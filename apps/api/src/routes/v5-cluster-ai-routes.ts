import { hostname } from "node:os";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { adminSql, withTenantDb } from "../db/client.js";
import type { AsyncJobType } from "../db/schema-jobs.js";
import { getGraphClusterStatus } from "../graph-runtime.js";
import { requireRoles, type SessionActor } from "../security/guards.js";
import { getRedisClusterStatus } from "../security/redis-store.js";
import { enqueueAsyncJob, getAsyncJobById, listAsyncJobs, scheduleAsyncJobWorker } from "../services/async-job-service.js";
import { executeNaturalLanguageSparql } from "../services/nl-sparql-service.js";
import {
  runWhatIfShadowSimulation,
  type WhatIfScenarioKind,
} from "../services/whatif-simulation-service.js";

type AppEnv = { Variables: { actor: SessionActor } };

const jobOperatorGuard = requireRoles("OWNER", "MODELER", "OPERATOR");
const INSTANCE_ID = process.env.HOSTNAME || `${hostname()}-${process.pid}`;

export const v5ClusterAiRoutes = new Hono<AppEnv>();

v5ClusterAiRoutes.get("/cluster/health", async (c) => {
  const [redis, graphStore] = await Promise.all([
    getRedisClusterStatus(),
    getGraphClusterStatus(),
  ]);
  let postgresOk = true;
  try {
    await adminSql`SELECT 1`;
  } catch {
    postgresOk = false;
  }
  const mem = process.memoryUsage();
  return c.json({
    instanceId: INSTANCE_ID,
    statelessReady: redis.mode === "redis" && graphStore.statelessClusterReady,
    postgres: { healthy: postgresOk },
    redis,
    graphStore,
    memory: {
      rssMb: Number((mem.rss / 1024 / 1024).toFixed(1)),
      heapUsedMb: Number((mem.heapUsed / 1024 / 1024).toFixed(1)),
    },
    checkedAt: new Date().toISOString(),
  });
});

v5ClusterAiRoutes.get("/workspaces/:id/jobs", async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const jobs = await withTenantDb(actor.tenantId, (txDb) => listAsyncJobs(txDb, wsId));
  return c.json({ jobs, instanceId: INSTANCE_ID });
});

v5ClusterAiRoutes.post("/workspaces/:id/jobs", jobOperatorGuard, async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as {
    jobType?: AsyncJobType;
    payload?: Record<string, unknown>;
  };
  const jobType: AsyncJobType =
    body.jobType === "MULTI_SOURCE_FUSION" || body.jobType === "SHACL_FULL_AUDIT"
      ? body.jobType
      : "MATERIALIZE_BATCH";

  const actorDisplay = `${actor.name} (${actor.role})`;
  const job = await withTenantDb(actor.tenantId, (txDb) =>
    enqueueAsyncJob(txDb, actor.tenantId, wsId, jobType, actorDisplay, body.payload ?? {})
  );
  // Schedule outside the request's AsyncLocalStorage DB transaction
  scheduleAsyncJobWorker(job.id, actor.tenantId, wsId, actorDisplay);
  return c.json({ job, message: `异步作业 ${job.id} 已入队（PG SKIP LOCKED 多副本安全调度）` }, 202);
});

v5ClusterAiRoutes.get("/workspaces/:id/jobs/:jobId/stream", async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const jobId = c.req.param("jobId");

  return streamSSE(c, async (stream) => {
    for (let tick = 0; tick < 30; tick++) {
      const job = await withTenantDb(actor.tenantId, (txDb) => getAsyncJobById(txDb, wsId, jobId));
      if (!job) {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ error: "未找到异步作业" }) });
        break;
      }
      await stream.writeSSE({ event: "progress", data: JSON.stringify(job) });
      if (job.status === "COMPLETED" || job.status === "FAILED") break;
      await stream.sleep(250);
    }
  });
});

v5ClusterAiRoutes.post("/workspaces/:id/portal/nl-query", async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { question?: string };
  if (!body.question?.trim()) {
    return c.json({ error: "请输入自然语言业务问题" }, 400);
  }
  const res = await withTenantDb(actor.tenantId, (txDb) =>
    executeNaturalLanguageSparql(
      txDb,
      actor.tenantId,
      wsId,
      body.question!,
      actor.role,
      `${actor.name} (${actor.role})`
    )
  );
  return c.json(res);
});

v5ClusterAiRoutes.post("/workspaces/:id/portal/whatif-simulate", async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as {
    scenario?: WhatIfScenarioKind;
    targetEntityId?: string;
    thresholdWan?: number;
  };
  const scenario: WhatIfScenarioKind =
    body.scenario === "CONTRACT_TERMINATION" || body.scenario === "RISK_THRESHOLD_TIGHTEN"
      ? body.scenario
      : "SUPPLIER_DEFAULT";

  const res = await withTenantDb(actor.tenantId, (txDb) =>
    runWhatIfShadowSimulation(txDb, actor.tenantId, wsId, `${actor.name} (${actor.role})`, {
      scenario,
      targetEntityId: body.targetEntityId,
      thresholdWan: body.thresholdWan,
    })
  );
  return c.json(res);
});
