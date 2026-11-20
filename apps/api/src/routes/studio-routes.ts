import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  CommitChangeSetInputSchema,
  CreateCompetencyQuestionInputSchema,
  QuickCreateAssetInputSchema,
  type Workspace,
} from "@lingdong/contracts";
import { withTenantDb, type AppDb } from "../db/client.js";
import {
  auditEvents,
  changesets,
  competencyQuestions,
  ontologyRevisions,
  users,
  workspaces,
} from "../db/schema.js";
import { issueSessionCookie, requireRoles, type SessionActor } from "../security/guards.js";
import {
  commitChangeSet,
  getModelingWorkspace,
  getOntologySnapshot,
  OptimisticLockConflictError,
  quickCreateAsset,
} from "../services/ontology-service.js";
import {
  extractProposalsFromDocChunks,
  parseAndStoreUploadedDocument,
} from "../services/document-extraction-service.js";
import { getGovernanceSnapshot } from "../services/release-portal-service.js";
import { dataRoutes } from "./data-routes.js";
import { m3OntologyRoutes } from "./m3-ontology-routes.js";

type AppEnv = { Variables: { actor: SessionActor } };

async function formatWorkspaces(txDb: AppDb): Promise<Workspace[]> {
  const wsRows = await txDb.select().from(workspaces);
  const activeCodes = [...new Set(wsRows.map((w) => w.activeRevisionId).filter(Boolean))];
  const revRows = activeCodes.length
    ? await txDb
        .select({ workspaceId: ontologyRevisions.workspaceId, revisionCode: ontologyRevisions.revisionCode, classesJson: ontologyRevisions.classesJson, propertiesJson: ontologyRevisions.propertiesJson })
        .from(ontologyRevisions)
        .where(inArray(ontologyRevisions.revisionCode, activeCodes))
    : [];
  const csRows = await txDb
    .select({ workspaceId: changesets.workspaceId, proposalsJson: changesets.proposalsJson })
    .from(changesets)
    .where(eq(changesets.status, "OPEN"));

  const order: Record<string, number> = { "ws-contract": 0, "ws-itu": 1, "ws-supply": 2 };
  wsRows.sort((a, b) => (order[a.id] ?? 99) - (order[b.id] ?? 99));

  return wsRows.map((w) => {
    const rev = revRows.find((r) => r.workspaceId === w.id && r.revisionCode === w.activeRevisionId);
    const openCs = csRows.find((c) => c.workspaceId === w.id);
    const pendingCount = (openCs?.proposalsJson ?? []).filter((p) => p.status === "PENDING").length;
    const classes = rev?.classesJson ?? [];
    const props = rev?.propertiesJson ?? [];
    const shaclCount = classes.reduce((s, c) => s + c.shaclConstraints.length, 0);

    return {
      id: w.id,
      tenantId: w.tenantId,
      slug: w.slug,
      name: w.name,
      versionLabel: w.versionLabel,
      status: w.status,
      description: w.description,
      namespaceIri: w.namespaceIri,
      activeRevisionId: w.activeRevisionId,
      publishedRevisionId: w.publishedRevisionId,
      classCount: classes.length,
      propertyCount: props.length,
      shaclCount,
      aboxInstanceCount: w.aboxInstanceCount,
      pendingProposalCount: pendingCount,
      updatedAt: w.updatedAt.toISOString(),
    };
  });
}

export const studioRoutes = new Hono<AppEnv>();

studioRoutes.route("/", dataRoutes);
studioRoutes.route("/", m3OntologyRoutes);

studioRoutes.get("/bootstrap", async (c) => {
  const actor = c.get("actor");
  const requestedId = c.req.query("workspaceId");
  return withTenantDb(actor.tenantId, async (txDb) => {
    const allWorkspaces = await formatWorkspaces(txDb);
    const activeWorkspace = allWorkspaces.find((w) => w.id === requestedId) ?? allWorkspaces[0];
    if (!activeWorkspace) return c.json({ error: "当前租户下无可用方案空间" }, 404);
    const governance = await getGovernanceSnapshot(txDb, actor, activeWorkspace.id);
    return c.json({ workspaces: allWorkspaces, activeWorkspace, governance });
  });
});

studioRoutes.post("/session/switch-actor", async (c) => {
  if (process.env.PLATFORM_GATEWAY_TOKEN && process.env.ALLOW_DEMO_ACTOR_SWITCH !== "true") {
    return c.json({ error: "零信任生产模式拦截：禁止客户端直接切换会话角色" }, 403);
  }
  const currentActor = c.get("actor");
  const body = (await c.req.json()) as { userId?: string; workspaceId?: string };
  return withTenantDb(currentActor.tenantId, async (txDb) => {
    const [u] = await txDb
      .select()
      .from(users)
      .where(and(eq(users.id, body.userId ?? ""), eq(users.tenantId, currentActor.tenantId)));
    if (!u) return c.json({ error: "未找到目标角色成员" }, 404);

    const nextActor: SessionActor = {
      userId: u.id,
      name: u.name,
      role: u.defaultRole,
      tenantId: u.tenantId,
    };
    issueSessionCookie(c, nextActor);
    const allWs = await formatWorkspaces(txDb);
    const targetWsId = body.workspaceId || allWs[0]?.id || "ws-contract";
    const governance = await getGovernanceSnapshot(txDb, nextActor, targetWsId);
    return c.json({ actor: nextActor, governance });
  });
});

studioRoutes.get("/workspaces/:id/overview", async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  return withTenantDb(actor.tenantId, async (txDb) => {
    const allWs = await formatWorkspaces(txDb);
    const workspace = allWs.find((w) => w.id === workspaceId);
    if (!workspace) return c.json({ error: "未找到方案空间" }, 404);

    const [rawWs] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    const cqs = await txDb
      .select()
      .from(competencyQuestions)
      .where(eq(competencyQuestions.workspaceId, workspaceId));
    const recentAudits = await txDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.workspaceId, workspaceId))
      .orderBy(desc(auditEvents.occurredAt))
      .limit(5);

    return c.json({
      workspace,
      workItems: rawWs?.workItemsJson ?? [],
      competencyQuestions: cqs,
      recentAuditEvents: recentAudits.map((a) => ({
        id: a.id,
        workspaceId: a.workspaceId,
        category: a.category,
        categoryLabel: a.categoryLabel,
        actorDisplay: a.actorDisplay,
        summary: a.summary,
        actionableByMe: a.actionableByRole === actor.role,
        occurredAt: a.occurredAt,
      })),
    });
  });
});

const modelerGuard = requireRoles("OWNER", "MODELER");
studioRoutes.post("/workspaces/:id/cqs", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const parsed = CreateCompetencyQuestionInputSchema.parse({ ...(await c.req.json()), workspaceId });
  return withTenantDb(actor.tenantId, async (txDb) => {
    const item = {
      id: `cq-${Date.now()}`,
      tenantId: actor.tenantId,
      workspaceId,
      code: parsed.code,
      question: parsed.question,
      coveredConcepts: parsed.coveredConcepts,
      boundCapability: parsed.boundCapability,
      status: "PASSED" as const,
    };
    await txDb.insert(competencyQuestions).values(item);
    await txDb.insert(auditEvents).values({
      id: `aud-cq-${Date.now()}`,
      tenantId: actor.tenantId,
      workspaceId,
      category: "ONTOLOGY_CHANGE",
      categoryLabel: "新增胜任力问题",
      actorDisplay: `${actor.name} (${actor.role})`,
      summary: `登记业务验证题 ${parsed.code}：${parsed.question.slice(0, 40)}`,
      occurredAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    });
    return c.json(item, 201);
  });
});

studioRoutes.get("/workspaces/:id/modeling", async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await getModelingWorkspace(txDb, c.req.param("id")))
  );
});

studioRoutes.post("/workspaces/:id/modeling/extract", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as {
    documentId?: string;
    chunkId?: string;
    instruction?: string;
  };
  return withTenantDb(actor.tenantId, async (txDb) => {
    const res = await extractProposalsFromDocChunks(
      txDb,
      actor.tenantId,
      workspaceId,
      body.documentId ?? "",
      body.chunkId,
      body.instruction
    );
    return c.json({
      proposals: res.proposals,
      engineUsed: res.engineUsed,
      message: `已通过 ${res.engineUsed} 抽取并更新候选提案队列`,
    });
  });
});

studioRoutes.post("/workspaces/:id/documents", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const contentType = c.req.header("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.parseBody();
    const uploaded = form["file"];
    const file = uploaded instanceof File ? uploaded : null;
    const title = typeof form["title"] === "string" ? form["title"] : undefined;
    const content = typeof form["content"] === "string" ? form["content"] : undefined;
    return withTenantDb(actor.tenantId, async (txDb) =>
      c.json(await parseAndStoreUploadedDocument(txDb, actor.tenantId, workspaceId, { file, title, content }), 201)
    );
  }

  const body = (await c.req.json()) as { title?: string; content?: string };
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await parseAndStoreUploadedDocument(txDb, actor.tenantId, workspaceId, body), 201)
  );
});

studioRoutes.get("/workspaces/:id/ontology", async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await getOntologySnapshot(txDb, c.req.param("id")))
  );
});

studioRoutes.post("/workspaces/:id/changesets/commit", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const parsed = CommitChangeSetInputSchema.parse({ ...(await c.req.json()), workspaceId });
  try {
    return await withTenantDb(actor.tenantId, async (txDb) =>
      c.json(await commitChangeSet(txDb, actor.tenantId, workspaceId, parsed.baseRevisionId, parsed.proposalIds, `${actor.name} (${actor.role})`))
    );
  } catch (err) {
    if (err instanceof OptimisticLockConflictError) return c.json({ error: err.message }, 409);
    return c.json({ error: err instanceof Error ? err.message : "提交失败" }, 400);
  }
});

studioRoutes.post("/workspaces/:id/quick-create", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const parsed = QuickCreateAssetInputSchema.parse({ ...(await c.req.json()), workspaceId });
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await quickCreateAsset(txDb, actor.tenantId, workspaceId, parsed), 201)
  );
});
