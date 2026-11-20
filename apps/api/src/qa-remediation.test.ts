import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { adminSql, appSql, sandboxErpSql } from "./db/client.js";
import { signSessionToken } from "./security/guards.js";
import { ensureSeeded } from "./seed/seed-service.js";

describe("QA Remediation Regression Suite (P0 Security, Alias Masking, Dry-Run & Workspace Isolation)", () => {
  const app = createApp();
  const viewerCookie = `lingdong_v3_session=${signSessionToken({
    userId: "user-chennan",
    name: "陈楠",
    role: "VIEWER",
    tenantId: "tenant-caict",
  })}`;

  beforeAll(async () => {
    await ensureSeeded();
  });

  afterAll(async () => {
    await adminSql.end();
    await appSql.end();
    await sandboxErpSql.end();
  });

  it("blocks VIEWER mutations (403) and blocks /confirm bypass on AWAITING_APPROVAL plans (403)", async () => {
    const qcRes = await app.request("http://localhost:8280/api/workspaces/ws-contract/quick-create", {
      method: "POST",
      headers: { Origin: "http://localhost:3200", Cookie: viewerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        assetKind: "OWL_CLASS",
        labelZh: "越权测试类",
        localName: "ViewerBlockedClass",
      }),
    });
    expect(qcRes.status).toBe(403);

    const bypassRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/agent/plans/plan-905/confirm",
      {
        method: "POST",
        headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    expect(bypassRes.status).toBe(403);
  });

  it("masks VIEWER amounts in aliased SPARQL and .docx exports, and blocks cross-workspace MCP tokens", async () => {
    const spqRes = await app.request("http://localhost:8280/api/workspaces/ws-contract/sparql", {
      method: "POST",
      headers: { Origin: "http://localhost:3200", Cookie: viewerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "SELECT ?cno ?secretAmt WHERE { ?c a ont:Contract ; ont:contractNo ?cno ; ont:totalAmount ?secretAmt . } LIMIT 3",
      }),
    });
    expect(spqRes.status).toBe(200);
    const spqJson = (await spqRes.json()) as { rows: Array<{ secretAmt: string }> };
    expect(spqJson.rows.length).toBeGreaterThan(0);
    expect(spqJson.rows.every((r) => r.secretAmt === "***MASKED_BY_ROLE***")).toBe(true);

    const docxRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/portal/renewal-brief/HT-2026-089.docx",
      { headers: { Cookie: viewerCookie } }
    );
    const docXml = strFromU8(unzipSync(new Uint8Array(await docxRes.arrayBuffer()))["word/document.xml"]);
    expect(docXml).toContain("已脱敏");
    expect(docXml).not.toContain("285.00");

    const tokRes = await app.request("http://localhost:8280/api/workspaces/ws-contract/mcp-tokens", {
      method: "POST",
      headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ScopedContractToken", roleScope: "VIEWER" }),
    });
    const { rawTokenOnce } = (await tokRes.json()) as { rawTokenOnce: string };

    const crossRes = await app.request("http://localhost:8280/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${rawTokenOnce}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list", params: { workspaceId: "ws-itu" } }),
    });
    const crossJson = (await crossRes.json()) as { error?: { code: number } };
    expect(crossJson.error?.code).toBe(-32003);

    const hiddenToolRes = await app.request("http://localhost:8280/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${rawTokenOnce}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: { name: "MarkRenewalPending", workspaceId: "ws-contract" },
      }),
    });
    const hiddenJson = (await hiddenToolRes.json()) as { error?: { code: number } };
    expect(hiddenJson.error?.code).toBe(-32602);
  });

  it("isolates ws-supply ontology/releases and runs real mapping dry-run", async () => {
    const supOnt = (await (await app.request("http://localhost:8280/api/workspaces/ws-supply/ontology")).json()) as {
      classes: Array<{ localName: string }>;
    };
    expect(supOnt.classes.some((c) => c.localName === "Supplier")).toBe(true);
    expect(supOnt.classes.some((c) => c.localName === "Contract")).toBe(false);

    const dryRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/mappings/map-contracts/dry-run",
      { method: "POST", headers: { Origin: "http://localhost:3200" } }
    );
    expect(dryRes.status).toBe(200);
    const dryJson = (await dryRes.json()) as { rows: Array<{ rowKey: string; shaclStatus: string }> };
    expect(dryJson.rows.length).toBeGreaterThanOrEqual(4);
  });
});
