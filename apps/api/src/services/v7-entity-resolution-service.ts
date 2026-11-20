import { randomUUID } from "node:crypto";
import type { AppDb } from "../db/client.js";
import { loadRuntimeKv, saveRuntimeKv } from "../db/runtime-kv.js";
import { auditEvents } from "../db/schema.js";
import { appendAuditChainEntry } from "../security/audit-chain-service.js";

export interface SourceEntityRecord {
  sourceSystem: "CRM" | "ERP" | "FINANCE";
  sourceId: string;
  displayName: string;
  taxCode: string;
  region: string;
  creditRating: string;
  updatedAt: string;
}

export interface EntityResolutionCandidate {
  id: string;
  entityType: string;
  similarityScore: number;
  matchReason: string;
  status: "PENDING" | "MERGED";
  goldenRecordId: string | null;
  goldenDisplayName: string | null;
  authoritativeSystem: "CRM" | "ERP" | "FINANCE";
  left: SourceEntityRecord;
  right: SourceEntityRecord;
  resolvedBy?: string;
  resolvedAt?: string;
}

const ER_NS = "v7_entity_resolution";
const nowStr = () => new Date().toISOString().slice(0, 16).replace("T", " ");

function defaultCandidates(): EntityResolutionCandidate[] {
  return [
    {
      id: "er-pair-huayun",
      entityType: "ont:Supplier",
      similarityScore: 0.94,
      matchReason: "统一社会信用代码完全一致 + 企业简称编辑距离 0.89",
      status: "PENDING",
      goldenRecordId: null,
      goldenDisplayName: null,
      authoritativeSystem: "CRM",
      left: {
        sourceSystem: "CRM",
        sourceId: "CRM-CUST-0081",
        displayName: "华云智算科技有限公司",
        taxCode: "91310115MA1K48920X",
        region: "上海市浦东新区",
        creditRating: "AAA",
        updatedAt: "2026-11-18",
      },
      right: {
        sourceSystem: "ERP",
        sourceId: "ERP-VEND-3302",
        displayName: "华云智算（上海）",
        taxCode: "91310115MA1K48920X",
        region: "上海",
        creditRating: "AA+",
        updatedAt: "2026-10-05",
      },
    },
    {
      id: "er-pair-xingchen",
      entityType: "ont:Supplier",
      similarityScore: 0.91,
      matchReason: "银行结算户名一致 + 法人主体名称高度相似",
      status: "PENDING",
      goldenRecordId: null,
      goldenDisplayName: null,
      authoritativeSystem: "FINANCE",
      left: {
        sourceSystem: "FINANCE",
        sourceId: "FIN-SUP-0419",
        displayName: "星辰基础软件股份有限公司",
        taxCode: "91110108MA0092184Q",
        region: "北京市海淀区",
        creditRating: "AAA",
        updatedAt: "2026-11-15",
      },
      right: {
        sourceSystem: "ERP",
        sourceId: "ERP-VEND-1109",
        displayName: "星辰基础软件",
        taxCode: "91110108MA0092184Q",
        region: "北京",
        creditRating: "AA",
        updatedAt: "2026-09-22",
      },
    },
  ];
}

export async function listEntityResolutionCandidates(tenantId: string, workspaceId: string) {
  const saved = await loadRuntimeKv<{ items: EntityResolutionCandidate[] }>(tenantId, ER_NS, workspaceId);
  const items = saved?.items ?? defaultCandidates();
  return {
    items,
    pendingCount: items.filter((i) => i.status === "PENDING").length,
    mergedCount: items.filter((i) => i.status === "MERGED").length,
  };
}

export async function mergeToGoldenRecord(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  pairId: string,
  authoritativeSystem: "CRM" | "ERP" | "FINANCE",
  actorDisplay: string
) {
  const { items } = await listEntityResolutionCandidates(tenantId, workspaceId);
  const target = items.find((i) => i.id === pairId);
  if (!target) throw new Error("未找到待消歧实体对");

  const winner = target.left.sourceSystem === authoritativeSystem ? target.left : target.right;
  const goldenId = `GOLDEN-${winner.taxCode.slice(-6)}-${Date.now().toString().slice(-4)}`;
  const resolvedAt = nowStr();

  const next = items.map((i) =>
    i.id === pairId
      ? {
          ...i,
          status: "MERGED" as const,
          goldenRecordId: goldenId,
          goldenDisplayName: winner.displayName,
          authoritativeSystem,
          resolvedBy: actorDisplay,
          resolvedAt,
        }
      : i
  );
  await saveRuntimeKv(tenantId, ER_NS, workspaceId, { items: next });

  const eventId = `aud-er-${Date.now()}-${randomUUID().slice(0, 6)}`;
  await txDb.insert(auditEvents).values({
    id: eventId,
    tenantId,
    workspaceId,
    category: "DATA_MATERIALIZATION",
    categoryLabel: "黄金主数据合并",
    actorDisplay,
    summary: `合并重复实体 (${target.left.displayName} + ${target.right.displayName}) → 黄金记录 ${goldenId}（权威源：${authoritativeSystem}）`,
    occurredAt: resolvedAt,
  });
  await appendAuditChainEntry(txDb, tenantId, workspaceId, eventId, actorDisplay, `实体消歧合并 → ${goldenId}`);

  return {
    goldenRecordId: goldenId,
    items: next,
    message: `已生成唯一黄金主数据 ${goldenId}（${winner.displayName}），支持随时一键拆分回滚`,
  };
}

export async function splitGoldenRecord(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  pairId: string,
  actorDisplay: string
) {
  const { items } = await listEntityResolutionCandidates(tenantId, workspaceId);
  const target = items.find((i) => i.id === pairId);
  if (!target) throw new Error("未找到目标黄金记录");

  const prevGolden = target.goldenRecordId ?? pairId;
  const next = items.map((i) =>
    i.id === pairId
      ? {
          ...i,
          status: "PENDING" as const,
          goldenRecordId: null,
          goldenDisplayName: null,
          resolvedBy: undefined,
          resolvedAt: undefined,
        }
      : i
  );
  await saveRuntimeKv(tenantId, ER_NS, workspaceId, { items: next });

  const eventId = `aud-ersplit-${Date.now()}-${randomUUID().slice(0, 6)}`;
  await txDb.insert(auditEvents).values({
    id: eventId,
    tenantId,
    workspaceId,
    category: "DATA_MATERIALIZATION",
    categoryLabel: "黄金主数据拆分",
    actorDisplay,
    summary: `已拆分回滚黄金记录 ${prevGolden}，恢复双源独立血缘状态`,
    occurredAt: nowStr(),
  });
  await appendAuditChainEntry(txDb, tenantId, workspaceId, eventId, actorDisplay, `拆分回滚黄金记录 ${prevGolden}`);

  return { ok: true, items: next, message: `已将黄金记录 ${prevGolden} 拆分回滚为待仲裁状态` };
}
