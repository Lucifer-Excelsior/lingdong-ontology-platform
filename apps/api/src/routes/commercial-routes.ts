import { Hono } from "hono";
import { PortalAppConfigSchema } from "@lingdong/contracts";
import { withTenantDb } from "../db/client.js";
import { requireRoles, type SessionActor } from "../security/guards.js";
import {
  createOntologyBranch,
  listOntologyBranches,
  mergeOntologyBranch,
  simulateOntologyImpact,
} from "../services/commercial-ontology-service.js";
import {
  exportQuarantineCsv,
  importQuarantineCsvAndReplay,
  testCapabilityWebhookAction,
} from "../services/commercial-fde-service.js";
import {
  createEnterpriseUser,
  dispatchImApprovalCard,
  exportPortalAlertsCsv,
  exportSignedAuditCsv,
  getCommercialLicenseAndChain,
  getEntity360Profile,
  getPortalAppConfig,
  listBusinessFeedback,
  listEnterpriseUsers,
  savePortalAppConfig,
  submitBusinessFeedback,
} from "../services/commercial-portal-iam-service.js";

type AppEnv = { Variables: { actor: SessionActor } };

const modelerGuard = requireRoles("OWNER", "MODELER");
const operatorGuard = requireRoles("OWNER", "MODELER", "OPERATOR");
const ownerGuard = requireRoles("OWNER");

export const commercialRoutes = new Hono<AppEnv>();

// Pillar 1: Branches & Impact Simulation
commercialRoutes.get("/workspaces/:id/ontology/branches", async (c) => {
  const actor = c.get("actor");
  return c.json({ branches: await listOntologyBranches(actor.tenantId, c.req.param("id")) });
});

commercialRoutes.post("/workspaces/:id/ontology/branches", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json()) as { name: string; description?: string };
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await createOntologyBranch(txDb, actor.tenantId, c.req.param("id"), `${actor.name} (${actor.role})`, body), 201)
  );
});

commercialRoutes.post("/workspaces/:id/ontology/branches/:branchId/merge", modelerGuard, async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await mergeOntologyBranch(txDb, actor.tenantId, c.req.param("id"), c.req.param("branchId"), `${actor.name} (${actor.role})`))
  );
});

commercialRoutes.post("/workspaces/:id/ontology/simulate-impact", async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json()) as {
    operation: "DELETE_CLASS" | "RENAME_CLASS" | "DELETE_PROPERTY" | "ADD_SHACL_CONSTRAINT";
    targetLocalName: string;
    minInclusive?: number;
  };
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await simulateOntologyImpact(txDb, c.req.param("id"), body))
  );
});

// Pillar 2: Quarantine CSV Batch Export/Import & Webhook Debugger
commercialRoutes.get("/workspaces/:id/materializations/quarantine/export.csv", async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) => {
    const out = await exportQuarantineCsv(txDb, c.req.param("id"));
    return new Response(out.csv, {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${out.filename}"` },
    });
  });
});

commercialRoutes.post("/workspaces/:id/materializations/quarantine/import-csv", operatorGuard, async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json()) as { csvText: string };
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await importQuarantineCsvAndReplay(txDb, actor.tenantId, c.req.param("id"), body.csvText ?? "", `${actor.name} (${actor.role})`))
  );
});

commercialRoutes.post("/workspaces/:id/capabilities/:code/test-webhook", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json()) as { webhookUrl: string; method?: "POST" | "PATCH" | "PUT"; samplePayload?: Record<string, unknown> };
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await testCapabilityWebhookAction(txDb, actor.tenantId, c.req.param("id"), c.req.param("code"), `${actor.name} (${actor.role})`, body))
  );
});

// Pillar 3: Entity 360, Low-Code Portal Config, Feedback Loop, IM Push & CSV Ledger
commercialRoutes.get("/workspaces/:id/portal/entity-360/:entityKey", async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await getEntity360Profile(txDb, c.req.param("id"), c.req.param("entityKey"), actor.role))
  );
});

commercialRoutes.get("/workspaces/:id/portal/config", async (c) => {
  const actor = c.get("actor");
  return c.json(await getPortalAppConfig(actor.tenantId, c.req.param("id")));
});

commercialRoutes.post("/workspaces/:id/portal/config", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const parsed = PortalAppConfigSchema.parse({ ...(await c.req.json()), workspaceId: c.req.param("id") });
  return c.json({ config: await savePortalAppConfig(actor.tenantId, c.req.param("id"), parsed), message: "业务门户低代码装配配置已保存生效" });
});

commercialRoutes.get("/workspaces/:id/portal/feedback", async (c) => {
  const actor = c.get("actor");
  return c.json({ items: await listBusinessFeedback(actor.tenantId, c.req.param("id")) });
});

commercialRoutes.post("/workspaces/:id/portal/feedback", async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json()) as { question: string; rating: "UP" | "DOWN"; correctionNote?: string };
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await submitBusinessFeedback(txDb, actor.tenantId, c.req.param("id"), `${actor.name} (${actor.role})`, body), 201)
  );
});

commercialRoutes.post("/workspaces/:id/portal/im-push", operatorGuard, async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json()) as { channel?: "WECOM" | "DINGTALK" | "FEISHU"; title: string; summary: string; targetRef: string };
  return c.json(await dispatchImApprovalCard(actor.tenantId, c.req.param("id"), `${actor.name} (${actor.role})`, body));
});

commercialRoutes.get("/workspaces/:id/portal/alerts.csv", async (c) => {
  const actor = c.get("actor");
  const out = await exportPortalAlertsCsv(actor.role);
  return new Response(out.csv, {
    status: 200,
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${out.filename}"` },
  });
});

// Pillar 4: Enterprise IAM, Signed Audit Export & Commercial License
commercialRoutes.get("/governance/users", async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) => c.json({ users: await listEnterpriseUsers(txDb, actor.tenantId) }));
});

commercialRoutes.post("/governance/users", ownerGuard, async (c) => {
  const actor = c.get("actor");
  const body = await c.req.json();
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json({ user: await createEnterpriseUser(txDb, actor.tenantId, body), message: "已创建企业成员并绑定部门与区域 ABAC 权限范围" }, 201)
  );
});

commercialRoutes.get("/workspaces/:id/governance/license", async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await getCommercialLicenseAndChain(txDb, actor.tenantId, c.req.param("id")))
  );
});

commercialRoutes.get("/workspaces/:id/governance/audit-export.csv", async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) => {
    const out = await exportSignedAuditCsv(txDb, c.req.param("id"));
    return new Response(out.csv, {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${out.filename}"` },
    });
  });
});
