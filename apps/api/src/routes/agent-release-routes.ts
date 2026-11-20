import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { ActionDecisionInputSchema, AgentAskInputSchema } from "@lingdong/contracts";
import { withTenantDb } from "../db/client.js";
import { capabilities, documents } from "../db/schema.js";
import { requireRoles, type SessionActor } from "../security/guards.js";
import {
  askOntologyAgent,
  executeGovernedPlanDecision,
  getAppsWorkspace,
  SeparationOfDutiesError,
} from "../services/agent-service.js";
import {
  getCachedBenchmarkCases,
  handleStandardMcpJsonRpc,
  runLiveGoldenBenchmark,
} from "../services/m5-benchmark-and-mcp-service.js";
import { m5M6Routes } from "./m5-m6-routes.js";
import { runWorkspaceSparql } from "../services/data-service.js";
import {
  approveReleasePackageSoD,
  buildImmutableReleaseZip,
  getGovernanceSnapshot,
  getPortalSnapshot,
  getQualityAndReleaseSnapshot,
} from "../services/release-portal-service.js";
import {
  getPublicLlmConfigView,
  saveTenantLlmConfig,
  testTenantLlmConnection,
} from "../services/llm-config-service.js";

type AppEnv = { Variables: { actor: SessionActor } };

export const agentReleaseRoutes = new Hono<AppEnv>();

agentReleaseRoutes.route("/", m5M6Routes);

agentReleaseRoutes.get("/workspaces/:id/apps", async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  return withTenantDb(actor.tenantId, async (txDb) => {
    const base = await getAppsWorkspace(txDb, workspaceId, actor);
    let benchmarkCases = getCachedBenchmarkCases(workspaceId);
    if (benchmarkCases.length === 0) {
      benchmarkCases = (await runLiveGoldenBenchmark(txDb, workspaceId, getAppsWorkspace)).caseResults;
    }
    return c.json({ ...base, benchmarkCases });
  });
});

agentReleaseRoutes.post("/workspaces/:id/agent/ask", async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const parsed = AgentAskInputSchema.parse({
    ...(await c.req.json()),
    workspaceId,
  });
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await askOntologyAgent(txDb, actor, workspaceId, parsed.sessionId, parsed.question))
  );
});

agentReleaseRoutes.post("/workspaces/:id/agent/plans/:planId/confirm", async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const planId = c.req.param("planId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = ActionDecisionInputSchema.parse({ ...body, workspaceId, planId });
  try {
    return await withTenantDb(actor.tenantId, async (txDb) =>
      c.json(
        await executeGovernedPlanDecision(
          txDb,
          actor,
          workspaceId,
          planId,
          "CONFIRM",
          parsed.confirmationToken,
          parsed.simulateDownstreamFailure
        )
      )
    );
  } catch (err) {
    if (err instanceof SeparationOfDutiesError) return c.json({ error: err.message }, 403);
    return c.json({ error: err instanceof Error ? err.message : "确认执行失败" }, 400);
  }
});

agentReleaseRoutes.post("/workspaces/:id/agent/plans/:planId/approve", async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const planId = c.req.param("planId");
  try {
    return await withTenantDb(actor.tenantId, async (txDb) =>
      c.json(await executeGovernedPlanDecision(txDb, actor, workspaceId, planId, "APPROVE"))
    );
  } catch (err) {
    if (err instanceof SeparationOfDutiesError) {
      return c.json({ error: err.message }, 403);
    }
    return c.json({ error: err instanceof Error ? err.message : "独立审批失败" }, 400);
  }
});

const operatorGuard = requireRoles("OWNER", "MODELER", "OPERATOR");

agentReleaseRoutes.post("/workspaces/:id/apps/evaluate", operatorGuard, async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await runLiveGoldenBenchmark(txDb, c.req.param("id"), getAppsWorkspace))
  );
});

agentReleaseRoutes.get("/workspaces/:id/release", async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await getQualityAndReleaseSnapshot(txDb, c.req.param("id")))
  );
});

agentReleaseRoutes.post("/workspaces/:id/release/diagnose", operatorGuard, async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await getQualityAndReleaseSnapshot(txDb, c.req.param("id")))
  );
});

agentReleaseRoutes.post("/workspaces/:id/releases/:releaseId/approve", async (c) => {
  const actor = c.get("actor");
  try {
    return await withTenantDb(actor.tenantId, async (txDb) =>
      c.json(
        await approveReleasePackageSoD(
          txDb,
          actor,
          c.req.param("id"),
          c.req.param("releaseId")
        )
      )
    );
  } catch (err) {
    if (err instanceof SeparationOfDutiesError) {
      return c.json({ error: err.message }, 403);
    }
    return c.json({ error: err instanceof Error ? err.message : "签署发布失败" }, 400);
  }
});

agentReleaseRoutes.get("/workspaces/:id/releases/:releaseId/download", async (c) => {
  const actor = c.get("actor");
  try {
    return await withTenantDb(actor.tenantId, async (txDb) => {
      const bundle = await buildImmutableReleaseZip(txDb, c.req.param("id"), c.req.param("releaseId"));
      return new Response(Buffer.from(bundle.bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${bundle.filename}"`,
        },
      });
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "导出方案包失败" }, 400);
  }
});

agentReleaseRoutes.get("/workspaces/:id/governance", async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await getGovernanceSnapshot(txDb, actor, c.req.param("id")))
  );
});

agentReleaseRoutes.get("/governance/llm-config", (c) => {
  const actor = c.get("actor");
  return c.json(getPublicLlmConfigView(actor.tenantId));
});

agentReleaseRoutes.post("/governance/llm-config", async (c) => {
  const actor = c.get("actor");
  if (actor.role !== "OWNER") {
    return c.json({ error: "仅空间 OWNER 架构师可修改大模型接口与密钥配置" }, 403);
  }
  const body = (await c.req.json()) as {
    enabled?: boolean;
    providerLabel?: string;
    baseUrl?: string;
    modelId?: string;
    apiKey?: string;
  };
  const saved = saveTenantLlmConfig(actor.tenantId, {
    enabled: body.enabled ?? true,
    providerLabel: body.providerLabel,
    baseUrl: body.baseUrl ?? "",
    modelId: body.modelId ?? "qwen-max",
    apiKey: body.apiKey,
  });
  return c.json({ config: saved, message: "大模型连接配置已保存并立即生效（密钥已掩码保护）" });
});

agentReleaseRoutes.post("/governance/llm-test", requireRoles("OWNER"), async (c) => {
  const actor = c.get("actor");
  try {
    return c.json(await testTenantLlmConnection(actor.tenantId));
  } catch (err) {
    return c.json(
      { ok: false, latencyMs: 0, message: `连通测试失败：${err instanceof Error ? err.message : "未知错误"}` },
      400
    );
  }
});

agentReleaseRoutes.get("/workspaces/:id/portal", async (c) => {
  const actor = c.get("actor");
  return c.json(await getPortalSnapshot(actor.role));
});

// Official Streamable HTTP JSON-RPC 2.0 + REST MCP Read-Only Tool Exposure
export const mcpRoutes = new Hono<AppEnv>();

mcpRoutes.post("/", async (c) => {
  const actor = c.get("actor");
  const rpcBody = (await c.req.json()) as {
    jsonrpc?: string;
    id?: string | number | null;
    method: string;
    params?: Record<string, unknown>;
  };
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await handleStandardMcpJsonRpc(txDb, actor, rpcBody))
  );
});

mcpRoutes.get("/tools", async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.query("workspaceId") ?? actor.mcpWorkspaceId ?? "ws-contract";
  if (actor.mcpWorkspaceId && actor.mcpWorkspaceId !== workspaceId) {
    return c.json({ error: `MCP 令牌跨空间越权拦截：仅限 ${actor.mcpWorkspaceId}` }, 403);
  }
  return withTenantDb(actor.tenantId, async (txDb) => {
    const caps = await txDb.select().from(capabilities).where(eq(capabilities.workspaceId, workspaceId));
    const published = caps
      .filter((cap) => cap.mcpExposed && (cap.autonomyTier === "READ" || cap.autonomyTier === "DRAFT"))
      .map((cap) => ({ name: cap.code, uri: cap.mcpUri, description: cap.description, autonomyTier: cap.autonomyTier, quotaPerMinute: cap.quotaPerMinute }));
    return c.json({ protocol: "mcp/2025-03-26", workspaceId, tools: published });
  });
});

mcpRoutes.post("/call", async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json()) as { workspaceId?: string; toolName: string };
  const workspaceId = body.workspaceId ?? actor.mcpWorkspaceId ?? "ws-contract";
  if (actor.mcpWorkspaceId && actor.mcpWorkspaceId !== workspaceId) {
    return c.json({ error: `MCP 令牌跨空间越权拦截：仅限 ${actor.mcpWorkspaceId}` }, 403);
  }
  return withTenantDb(actor.tenantId, async (txDb) => {
    const caps = await txDb.select().from(capabilities).where(eq(capabilities.workspaceId, workspaceId));
    const allowed = caps.find((cap) => cap.code === body.toolName && cap.mcpExposed && (cap.autonomyTier === "READ" || cap.autonomyTier === "DRAFT"));
    if (!allowed) return c.json({ error: `MCP 白名单拦截：工具 ${body.toolName} 未对外公开` }, 403);
    if (body.toolName === "FindExpiringContracts") {
      const res = await runWorkspaceSparql(
        txDb,
        workspaceId,
        actor.role,
        `SELECT ?contractNo ?expiresAt ?totalAmount ?status WHERE { ?c a ont:Contract ; ont:contractNo ?contractNo ; ont:expiresAt ?expiresAt ; ont:totalAmount ?totalAmount ; ont:status ?status . } ORDER BY ?expiresAt LIMIT 20`
      );
      return c.json({ toolName: body.toolName, result: res.rows, maskedColumns: res.maskedColumnsApplied });
    }
    const docs = await txDb.select().from(documents).where(eq(documents.workspaceId, workspaceId));
    return c.json({ toolName: body.toolName, result: docs.flatMap((d) => d.chunksJson) });
  });
});
