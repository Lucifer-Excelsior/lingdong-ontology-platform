import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { adminSql, appSql, sandboxErpSql } from "./db/client.js";
import { ensureSeeded } from "./seed/seed-service.js";

describe("M2 Full-Stack Capabilities: Document Parsing, Canvas Authoring & Quarantine Replay", () => {
  const app = createApp();

  beforeAll(async () => {
    await ensureSeeded();
    await sandboxErpSql`
      UPDATE public.contracts
      SET expires_at = CASE WHEN contract_no = 'HT-2026-BAD1' THEN '2026-03-01'::date ELSE '2026-04-10'::date END,
          status = 'DRAFT'
      WHERE contract_no IN ('HT-2026-BAD1', 'HT-2026-BAD2')
    `;
  });

  afterAll(async () => {
    await sandboxErpSql`
      UPDATE public.contracts
      SET expires_at = '2026-03-01'::date, status = 'DRAFT'
      WHERE contract_no = 'HT-2026-BAD1'
    `;
    await adminSql.end();
    await appSql.end();
    await sandboxErpSql.end();
  });

  it("parses uploaded multipart policy file into PROV-O character chunks and extracts grounded proposals", async () => {
    const form = new FormData();
    const policyText = [
      "第一条 智算算力采购主合同总金额超过 500 万元时，须在到期前 45 个自然日完成技术与法务双重复核。",
      "",
      "第二条 若供应商逾期交付算力节点，累计违约赔偿金上限不得超过合同总价的 12%。",
    ].join("\n");
    form.append("file", new File([policyText], "算力采购履约补充规范.md", { type: "text/markdown" }));

    const uploadRes = await app.request("http://localhost:8280/api/workspaces/ws-contract/documents", {
      method: "POST",
      headers: { Origin: "http://localhost:3200" },
      body: form,
    });
    expect(uploadRes.status).toBe(201);
    const doc = (await uploadRes.json()) as {
      id: string;
      chunkCount: number;
      chunks: Array<{ id: string; startOffset: number; endOffset: number }>;
    };
    expect(doc.chunkCount).toBeGreaterThanOrEqual(1);
    expect(doc.chunks[0].endOffset).toBeGreaterThan(doc.chunks[0].startOffset);

    const extractRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/modeling/extract",
      {
        method: "POST",
        headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id, chunkId: doc.chunks[0].id }),
      }
    );
    expect(extractRes.status).toBe(200);
    const extractJson = (await extractRes.json()) as { proposals: Array<{ localName: string }> };
    expect(extractJson.proposals.length).toBeGreaterThanOrEqual(2);
  });

  it("persists canvas node positions and commits drag-connected ObjectProperty onto ontology", async () => {
    const layoutRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/ontology/layout",
      {
        method: "POST",
        headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
        body: JSON.stringify({ positions: { Contract: { x: 340, y: 190 } } }),
      }
    );
    expect(layoutRes.status).toBe(200);

    const authorRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/ontology/author",
      {
        method: "POST",
        headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "ADD_OBJECT_PROPERTY",
          labelZh: "经办负责人",
          localName: "managedBy",
          sourceClassLocalName: "Contract",
          targetOrDatatype: "AccountOwner",
          commitImmediately: true,
        }),
      }
    );
    expect(authorRes.status).toBe(200);
    const authorJson = (await authorRes.json()) as {
      committed: boolean;
      snapshot: { properties: Array<{ localName: string }> };
    };
    expect(authorJson.committed).toBe(true);
    expect(authorJson.snapshot.properties.some((p) => p.localName === "managedBy")).toBe(true);
  });

  it("guards connector SSRF, toggles watermark schedule, and repairs/replays SHACL quarantined row", async () => {
    const ssrfRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/data-sources",
      {
        method: "POST",
        headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "非法内网探测",
          kind: "HTTP_OPENAPI",
          accessMode: "READ_ONLY",
          connectionUrl: "http://10.12.0.5:8080/internal",
          credentialAlias: "TEST_ALIAS",
        }),
      }
    );
    expect(ssrfRes.status).toBe(400);

    const schedOn = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/materializations/schedule",
      {
        method: "POST",
        headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, intervalSeconds: 60 }),
      }
    );
    expect(schedOn.status).toBe(200);
    await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/materializations/schedule",
      {
        method: "POST",
        headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }
    );

    const replayRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/materializations/quarantine/HT-2026-BAD1/replay",
      {
        method: "POST",
        headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
        body: JSON.stringify({ repairedExpiresAt: "2027-09-01" }),
      }
    );
    expect(replayRes.status).toBe(200);
    const replayJson = (await replayRes.json()) as { run: { quarantinedCount: number; writtenInstances: number } };
    expect(replayJson.run.quarantinedCount).toBe(1);
    expect(replayJson.run.writtenInstances).toBeGreaterThanOrEqual(9);
  });
});
