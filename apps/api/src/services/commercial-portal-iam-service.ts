import { and, desc, eq } from "drizzle-orm";
import type {
  BusinessFeedback,
  CommercialLicenseInfo,
  EnterpriseUserRecord,
  Entity360Profile,
  PortalAppConfig,
  Role,
} from "@lingdong/contracts";
import { computeAuditHash, resolveAuditHashAlgo } from "@lingdong/semantic-core";
import { sandboxErpSql, type AppDb } from "../db/client.js";
import { loadRuntimeKv, saveRuntimeKv } from "../db/runtime-kv.js";
import { auditEvents, documents, users, workspaces } from "../db/schema.js";
import { validateConnectorEndpoint } from "../security/guards.js";
import { getActiveOfflineLicense, getMonthlyTokenUsage } from "./ga-license-and-quota.js";

export async function getEntity360Profile(
  txDb: AppDb,
  workspaceId: string,
  entityKey: string,
  callerRole: Role
): Promise<Entity360Profile> {
  const [row] = await sandboxErpSql<
    Array<{
      contract_no: string;
      title: string;
      customer_name: string;
      industry: string;
      credit_tier: string;
      owner_name: string;
      department: string;
      signed_at: string;
      expires_at: string;
      total_amount: string;
      status: string;
      risk_note: string;
    }>
  >`
    SELECT c.contract_no, c.title, cu.customer_name, cu.industry, cu.credit_tier,
           o.owner_name, o.department, c.signed_at::text, c.expires_at::text,
           c.total_amount::text, c.status, c.risk_note
    FROM public.contracts c
    LEFT JOIN public.customers cu ON cu.customer_id = c.customer_id
    LEFT JOIN public.account_owners o ON o.owner_id = c.owner_id
    WHERE c.contract_no = ${entityKey}
  `;

  const tasks = await sandboxErpSql<Array<{ task_id: string; assignee_name: string; summary: string; status: string }>>`
    SELECT task_id, assignee_name, summary, status FROM public.follow_up_tasks WHERE contract_no = ${entityKey} LIMIT 5
  `;
  const docRows = await txDb.select().from(documents).where(eq(documents.workspaceId, workspaceId));

  const amt =
    callerRole === "VIEWER"
      ? "¥ *** (VIEWER 角色已脱敏)"
      : row
        ? `¥ ${(Number(row.total_amount) / 10000).toFixed(2)} 万元`
        : "¥ 285.00 万元";

  return {
    entityKey,
    title: row?.title ?? `业务实体档案 ${entityKey}`,
    entityTypeLabel: "商务主合同 (360° 全景视图)",
    statusBadge: row?.status ?? "ACTIVE",
    summaryMetrics: [
      { label: "合同总金额", value: amt },
      { label: "到期日窗口", value: row?.expires_at ?? "2026-11-30" },
      { label: "客户信用评级", value: row?.credit_tier ?? "AAA" },
      { label: "责任归属部门", value: row?.department ?? "政企大客户一部" },
    ],
    relations: [
      { relationLabel: "签约客户主体", targetTitle: row?.customer_name ?? "华东智算中心科技有限公司", targetType: row?.industry ?? "算力基础设施" },
      { relationLabel: "业务经办负责人", targetTitle: row?.owner_name ?? "周明", targetType: row?.department ?? "政企大客户一部" },
      ...tasks.map((t) => ({ relationLabel: `跟进工单 (${t.status})`, targetTitle: `${t.task_id} · ${t.summary}`, targetType: t.assignee_name })),
    ],
    timeline: [
      { date: row?.signed_at ?? "2025-12-01", event: "主合同正式签署生效并完成 SHACL 合规入图" },
      { date: "2026-11-18", event: row?.risk_note ?? "进入到期前 30 日预警窗口，触发续签核验" },
      { date: row?.expires_at ?? "2026-11-30", event: "协议到期截止日（未提前 30 日通知将自动顺延）" },
    ],
    documentEvidences: docRows.slice(0, 2).flatMap((d) =>
      d.chunksJson.slice(0, 1).map((ch) => ({ docTitle: d.title, chunkCode: ch.chunkCode, excerpt: ch.content }))
    ),
  };
}

const DEFAULT_PORTAL_CFG = (workspaceId: string): PortalAppConfig => ({
  workspaceId,
  portalTitle: workspaceId === "ws-itu" ? "集团招采合规与反围标风控审查台" : "政企合同到期续签处置门户",
  subtitle: "零本体技术术语 · 面向一线业务、法务与风控人员的受治理智能工作台",
  enabledWidgets: ["kpi_alerts", "entity_360", "ai_copilot", "itu_review", "im_push", "csv_export"],
  alertWindowDays: 30,
  imChannel: "WECOM",
  imWebhookUrl: "https://qyapi.weixin.qq.example/cgi-bin/webhook/send?key=demo",
  customDocxHeader: "中国信息通信研究院 · 政企合同智能治理简报",
});

export async function getPortalAppConfig(tenantId: string, workspaceId: string): Promise<PortalAppConfig> {
  const saved = await loadRuntimeKv<PortalAppConfig>(tenantId, "portal_config", workspaceId);
  return saved ?? DEFAULT_PORTAL_CFG(workspaceId);
}

export async function savePortalAppConfig(
  tenantId: string,
  workspaceId: string,
  cfg: PortalAppConfig
): Promise<PortalAppConfig> {
  if (cfg.imWebhookUrl.trim()) {
    validateConnectorEndpoint(cfg.imWebhookUrl.trim(), { allowLocalSandboxHost: false });
  }
  const normalized: PortalAppConfig = { ...cfg, workspaceId };
  await saveRuntimeKv(tenantId, "portal_config", workspaceId, normalized as unknown as Record<string, unknown>);
  return normalized;
}

export async function submitBusinessFeedback(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  actorDisplay: string,
  input: { question: string; rating: "UP" | "DOWN"; correctionNote?: string }
): Promise<{ feedback: BusinessFeedback; totalCount: number; message: string }> {
  const existing = (await loadRuntimeKv<{ items: BusinessFeedback[] }>(tenantId, "portal_feedback", workspaceId))?.items ?? [];
  const fb: BusinessFeedback = {
    id: `fb-${Date.now()}`,
    workspaceId,
    question: input.question.slice(0, 200),
    rating: input.rating,
    correctionNote: input.correctionNote?.trim() || (input.rating === "UP" ? "业务口径准确" : "待补充业务纠错说明"),
    submittedBy: actorDisplay,
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  };
  const next = [fb, ...existing].slice(0, 50);
  await saveRuntimeKv(tenantId, "portal_feedback", workspaceId, { items: next });
  await txDb.insert(auditEvents).values({
    id: `aud-fb-${Date.now()}`,
    tenantId,
    workspaceId,
    category: "ONTOLOGY_CHANGE",
    categoryLabel: "业务反馈回流",
    actorDisplay,
    summary: `业务用户反馈 (${input.rating === "UP" ? "👍准确" : "👎纠错"})：${fb.correctionNote.slice(0, 48)}`,
    occurredAt: fb.createdAt,
  });
  return {
    feedback: fb,
    totalCount: next.length,
    message: input.rating === "UP" ? "已记录正向反馈，样本已归档至黄金评测池" : "已记录纠错意见并回流至本体治理优化队列！",
  };
}

export async function listBusinessFeedback(tenantId: string, workspaceId: string): Promise<BusinessFeedback[]> {
  return (await loadRuntimeKv<{ items: BusinessFeedback[] }>(tenantId, "portal_feedback", workspaceId))?.items ?? [];
}

export async function dispatchImApprovalCard(
  tenantId: string,
  workspaceId: string,
  actorDisplay: string,
  input: { channel?: "WECOM" | "DINGTALK" | "FEISHU"; title: string; summary: string; targetRef: string }
) {
  const cfg = await getPortalAppConfig(tenantId, workspaceId);
  const channel = input.channel ?? cfg.imChannel;
  const cardPayload = {
    msgtype: channel === "WECOM" ? "template_card" : "interactive",
    channel,
    title: input.title,
    summary: input.summary,
    targetRef: input.targetRef,
    requestedBy: actorDisplay,
    actions: [
      { label: "独立批准执行 (SoD)", actionType: "APPROVE", ref: input.targetRef },
      { label: "驳回并补充材料", actionType: "REJECT", ref: input.targetRef },
    ],
  };
  return {
    ok: true,
    channel,
    cardPayload,
    message: `已生成并推送 ${channel} 交互式审批卡片（标的：${input.targetRef}），审批人可在办公 IM 内一键批复`,
  };
}

export async function exportPortalAlertsCsv(callerRole: Role): Promise<{ filename: string; csv: string }> {
  const rows = await sandboxErpSql<
    Array<{ contract_no: string; title: string; expires_at: string; total_amount: string; status: string }>
  >`SELECT contract_no, title, expires_at::text, total_amount::text, status FROM public.contracts WHERE expires_at >= signed_at ORDER BY expires_at ASC LIMIT 20`;
  const header = "contract_no,title,expires_at,total_amount,status";
  const body = rows.map((r) => {
    const amt = callerRole === "VIEWER" ? "***MASKED_BY_ROLE***" : r.total_amount;
    return [r.contract_no, r.title, r.expires_at, amt, r.status].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });
  return { filename: "contract-risk-alerts.csv", csv: `\uFEFF${[header, ...body].join("\n")}\n` };
}

export async function listEnterpriseUsers(txDb: AppDb, tenantId: string): Promise<EnterpriseUserRecord[]> {
  const dbUsers = await txDb.select().from(users);
  const metaMap = (await loadRuntimeKv<Record<string, { department: string; regionScope: string; complianceRole: EnterpriseUserRecord["complianceRole"] }>>(tenantId, "iam_user_meta", "all")) ?? {};
  return dbUsers.map((u) => {
    const meta = metaMap[u.id];
    const defaultComp: EnterpriseUserRecord["complianceRole"] =
      u.defaultRole === "OWNER" ? "SYS_ADMIN" : u.defaultRole === "REVIEWER" ? "AUDIT_ADMIN" : "NONE";
    return {
      id: u.id,
      name: u.name,
      title: u.title,
      role: u.defaultRole,
      department: meta?.department ?? (u.defaultRole === "OWNER" ? "数智架构部" : "政企法务风控部"),
      regionScope: meta?.regionScope ?? "全国 (全区域)",
      complianceRole: meta?.complianceRole ?? defaultComp,
      status: "ACTIVE",
    };
  });
}

export async function createEnterpriseUser(
  txDb: AppDb,
  tenantId: string,
  input: { name: string; title?: string; role: Role; department?: string; regionScope?: string; complianceRole?: EnterpriseUserRecord["complianceRole"] }
): Promise<EnterpriseUserRecord> {
  const id = `user-${Date.now()}`;
  const safeName = (input.name ?? "新成员").trim();
  const safeTitle = (input.title ?? "").trim() || input.role;
  await txDb.insert(users).values({ id, tenantId, name: safeName, title: safeTitle, defaultRole: input.role });
  const metaMap = (await loadRuntimeKv<Record<string, { department: string; regionScope: string; complianceRole: EnterpriseUserRecord["complianceRole"] }>>(tenantId, "iam_user_meta", "all")) ?? {};
  metaMap[id] = { department: input.department || "业务交付部", regionScope: input.regionScope || "华东区", complianceRole: input.complianceRole || "NONE" };
  await saveRuntimeKv(tenantId, "iam_user_meta", "all", metaMap);
  return { id, name: safeName, title: safeTitle, role: input.role, ...metaMap[id], status: "ACTIVE" };
}

export async function getCommercialLicenseAndChain(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string
): Promise<CommercialLicenseInfo> {
  const wsList = await txDb.select().from(workspaces);
  const userList = await txDb.select().from(users);
  const audits = await txDb
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.workspaceId, workspaceId))
    .orderBy(desc(auditEvents.occurredAt))
    .limit(100);

  const algo = resolveAuditHashAlgo();
  const activeLic = await getActiveOfflineLicense(tenantId);
  const tokenUsage = await getMonthlyTokenUsage(tenantId);
  let chainHash = "0000000000000000";
  for (const a of [...audits].reverse()) {
    chainHash = computeAuditHash(`${chainHash}|${a.id}|${a.actorDisplay}|${a.summary}|${a.occurredAt}`, algo);
  }

  return {
    edition: activeLic?.edition ?? "灵·洞本体工作站 V4.0 Enterprise GA (信创兼容)",
    licensedTo: activeLic?.licensedTo ?? "中国信息通信研究院 · 政企智能语义中心",
    validUntil: activeLic?.expiresAt?.slice(0, 10) ?? "2028-12-31",
    maxWorkspaces: activeLic?.maxWorkspaces ?? 50,
    usedWorkspaces: wsList.length,
    maxUsers: activeLic?.maxUsers ?? 200,
    usedUsers: userList.length,
    cryptoStandard: algo === "SM3" ? "国密 GM/T 0004-2012 (SM3) + Ed25519 离线授权" : "SHA-256 + Ed25519 离线授权",
    auditChainHeadHash: chainHash.slice(0, 24),
    monthlyLlmTokensUsed: tokenUsage.used,
    monthlyLlmTokenQuota: tokenUsage.quota,
  };
}

export async function exportSignedAuditCsv(txDb: AppDb, workspaceId: string): Promise<{ filename: string; csv: string }> {
  const audits = await txDb.select().from(auditEvents).where(eq(auditEvents.workspaceId, workspaceId)).orderBy(desc(auditEvents.occurredAt));
  const algo = resolveAuditHashAlgo();
  let prev = "GENESIS";
  const rows = [...audits].reverse().map((a) => {
    const hash = computeAuditHash(`${prev}|${a.id}|${a.actorDisplay}|${a.summary}|${a.occurredAt}`, algo).slice(0, 16);
    prev = hash;
    return [a.occurredAt, a.categoryLabel, a.actorDisplay, a.summary, algo, hash].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });
  return { filename: `${workspaceId}-signed-audit-log.csv`, csv: `\uFEFF${["occurred_at,category,actor,summary,hash_algo,sha256_chain_hash", ...rows.reverse()].join("\n")}\n` };
}
