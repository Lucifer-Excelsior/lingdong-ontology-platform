import { Hono } from "hono";
import type { Role } from "@lingdong/contracts";
import {
  applyAbacToQueryRows,
  getAbacPolicy,
  updateAbacPolicy,
  type DataClassification,
} from "../security/abac-policy.js";
import { requireRoles, type SessionActor } from "../security/guards.js";
import { buildOpenApi31Document, renderOfflineOpenApiHtml } from "../services/openapi-spec-service.js";

type AppEnv = { Variables: { actor: SessionActor } };

const ownerGuard = requireRoles("OWNER");

export const v5PublicDocsRoutes = new Hono();

v5PublicDocsRoutes.get("/openapi.json", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json(buildOpenApi31Document(origin));
});

v5PublicDocsRoutes.get("/docs", (c) => {
  return c.html(renderOfflineOpenApiHtml());
});

export const v5PhaseCRoutes = new Hono<AppEnv>();

v5PhaseCRoutes.get("/workspaces/:id/governance/abac-policy", async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const policy = await getAbacPolicy(actor.tenantId, wsId);
  return c.json({ policy, callerRole: actor.role, callerClearance: policy.roleClearance[actor.role] ?? "PUBLIC" });
});

v5PhaseCRoutes.put("/workspaces/:id/governance/abac-policy", ownerGuard, async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as {
    enabled?: boolean;
    roleClearance?: Record<Role, DataClassification>;
    confidentialFields?: string[];
    internalFields?: string[];
    maskToken?: string;
  };
  const policy = await updateAbacPolicy(actor.tenantId, wsId, `${actor.name} (${actor.role})`, body);
  return c.json({ ok: true, policy, message: "已更新 ABAC 数据密级管控策略并实时生效" });
});

v5PhaseCRoutes.post("/workspaces/:id/governance/abac-preview", async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { simulateRole?: Role };
  const targetRole: Role = body.simulateRole ?? "VIEWER";
  const policy = await getAbacPolicy(actor.tenantId, wsId);

  const sampleRows = [
    {
      subject: "ont:Contract/HT-2026-089",
      title: "华东算力中心二期主采合同",
      totalAmount: "4800000",
      expiresAt: "2026-12-15",
      supplier: "华云智算科技有限公司",
    },
    {
      subject: "ont:Contract/HT-2026-091",
      title: "信创数据库集群维保协议",
      totalAmount: "2150000",
      expiresAt: "2026-11-30",
      supplier: "星辰基础软件股份有限公司",
    },
  ];
  const preview = applyAbacToQueryRows(sampleRows, targetRole, policy);
  return c.json({
    simulateRole: targetRole,
    ...preview,
  });
});
