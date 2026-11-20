import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { adminSql, appSql, sandboxErpSql } from "./db/client.js";
import { ensureSeeded } from "./seed/seed-service.js";

describe("Unified Multi-Source Evidence Fusion (Document + Multimodal + Database Metadata)", () => {
  const app = createApp();

  beforeAll(async () => {
    await ensureSeeded();
  });

  afterAll(async () => {
    await adminSql.end();
    await appSql.end();
    await sandboxErpSql.end();
  });

  it("loads documents, multimodal diagrams, and live DB schema metadata in one unified modeling pool", async () => {
    const res = await app.request("http://localhost:8280/api/workspaces/ws-contract/modeling");
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      documents: Array<{ id: string; title: string; parserStatus: string }>;
      dataSources: Array<{ id: string; name: string; tables: Array<{ tableName: string }> }>;
    };
    expect(json.documents.some((d) => d.parserStatus.includes("多模态"))).toBe(true);
    expect(json.dataSources.length).toBeGreaterThanOrEqual(2);
    const erp = json.dataSources.find((ds) => ds.id === "ds-erp-pg");
    expect(erp?.tables.some((t) => t.tableName === "follow_up_tasks")).toBe(true);
  });

  it("cross-validates Document + Multimodal + DB Schema to emit CORROBORATED & CONFLICT_DETECTED proposals", async () => {
    const modRes = await app.request("http://localhost:8280/api/workspaces/ws-contract/modeling");
    const mod = (await modRes.json()) as {
      documents: Array<{ id: string }>;
      dataSources: Array<{ id: string }>;
    };

    const fuseRes = await app.request("http://localhost:8280/api/workspaces/ws-contract/modeling/fuse", {
      method: "POST",
      headers: { Origin: "http://localhost:3200", "Content-Type": "application/json" },
      body: JSON.stringify({
        documentIds: mod.documents.map((d) => d.id),
        dataSourceIds: mod.dataSources.map((s) => s.id),
        autoGenerateMappings: true,
      }),
    });
    expect(fuseRes.status).toBe(200);
    const fused = (await fuseRes.json()) as {
      proposals: Array<{
        localName: string;
        fusionStatus?: string;
        evidenceSources?: Array<{ kind: string }>;
        conflictNote?: string;
      }>;
      fusionSummary: {
        modalitiesUsed: string[];
        corroboratedCount: number;
        conflictCount: number;
      };
    };

    expect(fused.fusionSummary.modalitiesUsed).toEqual(
      expect.arrayContaining(["DOCUMENT", "MULTIMODAL", "DATABASE_SCHEMA"])
    );
    expect(fused.fusionSummary.corroboratedCount).toBeGreaterThanOrEqual(1);
    expect(fused.fusionSummary.conflictCount).toBeGreaterThanOrEqual(1);

    const taskProp = fused.proposals.find((p) => p.localName === "FollowUpTask");
    expect(taskProp?.fusionStatus).toBe("CORROBORATED");
    expect((taskProp?.evidenceSources?.length ?? 0)).toBeGreaterThanOrEqual(2);

    const conflictProp = fused.proposals.find((p) => p.fusionStatus === "CONFLICT_DETECTED");
    expect(conflictProp?.conflictNote).toContain("public.contracts");
  });

  it("accepts uploaded multimodal SVG diagram into the unified evidence pool", async () => {
    const form = new FormData();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text>Contract -> FollowUpTask -> AccountOwner</text></svg>`;
    form.append("file", new File([svg], "test-er-flow.svg", { type: "image/svg+xml" }));
    form.append("content", "合同到跟进工单的多模态关系图");

    const uploadRes = await app.request("http://localhost:8280/api/workspaces/ws-contract/documents", {
      method: "POST",
      headers: { Origin: "http://localhost:3200" },
      body: form,
    });
    expect(uploadRes.status).toBe(201);
    const doc = (await uploadRes.json()) as { parserStatus: string };
    expect(doc.parserStatus).toContain("多模态");
  });
});
