import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { OntologyClass, Role } from "@lingdong/contracts";
import { renderWorkspaceTurtle, shaclGraphUri, tboxGraphUri } from "@lingdong/semantic-core";
import type { AppDb } from "../db/client.js";
import { loadRuntimeKv, saveRuntimeKv } from "../db/runtime-kv.js";
import { auditEvents, ontologyRevisions, workspaces } from "../db/schema.js";
import { graphStore, syncRevisionToGraphStore } from "../graph-runtime.js";
import { appendAuditChainEntry } from "../security/audit-chain-service.js";
import { assertWorkspaceNotRetired } from "./std-requirements-lifecycle-service.js";
import type { MergeRequestRecord, OntologyBranchRecord } from "./v6-branch-pr-types.js";
export type { ApprovalStage, MergeRequestRecord, OntologyBranchRecord } from "./v6-branch-pr-types.js";

const BRANCH_NS = "v6_ontology_branches";
const MR_NS = "v6_merge_requests";
const nowStr = () => new Date().toISOString().slice(0, 16).replace("T", " ");

export async function listBranchesAndMrs(tenantId: string, workspaceId: string) {
  const bSaved = await loadRuntimeKv<{ branches: OntologyBranchRecord[] }>(tenantId, BRANCH_NS, workspaceId);
  const mSaved = await loadRuntimeKv<{ mrs: MergeRequestRecord[] }>(tenantId, MR_NS, workspaceId);
  return {
    branches: bSaved?.branches ?? [],
    mergeRequests: mSaved?.mrs ?? [],
  };
}

export async function createOntologyBranch(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  branchName: string,
  actorDisplay: string
): Promise<OntologyBranchRecord> {
  await assertWorkspaceNotRetired(tenantId, workspaceId);
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");
  const [rev] = await txDb
    .select()
    .from(ontologyRevisions)
    .where(and(eq(ontologyRevisions.workspaceId, workspaceId), eq(ontologyRevisions.revisionCode, ws.activeRevisionId)))
    .limit(1);
  if (!rev) throw new Error("未找到主干活跃修订");

  const { branches } = await listBranchesAndMrs(tenantId, workspaceId);
  const cleanName = branchName.trim().replace(/\s+/g, "-") || `feat/branch-${Date.now()}`;
  const record: OntologyBranchRecord = {
    id: `br-${Date.now()}-${randomUUID().slice(0, 6)}`,
    workspaceId,
    branchName: cleanName,
    baseRevisionCode: rev.revisionCode,
    classes: structuredClone(rev.classesJson),
    properties: structuredClone(rev.propertiesJson),
    status: "ACTIVE",
    createdBy: actorDisplay,
    createdAt: nowStr(),
  };
  await saveRuntimeKv(tenantId, BRANCH_NS, workspaceId, { branches: [record, ...branches] });
  return record;
}

export async function addClassToBranch(
  tenantId: string,
  workspaceId: string,
  branchId: string,
  input: { localName: string; labelZh: string; subClassOf?: string; description?: string }
): Promise<OntologyBranchRecord> {
  const { branches } = await listBranchesAndMrs(tenantId, workspaceId);
  const idx = branches.findIndex((b) => b.id === branchId && b.status === "ACTIVE");
  if (idx === -1) throw new Error("未找到活跃特性分支");

  const localName = input.localName.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(localName)) {
    throw new Error("类标识符必须为英文驼峰格式（如 SupplierCredit）");
  }
  const branch = branches[idx];
  const exists = branch.classes.some((c) => c.localName === localName);
  const newClass: OntologyClass = {
    iri: `http://lingdong.caict.ac.cn/ont/${localName}`,
    localName,
    labelZh: input.labelZh.trim() || localName,
    labelEn: localName,
    description: input.description?.trim() || `分支 ${branch.branchName} 新增领域本体类`,
    roleKind: "knowledge",
    subClassOf: input.subClassOf?.trim() || "owl:Thing",
    positionX: 460 + branch.classes.length * 40,
    positionY: 220,
    instanceCount: 0,
    controlledActionCount: 0,
    downstreamMappings: [],
    downstreamCapabilities: [],
    properties: [],
    shaclConstraints: [],
  };
  const updated: OntologyBranchRecord = {
    ...branch,
    classes: exists
      ? branch.classes.map((c) => (c.localName === localName ? { ...c, labelZh: newClass.labelZh, description: newClass.description } : c))
      : [...branch.classes, newClass],
  };
  branches[idx] = updated;
  await saveRuntimeKv(tenantId, BRANCH_NS, workspaceId, { branches });
  return updated;
}

export async function openMergeRequest(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  branchId: string,
  title: string,
  actorDisplay: string
): Promise<MergeRequestRecord> {
  const { branches, mergeRequests } = await listBranchesAndMrs(tenantId, workspaceId);
  const branch = branches.find((b) => b.id === branchId && b.status === "ACTIVE");
  if (!branch) throw new Error("未找到可发起合并请求的活跃分支");

  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");
  const [mainRev] = await txDb
    .select()
    .from(ontologyRevisions)
    .where(and(eq(ontologyRevisions.workspaceId, workspaceId), eq(ontologyRevisions.revisionCode, ws.activeRevisionId)))
    .limit(1);

  const mainClassMap = new Map((mainRev?.classesJson ?? []).map((c) => [c.localName, c]));
  const addedClasses: string[] = [];
  const modifiedClasses: string[] = [];
  const conflictItems: string[] = [];

  for (const bc of branch.classes) {
    const mc = mainClassMap.get(bc.localName);
    if (!mc) {
      addedClasses.push(bc.localName);
    } else if (mc.labelZh !== bc.labelZh || mc.description !== bc.description || mc.subClassOf !== bc.subClassOf) {
      modifiedClasses.push(bc.localName);
      if (branch.baseRevisionCode !== ws.activeRevisionId) {
        conflictItems.push(`类 ont:${bc.localName} 在主干 (${ws.activeRevisionId}) 与分支均存在并发变更，需评审确认`);
      }
    }
  }

  const mr: MergeRequestRecord = {
    id: `mr-${Date.now()}-${randomUUID().slice(0, 6)}`,
    workspaceId,
    branchId: branch.id,
    branchName: branch.branchName,
    title: title.trim() || `合并分支 ${branch.branchName} 至主干`,
    baseRevisionCode: branch.baseRevisionCode,
    targetRevisionCode: ws.activeRevisionId,
    addedClasses,
    modifiedClasses,
    conflictItems,
    approvalChain: [
      { stageOrder: 1, stageName: "一级会签：领域架构师评审", requiredRoles: ["MODELER", "REVIEWER", "OWNER"], status: "PENDING" },
      { stageOrder: 2, stageName: "二级终审：集团数据治理委员会", requiredRoles: ["OWNER"], status: "PENDING" },
    ],
    status: "OPEN",
    createdBy: actorDisplay,
    createdAt: nowStr(),
  };

  await saveRuntimeKv(tenantId, MR_NS, workspaceId, { mrs: [mr, ...mergeRequests] });
  return mr;
}

export async function approveMergeRequestStage(
  tenantId: string,
  workspaceId: string,
  mrId: string,
  callerRole: Role,
  actorDisplay: string
): Promise<MergeRequestRecord> {
  const { mergeRequests } = await listBranchesAndMrs(tenantId, workspaceId);
  const idx = mergeRequests.findIndex((m) => m.id === mrId && m.status === "OPEN");
  if (idx === -1) throw new Error("未找到待审批的合并请求");

  const mr = mergeRequests[idx];
  const nextStage = mr.approvalChain.find((s) => s.status === "PENDING");
  if (!nextStage) throw new Error("所有会签审批节点均已通过，请直接执行合并");
  if (!nextStage.requiredRoles.includes(callerRole)) {
    throw new Error(`角色 ${callerRole} 无权审批「${nextStage.stageName}」（需 ${nextStage.requiredRoles.join("/")}）`);
  }

  nextStage.status = "APPROVED";
  nextStage.approvedBy = actorDisplay;
  nextStage.approvedAt = nowStr();
  mergeRequests[idx] = mr;
  await saveRuntimeKv(tenantId, MR_NS, workspaceId, { mrs: mergeRequests });
  return mr;
}

export async function mergeApprovedRequest(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  mrId: string,
  actorDisplay: string
): Promise<{ mr: MergeRequestRecord; revisionCode: string; message: string }> {
  await assertWorkspaceNotRetired(tenantId, workspaceId);
  const { branches, mergeRequests } = await listBranchesAndMrs(tenantId, workspaceId);
  const mrIdx = mergeRequests.findIndex((m) => m.id === mrId && m.status === "OPEN");
  if (mrIdx === -1) throw new Error("未找到可合并的请求");
  const mr = mergeRequests[mrIdx];

  const pendingStages = mr.approvalChain.filter((s) => s.status !== "APPROVED");
  if (pendingStages.length > 0) {
    throw new Error(`合并拦截：尚有 ${pendingStages.length} 级会签未通过（${pendingStages[0].stageName}）`);
  }
  const brIdx = branches.findIndex((b) => b.id === mr.branchId);
  if (brIdx === -1) throw new Error("未找到源特性分支");
  const branch = branches[brIdx];

  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");

  const rendered = renderWorkspaceTurtle(ws.namespaceIri, branch.classes, branch.properties);
  const tempRev = `mr-${Date.now()}`;
  syncRevisionToGraphStore(workspaceId, tempRev, ws.namespaceIri, branch.classes, branch.properties);
  const { shortRev, sha256 } = graphStore.computeCanonicalGraphHash([
    tboxGraphUri(workspaceId, tempRev),
    shaclGraphUri(workspaceId, tempRev),
  ]);
  graphStore.clearNamedGraph(tboxGraphUri(workspaceId, tempRev));
  graphStore.clearNamedGraph(shaclGraphUri(workspaceId, tempRev));
  syncRevisionToGraphStore(workspaceId, shortRev, ws.namespaceIri, branch.classes, branch.properties);

  const eventId = `aud-mr-${Date.now()}-${randomUUID().slice(0, 6)}`;
  await txDb.insert(ontologyRevisions).values({
    id: `rev-${workspaceId}-${shortRev}-${Date.now()}`,
    tenantId,
    workspaceId,
    revisionCode: shortRev,
    parentRevisionCode: ws.activeRevisionId,
    sha256Hash: sha256,
    classesJson: branch.classes,
    propertiesJson: branch.properties,
    diffItemsJson: [{ changeType: "ADDED", summary: `PR 合并分支 ${branch.branchName}（+${mr.addedClasses.length} 类）` }],
    backwardCompatible: mr.conflictItems.length === 0,
    turtleSource: rendered.combinedTurtle,
    tboxGraphUri: tboxGraphUri(workspaceId, shortRev),
    shaclGraphUri: shaclGraphUri(workspaceId, shortRev),
    createdBy: actorDisplay,
  });
  await txDb.update(workspaces).set({ activeRevisionId: shortRev, updatedAt: new Date() }).where(eq(workspaces.id, workspaceId));
  await txDb.insert(auditEvents).values({
    id: eventId,
    tenantId,
    workspaceId,
    category: "ONTOLOGY_CHANGE",
    categoryLabel: "PR 审批合并",
    actorDisplay,
    summary: `分支 ${branch.branchName} 通过两级会签并合入主干 → rev:${shortRev}`,
    occurredAt: nowStr(),
  });
  await appendAuditChainEntry(txDb, tenantId, workspaceId, eventId, actorDisplay, `PR 合并 ${branch.branchName} → rev:${shortRev}`);

  mr.status = "MERGED";
  mr.mergedRevisionCode = shortRev;
  branch.status = "MERGED";
  await saveRuntimeKv(tenantId, MR_NS, workspaceId, { mrs: mergeRequests });
  await saveRuntimeKv(tenantId, BRANCH_NS, workspaceId, { branches });
  return { mr, revisionCode: shortRev, message: `分支 ${branch.branchName} 已原子合入主干并生成修订 rev:${shortRev}` };
}
