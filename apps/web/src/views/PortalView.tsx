import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { api } from "../api/client";
import type { ConversationMessage, PortalAppId } from "../api/types";
import { PortalAlertsGrid } from "../components/portal/PortalAlertsGrid";
import { PortalAppBuilderModal } from "../components/portal/PortalAppBuilderModal";
import { PortalEntity360Drawer } from "../components/portal/PortalEntity360Drawer";
import { PortalReplyCard } from "../components/portal/PortalReplyCard";
import { getRolePermissions } from "../utils/rbac";
import { ModernTabList } from "../shell/ModernTabs";
import { PortalItuApp } from "./PortalItuApp";
import { PortalNlQueryPanel } from "./portal/PortalNlQueryPanel";
import { PortalWhatIfPanel } from "./portal/PortalWhatIfPanel";
import { PortalExecutiveBriefingPanel } from "./portal/PortalExecutiveBriefingPanel";

type PortalSubTab = "copilot" | "nl_query" | "whatif" | "executive";

interface PortalQaPair {
  question: string;
  reply: ConversationMessage;
}

interface PortalViewProps {
  workspaceId: string;
  portalApp: PortalAppId;
  currentActorId?: string;
  currentRole?: string;
  onToast: (msg: string) => void;
}

function loadQaPairs(workspaceId: string): PortalQaPair[] {
  if (!workspaceId || typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(`lingdong-portal-qa:${workspaceId}`);
    const parsed = raw ? (JSON.parse(raw) as PortalQaPair[]) : [];
    return parsed.filter((p) => p.question.trim().replace(/[?？\s]/g, "").length >= 2);
  } catch {
    return [];
  }
}

const QUICK_PROMPTS = [
  "对比即将到期合同的违约条款",
  "列出近期高风险合同及负责人",
  "华东智算中心合同不续签有哪些风险？",
];

function getGreeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "上午好" : h < 18 ? "下午好" : "晚上好";
}

export function PortalView({ workspaceId, portalApp, currentActorId, currentRole, onToast }: PortalViewProps) {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [qaPairs, setQaPairs] = useState<PortalQaPair[]>(() => loadQaPairs(workspaceId));
  const [liveSteps, setLiveSteps] = useState<string[]>([]);
  const [liveAnswer, setLiveAnswer] = useState("");
  const [drawerEntityKey, setDrawerEntityKey] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [subTab, setSubTab] = useState<PortalSubTab>("copilot");
  const { canModel, canOperate } = getRolePermissions(currentRole);

  useEffect(() => {
    setQaPairs(loadQaPairs(workspaceId));
    setLiveSteps([]);
    setLiveAnswer("");
  }, [workspaceId, currentActorId, currentRole]);

  const persistPairs = (updater: (prev: PortalQaPair[]) => PortalQaPair[]) => {
    setQaPairs((prev) => {
      const next = updater(prev);
      try { window.sessionStorage.setItem(`lingdong-portal-qa:${workspaceId}`, JSON.stringify(next.slice(0, 20))); } catch { /* ignore */ }
      return next;
    });
  };

  const { data } = useQuery({ queryKey: ["portal", workspaceId], queryFn: () => api.getPortal(workspaceId), enabled: Boolean(workspaceId) });
  const { data: portalConfig } = useQuery({ queryKey: ["portal-config", workspaceId], queryFn: () => api.getPortalConfig(workspaceId), enabled: Boolean(workspaceId) });
  const alerts = data?.contractAlerts ?? [];
  const pendingTodoCount = alerts.filter((a) => !a.pendingApprovalNote).length;
  const inApprovalCount = alerts.length - pendingTodoCount;
  const enabledWidgets = new Set(portalConfig?.enabledWidgets ?? ["kpi_alerts", "entity_360", "ai_copilot", "itu_review", "im_push", "csv_export"]);

  const askMutation = useMutation({
    mutationFn: (q: string) => {
      setLiveSteps([]);
      setLiveAnswer("");
      return api.askAgentStream(workspaceId, { question: q, portalMode: true, sessionId: "portal" }, {
        onStep: (step) => setLiveSteps((prev) => [...prev, step]),
        onDelta: (delta) => setLiveAnswer((prev) => prev + delta),
      });
    },
    onSuccess: (res, askedQuestion) => {
      setLiveSteps([]);
      setLiveAnswer("");
      persistPairs((prev) => [{ question: askedQuestion, reply: res.message }, ...prev]);
      setQuestion("");
      void queryClient.invalidateQueries({ queryKey: ["apps", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
      onToast("已返回锚定原合同条款与实时台账的精准回答");
    },
    onError: (err: Error) => { setLiveSteps([]); setLiveAnswer(""); onToast(err.message); },
  });

  const confirmMutation = useMutation({
    mutationFn: (payload: { msgId: string; planId: string; token: string }) =>
      api.confirmPlan(workspaceId, payload.planId, payload.token),
    onSuccess: (res, vars) => {
      persistPairs((prev) =>
        prev.map((item) =>
          item.reply.id === vars.msgId && item.reply.pendingAction
            ? { ...item, reply: { ...item.reply, pendingAction: { ...item.reply.pendingAction, status: res.plan.status } } }
            : item
        )
      );
      void queryClient.invalidateQueries({ queryKey: ["portal", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["apps", workspaceId] });
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const imPushMutation = useMutation({
    mutationFn: (payload: { contractNo: string; title: string; summary: string }) =>
      api.pushPortalImCard(workspaceId, {
        channel: portalConfig?.imChannel ?? "WECOM",
        title: `合同续签独立审批：${payload.contractNo}`,
        summary: `${payload.title} · ${payload.summary}`,
        targetRef: payload.contractNo,
      }),
    onSuccess: (res) => onToast(res.message),
    onError: (err: Error) => onToast(err.message),
  });

  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      await api.downloadCommercialCsv(`/api/workspaces/${encodeURIComponent(workspaceId)}/portal/alerts.csv`, "contract-risk-alerts.csv");
      onToast("已导出受治理风险台账 CSV（按当前权限自动隐藏敏感金额）");
    } catch (err) { onToast(err instanceof Error ? err.message : "导出风险台账失败"); } finally { setExportingCsv(false); }
  };

  const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); if (question.trim() && !askMutation.isPending) askMutation.mutate(question.trim()); };
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!e.nativeEvent.isComposing && e.keyCode !== 229 && question.trim() && !askMutation.isPending) askMutation.mutate(question.trim()); }
  };

  return (
    <main className="flex-1 overflow-y-auto p-8">
      {portalApp === "itu" ? (
        <PortalItuApp workspaceId={workspaceId} ituReview={data?.ituReview} onToast={onToast} />
      ) : (
        <div className="max-w-7xl mx-auto space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-[var(--secondary)] text-[var(--primary)]">
                {portalConfig?.portalTitle ?? "受治理企业智能门户 · 合同管理"}
              </span>
              <h1 className="text-xl font-semibold pt-1">
                {getGreeting()}，您有 {pendingTodoCount} 项待处置续签待办（共 {alerts.length} 份进入 {portalConfig?.alertWindowDays ?? 30} 天窗口）
              </h1>
              <p className="text-sm text-[var(--muted-foreground)]">
                {portalConfig?.subtitle ?? "所有问答引用真实合同台账与法务条款，支持直接导出标准 Word 续签函，任何写入动作均需本人确认。"}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs shrink-0">
              {enabledWidgets.has("csv_export") && (
                <button type="button" disabled={exportingCsv} onClick={() => void handleExportCsv()} className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)] font-medium disabled:opacity-50 cursor-pointer">
                  {exportingCsv ? "导出中..." : "导出风险台账 (.csv)"}
                </button>
              )}
              {canModel && (
                <button type="button" onClick={() => setBuilderOpen(true)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)] font-medium cursor-pointer">
                  ⚙️ 低代码门户装配
                </button>
              )}
            </div>
          </div>

          <div className="border-b border-[var(--border)]">
            <ModernTabList
              idPrefix="portal-v5"
              ariaLabel="智能门户功能页签"
              value={subTab}
              onChange={setSubTab}
              options={[
                { value: "copilot", label: `待办与合同智能问答 (${pendingTodoCount})` },
                { value: "nl_query", label: "NL-SPARQL 语义检索" },
                { value: "whatif", label: "影子图 What-If 推演" },
                { value: "executive", label: "高层驾驶舱与多 Agent 会审" },
              ]}
            />
          </div>

          {subTab === "nl_query" ? (
            <PortalNlQueryPanel workspaceId={workspaceId} onToast={onToast} />
          ) : subTab === "whatif" ? (
            <PortalWhatIfPanel workspaceId={workspaceId} onToast={onToast} />
          ) : subTab === "executive" ? (
            <PortalExecutiveBriefingPanel workspaceId={workspaceId} onToast={onToast} />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {enabledWidgets.has("kpi_alerts") && (
                <section className="xl:col-span-5 space-y-3" aria-label="合同到期待办队列">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[var(--foreground)]">合同到期待办队列</h2>
                    <span className="text-[11px] text-[var(--muted-foreground)]">待我处置 {pendingTodoCount} · 审批中 {inApprovalCount}</span>
                  </div>
                  <PortalAlertsGrid workspaceId={workspaceId} alerts={alerts} showEntity360={enabledWidgets.has("entity_360")} showImPush={enabledWidgets.has("im_push")} canOperate={canOperate} isAsking={askMutation.isPending} isPushingIm={imPushMutation.isPending} onOpen360={setDrawerEntityKey} onPushIm={(p) => imPushMutation.mutate(p)} onTriggerRenewal={(no) => askMutation.mutate(`请为即将到期的合同 ${no} 创建续签跟进工单`)} onToast={onToast} />
                </section>
              )}

              {enabledWidgets.has("ai_copilot") && (
                <section className={enabledWidgets.has("kpi_alerts") ? "xl:col-span-7 space-y-4" : "xl:col-span-12 space-y-4"} aria-label="合同智能问答工作台">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="inline-flex items-center gap-1 text-[var(--muted-foreground)] font-medium"><Sparkles className="w-3.5 h-3.5 text-[var(--primary)]" />快捷提问：</span>
                      {QUICK_PROMPTS.map((prompt) => (
                        <button key={prompt} type="button" disabled={askMutation.isPending} onClick={() => { setQuestion(prompt); askMutation.mutate(prompt); }} className="px-2.5 py-1 rounded-full border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/60 hover:bg-[var(--secondary)] font-medium transition disabled:opacity-50 cursor-pointer">{prompt}</button>
                      ))}
                    </div>
                    {qaPairs.length > 0 && (
                      <button type="button" onClick={() => persistPairs(() => [])} className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] shrink-0 cursor-pointer">清空对话</button>
                    )}
                  </div>
                  <form onSubmit={handleFormSubmit} method="POST" className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-sm space-y-3">
                    <label htmlFor="portal-qa-textarea" className="sr-only">用自然语言向企业合同库提问</label>
                    <textarea id="portal-qa-textarea" name="question" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={handleKeyDown} placeholder="用自然语言向企业合同库提问，例如：华东智算中心合同如果不续签，违约责任是什么？" className="w-full bg-transparent text-sm focus:outline-none" />
                    <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                      <span>事实源：企业合同台账 + 法务原文条款依据（Enter 发送）</span>
                      <button type="submit" disabled={askMutation.isPending} className="px-4 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 cursor-pointer">{askMutation.isPending ? "实时核验中..." : "发送提问"}</button>
                    </div>
                  </form>
                  {askMutation.isPending && (
                    <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-400/40 space-y-2 text-xs">
                      <div className="flex flex-wrap gap-1.5">{liveSteps.map((s, idx) => (<span key={idx} className="px-2 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] font-mono">✓ {s}</span>))}</div>
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">{liveAnswer || "正在实时条款核验并对齐合同台账依据…"}</div>
                    </div>
                  )}
                  {qaPairs.length > 0 && (
                    <div className="space-y-3">
                      {qaPairs.map((pair) => (<PortalReplyCard key={pair.reply.id} workspaceId={workspaceId} userQuestion={pair.question} reply={pair.reply} canOperate={canOperate} isConfirming={confirmMutation.isPending} onConfirm={(p) => confirmMutation.mutate(p)} onToast={onToast} />))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      )}

      <PortalEntity360Drawer workspaceId={workspaceId} entityKey={drawerEntityKey} currentRole={currentRole} onClose={() => setDrawerEntityKey(null)} />
      <PortalAppBuilderModal workspaceId={workspaceId} open={builderOpen} config={portalConfig} canModel={canModel} onClose={() => setBuilderOpen(false)} onToast={onToast} />
    </main>
  );
}
