import { randomUUID } from "node:crypto";
import type { AppDb } from "../db/client.js";
import { loadRuntimeKv, saveRuntimeKv } from "../db/runtime-kv.js";
import { auditEvents } from "../db/schema.js";
import { appendAuditChainEntry } from "../security/audit-chain-service.js";

export interface EcaAutomationRule {
  id: string;
  workspaceId: string;
  name: string;
  triggerEvent: "CONTRACT_UPSERT" | "SUPPLIER_RISK_SIGNAL" | "MATERIALIZATION_QUARANTINE";
  conditionExpr: string;
  actionType: "PUSH_IM_ALERT" | "CREATE_RENEWAL_TASK" | "FREEZE_PAYMENT_APPROVAL";
  enabled: boolean;
  triggerCount: number;
  lastTriggeredAt: string | null;
  createdBy: string;
}

export interface EcaExecutionLog {
  id: string;
  ruleId: string;
  ruleName: string;
  eventPayloadSummary: string;
  actionTaken: string;
  status: "EXECUTED" | "SKIPPED_DISABLED";
  executedAt: string;
}

const ECA_RULES_NS = "v7_eca_rules";
const ECA_LOGS_NS = "v7_eca_logs";
const nowStr = () => new Date().toISOString().slice(0, 16).replace("T", " ");

function defaultEcaRules(workspaceId: string): EcaAutomationRule[] {
  return [
    {
      id: "eca-high-value-contract",
      workspaceId,
      name: "大额临期合同 7×24 自动法务盯盘",
      triggerEvent: "CONTRACT_UPSERT",
      conditionExpr: "totalAmount >= 2000000 AND expiresInDays <= 30",
      actionType: "PUSH_IM_ALERT",
      enabled: true,
      triggerCount: 4,
      lastTriggeredAt: "2026-11-20 09:30",
      createdBy: "系统基线编排",
    },
    {
      id: "eca-supplier-default-freeze",
      workspaceId,
      name: "核心供应商违约信号自动冻结首付款",
      triggerEvent: "SUPPLIER_RISK_SIGNAL",
      conditionExpr: "riskSeverity == 'CRITICAL' AND linkedActiveContracts >= 1",
      actionType: "FREEZE_PAYMENT_APPROVAL",
      enabled: true,
      triggerCount: 1,
      lastTriggeredAt: "2026-11-19 16:45",
      createdBy: "集团风控委员会",
    },
  ];
}

export async function listEcaAutomation(tenantId: string, workspaceId: string) {
  const savedRules = await loadRuntimeKv<{ rules: EcaAutomationRule[] }>(tenantId, ECA_RULES_NS, workspaceId);
  const savedLogs = await loadRuntimeKv<{ logs: EcaExecutionLog[] }>(tenantId, ECA_LOGS_NS, workspaceId);
  return {
    rules: savedRules?.rules ?? defaultEcaRules(workspaceId),
    logs: savedLogs?.logs ?? [],
  };
}

export async function createEcaRule(
  tenantId: string,
  workspaceId: string,
  actorDisplay: string,
  input: {
    name: string;
    triggerEvent: EcaAutomationRule["triggerEvent"];
    conditionExpr: string;
    actionType: EcaAutomationRule["actionType"];
  }
) {
  if (!input.name.trim() || !input.conditionExpr.trim()) {
    throw new Error("请填写自动化规则名称与触发条件表达式");
  }
  const { rules } = await listEcaAutomation(tenantId, workspaceId);
  const rule: EcaAutomationRule = {
    id: `eca-${Date.now()}-${randomUUID().slice(0, 6)}`,
    workspaceId,
    name: input.name.trim(),
    triggerEvent: input.triggerEvent,
    conditionExpr: input.conditionExpr.trim(),
    actionType: input.actionType,
    enabled: true,
    triggerCount: 0,
    lastTriggeredAt: null,
    createdBy: actorDisplay,
  };
  const next = [rule, ...rules];
  await saveRuntimeKv(tenantId, ECA_RULES_NS, workspaceId, { rules: next });
  return { rule, rules: next, message: `已创建事件驱动自动化规则「${rule.name}」` };
}

export async function toggleEcaRule(tenantId: string, workspaceId: string, ruleId: string) {
  const { rules } = await listEcaAutomation(tenantId, workspaceId);
  const next = rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r));
  await saveRuntimeKv(tenantId, ECA_RULES_NS, workspaceId, { rules: next });
  return { ok: true, rules: next, message: "已切换自动化规则启停状态" };
}

const ACTION_LABELS: Record<EcaAutomationRule["actionType"], string> = {
  PUSH_IM_ALERT: "自动推送企微/钉钉高危风控卡片并抄送法务总监",
  CREATE_RENEWAL_TASK: "自动创建合同续签跟进工单并指派责任人",
  FREEZE_PAYMENT_APPROVAL: "自动触发付款里程碑止付审批流并锁定 ERP 放款",
};

export async function simulateTriggerEcaRule(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  ruleId: string,
  actorDisplay: string,
  sampleEventSummary?: string
) {
  const { rules, logs } = await listEcaAutomation(tenantId, workspaceId);
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) throw new Error("未找到指定自动化规则");

  const executedAt = nowStr();
  const payload =
    sampleEventSummary?.trim() ||
    `CDC 实时事件 [${rule.triggerEvent}]: 合同 HT-2026-089 (金额 285 万 / 12 天到期) 命中条件 (${rule.conditionExpr})`;

  const log: EcaExecutionLog = {
    id: `ecalog-${Date.now()}-${randomUUID().slice(0, 6)}`,
    ruleId: rule.id,
    ruleName: rule.name,
    eventPayloadSummary: payload,
    actionTaken: rule.enabled ? ACTION_LABELS[rule.actionType] : "规则处于停用状态，已跳过执行",
    status: rule.enabled ? "EXECUTED" : "SKIPPED_DISABLED",
    executedAt,
  };

  const nextRules = rules.map((r) =>
    r.id === ruleId && r.enabled ? { ...r, triggerCount: r.triggerCount + 1, lastTriggeredAt: executedAt } : r
  );
  const nextLogs = [log, ...logs].slice(0, 20);
  await saveRuntimeKv(tenantId, ECA_RULES_NS, workspaceId, { rules: nextRules });
  await saveRuntimeKv(tenantId, ECA_LOGS_NS, workspaceId, { logs: nextLogs });

  if (rule.enabled) {
    const eventId = `aud-eca-${Date.now()}-${randomUUID().slice(0, 6)}`;
    await txDb.insert(auditEvents).values({
      id: eventId,
      tenantId,
      workspaceId,
      category: "CONTROLLED_ACTION",
      categoryLabel: "ECA 自动触发",
      actorDisplay,
      summary: `自动化规则「${rule.name}」命中并执行：${log.actionTaken}`,
      occurredAt: executedAt,
    });
    await appendAuditChainEntry(txDb, tenantId, workspaceId, eventId, actorDisplay, `ECA 自动触发 ${rule.name}`);
  }

  return { log, rules: nextRules, logs: nextLogs, message: `规则「${rule.name}」事件触发仿真完成（${log.status}）` };
}
