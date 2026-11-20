import { and, eq } from "drizzle-orm";
import type { Role } from "@lingdong/contracts";
import { renderWorkspaceTurtle, shaclGraphUri, tboxGraphUri } from "@lingdong/semantic-core";
import type { AppDb } from "../db/client.js";
import { loadRuntimeKv, saveRuntimeKv } from "../db/runtime-kv.js";
import { auditEvents, ontologyRevisions, releases, workspaces } from "../db/schema.js";
import { graphStore, syncRevisionToGraphStore } from "../graph-runtime.js";

const nowStr = () => new Date().toISOString().slice(0, 16).replace("T", " ");

export async function proposeCandidateRelease(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  actor: { userId: string; name: string; role: Role },
  input: { version?: string; notes?: string }
) {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");

  const version = input.version?.trim() || `v2.${(Math.floor(Date.now() / 1000) % 90) + 1}.0`;
  const id = `rel-cand-${Date.now()}`;
  await txDb.insert(releases).values({
    id,
    tenantId,
    workspaceId,
    version,
    revisionId: ws.activeRevisionId,
    status: "AWAITING_REVIEW",
    submittedBy: `${actor.name} (${actor.role})`,
    submittedById: actor.userId,
    reviewedBy: null,
    sha256ManifestHash: `${ws.activeRevisionId}cand`,
    publishedAt: null,
  });

  await txDb.insert(auditEvents).values({
    id: `aud-rel-prop-${Date.now()}`,
    tenantId,
    workspaceId,
    category: "RELEASE_APPROVAL",
    categoryLabel: "发起候选发布",
    actorDisplay: `${actor.name} (${actor.role})`,
    summary: `基于修订 rev:${ws.activeRevisionId} 发起候选版本 ${version} 审核${input.notes ? `：${input.notes}` : ""}`,
    occurredAt: nowStr(),
  });
  return {
    id,
    version,
    revisionId: ws.activeRevisionId,
    message: `已创建候选发布 ${version} (rev:${ws.activeRevisionId})，等待独立审核人签署`,
  };
}

export async function rejectCandidateRelease(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  releaseId: string,
  actorDisplay: string,
  reason?: string
) {
  const [rel] = await txDb
    .select()
    .from(releases)
    .where(and(eq(releases.id, releaseId), eq(releases.workspaceId, workspaceId)));
  if (!rel) throw new Error("未找到待审候选版本");
  if (rel.status === "PUBLISHED") throw new Error("已发布的不可变版本禁止驳回删除");

  await txDb.delete(releases).where(eq(releases.id, releaseId));
  await txDb.insert(auditEvents).values({
    id: `aud-rel-rej-${Date.now()}`,
    tenantId,
    workspaceId,
    category: "RELEASE_APPROVAL",
    categoryLabel: "驳回候选发布",
    actorDisplay,
    summary: `驳回并撤回候选版本 ${rel.version}：${reason?.trim() || "请完善建模与质量门禁后重新提交"}`,
    occurredAt: nowStr(),
  });
  return { ok: true, message: `已驳回候选版本 ${rel.version}` };
}

export async function deleteOntologyClassSafe(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  classLocalName: string,
  actorDisplay: string
) {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");
  const revs = await txDb.select().from(ontologyRevisions).where(eq(ontologyRevisions.workspaceId, workspaceId));
  const current = revs.find((r) => r.revisionCode === ws.activeRevisionId) ?? revs[0];
  if (!current) throw new Error("未找到当前本体修订");

  const target = current.classesJson.find((c) => c.localName === classLocalName || c.iri === classLocalName);
  if (!target) throw new Error("未找到指定本体类");

  const nextClasses = current.classesJson.filter((c) => c.localName !== target.localName);
  const nextProps = current.propertiesJson.filter(
    (p) => p.domainLocalName !== target.localName && p.rangeLocalName !== target.localName
  );
  const rendered = renderWorkspaceTurtle(ws.namespaceIri, nextClasses, nextProps);
  const tempRev = `del-${Date.now()}`;
  syncRevisionToGraphStore(workspaceId, tempRev, ws.namespaceIri, nextClasses, nextProps);
  const { shortRev, sha256 } = graphStore.computeCanonicalGraphHash([
    tboxGraphUri(workspaceId, tempRev),
    shaclGraphUri(workspaceId, tempRev),
  ]);
  syncRevisionToGraphStore(workspaceId, shortRev, ws.namespaceIri, nextClasses, nextProps);

  await txDb.insert(ontologyRevisions).values({
    id: `rev-${workspaceId}-${shortRev}-${Date.now()}`,
    tenantId,
    workspaceId,
    revisionCode: shortRev,
    parentRevisionCode: current.revisionCode,
    sha256Hash: sha256,
    classesJson: nextClasses,
    propertiesJson: nextProps,
    diffItemsJson: [{ changeType: "REMOVED", summary: `- 归档删除本体类 ont:${target.localName} (${target.labelZh})` }],
    backwardCompatible: false,
    turtleSource: rendered.combinedTurtle,
    tboxGraphUri: tboxGraphUri(workspaceId, shortRev),
    shaclGraphUri: shaclGraphUri(workspaceId, shortRev),
    createdBy: actorDisplay,
  });
  await txDb.update(workspaces).set({ activeRevisionId: shortRev, updatedAt: new Date() }).where(eq(workspaces.id, workspaceId));
  await txDb.insert(auditEvents).values({
    id: `aud-cls-del-${Date.now()}`,
    tenantId,
    workspaceId,
    category: "ONTOLOGY_CHANGE",
    categoryLabel: "归档删除本体类",
    actorDisplay,
    summary: `归档移除本体类 ont:${target.localName} (${target.labelZh}) → 生成修订 rev:${shortRev}`,
    occurredAt: nowStr(),
  });
  return { ok: true, revisionCode: shortRev, message: `已归档删除本体类「${target.labelZh}」(rev:${shortRev})` };
}

export async function deleteOntologyBranch(tenantId: string, workspaceId: string, branchId: string) {
  const saved = await loadRuntimeKv<{ branches: Array<{ id: string; name: string }> }>(tenantId, "ontology_branches", workspaceId);
  const next = (saved?.branches ?? []).filter((b) => b.id !== branchId);
  await saveRuntimeKv(tenantId, "ontology_branches", workspaceId, { branches: next });
  return { ok: true, branches: next, message: "已删除特性分支" };
}
