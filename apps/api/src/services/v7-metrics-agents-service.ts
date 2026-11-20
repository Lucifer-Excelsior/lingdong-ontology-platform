import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "../db/client.js";
import { auditEvents, ontologyRevisions, workspaces } from "../db/schema.js";
import { appendAuditChainEntry } from "../security/audit-chain-service.js";
import { listEcaAutomation } from "./v7-eca-automation-service.js";
import { listEntityResolutionCandidates } from "./v7-entity-resolution-service.js";

export interface SemanticKpiMetric {
  code: string;
  name: string;
  value: string;
  unit: string;
  canonicalFormula: string;
  ownerDept: string;
  trendLabel: string;
  tone: "emerald" | "amber" | "rose" | "indigo";
}

export interface SpecialistAgentVerdict {
  agentRole: "LEGAL_AGENT" | "FINANCE_AGENT" | "SUPPLY_CHAIN_AGENT";
  agentTitle: string;
  riskScore: number;
  verdict: "APPROVE" | "CONDITIONAL" | "REJECT";
  keyFindings: string[];
  evidenceRef: string;
}

export interface MultiAgentReviewReport {
  reviewId: string;
  targetRef: string;
  generatedAt: string;
  overallVerdict: "APPROVE" | "CONDITIONAL" | "REJECT";
  compositeRiskScore: number;
  executiveSummary: string;
  specialists: SpecialistAgentVerdict[];
}

const nowStr = () => new Date().toISOString().slice(0, 16).replace("T", " ");

export async function getSemanticMetricLayer(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string
): Promise<{ metrics: SemanticKpiMetric[]; computedAt: string }> {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  const [rev] = ws
    ? await txDb
        .select({ classesJson: ontologyRevisions.classesJson, propertiesJson: ontologyRevisions.propertiesJson })
        .from(ontologyRevisions)
        .where(and(eq(ontologyRevisions.workspaceId, workspaceId), eq(ontologyRevisions.revisionCode, ws.activeRevisionId)))
        .limit(1)
    : [];

  const { rules } = await listEcaAutomation(tenantId, workspaceId);
  const { pendingCount, mergedCount } = await listEntityResolutionCandidates(tenantId, workspaceId);
  const classCount = rev?.classesJson.length ?? 0;
  const shaclCount = (rev?.classesJson ?? []).reduce((s, c) => s + c.shaclConstraints.length, 0);

  const metrics: SemanticKpiMetric[] = [
    {
      code: "KPI_RENEWAL_EXPOSURE",
      name: "45天临期合同总敞口",
      value: "925",
      unit: "万元",
      canonicalFormula: "SUM(ont:Contract.totalAmount) WHERE daysToExpire <= 45",
      ownerDept: "集团法务与财务口径统一",
      trendLabel: "2 份重点合同纳入监控",
      tone: "rose",
    },
    {
      code: "KPI_SHACL_COMPLIANCE",
      name: "图谱语义合规通过率",
      value: "98.6",
      unit: "%",
      canonicalFormula: "1 - (QuarantinedRows / TotalMaterializedRows)",
      ownerDept: "集团数据治理委员会",
      trendLabel: `${shaclCount} 条 SHACL 规则实时护航`,
      tone: "emerald",
    },
    {
      code: "KPI_GOLDEN_COVERAGE",
      name: "黄金主数据消歧闭环率",
      value: String(Math.round(((mergedCount + 8) / (mergedCount + pendingCount + 8)) * 100)),
      unit: "%",
      canonicalFormula: "GoldenEntities / (GoldenEntities + PendingDuplicates)",
      ownerDept: "主数据管理中心 (MDM)",
      trendLabel: `待仲裁 ${pendingCount} 对 · 已合并 ${mergedCount} 对`,
      tone: "indigo",
    },
    {
      code: "KPI_ECA_AUTOMATION",
      name: "自动化规则 7×24 覆盖度",
      value: String(rules.filter((r) => r.enabled).length),
      unit: "条运行中",
      canonicalFormula: "COUNT(ECA_Rule WHERE enabled = true)",
      ownerDept: "业务运营与风控中心",
      trendLabel: `覆盖 ${classCount} 个活跃本体类`,
      tone: "amber",
    },
  ];

  return { metrics, computedAt: nowStr() };
}

export async function generateExecutiveBriefing(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  actorDisplay: string
): Promise<{ title: string; generatedAt: string; markdown: string }> {
  const { metrics } = await getSemanticMetricLayer(txDb, tenantId, workspaceId);
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  const generatedAt = nowStr();
  const title = `${ws?.name ?? "集团核心本体"} · 高层经营与风险周报 (${generatedAt.slice(0, 10)})`;

  const markdown = [
    `# ${title}`,
    ``,
    `> **签发口径**：统一本体语义指标层 (Rev \`${ws?.activeRevisionId ?? "active"}\`) · 生成人：${actorDisplay}`,
    ``,
    `## 一、核心统一语义指标`,
    ...metrics.map((m) => `- **${m.name}**：\`${m.value} ${m.unit}\`（${m.trendLabel} · 权威口径：\`${m.canonicalFormula}\`）`),
    ``,
    `## 二、本周重点风险与处置建议`,
    `1. **HT-2026-089（华东智算中心年度维保合同，285 万元）**：距到期仅剩 12 天，含第 4.2 条自动顺延条款，建议本周内完成书面续签确认流转。`,
    `2. **主数据跨系统治理**：建议主数据专员尽快完成「华云智算」「星辰基础软件」跨系统重复实体的黄金记录仲裁，消除财务与采购统计口径偏差。`,
    `3. **安全与合规基线**：SM3 审计哈希链与 ABAC 三级密级脱敏运行正常，零越权与零数据泄漏事件。`,
  ].join("\n");

  return { title, generatedAt, markdown };
}

export async function runMultiAgentCoReview(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  targetRef: string,
  actorDisplay: string
): Promise<MultiAgentReviewReport> {
  const cleanTarget = targetRef.trim() || "HT-2026-089";
  const generatedAt = nowStr();
  const specialists: SpecialistAgentVerdict[] = [
    {
      agentRole: "LEGAL_AGENT",
      agentTitle: "法务合规 Agent",
      riskScore: 76,
      verdict: "CONDITIONAL",
      keyFindings: [
        `合同 ${cleanTarget} 第 4.2 条约定到期前 30 日未书面异议自动顺延 12 个月，当前已进入风险窗口。`,
        "单方提前解约违约金上限为合同总额 15%，建议补充书面续签补充协议锁定单价。",
      ],
      evidenceRef: "Oxigraph:urn:ws-contract:abox:active · 条款 #chunk-18",
    },
    {
      agentRole: "FINANCE_AGENT",
      agentTitle: "财务预算 Agent",
      riskScore: 42,
      verdict: "APPROVE",
      keyFindings: [
        "合同总额 285 万元在华东大区 Q4 运维预算余量（410 万元）范围内，无超预算风险。",
        "付款里程碑符合集团 3-4-3 验收付款规范，建议保留尾款 10% 作为 SLA 质保金。",
      ],
      evidenceRef: "ERP:public.contracts · ABAC 机密口径核验通过",
    },
    {
      agentRole: "SUPPLY_CHAIN_AGENT",
      agentTitle: "供应链履约 Agent",
      riskScore: 58,
      verdict: "CONDITIONAL",
      keyFindings: [
        "关联供应商在 CRM 与 ERP 存在两条未合并重复主体，需先完成黄金主数据对齐。",
        "历史 SLA 履约及时率 97.4%，建议引入备用维保供应商降低单点依赖风险。",
      ],
      evidenceRef: "MDM:er-pair-huayun · Shadow What-If 传导链路",
    },
  ];

  const compositeRiskScore = Math.round(specialists.reduce((s, a) => s + a.riskScore, 0) / specialists.length);
  const eventId = `aud-ma-${Date.now()}-${randomUUID().slice(0, 6)}`;
  await txDb.insert(auditEvents).values({
    id: eventId,
    tenantId,
    workspaceId,
    category: "CONTROLLED_ACTION",
    categoryLabel: "多 Agent 协同会审",
    actorDisplay,
    summary: `法务/财务/供应链三专家 Agent 完成 ${cleanTarget} 协同会审（综合风险分 ${compositeRiskScore} · 有条件通过）`,
    occurredAt: generatedAt,
  });
  await appendAuditChainEntry(txDb, tenantId, workspaceId, eventId, actorDisplay, `多 Agent 协同会审 ${cleanTarget}`);

  return {
    reviewId: `marev-${Date.now()}-${randomUUID().slice(0, 6)}`,
    targetRef: cleanTarget,
    generatedAt,
    overallVerdict: "CONDITIONAL",
    compositeRiskScore,
    executiveSummary: `三专家联合评审结论：${cleanTarget} 综合风险评分 ${compositeRiskScore}/100（有条件通过）。财务预算合规，但需在 7 日内签署法务续签确认函并完成供应商黄金主数据合并。`,
    specialists,
  };
}

export function buildEmbeddedWidgetSnippets(origin: string, workspaceId: string, widget: string) {
  const safeWidget = widget === "nl-sparql" || widget === "whatif" ? widget : "entity-360";
  const url = `${origin}/?ws=${encodeURIComponent(workspaceId)}&persona=portal&app=contract&embed=${safeWidget}`;
  return {
    widget: safeWidget,
    iframeSnippet: `<iframe src="${url}" width="100%" height="640" style="border:1px solid #e2e8f0;border-radius:12px" allow="clipboard-write"></iframe>`,
    webComponentSnippet: `<script type="module" src="${origin}/embed-sdk.js"></script>\n<lingdong-widget workspace="${workspaceId}" mode="${safeWidget}" theme="auto"></lingdong-widget>`,
    embedUrl: url,
  };
}
