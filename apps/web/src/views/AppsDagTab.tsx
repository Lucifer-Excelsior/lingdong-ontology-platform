import { useState, type CSSProperties } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Webhook } from "lucide-react";
import { api } from "../api/client";
import { uxCrudApi } from "../api/ux-crud-client";
import type { AutonomyTier, Capability, ExecutionPlanRecord } from "../api/types";
import { ROLE_TIPS } from "../utils/rbac";
import { CapabilityActionModal } from "../components/apps/CapabilityActionModal";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { WebhookDebuggerPanel } from "../components/fde/WebhookDebuggerPanel";
import { SlideOverDrawer } from "../components/SlideOverDrawer";
import { CapabilityConfiguratorForm } from "./CapabilityConfiguratorForm";

interface AppsDagTabProps {
  workspaceId: string;
  capabilities: Capability[];
  executionPlans: ExecutionPlanRecord[];
  canModel?: boolean;
  canOperate?: boolean;
  canApprove?: boolean;
  onToast: (msg: string) => void;
}

function tierMeta(tier: Capability["autonomyTier"]) {
  if (tier === "READ") return { badge: "1 · READ 自动只读", cls: "bg-blue-500/15 text-blue-600", risk: "低风险" };
  if (tier === "DRAFT") return { badge: "2 · DRAFT 材料起草", cls: "bg-purple-500/15 text-purple-600", risk: "无副作用" };
  if (tier === "CONFIRM") return { badge: "3 · CONFIRM 发起确认", cls: "bg-amber-500/15 text-amber-600", risk: "中风险" };
  return { badge: "4 · APPROVE 独立审批", cls: "bg-emerald-500/15 text-emerald-600", risk: "高风险写" };
}

const DAG_STAGES: Array<{ tier: AutonomyTier; step: string; sub: string; tone: string }> = [
  { tier: "READ", step: "1. READ 语义只读检索", sub: "受控 SPARQL 编译 + 角色列掩码", tone: "border-blue-500/30 bg-blue-500/5 text-blue-700" },
  { tier: "DRAFT", step: "2. DRAFT 证据材料起草", sub: "锚定 PROV-O 原文生成草稿", tone: "border-purple-500/30 bg-purple-500/5 text-purple-700" },
  { tier: "CONFIRM", step: "3. CONFIRM 发起确认门禁", sub: "幂等令牌确认 · 本人二次复核", tone: "border-amber-500/30 bg-amber-500/5 text-amber-700" },
  { tier: "APPROVE", step: "4. APPROVE 异人审批 / SHACL 核验", sub: "高危异人 SoD · 写后失败自动补偿", tone: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700" },
];

export function AppsDagTab({
  workspaceId,
  capabilities,
  executionPlans,
  canModel = true,
  canOperate = true,
  canApprove = true,
  onToast,
}: AppsDagTabProps) {
  const queryClient = useQueryClient();
  const { ask, confirmDialogNode } = useConfirmDialog();
  const [tierFilter, setTierFilter] = useState<AutonomyTier | null>(null);
  const [modalState, setModalState] = useState<{ mode: "trigger" | "edit"; cap: Capability } | null>(null);
  const [drawerMode, setDrawerMode] = useState<"config" | "webhook" | null>(null);

  const invalidatePlans = () => {
    void queryClient.invalidateQueries({ queryKey: ["apps", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["governance", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["portal", workspaceId] });
  };

  const confirmMutation = useMutation({
    mutationFn: (plan: ExecutionPlanRecord) =>
      api.confirmPlan(workspaceId, plan.id, plan.confirmationToken ?? undefined),
    onSuccess: (res) => { invalidatePlans(); onToast(res.message); },
    onError: (err: Error) => onToast(err.message),
  });

  const approveMutation = useMutation({
    mutationFn: (planId: string) => api.approvePlan(workspaceId, planId),
    onSuccess: (res) => { invalidatePlans(); onToast(res.message); },
    onError: (err: Error) => onToast(err.message),
  });

  const deleteCapMutation = useMutation({
    mutationFn: (capId: string) => uxCrudApi.deleteCapability(workspaceId, capId),
    onSuccess: (res) => { invalidatePlans(); onToast(res.message); },
    onError: (err: Error) => onToast(err.message),
  });

  const handleDeleteCapability = async (cap: Capability) => {
    const { confirmed } = await ask({
      title: `删除受控能力「${cap.name}」`,
      description: `确认永久删除受控能力「${cap.name}」(${cap.code})？删除后关联的编排链与只读 MCP 映射将失效。`,
      confirmLabel: "确认删除",
      tone: "danger",
    });
    if (confirmed) deleteCapMutation.mutate(cap.id);
  };

  const visibleCapabilities = tierFilter
    ? capabilities.filter((c) => c.autonomyTier === tierFilter)
    : capabilities;

  const planTableVars = {
    "--label-2": "'触发能力链'",
    "--label-3": "'授权与幂等'",
    "--label-4": "'写后核验状态'",
  } as CSSProperties;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div
        role="region"
        aria-label="受控动作四阶段 DAG 执行流水线"
        className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-3 text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">受控业务动作 DAG 治理流水线拓扑</span>
            {tierFilter && (
              <button
                type="button"
                onClick={() => setTierFilter(null)}
                className="px-2 py-0.5 rounded bg-[var(--secondary)] text-[var(--primary)] font-medium hover:opacity-85 cursor-pointer"
              >
                当前筛选：{tierFilter} · 点击清除
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerMode("webhook")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--secondary)] font-medium transition-colors cursor-pointer"
            >
              <Webhook className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
              Webhook 调试台
            </button>
            <button
              type="button"
              disabled={!canModel}
              title={!canModel ? ROLE_TIPS.model : undefined}
              onClick={() => setDrawerMode("config")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              注册受控能力
            </button>
          </div>
        </div>
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {DAG_STAGES.map((st) => {
            const count = capabilities.filter((c) => c.autonomyTier === st.tier).length;
            const active = tierFilter === st.tier;
            return (
              <li key={st.tier}>
                <button type="button" aria-pressed={active} onClick={() => setTierFilter((prev) => (prev === st.tier ? null : st.tier))} className={`w-full text-left p-3 rounded-lg border transition cursor-pointer ${st.tone} ${active ? "ring-2 ring-[var(--primary)] shadow-sm" : "hover:opacity-90"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{st.step}</span>
                    <span className="px-1.5 py-0.5 rounded bg-[var(--card)]/80 font-mono font-semibold shrink-0">{count} 项</span>
                  </div>
                  <div className="text-[var(--muted-foreground)] mt-0.5">{st.sub}</div>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleCapabilities.map((cap) => {
          const meta = tierMeta(cap.autonomyTier);
          return (
            <div key={cap.id} className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className={`px-2 py-0.5 rounded font-semibold ${meta.cls}`}>{meta.badge}</span>
                  <span className="text-[var(--muted-foreground)]">{meta.risk}</span>
                </div>
                <div className="font-semibold text-sm">{cap.name}</div>
                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{cap.description}</p>
              </div>
              <div className="space-y-2 pt-2 border-t border-[var(--border)] text-xs">
                <div className="font-mono text-[11px] text-[var(--muted-foreground)] break-all">
                  {cap.code} · <span className="text-[var(--foreground)]">ont:{cap.targetEntityLocalName}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" disabled={!canOperate} title={!canOperate ? ROLE_TIPS.operate : undefined} onClick={() => setModalState({ mode: "trigger", cap })} className="px-2.5 py-1 rounded bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">试运行</button>
                  <button type="button" disabled={!canModel} title={!canModel ? ROLE_TIPS.model : undefined} onClick={() => setModalState({ mode: "edit", cap })} className="px-2.5 py-1 rounded border border-[var(--border)] hover:bg-[var(--secondary)] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">编辑</button>
                  <button type="button" disabled={!canModel || deleteCapMutation.isPending} title={!canModel ? ROLE_TIPS.model : undefined} onClick={() => void handleDeleteCapability(cap)} className="px-2.5 py-1 rounded border border-[var(--border)] text-red-600 hover:bg-red-500/10 font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">删除</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex justify-between items-center gap-4">
          <span className="text-sm font-semibold">任务级不可变执行计划与后置验证台账</span>
          <span className="text-xs text-[var(--muted-foreground)]">
            状态链：TARGET_EXECUTION → POSTCONDITION_QUERY → SHACL_VALIDATION → VERIFIED
          </span>
        </div>
        <div tabIndex={0} role="region" aria-label="受控执行计划运行记录" className="table-wrapper">
          <table style={planTableVars}>
            <thead>
              <tr>
                <th scope="col">计划标识 / 目标对象</th>
                <th scope="col">冻结能力链</th>
                <th scope="col">授权与幂等键</th>
                <th scope="col">最终业务验证结果</th>
              </tr>
            </thead>
            <tbody>
              {executionPlans.map((plan) => (
                <tr key={plan.id}>
                  <th scope="row">
                    {plan.targetObjectLabel.includes(plan.planCode) ? plan.targetObjectLabel : `${plan.planCode} · ${plan.targetObjectLabel}`}
                  </th>
                  <td>{plan.capabilityChain}</td>
                  <td>{plan.authAndIdempotencySummary}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded font-medium ${plan.status === "VERIFIED" ? "bg-emerald-500/10 text-emerald-600" : plan.status === "AWAITING_APPROVAL" || plan.status === "AWAITING_CONFIRMATION" ? "bg-amber-500/15 text-amber-600" : "bg-[var(--secondary)] text-[var(--foreground)]"}`}>
                        {plan.statusLabel}
                      </span>
                      {plan.status === "AWAITING_APPROVAL" && (
                        <button type="button" disabled={approveMutation.isPending || !canApprove} title={!canApprove ? ROLE_TIPS.approve : undefined} onClick={() => approveMutation.mutate(plan.id)} className="px-2.5 py-0.5 rounded bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">批准执行</button>
                      )}
                      {plan.status === "AWAITING_CONFIRMATION" && (
                        <button type="button" disabled={confirmMutation.isPending || !canOperate} title={!canOperate ? ROLE_TIPS.operate : undefined} onClick={() => confirmMutation.mutate(plan)} className="px-2.5 py-0.5 rounded bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">本人确认执行</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <SlideOverDrawer
        open={drawerMode !== null}
        title={drawerMode === "config" ? "注册受控业务能力" : "Webhook 执行器调试台"}
        subtitle={
          drawerMode === "config"
            ? "配置四级自治门禁、目标本体类、失败补偿动作与只读 MCP 暴露策略"
            : "外部 HTTP Webhook Dry-Run 拨测，支持幂等键透传与 SSRF 拦截演练"
        }
        widthClass="max-w-2xl"
        onClose={() => setDrawerMode(null)}
      >
        {drawerMode === "config" && <CapabilityConfiguratorForm workspaceId={workspaceId} canModel={canModel} onToast={onToast} />}
        {drawerMode === "webhook" && <WebhookDebuggerPanel workspaceId={workspaceId} capabilities={capabilities} canModel={canModel} onToast={onToast} />}
      </SlideOverDrawer>

      <CapabilityActionModal
        open={Boolean(modalState)}
        mode={modalState?.mode ?? "trigger"}
        workspaceId={workspaceId}
        capability={modalState?.cap ?? null}
        onClose={() => setModalState(null)}
        onToast={onToast}
      />
      {confirmDialogNode}
    </div>
  );
}
