import { Hono } from "hono";
import { withTenantDb } from "../db/client.js";
import { requireRoles, type SessionActor } from "../security/guards.js";
import { createEcaRule, listEcaAutomation, simulateTriggerEcaRule, toggleEcaRule, type EcaAutomationRule } from "../services/v7-eca-automation-service.js";
import { listEntityResolutionCandidates, mergeToGoldenRecord, splitGoldenRecord } from "../services/v7-entity-resolution-service.js";
import { installIndustryTemplate, listIndustryTemplates } from "../services/v7-industry-templates-service.js";
import { buildEmbeddedWidgetSnippets, generateExecutiveBriefing, getSemanticMetricLayer, runMultiAgentCoReview } from "../services/v7-metrics-agents-service.js";

type AppEnv = { Variables: { actor: SessionActor } };

const modelerGuard = requireRoles("OWNER", "MODELER");
const operatorGuard = requireRoles("OWNER", "MODELER", "OPERATOR");

export const v7BusinessOsRoutes = new Hono<AppEnv>();

// 1. Industry Ontology Template Marketplace
v7BusinessOsRoutes.get("/workspaces/:id/v7/templates", async (c) => {
  const actor = c.get("actor");
  const templates = await listIndustryTemplates(actor.tenantId, c.req.param("id"));
  return c.json({ templates });
});

v7BusinessOsRoutes.post("/workspaces/:id/v7/templates/:templateId/install", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const tplId = c.req.param("templateId");
  const res = await withTenantDb(actor.tenantId, (txDb) =>
    installIndustryTemplate(txDb, actor.tenantId, wsId, tplId, `${actor.name} (${actor.role})`)
  );
  return c.json(res);
});

// 2. Event-Driven Business Automation (ECA Rules)
v7BusinessOsRoutes.get("/workspaces/:id/v7/eca-rules", async (c) => {
  const actor = c.get("actor");
  return c.json(await listEcaAutomation(actor.tenantId, c.req.param("id")));
});

v7BusinessOsRoutes.post("/workspaces/:id/v7/eca-rules", operatorGuard, async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    triggerEvent?: EcaAutomationRule["triggerEvent"];
    conditionExpr?: string;
    actionType?: EcaAutomationRule["actionType"];
  };
  const res = await createEcaRule(actor.tenantId, c.req.param("id"), `${actor.name} (${actor.role})`, {
    name: body.name ?? "",
    triggerEvent: body.triggerEvent ?? "CONTRACT_UPSERT",
    conditionExpr: body.conditionExpr ?? "",
    actionType: body.actionType ?? "PUSH_IM_ALERT",
  });
  return c.json({ ok: true, ...res });
});

v7BusinessOsRoutes.post("/workspaces/:id/v7/eca-rules/:ruleId/toggle", operatorGuard, async (c) => {
  const actor = c.get("actor");
  return c.json(await toggleEcaRule(actor.tenantId, c.req.param("id"), c.req.param("ruleId")));
});

v7BusinessOsRoutes.post("/workspaces/:id/v7/eca-rules/:ruleId/simulate-trigger", operatorGuard, async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const ruleId = c.req.param("ruleId");
  const body = (await c.req.json().catch(() => ({}))) as { sampleEventSummary?: string };
  const res = await withTenantDb(actor.tenantId, (txDb) =>
    simulateTriggerEcaRule(txDb, actor.tenantId, wsId, ruleId, `${actor.name} (${actor.role})`, body.sampleEventSummary)
  );
  return c.json({ ok: true, ...res });
});

// 3. Cross-System Entity Resolution & Golden Record Workbench
v7BusinessOsRoutes.get("/workspaces/:id/v7/entity-resolution", async (c) => {
  const actor = c.get("actor");
  return c.json(await listEntityResolutionCandidates(actor.tenantId, c.req.param("id")));
});

v7BusinessOsRoutes.post("/workspaces/:id/v7/entity-resolution/:pairId/merge", operatorGuard, async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const pairId = c.req.param("pairId");
  const body = (await c.req.json().catch(() => ({}))) as { authoritativeSystem?: "CRM" | "ERP" | "FINANCE" };
  const res = await withTenantDb(actor.tenantId, (txDb) =>
    mergeToGoldenRecord(txDb, actor.tenantId, wsId, pairId, body.authoritativeSystem ?? "CRM", `${actor.name} (${actor.role})`)
  );
  return c.json({ ok: true, ...res });
});

v7BusinessOsRoutes.post("/workspaces/:id/v7/entity-resolution/:pairId/split", operatorGuard, async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const pairId = c.req.param("pairId");
  const res = await withTenantDb(actor.tenantId, (txDb) =>
    splitGoldenRecord(txDb, actor.tenantId, wsId, pairId, `${actor.name} (${actor.role})`)
  );
  return c.json(res);
});

// 4. Semantic Metric Layer + AI Executive Briefing + Multi-Agent Co-Review + Embed SDK
v7BusinessOsRoutes.get("/workspaces/:id/v7/metrics", async (c) => {
  const actor = c.get("actor");
  const res = await withTenantDb(actor.tenantId, (txDb) => getSemanticMetricLayer(txDb, actor.tenantId, c.req.param("id")));
  return c.json(res);
});

v7BusinessOsRoutes.post("/workspaces/:id/v7/executive-briefing", async (c) => {
  const actor = c.get("actor");
  const res = await withTenantDb(actor.tenantId, (txDb) =>
    generateExecutiveBriefing(txDb, actor.tenantId, c.req.param("id"), `${actor.name} (${actor.role})`)
  );
  return c.json(res);
});

v7BusinessOsRoutes.post("/workspaces/:id/v7/multi-agent-review", async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json().catch(() => ({}))) as { targetRef?: string };
  const res = await withTenantDb(actor.tenantId, (txDb) =>
    runMultiAgentCoReview(txDb, actor.tenantId, c.req.param("id"), body.targetRef ?? "HT-2026-089", `${actor.name} (${actor.role})`)
  );
  return c.json(res);
});

v7BusinessOsRoutes.get("/workspaces/:id/v7/embed-sdk", (c) => {
  const origin = new URL(c.req.url).origin;
  const widget = c.req.query("widget") ?? "entity-360";
  return c.json(buildEmbeddedWidgetSnippets(origin, c.req.param("id"), widget));
});
