import { Hono } from "hono";
import type { Role } from "@lingdong/contracts";
import { withTenantDb } from "../db/client.js";
import { appendAuditChainEntry, verifyAuditHashChain } from "../security/audit-chain-service.js";
import { requireRoles, type SessionActor } from "../security/guards.js";
import { reclaimExpiredLeasedJobs, retryDeadLetterJob } from "../services/async-job-recovery.js";
import {
  addClassToBranch,
  approveMergeRequestStage,
  createOntologyBranch,
  listBranchesAndMrs,
  mergeApprovedRequest,
  openMergeRequest,
} from "../services/v6-branch-pr-service.js";
import {
  bindAndSyncFederatedParent,
  createOrgUnit,
  getFederationState,
  listOrgUnits,
  syncScimUsersBatch,
  type FederatedBindingRecord,
  type OrgUnitNode,
} from "../services/v6-federation-org-service.js";
import { listManagedSecrets, rotateManagedSecret, scanLineageSchemaDrift } from "../services/v6-lineage-kms-service.js";

type AppEnv = { Variables: { actor: SessionActor } };

const ownerGuard = requireRoles("OWNER");
const modelerGuard = requireRoles("OWNER", "MODELER");
const operatorGuard = requireRoles("OWNER", "MODELER", "OPERATOR");

export const v6FlagshipRoutes = new Hono<AppEnv>();

// M2: Lease Recovery & Dead-Letter Replay
v6FlagshipRoutes.post("/workspaces/:id/jobs/reclaim", operatorGuard, async (c) => {
  const res = await reclaimExpiredLeasedJobs();
  return c.json({ ok: true, ...res });
});

v6FlagshipRoutes.post("/workspaces/:id/jobs/:jobId/retry", operatorGuard, async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const jobId = c.req.param("jobId");
  const res = await withTenantDb(actor.tenantId, (txDb) =>
    retryDeadLetterJob(txDb, actor.tenantId, wsId, jobId, `${actor.name} (${actor.role})`)
  );
  return c.json(res);
});

// M3: SM3 Tamper-Evident Audit Hash Chain
v6FlagshipRoutes.get("/workspaces/:id/governance/audit-chain/verify", async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const res = await withTenantDb(actor.tenantId, (txDb) => verifyAuditHashChain(txDb, wsId));
  return c.json(res);
});

v6FlagshipRoutes.post("/workspaces/:id/governance/audit-chain/append", operatorGuard, async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { summary?: string };
  const res = await withTenantDb(actor.tenantId, (txDb) =>
    appendAuditChainEntry(
      txDb,
      actor.tenantId,
      wsId,
      `manual-${Date.now()}`,
      `${actor.name} (${actor.role})`,
      body.summary?.trim() || "手动触发审计链存证锚点"
    )
  );
  return c.json({ ok: true, ...res });
});

// M4: Group Multi-Level Org Tree + SCIM 2.0 + Federated Ontology Inheritance
v6FlagshipRoutes.get("/org/units", async (c) => {
  const actor = c.get("actor");
  const units = await listOrgUnits(actor.tenantId);
  return c.json({ units });
});

v6FlagshipRoutes.post("/org/units", ownerGuard, async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json().catch(() => ({}))) as {
    parentId?: string | null;
    code?: string;
    name?: string;
    level?: OrgUnitNode["level"];
  };
  if (!body.code?.trim() || !body.name?.trim()) {
    return c.json({ error: "请填写组织编码与名称" }, 400);
  }
  const res = await createOrgUnit(actor.tenantId, {
    parentId: body.parentId ?? "org-hq",
    code: body.code,
    name: body.name,
    level: body.level ?? "SUBSIDIARY",
  });
  return c.json({ ok: true, ...res });
});

v6FlagshipRoutes.post("/scim/v2/Users/sync", ownerGuard, async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json().catch(() => ({}))) as {
    workspaceId?: string;
    Resources?: Array<{ externalId?: string; userName: string; displayName: string; title?: string; role?: Role }>;
  };
  const list = body.Resources ?? [];
  if (list.length === 0) return c.json({ error: "SCIM Resources 列表不能为空" }, 400);
  const res = await withTenantDb(actor.tenantId, (txDb) =>
    syncScimUsersBatch(txDb, actor.tenantId, body.workspaceId ?? "ws-contract", `${actor.name} (${actor.role})`, list)
  );
  return c.json({ ok: true, ...res });
});

v6FlagshipRoutes.get("/workspaces/:id/federation", async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const state = await withTenantDb(actor.tenantId, (txDb) => getFederationState(txDb, actor.tenantId, wsId));
  return c.json(state);
});

v6FlagshipRoutes.post("/workspaces/:id/federation/bind", ownerGuard, async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as {
    parentWorkspaceId?: string;
    overridePolicy?: FederatedBindingRecord["overridePolicy"];
    pullUpstreamClasses?: boolean;
  };
  if (!body.parentWorkspaceId) return c.json({ error: "请指定集团核心父工作空间" }, 400);
  const res = await withTenantDb(actor.tenantId, (txDb) =>
    bindAndSyncFederatedParent(
      txDb,
      actor.tenantId,
      wsId,
      body.parentWorkspaceId!,
      body.overridePolicy ?? "STRICT_READONLY_CORE",
      `${actor.name} (${actor.role})`,
      Boolean(body.pullUpstreamClasses)
    )
  );
  return c.json({ ok: true, ...res });
});

// M5: Git-Style Branch / PR 3-Way Merge + Two-Stage Approval Chain
v6FlagshipRoutes.get("/workspaces/:id/branches", async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  return c.json(await listBranchesAndMrs(actor.tenantId, wsId));
});

v6FlagshipRoutes.post("/workspaces/:id/branches", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { branchName?: string };
  const branch = await withTenantDb(actor.tenantId, (txDb) =>
    createOntologyBranch(txDb, actor.tenantId, wsId, body.branchName ?? "", `${actor.name} (${actor.role})`)
  );
  return c.json({ ok: true, branch, message: `已创建隔离特性分支 ${branch.branchName}` });
});

v6FlagshipRoutes.post("/workspaces/:id/branches/:branchId/classes", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const branchId = c.req.param("branchId");
  const body = (await c.req.json().catch(() => ({}))) as {
    localName?: string;
    labelZh?: string;
    subClassOf?: string;
    description?: string;
  };
  const branch = await addClassToBranch(actor.tenantId, wsId, branchId, {
    localName: body.localName ?? "",
    labelZh: body.labelZh ?? "",
    subClassOf: body.subClassOf,
    description: body.description,
  });
  return c.json({ ok: true, branch, message: `已在分支 ${branch.branchName} 中新增/更新类 ont:${body.localName}` });
});

v6FlagshipRoutes.post("/workspaces/:id/merge-requests", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { branchId?: string; title?: string };
  if (!body.branchId) return c.json({ error: "请指定源特性分支" }, 400);
  const mr = await withTenantDb(actor.tenantId, (txDb) =>
    openMergeRequest(txDb, actor.tenantId, wsId, body.branchId!, body.title ?? "", `${actor.name} (${actor.role})`)
  );
  return c.json({ ok: true, mr, message: `已创建合并请求 ${mr.id} 并启动两级审批会签` });
});

v6FlagshipRoutes.post("/workspaces/:id/merge-requests/:mrId/approve", async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const mrId = c.req.param("mrId");
  const mr = await approveMergeRequestStage(actor.tenantId, wsId, mrId, actor.role, `${actor.name} (${actor.role})`);
  return c.json({ ok: true, mr, message: `已完成会签审批节点（${actor.name}）` });
});

v6FlagshipRoutes.post("/workspaces/:id/merge-requests/:mrId/merge", ownerGuard, async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const mrId = c.req.param("mrId");
  const res = await withTenantDb(actor.tenantId, (txDb) =>
    mergeApprovedRequest(txDb, actor.tenantId, wsId, mrId, `${actor.name} (${actor.role})`)
  );
  return c.json({ ok: true, ...res });
});

// M6: 4-Layer Lineage Schema Drift Alerting + Vault/KMS Secret Rotation
v6FlagshipRoutes.post("/workspaces/:id/lineage/drift-scan", async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { droppedColumn?: string; typeChangedColumn?: string };
  const report = await withTenantDb(actor.tenantId, (txDb) => scanLineageSchemaDrift(txDb, wsId, body));
  return c.json(report);
});

v6FlagshipRoutes.get("/workspaces/:id/governance/kms-secrets", async (c) => {
  const actor = c.get("actor");
  const secrets = await withTenantDb(actor.tenantId, (txDb) => listManagedSecrets(txDb, actor.tenantId));
  return c.json({ secrets });
});

v6FlagshipRoutes.post("/workspaces/:id/governance/kms-secrets/:alias/rotate", ownerGuard, async (c) => {
  const actor = c.get("actor");
  const wsId = c.req.param("id");
  const alias = c.req.param("alias");
  const res = await withTenantDb(actor.tenantId, (txDb) =>
    rotateManagedSecret(txDb, actor.tenantId, wsId, alias, `${actor.name} (${actor.role})`)
  );
  return c.json({ ok: true, ...res });
});
