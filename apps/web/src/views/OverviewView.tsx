import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Layers, Sparkles } from "lucide-react";
import { api } from "../api/client";
import type {
  AppsWorkspaceResponse,
  DialogId,
  EngineeringViewId,
  QualityAndReleaseSnapshot,
} from "../api/types";
import { getRolePermissions, ROLE_TIPS } from "../utils/rbac";
import { getWorkspaceCopy } from "../utils/workspaceCopy";
import { RequirementTraceDrawer } from "../components/overview/RequirementTraceDrawer";
import { OverviewStepperColumn } from "./OverviewStepperColumn";
import { OverviewTemplateMarketDrawer } from "./overview/OverviewTemplateMarketDrawer";

interface OverviewViewProps {
  workspaceId: string;
  currentRole?: string;
  appsData?: AppsWorkspaceResponse;
  releaseData?: QualityAndReleaseSnapshot;
  onSwitchView: (view: EngineeringViewId) => void;
  onOpenDialog: (dialog: DialogId) => void;
}

type TaskFilter = "all" | "modeling" | "exec";

export function OverviewView({
  workspaceId,
  currentRole,
  appsData,
  releaseData,
  onSwitchView,
  onOpenDialog,
}: OverviewViewProps) {
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [traceOpen, setTraceOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const { canModel } = getRolePermissions(currentRole);
  const copy = getWorkspaceCopy(workspaceId);

  const { data } = useQuery({ queryKey: ["overview", workspaceId], queryFn: () => api.getOverview(workspaceId), enabled: Boolean(workspaceId) });
  const { data: dataSnap } = useQuery({ queryKey: ["data", workspaceId], queryFn: () => api.getData(workspaceId), enabled: Boolean(workspaceId) });
  const ws = data?.workspace;
  const workItems = data?.workItems ?? [];
  const cqs = data?.competencyQuestions ?? [];
  const recentAudit = data?.recentAuditEvents ?? [];
  const filteredItems = workItems.filter((item) =>
    taskFilter === "all" ? true : taskFilter === "modeling" ? item.category === "modeling" || item.category === "data" : item.category === "exec" || item.category === "release"
  );
  const shortRev = ws?.activeRevisionId?.replace(/^rev:/, "").slice(0, 6) ?? "------";
  const passRate = appsData?.app.benchmarkPassRate;
  const publishedRel = releaseData?.releases.find((r) => r.status === "PUBLISHED");
  const pendingRel = releaseData?.releases.find((r) => r.status === "AWAITING_REVIEW");
  const pendingProposals = ws?.pendingProposalCount ?? 0;
  const quarantineCount = dataSnap?.materializationRuns?.[0]?.quarantinedCount ?? 0;
  const heroAction =
    pendingProposals > 0
      ? {
          badge: `待审建模提案 · ${pendingProposals} 项`,
          tone: "border-amber-500/35 bg-gradient-to-r from-amber-500/[0.08] via-[var(--card)] to-[var(--card)]",
          badgeCls: "bg-amber-500/15 text-amber-700",
          title: `有 ${pendingProposals} 项 AI 辅助建模提案等待审阅合入`,
          desc: "核验资料证据锚点与本体影响面后合入主图谱，保持 TBox 语义模型与业务诉求对齐。",
          cta: "去审阅待合入建模提案",
          onClick: () => onOpenDialog("changeset"),
        }
      : quarantineCount > 0
        ? {
            badge: `SHACL 隔离告警 · ${quarantineCount} 条`,
            tone: "border-rose-500/35 bg-gradient-to-r from-rose-500/[0.08] via-[var(--card)] to-[var(--card)]",
            badgeCls: "bg-rose-500/15 text-rose-700",
            title: `最新物化批次拦截 ${quarantineCount} 条隔离脏数据待修复`,
            desc: "前往数据物化与隔离区修正源数据或时序冲突，并一键重放写入受治理 ABox 命名图。",
            cta: "去修复隔离脏数据",
            onClick: () => onSwitchView("data"),
          }
        : {
            badge: "语义链路健康 · 可体验",
            tone: "border-[var(--primary)]/30 bg-gradient-to-r from-blue-500/[0.08] via-[var(--card)] to-[var(--card)]",
            badgeCls: "bg-emerald-500/15 text-emerald-700",
            title: "本体模型、ABox 实例与质量门禁已全部就绪",
            desc: "当前高优先级治理待办已清零，可前往语义应用与业务应用门户体验端到端智能问答与受控执行。",
            cta: "前往业务应用门户体验",
            onClick: () => onSwitchView("apps"),
          };
  const cqTableVars = { "--label-2": "'覆盖概念'", "--label-3": "'绑定执行能力'", "--label-4": "'验证状态'" } as CSSProperties;

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        <section className={`p-5 rounded-2xl border shadow-sm flex flex-wrap items-center justify-between gap-4 ${heroAction.tone}`}>
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)]">
                <Sparkles className="w-3.5 h-3.5" />
                当前首要行动推荐
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${heroAction.badgeCls}`}>{heroAction.badge}</span>
            </div>
            <h1 className="text-base font-bold tracking-tight text-[var(--foreground)]">{heroAction.title}</h1>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{heroAction.desc}</p>
          </div>
          <div className="shrink-0 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setTemplateOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] text-xs font-semibold hover:bg-[var(--secondary)] transition cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              行业本体模板库
            </button>
            <button
              type="button"
              onClick={heroAction.onClick}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-semibold shadow-sm hover:opacity-90 transition cursor-pointer"
            >
              {heroAction.cta}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>

        <div className="grid grid-cols-4 gap-4">
          <button type="button" onClick={() => onSwitchView("ontology")} className="text-left p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] transition cursor-pointer">
            <div className="text-xs text-[var(--muted-foreground)]">本体语义规模 (rev:{shortRev})</div>
            <div className="text-2xl font-bold mt-1">{ws ? `${ws.classCount} 类 · ${ws.propertyCount} 关系` : "加载中..."}</div>
            <div className={`text-xs mt-1 ${pendingProposals > 0 ? "text-amber-600" : "text-emerald-600"}`}>
              {ws ? (pendingProposals > 0 ? `${ws.shaclCount} 条 SHACL 约束 · ${pendingProposals} 项待审变更` : `${ws.shaclCount} 条 SHACL 约束 · 已同步至主图谱`) : "正在核验本体状态"}
            </div>
          </button>

          <button type="button" onClick={() => onSwitchView("data")} className="text-left p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] transition cursor-pointer">
            <div className="text-xs text-[var(--muted-foreground)]">受治理 ABox 实例总量</div>
            <div className="text-2xl font-bold mt-1">{ws ? ws.aboxInstanceCount.toLocaleString() : "—"}</div>
            <div className="text-xs text-[var(--muted-foreground)] mt-1">{copy.aboxSubtext}</div>
          </button>

          <button type="button" onClick={() => onSwitchView("apps")} className="text-left p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] transition cursor-pointer">
            <div className="text-xs text-[var(--muted-foreground)]">受控执行与基准评测</div>
            <div className="text-2xl font-bold mt-1">{passRate !== undefined ? `${passRate}% 准确率` : "—"}</div>
            <div className={`text-xs mt-1 ${passRate !== undefined && passRate < 90 ? "text-amber-600" : "text-emerald-600"}`}>
              {passRate !== undefined ? `${appsData?.app.capabilities.length ?? 0} 项受控能力 · ${passRate >= 90 ? "基准评测达标" : "存在待优化用例"}` : "正在读取评测与能力状态"}
            </div>
          </button>

          <button type="button" onClick={() => onSwitchView("release")} className="text-left p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] transition cursor-pointer">
            <div className="text-xs text-[var(--muted-foreground)]">交付包与互操作状态</div>
            <div className="text-2xl font-bold mt-1">{publishedRel ? `${publishedRel.version} 已就绪` : `${ws?.versionLabel ?? "v2.0"} 就绪`}</div>
            <div className="text-xs text-amber-600 mt-1">{pendingRel ? `${pendingRel.version} 候选修订等待独立审核签署 →` : "标准交付包可随时下载 →"}</div>
          </button>
        </div>

        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-8 space-y-5">
            <section className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold">协作与治理待办中心</h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)]">
                    指派给我 {workItems.length} 项
                  </span>
                </div>
                <div className="flex gap-1 text-xs" role="group" aria-label="筛选治理待办">
                  {([["all", "全部"], ["modeling", "建模审阅"], ["exec", "受控执行审批"]] as const).map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setTaskFilter(key)} className={`px-2.5 py-1 rounded-md transition cursor-pointer ${taskFilter === key ? "bg-[var(--secondary)] font-medium text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="divide-y divide-[var(--border)] text-xs">
                {filteredItems.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[var(--muted-foreground)]">当前筛选分类下暂无待处理治理任务，所有事项已清零。</div>
                ) : (
                  filteredItems.map((item, idx) => (
                    <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <div className="font-medium text-[var(--foreground)]">{item.title}</div>
                        <div className="text-[var(--muted-foreground)]">{item.subtitle}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => (item.dialogTarget === "changeset" ? onOpenDialog("changeset") : onSwitchView(item.targetView))}
                        className={`shrink-0 px-3 py-1.5 rounded-md font-medium cursor-pointer ${idx === 0 && item.dialogTarget === "changeset" ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "border border-[var(--border)] hover:bg-[var(--secondary)]"}`}
                      >
                        {item.actionLabel}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">方案业务目标与能力问题（Competency Questions）追踪</h2>
                  <p className="text-xs text-[var(--muted-foreground)]">确保每一个本体类与属性都直接服务于可验证的业务问题，杜绝过度建模。</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => setTraceOpen(true)} className="px-2.5 py-1 rounded-md border border-[var(--primary)]/40 text-[var(--primary)] text-xs font-medium hover:bg-[var(--primary)]/10 cursor-pointer">
                    需求追踪矩阵
                  </button>
                  <button type="button" disabled={!canModel} title={!canModel ? ROLE_TIPS.model : undefined} onClick={() => onOpenDialog("create-cq")} className="px-2.5 py-1 rounded-md border border-[var(--border)] text-xs font-medium hover:bg-[var(--secondary)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                    + 新增 CQ
                  </button>
                </div>
              </div>
              <div tabIndex={0} role="region" aria-label="能力问题覆盖追踪表" className="table-wrapper">
                <table style={cqTableVars}>
                  <thead>
                    <tr>
                      <th scope="col">能力问题 (CQ)</th>
                      <th scope="col">覆盖本体概念</th>
                      <th scope="col">绑定查询 / 动作</th>
                      <th scope="col">回归状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cqs.map((cq) => (
                      <tr key={cq.id}>
                        <th scope="row" className="!whitespace-normal max-w-[310px]">{cq.question.startsWith(cq.code) ? cq.question : `${cq.code}：${cq.question}`}</th>
                        <td><code className="font-mono">{cq.coveredConcepts.join(", ")}</code></td>
                        <td><code className="font-mono">{cq.boundCapability}</code></td>
                        <td>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">
                            {cq.status === "VERIFIED_READY" ? "✓ 写后核验就绪" : "✓ 已覆盖通过"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <OverviewStepperColumn
            shortRev={shortRev}
            classCount={ws?.classCount ?? 0}
            shaclCount={ws?.shaclCount ?? 0}
            pendingProposalCount={ws?.pendingProposalCount ?? 0}
            cqCount={cqs.length}
            aboxInstanceCount={ws?.aboxInstanceCount ?? 0}
            capabilityCount={appsData?.app.capabilities.length ?? 0}
            appActiveVersion={appsData?.app.activeVersion ?? "v2.0"}
            hasPublishedRelease={Boolean(publishedRel)}
            hasPendingRelease={Boolean(pendingRel)}
            recentAudit={recentAudit}
            onSwitchView={onSwitchView}
          />
        </div>
      </div>
      <RequirementTraceDrawer workspaceId={workspaceId} open={traceOpen} canModel={canModel} onClose={() => setTraceOpen(false)} />
      <OverviewTemplateMarketDrawer workspaceId={workspaceId} open={templateOpen} canModel={canModel} onClose={() => setTemplateOpen(false)} />
    </main>
  );
}
