import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Code2, Copy, Play, Plus, Power, Radio, Terminal, Zap } from "lucide-react";
import { v7Api, type EcaActionType, type EcaTriggerEvent, type EmbedWidgetType } from "../../lib/v7-api";
import { ROLE_TIPS } from "../../utils/rbac";

interface AppsEcaAndEmbedPanelProps {
  workspaceId: string;
  canOperate: boolean;
  onToast: (msg: string) => void;
}

const TRIGGER_LABELS: Record<EcaTriggerEvent, string> = {
  CONTRACT_UPSERT: "合同变更/新建",
  SUPPLIER_RISK_SIGNAL: "供应商风险信号",
  MATERIALIZATION_QUARANTINE: "SHACL 隔离拦截",
};

const ACTION_LABELS: Record<EcaActionType, string> = {
  PUSH_IM_ALERT: "推送企微/钉钉高优告警",
  CREATE_RENEWAL_TASK: "自动创建续签待办任务",
  FREEZE_PAYMENT_APPROVAL: "冻结关联付款审批流",
};

const WIDGET_OPTIONS: Array<{ id: EmbedWidgetType; label: string }> = [
  { id: "entity-360", label: "360° 档案" },
  { id: "nl-sparql", label: "NL-SPARQL 问图" },
  { id: "whatif", label: "What-If 推演" },
];

export function AppsEcaAndEmbedPanel({ workspaceId, canOperate, onToast }: AppsEcaAndEmbedPanelProps) {
  const queryClient = useQueryClient();
  const [ruleName, setRuleName] = useState("");
  const [triggerEvent, setTriggerEvent] = useState<EcaTriggerEvent>("CONTRACT_UPSERT");
  const [conditionExpr, setConditionExpr] = useState("totalAmount >= 1000000 AND expiresInDays <= 45");
  const [actionType, setActionType] = useState<EcaActionType>("CREATE_RENEWAL_TASK");
  const [widget, setWidget] = useState<EmbedWidgetType>("entity-360");

  const { data: ecaData, isLoading: ecaLoading } = useQuery({
    queryKey: ["v7-eca-rules", workspaceId],
    queryFn: () => v7Api.listEcaRules(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const { data: embedData } = useQuery({
    queryKey: ["v7-embed-sdk", workspaceId, widget],
    queryFn: () => v7Api.getEmbedSdk(workspaceId, widget),
    enabled: Boolean(workspaceId),
  });

  const refreshEca = () => void queryClient.invalidateQueries({ queryKey: ["v7-eca-rules", workspaceId] });

  const createMutation = useMutation({
    mutationFn: () => v7Api.createEcaRule(workspaceId, { name: ruleName.trim(), triggerEvent, conditionExpr: conditionExpr.trim(), actionType }),
    onSuccess: (res) => { setRuleName(""); onToast(res.message || "已创建 ECA 事件自动化规则"); refreshEca(); },
    onError: (e: Error) => onToast(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (ruleId: string) => v7Api.toggleEcaRule(workspaceId, ruleId),
    onSuccess: (res) => { onToast(res.message || "已切换规则启停状态"); refreshEca(); },
    onError: (e: Error) => onToast(e.message),
  });

  const simulateMutation = useMutation({
    mutationFn: (ruleId: string) => v7Api.simulateTriggerEcaRule(workspaceId, ruleId),
    onSuccess: (res) => { onToast(res.message || "已触发模拟事件并写入执行日志与审计链"); refreshEca(); },
    onError: (e: Error) => onToast(e.message),
  });

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim() || !conditionExpr.trim()) return onToast("请填写规则名称与触发条件表达式");
    createMutation.mutate();
  };

  const copySnippet = async (label: string, text?: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      onToast(`已复制 ${label} 代码片段`);
    } catch {
      onToast("当前环境不支持剪贴板写入，请手动选中复制");
    }
  };

  const rules = ecaData?.rules ?? [];
  const logs = ecaData?.logs ?? [];
  const inputCls = "px-2.5 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)]";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <section className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-500" />事件驱动业务自动化（ECA When-If-Then 规则引擎）
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">监听图谱状态变更与风险信号，满足语义条件后自动执行受控动作并留痕至审计链。</p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 text-xs font-medium">
            {rules.filter((r) => r.enabled).length} / {rules.length} 条规则运行中
          </span>
        </div>

        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-12 gap-2.5 p-3 rounded-xl bg-[var(--secondary)]/45 border border-[var(--border)]">
          <input value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="规则名称（如：百万元合同临期自动建单）" className={`md:col-span-3 ${inputCls}`} />
          <select value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value as EcaTriggerEvent)} className={`md:col-span-3 ${inputCls}`}>
            {(Object.keys(TRIGGER_LABELS) as EcaTriggerEvent[]).map((k) => <option key={k} value={k}>When: {TRIGGER_LABELS[k]}</option>)}
          </select>
          <input value={conditionExpr} onChange={(e) => setConditionExpr(e.target.value)} placeholder="If 条件表达式" className={`md:col-span-3 font-mono ${inputCls}`} />
          <select value={actionType} onChange={(e) => setActionType(e.target.value as EcaActionType)} className={`md:col-span-2 ${inputCls}`}>
            {(Object.keys(ACTION_LABELS) as EcaActionType[]).map((k) => <option key={k} value={k}>Then: {ACTION_LABELS[k]}</option>)}
          </select>
          <button type="submit" disabled={!canOperate || createMutation.isPending} title={!canOperate ? ROLE_TIPS.operate : undefined} className="md:col-span-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer">
            <Plus className="w-3.5 h-3.5" />新建
          </button>
        </form>

        {ecaLoading ? (
          <div className="p-6 text-center text-xs text-[var(--muted-foreground)]">正在加载 ECA 规则列表...</div>
        ) : (
          <div className="space-y-2.5">
            {rules.map((rule) => (
              <div key={rule.id} className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)]/60 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[var(--foreground)]">{rule.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${rule.enabled ? "bg-emerald-500/15 text-emerald-700" : "bg-[var(--secondary)] text-[var(--muted-foreground)]"}`}>
                      {rule.enabled ? "运行中" : "已停用"}
                    </span>
                    <span className="text-[11px] text-[var(--muted-foreground)]">累计触发 {rule.triggerCount} 次{rule.lastTriggeredAt ? ` · 最近 ${rule.lastTriggeredAt}` : ""}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 font-mono">WHEN {rule.triggerEvent}</span>
                    <span className="px-1.5 py-0.5 rounded bg-[var(--secondary)] text-[var(--foreground)] font-mono">IF {rule.conditionExpr}</span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 font-medium">THEN {ACTION_LABELS[rule.actionType] ?? rule.actionType}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" disabled={!canOperate || toggleMutation.isPending} title={!canOperate ? ROLE_TIPS.operate : undefined} onClick={() => toggleMutation.mutate(rule.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)] text-xs text-[var(--foreground)] disabled:opacity-50 cursor-pointer">
                    <Power className="w-3.5 h-3.5" />{rule.enabled ? "停用" : "启用"}
                  </button>
                  <button type="button" disabled={!canOperate || simulateMutation.isPending} title={!canOperate ? ROLE_TIPS.operate : undefined} onClick={() => simulateMutation.mutate(rule.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 text-xs font-medium disabled:opacity-50 cursor-pointer">
                    <Play className="w-3.5 h-3.5" />模拟事件触发
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 border-t border-[var(--border)] space-y-2">
          <div className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5"><Radio className="w-3.5 h-3.5 text-emerald-500" />最近执行日志 ({logs.length})</div>
          {logs.length === 0 ? (
            <div className="text-xs text-[var(--muted-foreground)] py-2">暂无执行记录，可点击上方「模拟事件触发」验证链路。</div>
          ) : (
            <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--background)]/50">
              {logs.slice(0, 5).map((log) => (
                <div key={log.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="font-medium text-[var(--foreground)]">{log.ruleName} · <span className="text-[var(--muted-foreground)] font-normal">{log.eventPayloadSummary}</span></div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">执行动作：{log.actionTaken}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${log.status === "EXECUTED" ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}>
                      {log.status === "EXECUTED" ? "已执行" : "已跳过(停用)"}
                    </span>
                    <span className="text-[11px] font-mono text-[var(--muted-foreground)]">{log.executedAt}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-1.5"><Code2 className="w-4 h-4 text-indigo-500" />OA / ERP 嵌入式微组件 SDK</h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">将受控语义能力以零侵入方式嵌入 OA、ERP 或门户系统，自动继承工作区权限与主题。</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {WIDGET_OPTIONS.map((opt) => (
              <button key={opt.id} type="button" onClick={() => setWidget(opt.id)} className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${widget === opt.id ? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]" : "border-[var(--border)] bg-[var(--secondary)]/40 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { title: "iframe 快速嵌入", code: embedData?.iframeSnippet, tag: "<iframe>" },
            { title: "Web Component 集成", code: embedData?.webComponentSnippet, tag: "<lingdong-widget>" },
          ].map((block) => (
            <div key={block.title} className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/35 overflow-hidden">
              <div className="px-3.5 py-2 border-b border-[var(--border)] flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-[var(--foreground)] flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5 text-indigo-500" />{block.title}</span>
                <button type="button" onClick={() => void copySnippet(block.tag, block.code)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)] text-[11px] text-[var(--foreground)] cursor-pointer">
                  <Copy className="w-3 h-3" />复制代码
                </button>
              </div>
              <pre className="p-3.5 text-[11px] font-mono text-[var(--foreground)] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                {block.code ?? "正在生成嵌入代码..."}
              </pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
