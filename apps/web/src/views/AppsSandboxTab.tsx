import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ConversationMessage, ExecutionPlanRecord } from "../api/types";
import { SandboxTracePanel } from "../components/apps/SandboxTracePanel";
import { ROLE_TIPS } from "../utils/rbac";
import { getWorkspaceCopy } from "../utils/workspaceCopy";

interface AppsSandboxTabProps {
  workspaceId: string;
  conversation: ConversationMessage[];
  executionPlans?: ExecutionPlanRecord[];
  boundRevisionId: string;
  canOperate?: boolean;
  canApprove?: boolean;
  onToast: (msg: string) => void;
}

export function AppsSandboxTab({
  workspaceId,
  conversation,
  executionPlans = [],
  boundRevisionId,
  canOperate = true,
  canApprove = true,
  onToast,
}: AppsSandboxTabProps) {
  const queryClient = useQueryClient();
  const copy = getWorkspaceCopy(workspaceId);
  const [question, setQuestion] = useState("");
  const [streamingUserQ, setStreamingUserQ] = useState("");
  const [streamingSteps, setStreamingSteps] = useState<string[]>([]);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [planStatusOverrides, setPlanStatusOverrides] = useState<Record<string, string>>({});
  const [clearedIds, setClearedIds] = useState<string[]>([]);

  useEffect(() => {
    setPlanStatusOverrides({});
    setClearedIds([]);
  }, [workspaceId]);

  const refreshApps = () => {
    void queryClient.invalidateQueries({ queryKey: ["apps", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["governance", workspaceId] });
  };

  const askMutation = useMutation({
    mutationFn: (q: string) => {
      setStreamingUserQ(q);
      setStreamingSteps([]);
      setStreamingAnswer("");
      return api.askAgentStream(
        workspaceId,
        { question: q, portalMode: false, sessionId: "default" },
        {
          onStep: (step) => setStreamingSteps((prev) => [...prev, step]),
          onDelta: (delta) => setStreamingAnswer((prev) => prev + delta),
        }
      );
    },
    onSuccess: () => {
      setStreamingUserQ("");
      setStreamingAnswer("");
      setQuestion("");
      refreshApps();
      onToast("已完成流式推理、受控查询编译与 PROV-O 证据核验");
    },
    onError: (err: Error) => {
      setStreamingUserQ("");
      setStreamingAnswer("");
      onToast(err.message);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (payload: { planId: string; token: string }) =>
      api.confirmPlan(workspaceId, payload.planId, payload.token),
    onSuccess: (res, vars) => {
      setPlanStatusOverrides((prev) => ({ ...prev, [vars.planId]: res.plan.status }));
      refreshApps();
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const approveMutation = useMutation({
    mutationFn: (planId: string) => api.approvePlan(workspaceId, planId),
    onSuccess: (res, planId) => {
      setPlanStatusOverrides((prev) => ({ ...prev, [planId]: res.plan.status }));
      refreshApps();
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const submitQuestion = () => {
    const trimmed = question.trim();
    if (!trimmed || askMutation.isPending) return;
    askMutation.mutate(trimmed);
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitQuestion();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      submitQuestion();
    }
  };

  const visibleConversation = conversation.filter((m) => !clearedIds.includes(m.id));
  const latestAssistant = [...visibleConversation].reverse().find((m) => m.role === "assistant");
  const latestAction = latestAssistant?.pendingAction;
  const latestActionStatus = latestAction
    ? planStatusOverrides[latestAction.planId] ?? executionPlans.find((p) => p.id === latestAction.planId)?.status ?? latestAction.status
    : null;

  const traceLines =
    askMutation.isPending && streamingSteps.length > 0
      ? streamingSteps
      : latestAssistant && latestAssistant.transparencyTrace.length > 0
      ? latestAssistant.transparencyTrace
      : ["1. 意图路由: QUERY_TEMPLATE + CONFIRM_ACTION", `2. 冻结本体: ${boundRevisionId}`, ...copy.sandboxTraceTail];

  const handleClearChat = () => {
    setClearedIds(conversation.map((m) => m.id));
    setStreamingSteps([]);
    setStreamingAnswer("");
    onToast("已清空当前沙盒对话记录");
  };

  return (
    <div className="p-6 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="lg:col-span-8 rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 flex flex-col justify-between min-h-[480px]">
        <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-[var(--border)] text-xs">
          <span className="font-semibold text-sm">语义问答与受控动作沙盒</span>
          <button type="button" disabled={visibleConversation.length === 0 || askMutation.isPending} onClick={handleClearChat} className="px-2.5 py-1 rounded border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] disabled:opacity-40 cursor-pointer">
            清空对话
          </button>
        </div>

        <div className="space-y-3 text-sm max-h-[380px] overflow-y-auto pr-1">
          {visibleConversation.length === 0 && !askMutation.isPending && (
            <>
              <div className="p-3 rounded-lg bg-[var(--secondary)] text-xs font-medium">{copy.sandboxSampleQ}</div>
              <div className="p-4 rounded-xl border border-[var(--border)] space-y-2 text-xs">
                <div className="font-medium text-sm">{copy.sandboxSampleTitle}</div>
                <div className="text-[var(--muted-foreground)]">{copy.sandboxSampleBody}</div>
              </div>
            </>
          )}

          {visibleConversation.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="p-3 rounded-lg bg-[var(--secondary)] text-xs font-medium">{msg.content}</div>
            ) : (
              <div key={msg.id} className="p-4 rounded-xl border border-[var(--border)] space-y-2.5">
                <div className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                {msg.citations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.citations.map((cite, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-[var(--secondary)] font-mono text-xs text-[var(--muted-foreground)]">证据：{cite}</span>
                    ))}
                  </div>
                )}
                {msg.pendingAction && (() => {
                  const pa = msg.pendingAction;
                  const liveStatus = planStatusOverrides[pa.planId] ?? executionPlans.find((p) => p.id === pa.planId)?.status ?? pa.status;
                  return (
                    <div className="p-3 rounded-lg bg-[var(--secondary)] flex items-center justify-between gap-3 text-xs">
                      <span>{pa.previewText}</span>
                      {liveStatus === "AWAITING_CONFIRMATION" ? (
                        <button type="button" disabled={confirmMutation.isPending || !canOperate} title={!canOperate ? ROLE_TIPS.operate : undefined} onClick={() => confirmMutation.mutate({ planId: pa.planId, token: pa.confirmationToken })} className="shrink-0 px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">本人确认执行</button>
                      ) : liveStatus === "AWAITING_APPROVAL" ? (
                        <button type="button" disabled={approveMutation.isPending || !canApprove} title={!canApprove ? ROLE_TIPS.approve : undefined} onClick={() => approveMutation.mutate(pa.planId)} className="shrink-0 px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">独立审批执行</button>
                      ) : (
                        <span className="shrink-0 px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-600 font-medium">{liveStatus}</span>
                      )}
                    </div>
                  );
                })()}
              </div>
            )
          )}

          {askMutation.isPending && (
            <>
              {streamingUserQ && <div className="p-3 rounded-lg bg-[var(--secondary)] text-xs font-medium">{streamingUserQ}</div>}
              <div className="p-4 rounded-xl border border-blue-400/50 bg-blue-500/5 space-y-2 text-xs">
                <div className="text-[var(--primary)] font-medium">SSE 流式语义推理与证据对齐中…</div>
                <div className="leading-relaxed whitespace-pre-wrap">{streamingAnswer || "正在编译受控 SPARQL 查询并检索 PROV-O 制度证据…"}</div>
              </div>
            </>
          )}
        </div>

        <form onSubmit={handleFormSubmit} method="POST" className="pt-3 border-t border-[var(--border)] flex gap-2">
          <label htmlFor="sandbox-question-input" className="sr-only">输入语义问答或动作测试问题</label>
          <input id="sandbox-question-input" name="question" type="text" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={handleInputKeyDown} placeholder="输入测试问题（如询问未授权薪资字段将验证安全拒答）..." className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs" />
          <button type="submit" disabled={askMutation.isPending} className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium hover:opacity-90 cursor-pointer">
            {askMutation.isPending ? "流式推理中..." : "试运行"}
          </button>
        </form>
      </div>

      <SandboxTracePanel
        boundRevisionId={boundRevisionId}
        isStreaming={askMutation.isPending}
        latestAssistant={latestAssistant}
        latestActionStatus={latestActionStatus}
        traceLines={traceLines}
      />
    </div>
  );
}
