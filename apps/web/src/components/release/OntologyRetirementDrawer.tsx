import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OntologyRetirementImpact } from "@lingdong/contracts";
import { api } from "../../api/client";
import { useConfirmDialog } from "../ConfirmDialog";
import { SlideOverDrawer } from "../SlideOverDrawer";
import { ROLE_TIPS } from "../../utils/rbac";

interface OntologyRetirementDrawerProps {
  workspaceId: string;
  open: boolean;
  isOwner: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

const RISK_STYLE: Record<OntologyRetirementImpact["riskLevel"], string> = {
  LOW: "bg-emerald-500/10 text-emerald-600",
  MEDIUM: "bg-amber-500/15 text-amber-600",
  HIGH: "bg-rose-500/15 text-rose-600",
};

export function OntologyRetirementDrawer({
  workspaceId,
  open,
  isOwner,
  onClose,
  onToast,
}: OntologyRetirementDrawerProps) {
  const queryClient = useQueryClient();
  const { ask, confirmDialogNode } = useConfirmDialog();
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState<OntologyRetirementImpact | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["lifecycle-status", workspaceId],
    queryFn: () => api.getLifecycleStatus(workspaceId),
    enabled: open && Boolean(workspaceId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["lifecycle-status", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["release", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
  };

  const impactMutation = useMutation({
    mutationFn: () => api.analyzeRetirementImpact(workspaceId),
    onSuccess: (res) => {
      setImpact(res);
      onToast(`退役影响分析完成：风险等级 ${res.riskLevel} · 活跃实例 ${res.activeAboxInstances} 条`);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const retireMutation = useMutation({
    mutationFn: (r: string) => api.retireOntology(workspaceId, r),
    onSuccess: () => {
      invalidate();
      setReason("");
      onToast("本体已标记为已退役（只读归档）并写入审计留痕");
    },
    onError: (err: Error) => onToast(err.message),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => api.reactivateOntology(workspaceId),
    onSuccess: () => {
      invalidate();
      onToast("已恢复当前本体为活跃启用状态");
    },
    onError: (err: Error) => onToast(err.message),
  });

  const retirement = data?.retirement;
  const imports = data?.imports ?? [];
  const isRetired = retirement?.status === "RETIRED";

  const handleRetire = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      onToast("请先填写退役原因后再执行归档");
      return;
    }
    const { confirmed } = await ask({
      title: "确认标记本体为已退役 (只读归档)",
      description: `退役原因：「${trimmed}」。退役后该工作空间本体将进入只读归档状态，供历史溯源与合规审计。`,
      confirmLabel: "确认退役归档",
      tone: "danger",
    });
    if (confirmed) retireMutation.mutate(trimmed);
  };

  const handleReactivate = async () => {
    const { confirmed } = await ask({
      title: "恢复启用已退役本体",
      description: "确认将该本体从只读归档恢复为 ACTIVE 活跃状态吗？",
      confirmLabel: "确认恢复启用",
      tone: "primary",
    });
    if (confirmed) reactivateMutation.mutate();
  };

  return (
    <>
      <SlideOverDrawer
        open={open}
        onClose={onClose}
        widthClass="max-w-xl"
        title="发布引用核验与本体退役治理"
        subtitle="核验 owl:imports 外部依赖版本，评估退役影响范围并执行受控生命周期切换。"
        badge={
          retirement && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${isRetired ? "bg-rose-500/15 text-rose-600" : "bg-emerald-500/10 text-emerald-600"}`}>
              {retirement.status}
            </span>
          )
        }
      >
        <div className="space-y-4 text-xs">
          {isLoading ? (
            <div className="py-8 text-center text-[var(--muted-foreground)]">加载生命周期与引用状态...</div>
          ) : (
            <>
              <section className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)] space-y-2">
                <div className="font-semibold text-sm">当前生命周期状态</div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded font-semibold ${isRetired ? "bg-rose-500/15 text-rose-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                    {isRetired ? "RETIRED · 已退役（只读归档）" : "ACTIVE · 正常服务中"}
                  </span>
                </div>
                {isRetired && retirement && (
                  <div className="space-y-0.5 text-[var(--muted-foreground)] pt-1 border-t border-[var(--border)]">
                    <div>退役原因：{retirement.retiredReason || "—"}</div>
                    <div>操作人：{retirement.retiredBy || "—"} · 时间：{retirement.retiredAt || "—"}</div>
                  </div>
                )}
              </section>

              <section className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)] space-y-2">
                <div className="font-semibold text-sm">owl:imports 外部引用版本核验 ({imports.length})</div>
                {imports.length === 0 ? (
                  <div className="text-[var(--muted-foreground)]">当前本体未声明外部 owl:imports 引用。</div>
                ) : (
                  <div className="space-y-1.5">
                    {imports.map((imp) => (
                      <div key={imp.iri} className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono break-all">{imp.iri}</div>
                          <div className="text-[11px] text-[var(--muted-foreground)]">版本：{imp.version}</div>
                        </div>
                        <span className="shrink-0 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">
                          {imp.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-sm">退役影响面分析</div>
                  <button
                    type="button"
                    disabled={impactMutation.isPending}
                    onClick={() => impactMutation.mutate()}
                    className="px-3 py-1.5 rounded-md bg-[var(--secondary)] hover:bg-[var(--border)]/60 font-medium disabled:opacity-50 cursor-pointer"
                  >
                    {impactMutation.isPending ? "分析中..." : "运行退役影响分析"}
                  </button>
                </div>
                {impact && (
                  <div className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span>活跃 ABox 实例：<strong>{impact.activeAboxInstances.toLocaleString()}</strong> 条</span>
                      <span className={`px-2 py-0.5 rounded font-semibold ${RISK_STYLE[impact.riskLevel]}`}>
                        风险等级：{impact.riskLevel}
                      </span>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div>依赖应用：{impact.affectedApps.join("、") || "无"}</div>
                      <div>受影响能力：{impact.affectedCapabilities.join("、") || "无"}</div>
                      <div>受影响 MCP 工具：{impact.affectedMcpTools.join("、") || "无"}</div>
                      {impact.referencingWorkspaces.length > 0 && (
                        <div>引用工作空间：{impact.referencingWorkspaces.join("、")}</div>
                      )}
                    </div>
                    <div className="pt-1 border-t border-[var(--border)] text-[var(--muted-foreground)]">
                      治理建议：{impact.recommendation}
                    </div>
                  </div>
                )}
              </section>

              <section className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)] space-y-2.5">
                <div className="font-semibold text-sm">OWNER 生命周期操作</div>
                {isRetired ? (
                  <button
                    type="button"
                    disabled={!isOwner || reactivateMutation.isPending}
                    title={!isOwner ? ROLE_TIPS.owner : undefined}
                    onClick={() => void handleReactivate()}
                    className="w-full py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {reactivateMutation.isPending ? "恢复中..." : "恢复启用"}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      disabled={!isOwner}
                      placeholder="请输入退役原因，如：已由 v3.0 标准本体替代..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={!isOwner || retireMutation.isPending || !reason.trim()}
                      title={!isOwner ? ROLE_TIPS.owner : undefined}
                      onClick={() => void handleRetire()}
                      className="w-full py-2 rounded-lg border border-rose-500/40 text-rose-600 hover:bg-rose-500/10 font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {retireMutation.isPending ? "归档中..." : "标记为已退役 (只读归档)"}
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </SlideOverDrawer>
      {confirmDialogNode}
    </>
  );
}
