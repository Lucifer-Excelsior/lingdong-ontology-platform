import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3, Bot, Check, Copy, FileText, Landmark, Link2, RefreshCw, Scale, ShieldAlert, Sparkles, Truck } from "lucide-react";

interface SemanticKpiMetric {
  code: string; name: string; value: string; unit: string;
  canonicalFormula: string; ownerDept: string; trendLabel: string;
  tone: "emerald" | "amber" | "rose" | "indigo";
}
interface ExecutiveBriefingResponse { title: string; generatedAt: string; markdown: string; }
interface SpecialistAgentVerdict {
  agentRole: "LEGAL_AGENT" | "FINANCE_AGENT" | "SUPPLY_CHAIN_AGENT";
  agentTitle: string; riskScore: number; verdict: "APPROVE" | "CONDITIONAL" | "REJECT";
  keyFindings: string[]; evidenceRef: string;
}
interface MultiAgentReviewReport {
  reviewId: string; targetRef: string; generatedAt: string;
  overallVerdict: "APPROVE" | "CONDITIONAL" | "REJECT";
  compositeRiskScore: number; executiveSummary: string; specialists: SpecialistAgentVerdict[];
}

async function fetchV7Json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, ...init });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(errBody.error ?? errBody.message ?? `请求失败 (${res.status})`);
  }
  return (await res.json()) as T;
}

const TONE_TEXT: Record<SemanticKpiMetric["tone"], string> = {
  rose: "text-rose-600 dark:text-rose-400", emerald: "text-emerald-600 dark:text-emerald-400",
  indigo: "text-indigo-600 dark:text-indigo-400", amber: "text-amber-600 dark:text-amber-400",
};

function verdictMeta(verdict: "APPROVE" | "CONDITIONAL" | "REJECT") {
  if (verdict === "APPROVE") return { label: "评审通过", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" };
  if (verdict === "REJECT") return { label: "建议驳回", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30" };
  return { label: "有条件通过", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" };
}

function AgentIcon({ role }: { role: SpecialistAgentVerdict["agentRole"] }) {
  if (role === "LEGAL_AGENT") return <Scale className="w-4 h-4 text-rose-500" />;
  if (role === "FINANCE_AGENT") return <Landmark className="w-4 h-4 text-emerald-500" />;
  return <Truck className="w-4 h-4 text-indigo-500" />;
}

function renderInlineMarkdown(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold text-[var(--foreground)]">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="px-1 py-0.5 rounded bg-[var(--secondary)] font-mono text-[11px]">{part.slice(1, -1)}</code>;
    return <span key={i}>{part}</span>;
  });
}

export function PortalExecutiveBriefingPanel({ workspaceId, onToast }: { workspaceId: string; onToast: (msg: string) => void }) {
  const ws = encodeURIComponent(workspaceId);
  const [targetRef, setTargetRef] = useState("HT-2026-089");
  const [copied, setCopied] = useState(false);

  const metricsQuery = useQuery({
    queryKey: ["v7-metrics", workspaceId],
    queryFn: () => fetchV7Json<{ metrics: SemanticKpiMetric[]; computedAt: string }>(`/api/workspaces/${ws}/v7/metrics`),
    enabled: Boolean(workspaceId),
  });

  const briefingMutation = useMutation({
    mutationFn: () => fetchV7Json<ExecutiveBriefingResponse>(`/api/workspaces/${ws}/v7/executive-briefing`, { method: "POST" }),
    onSuccess: () => onToast("已基于统一本体语义指标层生成高层经营周报"),
    onError: (err: Error) => onToast(err.message),
  });

  const reviewMutation = useMutation({
    mutationFn: () => fetchV7Json<MultiAgentReviewReport>(`/api/workspaces/${ws}/v7/multi-agent-review`, {
      method: "POST",
      body: JSON.stringify({ targetRef: targetRef.trim() || "HT-2026-089" }),
    }),
    onSuccess: (res) => onToast(`三专家联合会审完成：${res.targetRef} 综合风险分 ${res.compositeRiskScore}/100`),
    onError: (err: Error) => onToast(err.message),
  });

  const handleCopyBriefing = async () => {
    const md = briefingMutation.data?.markdown;
    if (!md) return;
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true); onToast("已复制高层经营周报汇报稿到剪贴板"); window.setTimeout(() => setCopied(false), 1800);
    } catch { onToast("复制失败，请手动选中汇报稿文本复制"); }
  };

  const metrics = metricsQuery.data?.metrics ?? [];
  const { data: briefing } = briefingMutation;
  const { data: review } = reviewMutation;

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-label="集团统一语义指标中心">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[var(--primary)]" />
            <h2 className="text-sm font-semibold text-[var(--foreground)]">集团统一语义指标中心 (Metric Layer)</h2>
            {metricsQuery.data?.computedAt && <span className="text-[11px] text-[var(--muted-foreground)]">实时口径 · {metricsQuery.data.computedAt}</span>}
          </div>
          <button type="button" onClick={() => void metricsQuery.refetch()} disabled={metricsQuery.isFetching} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)] text-xs text-[var(--foreground)] cursor-pointer disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${metricsQuery.isFetching ? "animate-spin" : ""}`} />刷新指标
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {metrics.map((m) => (
            <div key={m.code} title={`权威语义公式：${m.canonicalFormula}`} className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-sm flex flex-col justify-between gap-2.5">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--muted-foreground)]">{m.name}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--secondary)] text-[var(--muted-foreground)]">{m.code}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-2xl font-bold tracking-tight ${TONE_TEXT[m.tone]}`}>{m.value}</span>
                  <span className="text-xs font-medium text-[var(--muted-foreground)]">{m.unit}</span>
                </div>
                <div className="text-xs text-[var(--foreground)]/80">{m.trendLabel}</div>
              </div>
              <div className="pt-2 border-t border-[var(--border)] space-y-1">
                <div className="text-[11px] text-[var(--muted-foreground)]">归属口径：{m.ownerDept}</div>
                <div className="text-[10px] font-mono text-[var(--muted-foreground)] bg-[var(--secondary)] px-2 py-1 rounded truncate" title={m.canonicalFormula}>{m.canonicalFormula}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-sm space-y-4" aria-label="AI 高层经营周报生成器">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-1.5"><FileText className="w-4 h-4 text-[var(--primary)]" />AI 高层经营周报生成器</h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">自动聚合统一本体语义指标、临期合同风险与治理基线，一键生成可签发汇报稿。</p>
          </div>
          <div className="flex items-center gap-2">
            {briefing && (
              <button type="button" onClick={() => void handleCopyBriefing()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] hover:opacity-90 text-xs font-medium text-[var(--foreground)] cursor-pointer">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}{copied ? "已复制" : "复制汇报稿"}
              </button>
            )}
            <button type="button" disabled={briefingMutation.isPending} onClick={() => briefingMutation.mutate()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer">
              <Sparkles className="w-3.5 h-3.5" />{briefingMutation.isPending ? "周报生成中..." : "一键生成高层经营周报"}
            </button>
          </div>
        </div>

        {briefing ? (
          <div className="p-4 rounded-xl bg-[var(--background)] border border-[var(--border)] space-y-2 text-xs leading-relaxed text-[var(--foreground)]/90">
            {briefing.markdown.split("\n").map((line, idx) => {
              if (!line.trim()) return <div key={idx} className="h-1" />;
              if (line.startsWith("# ")) return <h3 key={idx} className="text-sm font-bold text-[var(--foreground)]">{line.slice(2)}</h3>;
              if (line.startsWith("## ")) return <h4 key={idx} className="text-xs font-semibold text-[var(--foreground)] pt-1">{line.slice(3)}</h4>;
              if (line.startsWith("> ")) return <div key={idx} className="pl-3 border-l-2 border-[var(--primary)] text-[var(--muted-foreground)]">{renderInlineMarkdown(line.slice(2))}</div>;
              return <p key={idx}>{renderInlineMarkdown(line)}</p>;
            })}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-[var(--secondary)]/60 border border-dashed border-[var(--border)] text-xs text-[var(--muted-foreground)]">
            点击右上角「一键生成高层经营周报」，系统将基于当前活跃本体版本与统一指标层实时编排周报内容。
          </div>
        )}
      </section>

      <section className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-sm space-y-4" aria-label="多角色专家智能体协同会审">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-1.5"><Bot className="w-4 h-4 text-[var(--primary)]" />多角色专家智能体协同会审 (Multi-Agent Co-Review)</h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">并行调度法务合规、财务预算、供应链履约三大专家 Agent，基于本体证据链输出联合裁决。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="text" aria-label="目标会审合同编号" value={targetRef} onChange={(e) => setTargetRef(e.target.value)} placeholder="HT-2026-089" className="w-40 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-xs font-mono text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]" />
            <button type="button" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer">
              <ShieldAlert className="w-3.5 h-3.5" />{reviewMutation.isPending ? "三专家并行会审中..." : "启动三专家联合会审"}
            </button>
          </div>
        </div>

        {review && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[var(--secondary)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-[var(--foreground)]">{review.targetRef}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${verdictMeta(review.overallVerdict).cls}`}>{verdictMeta(review.overallVerdict).label}</span>
                  <span className="text-[11px] text-[var(--muted-foreground)]">{review.generatedAt} · {review.reviewId}</span>
                </div>
                <p className="text-xs text-[var(--foreground)]/90 leading-relaxed">{review.executiveSummary}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] text-[var(--muted-foreground)]">综合风险评分</div>
                <div className="text-2xl font-bold text-[var(--foreground)]">{review.compositeRiskScore}<span className="text-xs font-normal text-[var(--muted-foreground)]"> / 100</span></div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {review.specialists.map((sp) => {
                const vm = verdictMeta(sp.verdict);
                const barCls = sp.riskScore >= 70 ? "bg-rose-500" : sp.riskScore >= 50 ? "bg-amber-500" : "bg-emerald-500";
                return (
                  <div key={sp.agentRole} className="p-4 rounded-xl bg-[var(--background)] border border-[var(--border)] flex flex-col justify-between gap-3">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]"><AgentIcon role={sp.agentRole} />{sp.agentTitle}</div>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${vm.cls}`}>{vm.label}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]"><span className="text-[var(--muted-foreground)]">专项风险评分</span><span className="font-mono font-semibold text-[var(--foreground)]">{sp.riskScore} / 100</span></div>
                        <div className="h-1.5 rounded-full bg-[var(--secondary)] overflow-hidden"><div className={`h-full rounded-full ${barCls}`} style={{ width: `${Math.min(100, sp.riskScore)}%` }} /></div>
                      </div>
                      <ul className="space-y-1.5 text-xs text-[var(--foreground)]/85 list-disc pl-4">
                        {sp.keyFindings.map((f, i) => <li key={i} className="leading-relaxed">{f}</li>)}
                      </ul>
                    </div>
                    <div className="pt-2 border-t border-[var(--border)] flex items-center gap-1.5 text-[11px] font-mono text-[var(--muted-foreground)]">
                      <Link2 className="w-3.5 h-3.5 shrink-0 text-[var(--primary)]" /><span className="truncate" title={sp.evidenceRef}>{sp.evidenceRef}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
