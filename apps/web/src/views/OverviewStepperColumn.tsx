import type { AuditEvent, EngineeringViewId } from "../api/types";

interface OverviewStepperColumnProps {
  shortRev: string;
  classCount: number;
  shaclCount: number;
  pendingProposalCount: number;
  cqCount: number;
  aboxInstanceCount: number;
  capabilityCount: number;
  appActiveVersion: string;
  hasPublishedRelease: boolean;
  hasPendingRelease: boolean;
  recentAudit: AuditEvent[];
  onSwitchView: (view: EngineeringViewId) => void;
}

export function OverviewStepperColumn({
  shortRev,
  classCount,
  shaclCount,
  pendingProposalCount,
  cqCount,
  aboxInstanceCount,
  capabilityCount,
  appActiveVersion,
  hasPublishedRelease,
  hasPendingRelease,
  recentAudit,
  onSwitchView,
}: OverviewStepperColumnProps) {
  const stage1Ready = cqCount > 0 || classCount > 0;
  const stage2Ready = classCount > 0 && shaclCount > 0;
  const stage3Ready = aboxInstanceCount > 0;
  const stage4Ready = capabilityCount > 0;
  const stage5Ready = hasPublishedRelease && !hasPendingRelease;
  const completedStages = [stage1Ready, stage2Ready, stage3Ready, stage4Ready, stage5Ready].filter(Boolean).length;

  return (
    <div className="col-span-4 space-y-5">
      <section className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-3">
        <h2 className="text-sm font-semibold">端到端工程进度（{completedStages}/5 阶段就绪）</h2>
        <div className="space-y-2 text-xs">
          <button
            type="button"
            onClick={() => onSwitchView("modeling")}
            className="w-full p-2.5 rounded-lg bg-[var(--secondary)] flex items-center justify-between text-left hover:opacity-90 cursor-pointer"
          >
            <span>
              <strong>1. 资料与向导建模</strong> · {cqCount} 项 CQ
            </span>
            <span className={pendingProposalCount > 0 ? "text-amber-600 font-medium" : stage1Ready ? "text-emerald-600 font-medium" : "text-[var(--muted-foreground)] font-medium"}>
              {pendingProposalCount > 0 ? `${pendingProposalCount} 项待审 →` : stage1Ready ? "就绪 →" : "待开始 →"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchView("ontology")}
            className="w-full p-2.5 rounded-lg bg-[var(--secondary)] flex items-center justify-between text-left hover:opacity-90 cursor-pointer"
          >
            <span>
              <strong>2. 专家本体与 SHACL</strong> · rev:{shortRev}
            </span>
            <span className={stage2Ready ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
              {stage2Ready ? "就绪 →" : "待补充 →"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchView("data")}
            className="w-full p-2.5 rounded-lg bg-[var(--secondary)] flex items-center justify-between text-left hover:opacity-90 cursor-pointer"
          >
            <span>
              <strong>3. 映射与 ABox 物化</strong> · {aboxInstanceCount.toLocaleString()} 实例
            </span>
            <span className={stage3Ready ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
              {stage3Ready ? "已物化 →" : "待物化 →"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchView("apps")}
            className="w-full p-2.5 rounded-lg bg-[var(--secondary)] flex items-center justify-between text-left hover:opacity-90 cursor-pointer"
          >
            <span>
              <strong>4. 语义应用与受控动作</strong> · {appActiveVersion}
            </span>
            <span className={stage4Ready ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
              {stage4Ready ? `${capabilityCount} 项能力 →` : "待配置 →"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchView("release")}
            className="w-full p-2.5 rounded-lg border border-[var(--border)] flex items-center justify-between text-left hover:bg-[var(--secondary)] cursor-pointer"
          >
            <span>
              <strong>5. 独立审核与方案包交付</strong>
            </span>
            <span className={hasPendingRelease ? "text-amber-600 font-medium" : hasPublishedRelease ? "text-emerald-600 font-medium" : "text-[var(--muted-foreground)] font-medium"}>
              {hasPendingRelease ? "待审核签署 →" : hasPublishedRelease ? "已发布 →" : "待提审 →"}
            </span>
          </button>
        </div>
      </section>

      <section className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-2.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-sm">最近变更审计摘要</div>
          <button
            type="button"
            onClick={() => onSwitchView("governance")}
            className="text-xs font-medium text-[var(--primary)] hover:underline cursor-pointer"
          >
            完整审计 →
          </button>
        </div>
        <div className="space-y-2 text-[var(--muted-foreground)]">
          {recentAudit.length === 0 ? (
            <div>暂无最近审计记录</div>
          ) : (
            recentAudit.slice(0, 4).map((ev) => (
              <div key={ev.id}>
                <strong className="text-[var(--foreground)]">{ev.occurredAt.slice(-5)}</strong> ·{" "}
                {ev.actorDisplay} · {ev.summary}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
