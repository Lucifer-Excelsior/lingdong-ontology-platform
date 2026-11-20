import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ExternalLink, Eye, FileJson, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { v5Api, type SecurityClearance, type WorkspaceRole } from "../../lib/v5-api";

interface GovernanceAbacOpenApiPanelProps {
  workspaceId: string;
  onToast: (msg: string) => void;
}

const CLEARANCE_META: Record<SecurityClearance, { label: string; short: string; cls: string }> = {
  CONFIDENTIAL: { label: "机密 (CONFIDENTIAL)", short: "机密", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  INTERNAL: { label: "内部 (INTERNAL)", short: "内部", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  PUBLIC: { label: "公开 (PUBLIC)", short: "公开", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const ROLES_ORDER: WorkspaceRole[] = ["OWNER", "MODELER", "OPERATOR", "REVIEWER", "VIEWER"];

const SIMULATE_ROLE_OPTIONS: { role: WorkspaceRole; label: string }[] = [
  { role: "VIEWER", label: "VIEWER · 公开访客（机密与内部字段脱敏）" },
  { role: "OPERATOR", label: "OPERATOR · 业务操作员（机密字段脱敏）" },
  { role: "OWNER", label: "OWNER · 空间所有者（全量明文可见）" },
];

const OPENAPI_DOMAINS = [
  "认证与多租户隔离 (/api/auth/*)",
  "本体与图谱 SPARQL (/api/workspaces/*/ontology)",
  "ABAC 密级策略与脱敏仿真 (/api/workspaces/*/governance/abac-*)",
  "高可用集群与异步作业 SSE (/api/cluster/health, /jobs)",
  "NL2SPARQL 问数与 What-If 推演 (/portal/*)",
];

export function GovernanceAbacOpenApiPanel({ workspaceId, onToast }: GovernanceAbacOpenApiPanelProps) {
  const queryClient = useQueryClient();
  const [simulateRole, setSimulateRole] = useState<WorkspaceRole>("VIEWER");

  const { data: policyData, isFetching: policyLoading, refetch: refetchPolicy } = useQuery({
    queryKey: ["v5-abac-policy", workspaceId],
    queryFn: () => v5Api.getAbacPolicy(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const policy = policyData?.policy;
  const callerRole = policyData?.callerRole ?? "VIEWER";
  const callerClearance = policyData?.callerClearance ?? "PUBLIC";
  const isOwner = callerRole === "OWNER";

  const { data: preview, isFetching: previewLoading, refetch: refetchPreview } = useQuery({
    queryKey: ["v5-abac-preview", workspaceId, simulateRole, policy?.enabled],
    queryFn: () => v5Api.previewAbacRedaction(workspaceId, simulateRole),
    enabled: Boolean(workspaceId),
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => v5Api.updateAbacPolicy(workspaceId, { enabled }),
    onSuccess: (res) => {
      onToast(res.message || (res.policy.enabled ? "已开启 ABAC 属性级密级脱敏管控" : "已暂停 ABAC 属性级密级脱敏管控"));
      void queryClient.invalidateQueries({ queryKey: ["v5-abac-policy", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["v5-abac-preview", workspaceId] });
    },
    onError: (err: Error) => onToast(err.message),
  });

  const rows = preview?.rows ?? [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const redactedSet = new Set(preview?.redactedColumns ?? []);
  const maskToken = policy?.maskToken ?? "***";
  const redactedCount = preview?.redactedCellCount ?? 0;

  return (
    <div className="space-y-5">
      <div className="p-5 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-[var(--foreground)]">ABAC 属性级数据密级管控策略</h3>
              <span className={`px-2 py-0.5 rounded border text-[11px] font-medium ${CLEARANCE_META[callerClearance].cls}`}>
                当前身份：{callerRole} · {CLEARANCE_META[callerClearance].label}
              </span>
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">基于角色密级（机密 / 内部 / 公开）自动对合同金额、主体证件与内部风险字段执行实时掩码脱敏。</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isOwner || toggleMutation.isPending || !policy}
              title={!isOwner ? "仅 OWNER 角色可切换 ABAC 全局脱敏开关" : "切换 ABAC 策略状态并即时持久化"}
              onClick={() => policy && toggleMutation.mutate(!policy.enabled)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                policy?.enabled ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100/70" : "bg-[var(--secondary)]/60 border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${policy?.enabled ? "bg-emerald-600" : "bg-[var(--muted-foreground)]"}`} />
              {toggleMutation.isPending ? "保存中..." : policy?.enabled ? "ABAC 脱敏已启用（点击关闭）" : "ABAC 脱敏已关闭（点击启用）"}
            </button>
            <button type="button" onClick={() => { void refetchPolicy(); void refetchPreview(); }} className="p-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--secondary)] text-[var(--muted-foreground)] cursor-pointer" title="刷新策略与仿真结果">
              <RefreshCw className={`w-3.5 h-3.5 ${policyLoading || previewLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
          {ROLES_ORDER.map((role) => {
            const c = policy?.roleClearance?.[role] ?? (role === "OWNER" ? "CONFIDENTIAL" : role === "VIEWER" ? "PUBLIC" : "INTERNAL");
            return (
              <div key={role} className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--secondary)]/60 flex flex-col gap-1">
                <span className="font-mono font-semibold text-[var(--foreground)]">{role}</span>
                <span className={`inline-flex w-fit px-1.5 py-0.5 rounded border text-[11px] font-medium ${CLEARANCE_META[c].cls}`}>{CLEARANCE_META[c].short}</span>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg border border-rose-200/80 bg-rose-50/30 space-y-1.5">
            <div className="font-semibold text-rose-700">机密字段（仅 OWNER 明文可见）</div>
            <div className="flex flex-wrap gap-1.5">
              {(policy?.confidentialFields ?? []).map((f) => (
                <span key={f} className="px-2 py-0.5 rounded bg-[var(--card)] border border-rose-200 text-rose-700 font-mono">{f}</span>
              ))}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-amber-200/80 bg-amber-50/30 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-amber-700">内部字段（VIEWER 自动脱敏）</span>
              <span className="font-mono text-[11px] text-[var(--muted-foreground)]">掩码符：{maskToken}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(policy?.internalFields ?? []).map((f) => (
                <span key={f} className="px-2 py-0.5 rounded bg-[var(--card)] border border-amber-200 text-amber-700 font-mono">{f}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-[var(--border)] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-600" />
              <span className="font-semibold text-[var(--foreground)]">密级脱敏效果仿真器</span>
              <span className={`px-2 py-0.5 rounded border font-medium ${redactedCount > 0 ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                {redactedCount > 0 ? `已脱敏单元格：${redactedCount}（${preview?.redactedColumns.length ?? 0} 列）` : "0 处脱敏 · 全量明文"}
              </span>
            </div>
            <label className="inline-flex items-center gap-2 text-[var(--muted-foreground)]">
              <span>模拟访问角色</span>
              <select value={simulateRole} onChange={(e) => setSimulateRole(e.target.value as WorkspaceRole)} className="px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-xs font-medium focus:outline-none focus:border-indigo-500">
                {SIMULATE_ROLE_OPTIONS.map((opt) => <option key={opt.role} value={opt.role}>{opt.label}</option>)}
              </select>
            </label>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-[var(--secondary)]/60 text-[var(--muted-foreground)] border-b border-[var(--border)]">
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="px-3 py-2 font-semibold whitespace-nowrap">
                      <span>{col}</span>
                      {redactedSet.has(col) && <span className="ml-1 text-[10px] text-rose-600">(脱敏)</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.length === 0 ? (
                  <tr><td colSpan={Math.max(1, columns.length)} className="px-3 py-5 text-center text-[var(--muted-foreground)]">暂无仿真样本数据</td></tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[var(--secondary)]/60">
                      {columns.map((col) => {
                        const val = row[col] ?? "";
                        const masked = redactedSet.has(col) || val === maskToken || val.includes(maskToken);
                        return <td key={col} className={`px-3 py-2 whitespace-nowrap ${masked ? "bg-rose-50/70 text-rose-700 font-mono font-medium" : "text-[var(--foreground)]"}`}>{val}</td>;
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="p-5 rounded-xl bg-[var(--card)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-[var(--foreground)]">OpenAPI 3.1 开发者生态与标准契约</h3>
            <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-mono font-medium">OpenAPI 3.1.0</span>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">全平台 REST / SSE 接口遵循 OpenAPI 3.1.0 规范，支持离线内网浏览器直接交互调试与 SDK 代码生成。</p>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {OPENAPI_DOMAINS.map((item) => (
              <span key={item} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--secondary)]/60 border border-[var(--border)] text-[var(--muted-foreground)]">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />{item}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <a href="/api/docs" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition">
            <ExternalLink className="w-3.5 h-3.5" />离线交互式文档 (/api/docs)
          </a>
          <a href="/api/openapi.json" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--secondary)] text-[var(--foreground)]/85 font-medium transition">
            <FileJson className="w-3.5 h-3.5 text-indigo-600" />下载 JSON 规范 (/api/openapi.json)
          </a>
        </div>
      </div>
    </div>
  );
}
