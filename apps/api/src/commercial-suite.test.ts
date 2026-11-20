import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { adminSql, appSql, sandboxErpSql } from "./db/client.js";
import { ensureSeeded } from "./seed/seed-service.js";

const OWNER_HEADERS = { "x-demo-user-id": "user-owner", "content-type": "application/json" };
const VIEWER_HEADERS = { "x-demo-user-id": "user-viewer", "content-type": "application/json" };

describe("Commercial V3.5 Enterprise Suite (All 4 Pillars)", () => {
  const app = createApp();

  beforeAll(async () => {
    await ensureSeeded();
  });

  afterAll(async () => {
    await adminSql`DELETE FROM users WHERE name = '王安全'`;
    await adminSql`DELETE FROM data_sources WHERE name = '达梦 DM8 财务归档库'`;
    await adminSql.end();
    await appSql.end();
    await sandboxErpSql.end();
  });

  it("Pillar 1: Git-style ontology branch creation, merge, and pre-change impact simulation", async () => {
    const branchName = `feat/risk-tier-${Date.now()}`;
    const createRes = await app.request("/api/workspaces/ws-contract/ontology/branches", {
      method: "POST",
      headers: OWNER_HEADERS,
      body: JSON.stringify({ name: branchName, description: "新增风险分级属性" }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { branch: { id: string; name: string; status: string } };
    expect(created.branch.name).toBe(branchName);
    expect(created.branch.status).toBe("OPEN");

    const mergeRes = await app.request(
      `/api/workspaces/ws-contract/ontology/branches/${created.branch.id}/merge`,
      { method: "POST", headers: OWNER_HEADERS }
    );
    expect(mergeRes.status).toBe(200);
    const merged = (await mergeRes.json()) as { branch: { status: string }; message: string };
    expect(merged.branch.status).toBe("MERGED");

    const simRes = await app.request("/api/workspaces/ws-contract/ontology/simulate-impact", {
      method: "POST",
      headers: OWNER_HEADERS,
      body: JSON.stringify({ operation: "DELETE_CLASS", targetLocalName: "Contract" }),
    });
    expect(simRes.status).toBe(200);
    const sim = (await simRes.json()) as { riskLevel: string; affectedInstanceCount: number };
    expect(["WARN", "BREAKING"]).toContain(sim.riskLevel);
    expect(sim.affectedInstanceCount).toBeGreaterThanOrEqual(0);
  });

  it("Pillar 2: Xinchuang DAMENG_DM8 connector, quarantine CSV export, and SSRF-safe Webhook debugger", async () => {
    const dsRes = await app.request("/api/workspaces/ws-contract/data-sources", {
      method: "POST",
      headers: OWNER_HEADERS,
      body: JSON.stringify({
        name: "达梦 DM8 财务归档库",
        kind: "DAMENG_DM8",
        accessMode: "READ_ONLY",
        connectionUrl: "dm://finance-dm8.corp.internal:5236/ERP_FIN",
        credentialAlias: "ERP_CONTRACT_DB",
      }),
    });
    expect(dsRes.status).toBe(201);
    const ds = (await dsRes.json()) as { id?: string; message?: string };
    expect(ds.id ?? ds.message).toBeTruthy();

    const csvRes = await app.request("/api/workspaces/ws-contract/materializations/quarantine/export.csv", {
      headers: { "x-demo-user-id": "user-owner" },
    });
    expect(csvRes.status).toBe(200);
    expect(await csvRes.text()).toContain("row_key,source_table,violated_property");

    const webhookRes = await app.request(
      "/api/workspaces/ws-contract/capabilities/CreateFollowUpTask/test-webhook",
      {
        method: "POST",
        headers: OWNER_HEADERS,
        body: JSON.stringify({
          webhookUrl: "https://erp-hook.example/api/follow-up",
          method: "POST",
          samplePayload: { contractNo: "HT-2026-089" },
        }),
      }
    );
    expect(webhookRes.status).toBe(200);
    const wh = (await webhookRes.json()) as { ok: boolean; httpStatus?: number; statusCode?: number };
    expect(wh.ok).toBe(true);
    expect(wh.httpStatus ?? wh.statusCode ?? 200).toBe(200);
  });

  it("Pillar 3: Entity 360 profile (with RBAC masking), Portal low-code config, feedback loop, IM push & alerts CSV", async () => {
    const owner360 = await app.request("/api/workspaces/ws-contract/portal/entity-360/HT-2026-089", {
      headers: { "x-demo-user-id": "user-owner" },
    });
    expect(owner360.status).toBe(200);
    const ownerData = (await owner360.json()) as { entityKey: string; summaryMetrics: Array<{ label: string; value: string }> };
    expect(ownerData.entityKey).toBe("HT-2026-089");
    expect(ownerData.summaryMetrics.some((m) => m.value.includes("脱敏"))).toBe(false);

    const usersRes = await app.request("/api/governance/users");
    const usersJson = (await usersRes.json()) as { users: Array<{ id: string; role: string }> };
    const viewerUser = usersJson.users.find((u) => u.role === "VIEWER")!;
    const switchRes = await app.request("/api/session/switch-actor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: viewerUser.id }),
    });
    const viewerCookie = switchRes.headers.get("set-cookie")?.split(";")[0] ?? "";
    const viewer360 = await app.request("/api/workspaces/ws-contract/portal/entity-360/HT-2026-089", {
      headers: { cookie: viewerCookie },
    });
    expect(viewer360.status).toBe(200);
    const viewerData = (await viewer360.json()) as { summaryMetrics: Array<{ label: string; value: string }> };
    expect(viewerData.summaryMetrics.some((m) => m.value.includes("***") || m.value.includes("脱敏"))).toBe(true);

    const cfgRes = await app.request("/api/workspaces/ws-contract/portal/config", {
      method: "POST",
      headers: OWNER_HEADERS,
      body: JSON.stringify({
        portalTitle: "华东大区合同风险指挥舱",
        subtitle: "华东区业务看板",
        enabledWidgets: ["kpi_alerts", "entity_360", "ai_copilot", "im_push", "csv_export"],
        alertWindowDays: 45,
        imChannel: "WECOM",
        imWebhookUrl: "https://qyapi.weixin.qq.example/cgi-bin/webhook/send",
        customDocxHeader: "华东大区合规专报",
      }),
    });
    expect(cfgRes.status).toBe(200);

    const fbRes = await app.request("/api/workspaces/ws-contract/portal/feedback", {
      method: "POST",
      headers: VIEWER_HEADERS,
      body: JSON.stringify({ question: "HT-2026-089 风险点", rating: "UP", correctionNote: "精准命中" }),
    });
    expect(fbRes.status).toBe(201);

    const imRes = await app.request("/api/workspaces/ws-contract/portal/im-push", {
      method: "POST",
      headers: OWNER_HEADERS,
      body: JSON.stringify({ channel: "WECOM", title: "高风险合同审批", targetRef: "HT-2026-089", summary: "需法务审批" }),
    });
    expect(imRes.status).toBe(200);
    const imData = (await imRes.json()) as { ok: boolean };
    expect(imData.ok).toBe(true);

    const alertsCsv = await app.request("/api/workspaces/ws-contract/portal/alerts.csv", {
      headers: { cookie: viewerCookie },
    });
    expect(alertsCsv.status).toBe(200);
    const alertsText = await alertsCsv.text();
    expect(alertsText).toContain("contract_no,title,expires_at,total_amount,status");
    expect(alertsText).toContain("***");
  });

  it("Pillar 4: Enterprise IAM user/ABAC creation, SHA-256 hash-chained audit CSV, and License/Quota panel", async () => {
    const userRes = await app.request("/api/governance/users", {
      method: "POST",
      headers: OWNER_HEADERS,
      body: JSON.stringify({
        name: "王安全",
        title: "安全保密管理员",
        department: "信息安全部",
        regionScope: "华东大区",
        role: "REVIEWER",
        complianceRole: "SEC_ADMIN",
      }),
    });
    expect(userRes.status).toBe(201);

    const licRes = await app.request("/api/workspaces/ws-contract/governance/license", {
      headers: { "x-demo-user-id": "user-owner" },
    });
    expect(licRes.status).toBe(200);
    const lic = (await licRes.json()) as { edition: string; auditChainHeadHash: string };
    expect(lic.edition).toMatch(/V[34]\./);
    expect(lic.auditChainHeadHash.length).toBeGreaterThan(10);

    const auditCsv = await app.request("/api/workspaces/ws-contract/governance/audit-export.csv", {
      headers: { "x-demo-user-id": "user-owner" },
    });
    expect(auditCsv.status).toBe(200);
    expect(await auditCsv.text()).toContain("sha256_chain_hash");
  });
});
