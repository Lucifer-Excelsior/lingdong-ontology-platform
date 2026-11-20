import { Hono } from "hono";
import { SparqlQueryInputSchema, type DataSourceKind } from "@lingdong/contracts";
import { withTenantDb } from "../db/client.js";
import { requireRoles, type SessionActor } from "../security/guards.js";
import { getDataWorkspace, runWorkspaceSparql } from "../services/data-service.js";
import {
  configureWatermarkSchedule,
  getWatermarkScheduleState,
  registerEnterpriseDataSource,
  repairAndReplayQuarantineRow,
  updateMappingColumnRule,
} from "../services/connector-and-replay-service.js";
import {
  captureDynamicSnapshot,
  dryRunSemanticMapping,
  executeEntityResolution,
  getWorkspaceEntityResolutionRules,
  getWorkspaceWatermarkCursor,
  probeDynamicDataSource,
  streamCursorMaterialization,
} from "../services/m4-streaming-and-resolution.js";

type AppEnv = { Variables: { actor: SessionActor } };

const modelerGuard = requireRoles("OWNER", "MODELER");
const operatorGuard = requireRoles("OWNER", "MODELER", "OPERATOR");

export const dataRoutes = new Hono<AppEnv>();

dataRoutes.get("/workspaces/:id/data", async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  return withTenantDb(actor.tenantId, async (txDb) => {
    const base = await getDataWorkspace(txDb, workspaceId);
    return c.json({
      ...base,
      schedule: getWatermarkScheduleState(workspaceId),
      watermarkCursor: getWorkspaceWatermarkCursor(workspaceId),
      entityResolutionRules: getWorkspaceEntityResolutionRules(workspaceId),
    });
  });
});

dataRoutes.post("/workspaces/:id/data-sources", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const body = (await c.req.json()) as {
    name: string;
    kind: DataSourceKind;
    accessMode: "READ_ONLY" | "READ_WRITE" | "RDF_GSP";
    connectionUrl: string;
    credentialAlias: string;
  };
  try {
    return await withTenantDb(actor.tenantId, async (txDb) =>
      c.json(await registerEnterpriseDataSource(txDb, actor.tenantId, workspaceId, body), 201)
    );
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "数据源注册失败" }, 400);
  }
});

dataRoutes.post("/workspaces/:id/data-sources/:dsId/test", operatorGuard, async (c) => {
  const actor = c.get("actor");
  try {
    return await withTenantDb(actor.tenantId, async (txDb) =>
      c.json(
        await probeDynamicDataSource(
          txDb,
          actor.tenantId,
          actor.role,
          c.req.param("id"),
          c.req.param("dsId")
        )
      )
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "连接测试失败";
    return c.json({ error: msg }, msg.includes("凭据访问被拒绝") ? 403 : 400);
  }
});

dataRoutes.post("/workspaces/:id/data-sources/:dsId/snapshot", modelerGuard, async (c) => {
  const actor = c.get("actor");
  try {
    return await withTenantDb(actor.tenantId, async (txDb) =>
      c.json(
        await captureDynamicSnapshot(
          txDb,
          actor.tenantId,
          actor.role,
          c.req.param("id"),
          c.req.param("dsId")
        )
      )
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "快照采集失败";
    return c.json({ error: msg }, msg.includes("凭据访问被拒绝") ? 403 : 400);
  }
});

dataRoutes.post("/workspaces/:id/mappings/:mappingId/rules", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const mappingId = c.req.param("mappingId");
  const body = await c.req.json();
  try {
    return await withTenantDb(actor.tenantId, async (txDb) =>
      c.json(await updateMappingColumnRule(txDb, workspaceId, mappingId, body))
    );
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "更新映射规则失败" }, 400);
  }
});

dataRoutes.post("/workspaces/:id/mappings/:mappingId/dry-run", async (c) => {
  const actor = c.get("actor");
  try {
    return await withTenantDb(actor.tenantId, async (txDb) =>
      c.json(await dryRunSemanticMapping(txDb, c.req.param("id"), c.req.param("mappingId"), actor.role))
    );
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "映射抽样试运行失败" }, 400);
  }
});

dataRoutes.post("/workspaces/:id/materializations/run", operatorGuard, async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json().catch(() => ({}))) as {
    resetCursor?: boolean;
    batchSize?: number;
  };
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(
      await streamCursorMaterialization(
        txDb,
        actor.tenantId,
        c.req.param("id"),
        `${actor.name} (${actor.role})`,
        { resetCursor: Boolean(body.resetCursor), batchSize: body.batchSize }
      )
    )
  );
});

dataRoutes.post("/workspaces/:id/entity-resolution/run", operatorGuard, async (c) => {
  return c.json(await executeEntityResolution(c.req.param("id")));
});

dataRoutes.post("/workspaces/:id/materializations/schedule", operatorGuard, async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const body = (await c.req.json()) as { enabled: boolean; intervalSeconds?: number };
  const state = configureWatermarkSchedule(
    actor.tenantId,
    workspaceId,
    Boolean(body.enabled),
    body.intervalSeconds ?? 60
  );
  return c.json({
    schedule: state,
    message: state.enabled
      ? `已开启每 ${state.intervalSeconds} 秒自动水位线增量同步`
      : "已暂停自动水位线同步（仍可随时手动触发批次）",
  });
});

dataRoutes.post("/workspaces/:id/materializations/quarantine/:rowKey/replay", operatorGuard, async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const rowKey = c.req.param("rowKey");
  const body = (await c.req.json().catch(() => ({}))) as { repairedExpiresAt?: string };
  try {
    return await withTenantDb(actor.tenantId, async (txDb) =>
      c.json(
        await repairAndReplayQuarantineRow(
          txDb,
          actor.tenantId,
          workspaceId,
          rowKey,
          body.repairedExpiresAt,
          `${actor.name} (${actor.role})`
        )
      )
    );
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "修复重放失败" }, 400);
  }
});

dataRoutes.post("/workspaces/:id/sparql", async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const parsed = SparqlQueryInputSchema.parse({
    ...(await c.req.json()),
    workspaceId,
  });
  try {
    return await withTenantDb(actor.tenantId, async (txDb) =>
      c.json(await runWorkspaceSparql(txDb, workspaceId, actor.role, parsed.query, parsed.limit))
    );
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "SPARQL 执行失败" }, 400);
  }
});
