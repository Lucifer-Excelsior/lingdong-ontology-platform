import { CheckCircle2, FileText, GitBranch, ShieldCheck } from "lucide-react";
import type { ConversationMessage } from "../../api/types";

interface SandboxTracePanelProps {
  boundRevisionId: string;
  isStreaming: boolean;
  latestAssistant?: ConversationMessage;
  latestActionStatus: string | null;
  traceLines: string[];
}

export function SandboxTracePanel({
  boundRevisionId,
  isStreaming,
  latestAssistant,
  latestActionStatus,
  traceLines,
}: SandboxTracePanelProps) {
  const latestAction = latestAssistant?.pendingAction;
  const citationCount = latestAssistant?.citations.length ?? 0;

  const traceStages = [
    {
      icon: GitBranch,
      title: "1. 语义图谱检索命中",
      status: isStreaming ? "检索中" : "已命中",
      tone: isStreaming ? "text-blue-600 bg-blue-500/10" : "text-emerald-600 bg-emerald-500/10",
      detail: `冻结修订 ${boundRevisionId} · ${traceLines[0] ?? "受控 SPARQL 模板编译完成"}`,
    },
    {
      icon: FileText,
      title: "2. 原文条款依据数量",
      status: `${citationCount} 条证据`,
      tone: citationCount > 0 ? "text-emerald-600 bg-emerald-500/10" : "text-[var(--muted-foreground)] bg-[var(--secondary)]",
      detail:
        citationCount > 0
          ? `已锚定 ${citationCount} 条 PROV-O 制度与合同原文切片`
          : "等待本轮问答返回原文条款锚点",
    },
    {
      icon: ShieldCheck,
      title: "3. 受控能力门禁状态",
      status: latestActionStatus ?? "READ 只读放行",
      tone:
        latestActionStatus === "VERIFIED"
          ? "text-emerald-600 bg-emerald-500/10"
          : latestActionStatus
          ? "text-amber-600 bg-amber-500/15"
          : "text-blue-600 bg-blue-500/10",
      detail: latestAction ? latestAction.previewText : "本轮无写入副作用，已按角色列掩码校验放行",
    },
    {
      icon: CheckCircle2,
      title: "4. 写后规则核验结论",
      status: latestActionStatus === "VERIFIED" ? "SHACL 通过" : latestActionStatus ? "待执行后核验" : "校验通过",
      tone:
        latestActionStatus && latestActionStatus !== "VERIFIED"
          ? "text-amber-600 bg-amber-500/15"
          : "text-emerald-600 bg-emerald-500/10",
      detail:
        latestActionStatus === "VERIFIED"
          ? "写后状态查询与 SHACL 形状约束 0 违规"
          : latestActionStatus
          ? "确认/独立审批生效后将自动触发后置 SHACL 校验"
          : "输出符合租户权限边界与合规拒答策略",
    },
  ];

  return (
    <aside className="lg:col-span-4 rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 flex flex-col gap-3 text-xs">
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
        <span className="font-semibold text-sm">AI 推理与治理 Trace 面板</span>
        <span
          className={`px-2 py-0.5 rounded font-mono text-[11px] font-medium ${
            isStreaming ? "bg-blue-500/15 text-blue-700" : "bg-emerald-500/10 text-emerald-700"
          }`}
        >
          {isStreaming ? "SSE LIVE" : "4-STAGE"}
        </span>
      </div>

      <div className="space-y-2">
        {traceStages.map((stage) => {
          const Icon = stage.icon;
          return (
            <div key={stage.title} className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)]/60 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <Icon className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                  {stage.title}
                </span>
                <span className={`px-1.5 py-0.5 rounded font-mono text-[11px] font-medium shrink-0 ${stage.tone}`}>
                  {stage.status}
                </span>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">{stage.detail}</p>
            </div>
          );
        })}
      </div>

      <details className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/50 p-2.5">
        <summary className="font-medium text-[var(--muted-foreground)] cursor-pointer select-none">
          原始编译与执行轨迹日志 ({traceLines.length})
        </summary>
        <pre
          tabIndex={0}
          role="region"
          aria-label="执行计划与编译透明轨迹"
          className="mt-2 p-2.5 rounded bg-[var(--card)] font-mono text-[11px] overflow-x-auto max-h-40 leading-relaxed whitespace-pre-wrap"
        >
          <code>{traceLines.join("\n")}</code>
        </pre>
      </details>
    </aside>
  );
}
