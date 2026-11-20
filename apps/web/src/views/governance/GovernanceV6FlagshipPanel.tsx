import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ExternalLink, KeyRound, Link2, Lock, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import { v6Api } from "../../lib/v6-api";

interface GovernanceV6FlagshipPanelProps {
  workspaceId: string;
  onToast: (msg: string) => void;
}

function fedBadge(status: string) {
  if (status === "INHERITED_OK") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "LOCAL_EXTENSION") return "bg-indigo-50 text-indigo-700 border-indigo-200";
  if (status === "UPSTREAM_NEW") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

export function GovernanceV6FlagshipPanel({ workspaceId, onToast }: GovernanceV6FlagshipPanelProps) {
  const qc = useQueryClient();

  const { data: orgData } = useQuery({ queryKey: ["v6-org-units"], queryFn: () => v6Api.listOrgUnits() });
  const { data: fedData, refetch: refetchFed } = useQuery({ queryKey: ["v6-federation", workspaceId], queryFn: () => v6Api.getFederation(workspaceId), enabled: Boolean(workspaceId) });
  const { data: auditData, isFetching: auditFetching, refetch: refetchAudit } = useQuery({ queryKey: ["v6-audit-chain", workspaceId], queryFn: () => v6Api.verifyAuditChain(workspaceId), enabled: Boolean(workspaceId) });
  const { data: kmsData } = useQuery({ queryKey: ["v6-kms-secrets", workspaceId], queryFn: () => v6Api.listKmsSecrets(workspaceId), enabled: Boolean(workspaceId) });

  const bindFedMut = useMutation({
    mutationFn: () =>
      v6Api.bindFederation(workspaceId, {
        parentWorkspaceId: "ws-itu",
        overridePolicy: "EXTEND_ONLY",
        pullUpstreamClasses: true,
      }),
    onSuccess: (res) => {
      void refetchFed();
      void qc.invalidateQueries({ queryKey: ["ontology", workspaceId] });
      onToast(res.message || "已绑定集团标准招采父本体并拉取上游类");
    },
    onError: (e: Error) => onToast(e.message),
  });

  const appendAuditMut = useMutation({
    mutationFn: () => v6Api.appendAuditChain(workspaceId, `人工合规巡检存证 (${new Date().toLocaleTimeString()})`),
    onSuccess: (res) => {
      void refetchAudit();
      onToast(res.message || "已追加 SM3 不可变存证锚点");
    },
    onError: (e: Error) => onToast(e.message),
  });

  const rotateKmsMut = useMutation({
    mutationFn: (alias: string) => v6Api.rotateKmsSecret(workspaceId, alias),
    onSuccess: (res, alias) => {
      void qc.invalidateQueries({ queryKey: ["v6-kms-secrets", workspaceId] });
      onToast(res.message || `密钥 ${alias} 已完成零停机轮转`);
    },
    onError: (e: Error) => onToast(e.message),
  });

  const units = orgData?.units ?? [];
  const fedItems = fedData?.items ?? [];
  const secrets = kmsData?.secrets ?? [];

  return (
    <div className="space-y-5 text-xs">
      <div>
        <h2 className="text-base font-semibold text-[var(--foreground)]">集团联邦治理、SM3 防篡改审计与国密 KMS 轮转</h2>
        <p className="text-xs text-[var(--muted-foreground)] mt-0.5">面向大型集团的多级组织本体继承、链式哈希存证验真、Prometheus 指标观测与凭据零停机轮转。</p>
      </div>

      {/* Card 1: Org Units & Federation */}
      <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
            <Building2 className="w-4 h-4 text-indigo-600" />集团多级组织与联邦本体继承
          </div>
          <button
            type="button"
            disabled={bindFedMut.isPending}
            onClick={() => bindFedMut.mutate()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50 cursor-pointer"
          >
            <Link2 className="w-3.5 h-3.5" />{bindFedMut.isPending ? "绑定同步中..." : "一键绑定集团招采父本体"}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-[var(--secondary)]/60 border border-[var(--border)] space-y-1.5">
            <div className="font-semibold text-[var(--foreground)]/85 mb-1">集团组织架构树 ({units.length})</div>
            {units.length === 0 ? (
              <div className="text-[var(--muted-foreground)]">暂无组织单元数据</div>
            ) : (
              units.map((u) => (
                <div key={u.id} style={{ paddingLeft: `${Math.max(0, u.level - 1) * 14}px` }} className="flex items-center justify-between py-1 border-b border-[var(--border)]/60 last:border-0">
                  <span className="font-medium text-[var(--foreground)]">
                    <span className="font-mono text-[var(--muted-foreground)] mr-1.5">{u.code}</span>{u.name}
                  </span>
                  <span className="text-[11px] text-[var(--muted-foreground)]">{u.workspaceIds.length} 空间 · {u.memberCount} 人</span>
                </div>
              ))
            )}
          </div>

          <div className="p-3 rounded-lg bg-[var(--secondary)]/60 border border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--foreground)]/85">联邦继承差异 ({fedItems.length})</span>
              {fedData?.binding ? (
                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  父空间: {fedData.binding.parentWorkspaceName} ({fedData.binding.overridePolicy})
                </span>
              ) : (
                <span className="text-[var(--muted-foreground)]">未绑定集团父空间</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
              {fedItems.length === 0 ? (
                <span className="text-[var(--muted-foreground)]">绑定后将展示上游标准类与本地扩展差异</span>
              ) : (
                fedItems.map((it) => (
                  <span key={it.classLocalName} title={it.detail} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] ${fedBadge(it.status)}`}>
                    <span className="font-mono font-semibold">{it.classLocalName}</span>
                    <span>· {it.status}</span>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: SM3 Audit Chain + Prometheus /metrics */}
      <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
            <Lock className="w-4 h-4 text-emerald-600" />SM3 区块链式审计防篡改链 & Prometheus 可观测性
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={appendAuditMut.isPending} onClick={() => appendAuditMut.mutate()} className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50 cursor-pointer">
              追加存证锚点
            </button>
            <button type="button" onClick={() => void refetchAudit().then(() => onToast("已完成 SM3 全链哈希验真"))} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)] text-[var(--foreground)]/85 font-medium cursor-pointer">
              <RefreshCw className={`w-3.5 h-3.5 ${auditFetching ? "animate-spin" : ""}`} />全链验真
            </button>
            <a href="/metrics" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium">
              Prometheus /metrics <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-[var(--secondary)]/60 border border-[var(--border)]">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border font-semibold ${auditData?.intact !== false ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
            {auditData?.intact !== false ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
            {auditData?.intact !== false ? "链式验真完好 (INTACT)" : `篡改告警 @#${auditData?.brokenAtSeq}`}
          </span>
          <span className="text-[var(--muted-foreground)]">算法：<strong className="font-mono text-[var(--foreground)]">{auditData?.algo ?? "SM3-CHAIN"}</strong></span>
          <span className="text-[var(--muted-foreground)]">总区块：<strong className="font-mono text-[var(--foreground)]">{auditData?.totalEntries ?? 0}</strong></span>
          <span className="text-[var(--muted-foreground)] truncate max-w-md" title={auditData?.headHash}>
            Head Hash：<code className="font-mono text-indigo-700">{auditData?.headHash || "-"}</code>
          </span>
        </div>

        {auditData?.recentEntries && auditData.recentEntries.length > 0 && (
          <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg overflow-hidden">
            {auditData.recentEntries.slice(0, 4).map((e) => (
              <div key={e.seqNo} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 bg-[var(--card)] hover:bg-[var(--secondary)]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--secondary)] text-[var(--foreground)]/85">#{e.seqNo}</span>
                  <span className="text-[var(--foreground)] truncate">{e.payloadSummary}</span>
                  <span className="text-[var(--muted-foreground)]">· {e.actorDisplay}</span>
                </div>
                <code className="font-mono text-[11px] text-[var(--muted-foreground)]">{e.currHash.slice(0, 18)}…</code>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Card 3: KMS Secrets Zero-Downtime Rotation */}
      <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <KeyRound className="w-4 h-4 text-amber-600" />国密 KMS / Vault 凭据零停机轮转 ({secrets.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[var(--secondary)]/60 text-[var(--muted-foreground)] border-b border-[var(--border)]">
              <tr>
                <th className="px-3 py-2 font-semibold">凭据别名</th>
                <th className="px-3 py-2 font-semibold">环境变量</th>
                <th className="px-3 py-2 font-semibold">托管引擎</th>
                <th className="px-3 py-2 font-semibold">版本 / 指纹</th>
                <th className="px-3 py-2 font-semibold">最近轮转</th>
                <th className="px-3 py-2 font-semibold text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-[var(--foreground)]">
              {secrets.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-5 text-center text-[var(--muted-foreground)]">暂无托管密钥</td></tr>
              ) : (
                secrets.map((s) => (
                  <tr key={s.alias} className="hover:bg-[var(--secondary)]/60">
                    <td className="px-3 py-2 font-mono font-semibold text-[var(--foreground)]">{s.alias}</td>
                    <td className="px-3 py-2 font-mono text-[var(--muted-foreground)]">{s.envVarName}</td>
                    <td className="px-3 py-2"><span className="px-2 py-0.5 rounded bg-[var(--secondary)] text-[var(--foreground)]/85 font-medium">{s.provider}</span></td>
                    <td className="px-3 py-2 font-mono">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 mr-1.5">v{s.version}</span>
                      <span className="text-[var(--muted-foreground)]">{s.fingerprint}</span>
                    </td>
                    <td className="px-3 py-2 text-[var(--muted-foreground)] font-mono">{new Date(s.lastRotatedAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={rotateKmsMut.isPending}
                        onClick={() => rotateKmsMut.mutate(s.alias)}
                        className="px-2.5 py-1 rounded-md border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium disabled:opacity-50 cursor-pointer"
                      >
                        轮转密钥
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
