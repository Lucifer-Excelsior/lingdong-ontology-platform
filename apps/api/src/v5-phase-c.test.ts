import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { adminSql, appSql, sandboxErpSql } from "./db/client.js";
import { ensureSeeded } from "./seed/seed-service.js";

const JSON_HEADERS = { "content-type": "application/json" };

describe("V5.0 Phase C (ABAC Data Classification & OpenAPI 3.1 Ecosystem)", () => {
  const app = createApp();

  beforeAll(async () => {
    await ensureSeeded();
  });

  afterAll(async () => {
    await adminSql.end();
    await appSql.end();
    await sandboxErpSql.end();
  });

  it("C1: enforces ABAC clearance redaction for VIEWER vs OWNER and persists policy updates", async () => {
    const viewerPreview = await app.request("/api/workspaces/ws-contract/governance/abac-preview", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ simulateRole: "VIEWER" }),
    });
    expect(viewerPreview.status).toBe(200);
    const vBody = (await viewerPreview.json()) as {
      callerClearance: string;
      redactedCellCount: number;
      redactedColumns: string[];
      rows: Array<Record<string, string>>;
    };
    expect(vBody.callerClearance).toBe("PUBLIC");
    expect(vBody.redactedCellCount).toBeGreaterThan(0);
    expect(vBody.redactedColumns).toContain("totalAmount");
    expect(vBody.rows[0]?.totalAmount).toContain("CONFIDENTIAL");

    const ownerPreview = await app.request("/api/workspaces/ws-contract/governance/abac-preview", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ simulateRole: "OWNER" }),
    });
    expect(ownerPreview.status).toBe(200);
    const oBody = (await ownerPreview.json()) as { callerClearance: string; redactedCellCount: number };
    expect(oBody.callerClearance).toBe("CONFIDENTIAL");
    expect(oBody.redactedCellCount).toBe(0);

    const putRes = await app.request("/api/workspaces/ws-contract/governance/abac-policy", {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ enabled: true, maskToken: "【机密受控】" }),
    });
    expect(putRes.status).toBe(200);
    const getRes = await app.request("/api/workspaces/ws-contract/governance/abac-policy");
    const gBody = (await getRes.json()) as { policy: { maskToken: string } };
    expect(gBody.policy.maskToken).toBe("【机密受控】");
  });

  it("C2: serves valid OpenAPI 3.1.0 JSON spec and offline zero-CDN HTML explorer", async () => {
    const specRes = await app.request("/api/openapi.json");
    expect(specRes.status).toBe(200);
    const spec = (await specRes.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths).length).toBeGreaterThanOrEqual(10);

    const docsRes = await app.request("/api/docs");
    expect(docsRes.status).toBe(200);
    const html = await docsRes.text();
    expect(html).toContain("OpenAPI 3.1.0");
    expect(html).not.toContain("https://cdn.");
  });
});
