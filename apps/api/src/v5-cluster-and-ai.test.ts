import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { adminSql, appSql, sandboxErpSql } from "./db/client.js";
import { graphStore } from "./graph-runtime.js";
import { isSessionRevoked, revokeSessionToken } from "./security/redis-store.js";
import { ensureSeeded } from "./seed/seed-service.js";

const JSON_HEADERS = { "content-type": "application/json" };

describe("V5.0 Phase A (HA Cluster & Async Jobs) + Phase B (NL-SPARQL & What-If) Suite", () => {
  const app = createApp();

  beforeAll(async () => {
    await ensureSeeded();
  });

  afterAll(async () => {
    await adminSql.end();
    await appSql.end();
    await sandboxErpSql.end();
  });

  it("Phase A1: exposes cluster health and revokes logged-out session tokens", async () => {
    const healthRes = await app.request("/api/cluster/health");
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as { instanceId: string; postgres: { healthy: boolean }; redis: { healthy: boolean } };
    expect(health.instanceId).toBeTruthy();
    expect(health.postgres.healthy).toBe(true);
    expect(health.redis.healthy).toBe(true);

    const fakeToken = `rev-test-${Date.now()}.sig`;
    expect(await isSessionRevoked(fakeToken)).toBe(false);
    await revokeSessionToken(fakeToken, 60);
    expect(await isSessionRevoked(fakeToken)).toBe(true);
  });

  it("Phase A2: enqueues PG SKIP LOCKED async job and completes via SSE stream", async () => {
    const postRes = await app.request("/api/workspaces/ws-contract/jobs", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ jobType: "SHACL_FULL_AUDIT" }),
    });
    expect(postRes.status).toBe(202);
    const created = (await postRes.json()) as { job: { id: string; status: string } };
    expect(created.job.id).toMatch(/^job-/);

    const sseRes = await app.request(`/api/workspaces/ws-contract/jobs/${created.job.id}/stream`);
    expect(sseRes.status).toBe(200);
    const sseText = await sseRes.text();
    expect(sseText).toContain("event: progress");
    expect(sseText).toContain("COMPLETED");

    const listRes = await app.request("/api/workspaces/ws-contract/jobs");
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { jobs: Array<{ id: string; status: string }> };
    const found = listBody.jobs.find((j) => j.id === created.job.id);
    expect(found?.status).toBe("COMPLETED");
  });

  it("Phase B1: executes ontology-aware NL-to-SPARQL with governed read-only guard and evidence anchors", async () => {
    const res = await app.request("/api/workspaces/ws-contract/portal/nl-query", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ question: "排查高风险和临期合同金额明细" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      generatedSparql: string;
      intentSummary: string;
      columns: string[];
      evidenceAnchors: Array<{ documentTitle: string }>;
    };
    expect(body.generatedSparql).toContain("SELECT");
    expect(body.intentSummary.length).toBeGreaterThan(5);
    expect(Array.isArray(body.columns)).toBe(true);
    expect(body.evidenceAnchors.length).toBeGreaterThan(0);
  });

  it("Phase B2: runs isolated What-If shadow graph cascade simulation and cleans shadow graph", async () => {
    const res = await app.request("/api/workspaces/ws-contract/portal/whatif-simulate", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        scenario: "SUPPLIER_DEFAULT",
        targetEntityId: "SUP-CORE-001",
        thresholdWan: 150,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shadowGraphUri: string;
      shadowGraphCleaned: boolean;
      affectedCount: number;
      totalExposureWan: number;
      recommendedActions: unknown[];
    };
    expect(body.shadowGraphCleaned).toBe(true);
    expect(body.affectedCount).toBeGreaterThan(0);
    expect(body.totalExposureWan).toBeGreaterThan(0);
    expect(body.recommendedActions.length).toBeGreaterThan(0);
    // Guarantee zero shadow graph leakage in Oxigraph!
    expect(graphStore.countQuadsInGraph(body.shadowGraphUri)).toBe(0);
  });
});
