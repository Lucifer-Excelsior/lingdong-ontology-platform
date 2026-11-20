import { eq } from "drizzle-orm";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { adminSql, appSql, sandboxErpSql, withTenantDb } from "./db/client.js";
import {
  auditEvents,
  changesets,
  ontologyRevisions,
  releases,
  semanticApps,
  workspaces,
} from "./db/schema.js";
import { ensureSeeded } from "./seed/seed-service.js";

describe("M3 -> M6-1 Full Enterprise Capabilities Acceptance Suite", () => {
  const app = createApp();
  const importedWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await ensureSeeded();
  });

  afterAll(async () => {
    await withTenantDb("tenant-caict", async (txDb) => {
      for (const wsId of importedWorkspaceIds) {
        await txDb.delete(auditEvents).where(eq(auditEvents.workspaceId, wsId));
        await txDb.delete(releases).where(eq(releases.workspaceId, wsId));
        await txDb.delete(semanticApps).where(eq(semanticApps.workspaceId, wsId));
        await txDb.delete(changesets).where(eq(changesets.workspaceId, wsId));
        await txDb.delete(ontologyRevisions).where(eq(ontologyRevisions.workspaceId, wsId));
        await txDb.delete(workspaces).where(eq(workspaces.id, wsId));
      }
    });
    await adminSql.end();
    await appSql.end();
    await sandboxErpSql.end();
  });

  it("M3-1..M3-4: imports Turtle RDF, infers OWL 2 EL chains, diffs & rolls back revisions, and emits sh:ValidationReport", async () => {
    const baseOntRes = await app.request("http://localhost:8280/api/workspaces/ws-contract/ontology");
    const baseOnt = (await baseOntRes.json()) as {
      revisionId: string;
      inferredRelations: Array<{ reasoningRule: string }>;
    };
    expect(baseOnt.inferredRelations.length).toBeGreaterThanOrEqual(1);

    const ttlPayload = `
      @prefix ont: <https://ontology.caict.cn/contract#> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      ont:PerformanceBond a owl:Class ;
        rdfs:label "履约银行保函"@zh ;
        rdfs:subClassOf ont:Contract .
      ont:backedByBond a owl:ObjectProperty ;
        rdfs:label "绑定履约保函"@zh ;
        rdfs:domain ont:Contract ;
        rdfs:range ont:PerformanceBond .
    `;
    const impRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/ontology/import-rdf",
      {
        method: "POST",
        headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: "performance-bond.ttl",
          content: ttlPayload,
          commitImmediately: true,
        }),
      }
    );
    expect(impRes.status).toBe(200);
    const impJson = (await impRes.json()) as { committed: boolean; revisionId: string };
    expect(impJson.committed).toBe(true);
    expect(impJson.revisionId).not.toBe(baseOnt.revisionId);

    const diffRes = await app.request(
      `http://localhost:8280/api/workspaces/ws-contract/ontology/diff?from=${baseOnt.revisionId}&to=${impJson.revisionId}`
    );
    const diffJson = (await diffRes.json()) as { items: Array<{ summary: string }> };
    expect(diffJson.items.some((i) => i.summary.includes("PerformanceBond"))).toBe(true);

    const rbRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/ontology/rollback",
      {
        method: "POST",
        headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
        body: JSON.stringify({ targetRevisionCode: baseOnt.revisionId }),
      }
    );
    expect(rbRes.status).toBe(200);
    const rbJson = (await rbRes.json()) as { revisionId: string };
    expect(rbJson.revisionId.startsWith("rb")).toBe(true);

    const relRes = await app.request("http://localhost:8280/api/workspaces/ws-contract/release");
    const relJson = (await relRes.json()) as { validationReportTurtle: string };
    expect(relJson.validationReportTurtle).toContain("sh:ValidationReport");
    expect(relJson.validationReportTurtle).toContain("sh:conforms true");
  });

  it("M4-1..M4-3: probes dynamic PG pool, advances streaming watermark cursor, and links owl:sameAs entities", async () => {
    const testRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/data-sources/ds-erp-pg/test",
      { method: "POST", headers: { Origin: "http://localhost:3200" } }
    );
    expect(testRes.status).toBe(200);

    const fullRunRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/materializations/run",
      {
        method: "POST",
        headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
        body: JSON.stringify({ resetCursor: true, batchSize: 500 }),
      }
    );
    const fullRun = (await fullRunRes.json()) as {
      run: { syncMode: string };
      cursor: { lastValue: string | null };
    };
    expect(fullRun.run.syncMode).toBe("BASELINE_FULL");
    expect(fullRun.cursor.lastValue).toBeTruthy();

    const incRunRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/materializations/run",
      {
        method: "POST",
        headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
        body: JSON.stringify({ resetCursor: false }),
      }
    );
    const incRun = (await incRunRes.json()) as { run: { syncMode: string } };
    expect(incRun.run.syncMode).toBe("WATERMARK_INCREMENTAL");

    const erRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/entity-resolution/run",
      { method: "POST", headers: { Origin: "http://localhost:3200" } }
    );
    const erJson = (await erRes.json()) as { mergedCount: number; sampleLinks: string[] };
    expect(erJson.mergedCount).toBeGreaterThanOrEqual(2);
    expect(erJson.sampleLinks[0]).toContain("owl:sameAs");
  });

  it("M5-1..M5-4: configures capability, runs live benchmark, streams SSE, exports .docx, and serves Bearer MCP JSON-RPC", async () => {
    const capRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/capabilities/configure",
      {
        method: "POST",
        headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "NotifyLegalCounsel",
          name: "抄送法务顾问复核函",
          autonomyTier: "CONFIRM",
          riskLevel: "MEDIUM",
          targetEntityLocalName: "Contract",
          description: "向签约主体法务接口人发送标准续签提示函",
          mcpExposed: false,
        }),
      }
    );
    expect(capRes.status).toBe(201);

    const evalRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/apps/evaluate",
      { method: "POST", headers: { Origin: "http://localhost:3200" } }
    );
    const evalJson = (await evalRes.json()) as { caseResults: Array<{ passed: boolean }> };
    expect(evalJson.caseResults.length).toBe(4);
    expect(evalJson.caseResults.every((c) => c.passed)).toBe(true);

    const sseRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/agent/ask-stream",
      {
        method: "POST",
        headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "default", question: "查询即将到期的维保合同" }),
      }
    );
    expect(sseRes.status).toBe(200);
    const sseText = await sseRes.text();
    expect(sseText).toContain('"type":"step"');
    expect(sseText).toContain('"type":"done"');

    const docxRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/portal/renewal-brief/HT-2026-089.docx"
    );
    expect(docxRes.status).toBe(200);
    const docxBytes = new Uint8Array(await docxRes.arrayBuffer());
    expect(docxBytes[0]).toBe(0x50); // 'P'
    expect(docxBytes[1]).toBe(0x4b); // 'K'
    const docxEntries = unzipSync(docxBytes);
    expect(strFromU8(docxEntries["word/document.xml"])).toContain("HT-2026-089");

    const tokRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/mcp-tokens",
      {
        method: "POST",
        headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Claude-ReadOnly", roleScope: "VIEWER" }),
      }
    );
    const tokJson = (await tokRes.json()) as { rawTokenOnce: string; token: { id: string } };
    expect(tokJson.rawTokenOnce.startsWith("ldmcp_")).toBe(true);

    const mcpCallRes = await app.request("http://localhost:8280/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokJson.rawTokenOnce}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "FindExpiringContracts", workspaceId: "ws-contract" },
      }),
    });
    const mcpCallJson = (await mcpCallRes.json()) as {
      result: { content: Array<{ text: string }> };
    };
    expect(mcpCallJson.result.content[0].text).toContain("***MASKED_BY_ROLE***");
  });

  it("M6-1: verifies SHA-256 checksums on FDE .zip import and blocks tampered bundles", async () => {
    const dlRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/releases/rel-v2-0-0/download"
    );
    const validZip = new Uint8Array(await dlRes.arrayBuffer());

    const importForm = new FormData();
    importForm.append("file", new File([Buffer.from(validZip)], "contract-v2.zip", { type: "application/zip" }));
    importForm.append("targetSlug", "contract-dr");

    const impRes = await app.request("http://localhost:8280/api/releases/import-bundle", {
      method: "POST",
      headers: { Origin: "http://localhost:3200" },
      body: importForm,
    });
    expect(impRes.status).toBe(201);
    const impJson = (await impRes.json()) as {
      workspaceId: string;
      checksumVerified: boolean;
      classesRestored: number;
    };
    importedWorkspaceIds.push(impJson.workspaceId);
    expect(impJson.checksumVerified).toBe(true);
    expect(impJson.classesRestored).toBeGreaterThanOrEqual(4);

    // Tamper ontology.ttl inside ZIP and assert cryptographic SHA-256 rejection
    const unpacked = unzipSync(validZip);
    unpacked["ontology.ttl"] = strToU8(strFromU8(unpacked["ontology.ttl"]) + "\n# tampered!");
    const tamperedZip = zipSync(unpacked);

    const badForm = new FormData();
    badForm.append("file", new File([Buffer.from(tamperedZip)], "tampered.zip", { type: "application/zip" }));
    const badRes = await app.request("http://localhost:8280/api/releases/import-bundle", {
      method: "POST",
      headers: { Origin: "http://localhost:3200" },
      body: badForm,
    });
    expect(badRes.status).toBe(400);
    const badJson = (await badRes.json()) as { error: string };
    expect(badJson.error).toContain("SHA-256 密码学验签失败");
  });
});
