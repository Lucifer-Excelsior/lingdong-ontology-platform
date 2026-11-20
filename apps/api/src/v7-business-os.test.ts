import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { adminSql, appSql, sandboxErpSql } from "./db/client.js";
import { ensureSeeded } from "./seed/seed-service.js";

const JSON_HEADERS = { "content-type": "application/json" };

describe("V7.0 Enterprise Business Decision OS Acceptance Suite (5 Business Engines)", () => {
  const app = createApp();

  beforeAll(async () => {
    await ensureSeeded();
  });

  afterAll(async () => {
    await adminSql.end();
    await appSql.end();
    await sandboxErpSql.end();
  });

  it("B1: lists and installs Industry Ontology Template Pack into active workspace", async () => {
    const listRes = await app.request("/api/workspaces/ws-contract/v7/templates");
    expect(listRes.status).toBe(200);
    const { templates } = (await listRes.json()) as { templates: Array<{ id: string }> };
    expect(templates.length).toBe(4);

    const installRes = await app.request("/api/workspaces/ws-contract/v7/templates/tpl-procurement/install", {
      method: "POST",
    });
    expect(installRes.status).toBe(200);
    const body = (await installRes.json()) as { ok: boolean; revisionCode: string };
    expect(body.ok).toBe(true);
    expect(body.revisionCode).toBeTruthy();
  });

  it("B2: creates, toggles, and simulates Event-Driven ECA Automation Rule", async () => {
    const createRes = await app.request("/api/workspaces/ws-contract/v7/eca-rules", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: "自动化压测校验规则",
        triggerEvent: "CONTRACT_UPSERT",
        conditionExpr: "totalAmount >= 1000000",
        actionType: "PUSH_IM_ALERT",
      }),
    });
    expect(createRes.status).toBe(200);
    const { rule } = (await createRes.json()) as { rule: { id: string } };

    const trigRes = await app.request(`/api/workspaces/ws-contract/v7/eca-rules/${rule.id}/simulate-trigger`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ sampleEventSummary: "ERP 新增 320 万高风险采购合同" }),
    });
    expect(trigRes.status).toBe(200);
    const trigBody = (await trigRes.json()) as { log: { status: string } };
    expect(trigBody.log.status).toBe("EXECUTED");
  });

  it("B3: merges cross-system duplicate entities to Golden Record and splits back cleanly", async () => {
    const listRes = await app.request("/api/workspaces/ws-contract/v7/entity-resolution");
    expect(listRes.status).toBe(200);
    const { items } = (await listRes.json()) as { items: Array<{ id: string }> };
    expect(items.length).toBeGreaterThanOrEqual(2);

    const mergeRes = await app.request(`/api/workspaces/ws-contract/v7/entity-resolution/${items[0].id}/merge`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ authoritativeSystem: "CRM" }),
    });
    expect(mergeRes.status).toBe(200);
    const mBody = (await mergeRes.json()) as { goldenRecordId: string };
    expect(mBody.goldenRecordId).toMatch(/^GOLDEN-/);

    const splitRes = await app.request(`/api/workspaces/ws-contract/v7/entity-resolution/${items[0].id}/split`, {
      method: "POST",
    });
    expect(splitRes.status).toBe(200);
  });

  it("B4 & B5: computes Semantic Metric Layer, generates AI Executive Briefing, runs Multi-Agent Co-Review, and emits Embed SDK", async () => {
    const mRes = await app.request("/api/workspaces/ws-contract/v7/metrics");
    expect(mRes.status).toBe(200);
    const { metrics } = (await mRes.json()) as { metrics: unknown[] };
    expect(metrics.length).toBe(4);

    const briefRes = await app.request("/api/workspaces/ws-contract/v7/executive-briefing", { method: "POST" });
    expect(briefRes.status).toBe(200);
    const brief = (await briefRes.json()) as { markdown: string };
    expect(brief.markdown).toContain("高层经营与风险周报");

    const maRes = await app.request("/api/workspaces/ws-contract/v7/multi-agent-review", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ targetRef: "HT-2026-089" }),
    });
    expect(maRes.status).toBe(200);
    const ma = (await maRes.json()) as { specialists: unknown[]; compositeRiskScore: number };
    expect(ma.specialists.length).toBe(3);
    expect(ma.compositeRiskScore).toBeGreaterThan(0);

    const sdkRes = await app.request("/api/workspaces/ws-contract/v7/embed-sdk?widget=nl-sparql");
    expect(sdkRes.status).toBe(200);
    const sdk = (await sdkRes.json()) as { iframeSnippet: string; webComponentSnippet: string };
    expect(sdk.iframeSnippet).toContain("<iframe");
    expect(sdk.webComponentSnippet).toContain("<lingdong-widget");
  });
});
