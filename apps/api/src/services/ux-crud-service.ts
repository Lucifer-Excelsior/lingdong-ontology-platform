import { and, eq } from "drizzle-orm";
import type { Role } from "@lingdong/contracts";
import type { AppDb } from "../db/client.js";
import { loadRuntimeKv, saveRuntimeKv } from "../db/runtime-kv.js";
import {
  auditEvents,
  capabilities,
  changesets,
  dataSources,
  documents,
  executionRuns,
  schemaSnapshots,
  semanticMappings,
  users,
} from "../db/schema.js";

const nowStr = () => new Date().toISOString().slice(0, 16).replace("T", " ");

export async function updateCapabilityRecord(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  capId: string,
  actorDisplay: string,
  patch: {
    name?: string;
    description?: string;
    autonomyTier?: "READ" | "DRAFT" | "CONFIRM" | "APPROVE";
    targetEntityLocalName?: string;
    mcpExposed?: boolean;
  }
) {
  const [existing] = await txDb
    .select()
    .from(capabilities)
    .where(and(eq(capabilities.id, capId), eq(capabilities.workspaceId, workspaceId)));
  if (!existing) throw new Error("未找到目标受控能力");

  await txDb
    .update(capabilities)
    .set({
      name: patch.name?.trim() || existing.name,
      description: patch.description?.trim() || existing.description,
      autonomyTier: patch.autonomyTier ?? existing.autonomyTier,
      targetEntityLocalName: patch.targetEntityLocalName?.trim() || existing.targetEntityLocalName,
      mcpExposed: patch.mcpExposed ?? existing.mcpExposed,
    })
    .where(eq(capabilities.id, capId));

  await txDb.insert(auditEvents).values({
    id: `aud-cap-upd-${Date.now()}`,
    tenantId,
    workspaceId,
    category: "ONTOLOGY_CHANGE",
    categoryLabel: "编辑受控能力",
    actorDisplay,
    summary: `更新受控业务能力 ${existing.code} (${patch.name ?? existing.name})`,
    occurredAt: nowStr(),
  });
  return { ok: true, message: `已更新受控能力「${patch.name ?? existing.name}」` };
}

export async function deleteCapabilityRecord(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  capId: string,
  actorDisplay: string
) {
  const [existing] = await txDb
    .select()
    .from(capabilities)
    .where(and(eq(capabilities.id, capId), eq(capabilities.workspaceId, workspaceId)));
  if (!existing) throw new Error("未找到目标受控能力");

  await txDb.delete(capabilities).where(eq(capabilities.id, capId));
  await txDb.insert(auditEvents).values({
    id: `aud-cap-del-${Date.now()}`,
    tenantId,
    workspaceId,
    category: "ONTOLOGY_CHANGE",
    categoryLabel: "删除受控能力",
    actorDisplay,
    summary: `删除受控业务能力 ${existing.code} (${existing.name})`,
    occurredAt: nowStr(),
  });
  return { ok: true, message: `已删除受控能力「${existing.name}」` };
}

export async function triggerCapabilityDryRunPlan(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  capId: string,
  actor: { userId: string; name: string; role: Role },
  input: { targetObjectLabel?: string; contractNo?: string; paramsSummary?: string }
) {
  const [cap] = await txDb
    .select()
    .from(capabilities)
    .where(and(eq(capabilities.id, capId), eq(capabilities.workspaceId, workspaceId)));
  if (!cap) throw new Error("未找到目标受控能力");

  const planCode = `PLAN-${String(Date.now()).slice(-4)}`;
  const targetLabel = input.targetObjectLabel?.trim() || input.contractNo?.trim() || `${cap.targetEntityLocalName}#DEMO`;
  const isApprove = cap.autonomyTier === "APPROVE";
  const isConfirm = cap.autonomyTier === "CONFIRM";
  const status = isApprove ? "AWAITING_APPROVAL" : isConfirm ? "AWAITING_CONFIRMATION" : "VERIFIED";
  const statusLabel = isApprove ? "待异人独立审批" : isConfirm ? "待发起人二次确认" : "只读/草稿试跑通过";
  const confirmToken = isConfirm ? `tok-${Date.now()}` : null;
  const planId = `run-${Date.now()}`;

  await txDb.insert(executionRuns).values({
    id: planId,
    tenantId,
    workspaceId,
    planCode,
    targetObjectLabel: `${planCode} · ${targetLabel}`,
    targetContractNo: input.contractNo?.trim() || "HT-2026-089",
    capabilityCode: cap.code,
    capabilityChain: `${cap.code} (${cap.autonomyTier})`,
    authAndIdempotencySummary: `${actor.name} · 幂等键 ${planCode}${input.paramsSummary ? ` · ${input.paramsSummary}` : ""}`,
    status,
    statusLabel,
    requestedBy: `${actor.name} (${actor.role})`,
    requestedById: actor.userId,
    confirmationToken: confirmToken,
    previewSummary: `单页试跑预演：将对 ${targetLabel} 执行 ${cap.name}`,
    conversationJson: [],
    createdAt: nowStr(),
  });

  await txDb.insert(auditEvents).values({
    id: `aud-cap-run-${Date.now()}`,
    tenantId,
    workspaceId,
    category: "CONTROLLED_ACTION",
    categoryLabel: "能力单页试跑",
    actorDisplay: `${actor.name} (${actor.role})`,
    summary: `触发受控能力 ${cap.code} 试跑计划 ${planCode} (${statusLabel})`,
    occurredAt: nowStr(),
  });

  return {
    planId,
    planCode,
    status,
    statusLabel,
    message:
      status === "VERIFIED"
        ? `试跑完成：${cap.name} (${planCode}) 已安全通过只读/草稿核验`
        : `已生成受控执行计划 ${planCode}（${statusLabel}），请在下方台账中直接确认或审批`,
  };
}

export async function deleteDataSourceCascade(txDb: AppDb, workspaceId: string, dsId: string) {
  await txDb.delete(semanticMappings).where(and(eq(semanticMappings.dataSourceId, dsId), eq(semanticMappings.workspaceId, workspaceId)));
  await txDb.delete(schemaSnapshots).where(eq(schemaSnapshots.dataSourceId, dsId));
  await txDb.delete(dataSources).where(and(eq(dataSources.id, dsId), eq(dataSources.workspaceId, workspaceId)));
  return { ok: true, message: "已移除该数据源及其快照与映射规则" };
}

export async function deleteDocumentAndProposals(txDb: AppDb, workspaceId: string, docId: string) {
  await txDb.delete(documents).where(and(eq(documents.id, docId), eq(documents.workspaceId, workspaceId)));
  return { ok: true, message: "已删除该资料文档" };
}

export async function dismissChangeSetProposal(txDb: AppDb, workspaceId: string, proposalId: string) {
  const openSets = await txDb
    .select()
    .from(changesets)
    .where(and(eq(changesets.workspaceId, workspaceId), eq(changesets.status, "OPEN")));
  const cs = openSets[0];
  if (!cs) return { ok: true, remaining: 0, message: "当前无待审提案" };
  const next = cs.proposalsJson.filter((p) => p.id !== proposalId);
  await txDb.update(changesets).set({ proposalsJson: next }).where(eq(changesets.id, cs.id));
  return { ok: true, remaining: next.length, message: "已丢弃该条提案" };
}

export async function updateOrDeleteEnterpriseUser(
  txDb: AppDb,
  tenantId: string,
  userId: string,
  action: "UPDATE" | "DELETE",
  patch?: { role?: Role; department?: string; regionScope?: string; complianceRole?: "NONE" | "SYS_ADMIN" | "SEC_ADMIN" | "AUDIT_ADMIN" }
) {
  const PROTECTED = new Set(["user-linyuan", "user-zhangmin", "user-zhouming", "user-chennan"]);
  if (action === "DELETE") {
    if (PROTECTED.has(userId)) throw new Error("系统基线三员演示账号不可删除，仅支持编辑");
    await txDb.delete(users).where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
    return { ok: true, message: "已移除该企业成员" };
  }
  if (patch?.role) {
    await txDb.update(users).set({ defaultRole: patch.role }).where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
  }
  const metaMap = (await loadRuntimeKv<Record<string, Record<string, string>>>(tenantId, "iam_user_meta", "all")) ?? {};
  metaMap[userId] = {
    department: patch?.department ?? metaMap[userId]?.department ?? "业务交付部",
    regionScope: patch?.regionScope ?? metaMap[userId]?.regionScope ?? "全国 (全区域)",
    complianceRole: patch?.complianceRole ?? metaMap[userId]?.complianceRole ?? "NONE",
  };
  await saveRuntimeKv(tenantId, "iam_user_meta", "all", metaMap);
  return { ok: true, message: "已更新成员角色与 ABAC 权限范围" };
}
