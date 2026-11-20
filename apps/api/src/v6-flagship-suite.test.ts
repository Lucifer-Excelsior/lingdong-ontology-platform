import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { adminSql, appSql, sandboxErpSql } from "./db/client.js";
import { ensureSeeded } from "./seed/seed-service.js";

const JSON_HEADERS = { "content-type": "application/json" };

describe("V6.0 Flagship Enterprise Group Edition Full Acceptance Suite (M1..M6)", () => {
  const app = createApp();

  beforeAll(async () => {
    await ensureSeeded();
  });

  afterAll(async () => {
    await adminSql.end();
    await appSql.end();
    await sandboxErpSql.end();
  });

  it("M2 & M3: reclaims zombie jobs, maintains SM3 tamper-evident audit hash chain, and exposes Prometheus /metrics", async () => {
    const reclaimRes = await app.request("/api/workspaces/ws-contract/jobs/reclaim", { method: "POST" });
    expect(reclaimRes.status).toBe(200);

    const a1 = await app.request("/api/workspaces/ws-contract/governance/audit-chain/append", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ summary: "V6 旗舰审计链存证测试 #1" }),
    });
    expect(a1.status).toBe(200);
    const a2 = await app.request("/api/workspaces/ws-contract/governance/audit-chain/append", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ summary: "V6 旗舰审计链存证测试 #2" }),
    });
    expect(a2.status).toBe(200);

    const verifyRes = await app.request("/api/workspaces/ws-contract/governance/audit-chain/verify");
    expect(verifyRes.status).toBe(200);
    const vBody = (await verifyRes.json()) as { intact: boolean; totalEntries: number; brokenAtSeq: number | null };
    expect(vBody.intact).toBe(true);
    expect(vBody.totalEntries).toBeGreaterThanOrEqual(2);
    expect(vBody.brokenAtSeq).toBeNull();

    const metricsRes = await app.request("/metrics");
    expect(metricsRes.status).toBe(200);
    const metricsText = await metricsRes.text();
    expect(metricsText).toContain("lingdong_http_requests_total");
    expect(metricsText).toContain("lingdong_process_rss_bytes");
  });

  it("M4: manages multi-level group org tree, SCIM 2.0 user sync, and federated ontology inheritance", async () => {
    const orgRes = await app.request("/api/org/units");
    expect(orgRes.status).toBe(200);
    const orgBody = (await orgRes.json()) as { units: Array<{ code: string }> };
    expect(orgBody.units.length).toBeGreaterThanOrEqual(3);

    const scimRes = await app.request("/api/scim/v2/Users/sync", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        workspaceId: "ws-contract",
        Resources: [{ userName: "zhangwei_scim", displayName: "张伟(集团数据官)", title: "集团首席数据官", role: "REVIEWER" }],
      }),
    });
    expect(scimRes.status).toBe(200);

    const bindRes = await app.request("/api/workspaces/ws-contract/federation/bind", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ parentWorkspaceId: "ws-itu", overridePolicy: "STRICT_READONLY_CORE", pullUpstreamClasses: false }),
    });
    expect(bindRes.status).toBe(200);
    const fBody = (await bindRes.json()) as { binding: { parentWorkspaceId: string }; items: unknown[] };
    expect(fBody.binding.parentWorkspaceId).toBe("ws-itu");
    expect(fBody.items.length).toBeGreaterThan(0);
  });

  it("M5: runs Git-style Branch -> add class -> Open PR -> Two-Stage Approval -> Atomic Merge", async () => {
    const brRes = await app.request("/api/workspaces/ws-contract/branches", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ branchName: "feat/supplier-credit-v6" }),
    });
    expect(brRes.status).toBe(200);
    const { branch } = (await brRes.json()) as { branch: { id: string } };

    const uniqueClass = `SupplierCreditProfile_${Date.now().toString().slice(-5)}`;
    const addClsRes = await app.request(`/api/workspaces/ws-contract/branches/${branch.id}/classes`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ localName: uniqueClass, labelZh: "供应商信用画像", subClassOf: "owl:Thing" }),
    });
    expect(addClsRes.status).toBe(200);

    const mrRes = await app.request("/api/workspaces/ws-contract/merge-requests", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ branchId: branch.id, title: "合入供应商信用画像扩展本体" }),
    });
    expect(mrRes.status).toBe(200);
    const { mr } = (await mrRes.json()) as { mr: { id: string; addedClasses: string[] } };
    expect(mr.addedClasses).toContain(uniqueClass);

    // Merge before 2-stage approval must be rejected
    const earlyMerge = await app.request(`/api/workspaces/ws-contract/merge-requests/${mr.id}/merge`, { method: "POST" });
    expect(earlyMerge.status).toBe(400);

    // Approve stage 1 & stage 2
    expect((await app.request(`/api/workspaces/ws-contract/merge-requests/${mr.id}/approve`, { method: "POST" })).status).toBe(200);
    expect((await app.request(`/api/workspaces/ws-contract/merge-requests/${mr.id}/approve`, { method: "POST" })).status).toBe(200);

    const mergeRes = await app.request(`/api/workspaces/ws-contract/merge-requests/${mr.id}/merge`, { method: "POST" });
    expect(mergeRes.status).toBe(200);
    const merged = (await mergeRes.json()) as { revisionCode: string };
    expect(merged.revisionCode).toBeTruthy();
  });

  it("M6: detects 4-layer Schema lineage drift and performs zero-downtime Vault/KMS secret rotation", async () => {
    const driftRes = await app.request("/api/workspaces/ws-contract/lineage/drift-scan", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ droppedColumn: "expires_at" }),
    });
    expect(driftRes.status).toBe(200);
    const drift = (await driftRes.json()) as { totalLinks: number; brokenCount: number; nodes: Array<{ status: string }> };
    expect(drift.totalLinks).toBeGreaterThan(0);
    expect(drift.brokenCount).toBeGreaterThanOrEqual(1);

    const listSecRes = await app.request("/api/workspaces/ws-contract/governance/kms-secrets");
    expect(listSecRes.status).toBe(200);
    const { secrets } = (await listSecRes.json()) as { secrets: Array<{ alias: string; version: number }> };
    expect(secrets.length).toBeGreaterThan(0);

    const firstAlias = secrets[0].alias;
    const rotRes = await app.request(`/api/workspaces/ws-contract/governance/kms-secrets/${encodeURIComponent(firstAlias)}/rotate`, {
      method: "POST",
    });
    expect(rotRes.status).toBe(200);
    const rotBody = (await rotRes.json()) as { secret: { version: number } };
    expect(rotBody.secret.version).toBeGreaterThan(secrets[0].version);
  });
});
