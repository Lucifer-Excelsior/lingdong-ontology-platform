import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, Download, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { SlideOverDrawer } from "../../components/SlideOverDrawer";
import { v7Api, type V7IndustryTemplateDto } from "../../lib/v7-api";
import { ROLE_TIPS } from "../../utils/rbac";

interface OverviewTemplateMarketDrawerProps {
  workspaceId: string;
  open: boolean;
  canModel: boolean;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = { master: "核心主数据", knowledge: "语义知识", controlled_write: "受控写回" };

export function OverviewTemplateMarketDrawer({ workspaceId, open, canModel, onClose }: OverviewTemplateMarketDrawerProps) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["v7-templates", workspaceId],
    queryFn: () => v7Api.listTemplates(workspaceId),
    enabled: Boolean(workspaceId) && open,
  });

  const installMutation = useMutation({
    mutationFn: (tplId: string) => {
      setInstallingId(tplId);
      return v7Api.installTemplate(workspaceId, tplId);
    },
    onSuccess: (res) => {
      setFeedback({ tone: "ok", text: res.message || `已安装本体包（新增 ${res.addedCount} 类 · ${res.revisionCode}）` });
      void queryClient.invalidateQueries({ queryKey: ["v7-templates", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["ontology", workspaceId] });
    },
    onError: (err: Error) => setFeedback({ tone: "err", text: err.message }),
    onSettled: () => setInstallingId(null),
  });

  const templates: V7IndustryTemplateDto[] = data?.templates ?? [];

  return (
    <SlideOverDrawer
      open={open}
      onClose={onClose}
      widthClass="max-w-3xl"
      title="行业本体模板库（Ontology Pack Market）"
      subtitle="基于国家与行业语义标准沉淀的开箱即用本体包，一键合入当前工作区主图谱与 SHACL 约束库。"
      badge={
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 text-[11px] font-medium">
          <Sparkles className="w-3 h-3" />{templates.length} 套标准包
        </span>
      }
    >
      <div className="space-y-4">
        {feedback && (
          <div className={`px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${feedback.tone === "ok" ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700" : "border-rose-500/35 bg-rose-500/10 text-rose-700"}`}>
            <span>{feedback.text}</span>
            <button type="button" onClick={() => setFeedback(null)} className="text-[11px] underline opacity-80 hover:opacity-100 cursor-pointer shrink-0">关闭</button>
          </div>
        )}

        {isLoading ? (
          <div className="p-8 text-center text-xs text-[var(--muted-foreground)] rounded-xl border border-[var(--border)] bg-[var(--secondary)]/30">
            正在加载行业本体模板包...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {templates.map((tpl) => {
              const isBusy = installingId === tpl.id && installMutation.isPending;
              return (
                <article key={tpl.id} className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-3 hover:border-[var(--primary)]/40 transition-colors">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-600 text-[11px] font-semibold">{tpl.industry}</span>
                        <h3 className="text-sm font-semibold text-[var(--foreground)]">{tpl.name}</h3>
                        {tpl.installed && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 text-[11px] font-medium">
                            <CheckCircle2 className="w-3 h-3" />已安装
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{tpl.summary}</p>
                      <div className="flex items-center gap-3 flex-wrap text-[11px] text-[var(--muted-foreground)] pt-0.5">
                        <span className="inline-flex items-center gap-1"><BookOpen className="w-3 h-3 text-indigo-500" />标准参考：{tpl.standardRef}</span>
                        <span className="inline-flex items-center gap-1"><Layers className="w-3 h-3 text-emerald-500" />{tpl.classCount} 个本体类</span>
                        <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-amber-500" />{tpl.shaclRuleCount} 条 SHACL 约束</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!canModel || Boolean(tpl.installed) || installMutation.isPending}
                      title={!canModel ? ROLE_TIPS.model : tpl.installed ? "该本体包已合入当前工作区" : undefined}
                      onClick={() => installMutation.mutate(tpl.id)}
                      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${tpl.installed ? "border border-emerald-500/35 bg-emerald-500/10 text-emerald-700" : "bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90"}`}
                    >
                      {tpl.installed ? (
                        <><CheckCircle2 className="w-3.5 h-3.5" />已安装至工作区</>
                      ) : (
                        <><Download className="w-3.5 h-3.5" />{isBusy ? "正在安装..." : "一键安装本体包"}</>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {tpl.sampleClasses.map((cls) => (
                      <div key={cls.localName} className="p-2.5 rounded-lg bg-[var(--secondary)]/50 border border-[var(--border)] space-y-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-xs font-semibold text-[var(--foreground)] truncate">{cls.labelZh}</span>
                          <span className="px-1.5 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] text-[10px] text-[var(--muted-foreground)] shrink-0">
                            {ROLE_LABELS[cls.roleKind] ?? cls.roleKind}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-indigo-600 truncate">ont:{cls.localName}</div>
                        <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-2 leading-snug">{cls.description}</p>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </SlideOverDrawer>
  );
}
