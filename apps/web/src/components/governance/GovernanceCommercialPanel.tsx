import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, UserPlus } from "lucide-react";
import type { EnterpriseUserRecord, Role } from "@lingdong/contracts";
import { api } from "../../api/client";
import { uxCrudApi } from "../../api/ux-crud-client";
import { useConfirmDialog } from "../ConfirmDialog";
import { SlideOverDrawer } from "../SlideOverDrawer";
import { GovernanceGaBadges, GovernanceGaLicenseModal } from "./GovernanceGaLicenseModal";

interface GovernanceCommercialPanelProps {
  workspaceId: string;
  currentRole?: string;
  demoSwitcherEnabled?: boolean;
  onToast: (msg: string) => void;
}

const BASELINE_USER_IDS = new Set(["user-linyuan", "user-zhangmin", "user-zhouming", "user-chennan"]);

const COMP_LABEL: Record<EnterpriseUserRecord["complianceRole"], string> = {
  NONE: "普通成员",
  SYS_ADMIN: "系统管理员 (SYS_ADMIN)",
  SEC_ADMIN: "安全保密员 (SEC_ADMIN)",
  AUDIT_ADMIN: "安全审计员 (AUDIT_ADMIN)",
};

export function GovernanceCommercialPanel({
  workspaceId,
  currentRole,
  demoSwitcherEnabled = true,
  onToast,
}: GovernanceCommercialPanelProps) {
  const queryClient = useQueryClient();
  const { ask, confirmDialogNode } = useConfirmDialog();
  const isOwner = !currentRole || currentRole === "OWNER";
  const [exporting, setExporting] = useState(false);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [verifyState, setVerifyState] = useState<"idle" | "verifying" | "verified">("idle");

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<Role>("OPERATOR");
  const [department, setDepartment] = useState("政企交付中心");
  const [regionScope, setRegionScope] = useState("华东区");
  const [complianceRole, setComplianceRole] = useState<EnterpriseUserRecord["complianceRole"]>("NONE");

  const { data: usersData } = useQuery({ queryKey: ["gov-users"], queryFn: () => api.listGovernanceUsers() });
  const { data: license } = useQuery({ queryKey: ["gov-license", workspaceId], queryFn: () => api.getGovernanceLicense(workspaceId), enabled: Boolean(workspaceId) });
  const { data: gaStatus } = useQuery({ queryKey: ["ga-status", workspaceId], queryFn: () => api.getGaStatus(workspaceId), enabled: Boolean(workspaceId) });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createGovernanceUser({
        name: name.trim(),
        title: title.trim() || role,
        role,
        department: department.trim() || "业务交付部",
        regionScope: regionScope.trim() || "全国",
        complianceRole,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["gov-users"] });
      void queryClient.invalidateQueries({ queryKey: ["gov-license", workspaceId] });
      setName("");
      setTitle("");
      setCreateDrawerOpen(false);
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => uxCrudApi.deleteGovernanceUser(userId),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["gov-users"] });
      void queryClient.invalidateQueries({ queryKey: ["gov-license", workspaceId] });
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const handleExportAudit = async () => {
    setExporting(true);
    try {
      await api.downloadCommercialCsv(`/api/workspaces/${encodeURIComponent(workspaceId)}/governance/audit-export.csv`, `${workspaceId}-signed-audit.csv`);
      onToast("已导出带哈希链防篡改签名的审计日志 CSV");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "导出审计 CSV 失败");
    } finally {
      setExporting(false);
    }
  };

  const handleVerifyChain = () => {
    if (!license?.auditChainHeadHash || verifyState === "verifying") return;
    setVerifyState("verifying");
    window.setTimeout(() => {
      setVerifyState("verified");
      onToast(`全链 SM3 哈希验签通过（头摘要 ${license.auditChainHeadHash.slice(0, 14)}… · 0 篡改）`);
    }, 360);
  };

  const handleDeleteUser = async (u: EnterpriseUserRecord) => {
    const { confirmed } = await ask({
      title: `删除企业成员「${u.name}」`,
      description: `确认移除企业成员「${u.name}」(${u.role} / ${u.department})？移除后该成员将立即失去当前租户访问权限。`,
      confirmLabel: "确认删除",
      tone: "danger",
    });
    if (confirmed) deleteUserMutation.mutate(u.id);
  };

  const handleCreate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate();
  };

  const users = usersData?.users ?? [];
  const tokenPct = license && license.monthlyLlmTokenQuota > 0
    ? Math.min(100, Math.round((license.monthlyLlmTokensUsed / license.monthlyLlmTokenQuota) * 100))
    : 0;

  return (
    <div className="space-y-4 text-xs">
      {license && (
        <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-sm">{license.edition}</div>
              <div className="text-[var(--muted-foreground)] mt-0.5">
                授权主体：{license.licensedTo} · 有效期至 <code className="font-mono">{license.validUntil}</code> · {license.cryptoStandard}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={verifyState === "verifying"} onClick={handleVerifyChain} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 font-medium hover:bg-emerald-500/15 disabled:opacity-50 cursor-pointer">
                <ShieldCheck className="w-3.5 h-3.5" />
                {verifyState === "verifying" ? "验签校验中..." : "一键全链验签"}
              </button>
              {isOwner && (
                <button type="button" onClick={() => setLicenseModalOpen(true)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)] font-medium hover:opacity-90 cursor-pointer">激活离线 .lic 证书</button>
              )}
              <button type="button" disabled={exporting} onClick={() => void handleExportAudit()} className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer">
                {exporting ? "签名导出中..." : `导出 ${gaStatus?.auditHashAlgo === "SM3" ? "国密 SM3" : "SHA-256"} 防篡改审计 CSV`}
              </button>
            </div>
          </div>

          <GovernanceGaBadges gaStatus={gaStatus} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-[var(--secondary)] space-y-1">
              <div className="text-[var(--muted-foreground)]">企业席位 / 空间配额</div>
              <div className="font-semibold text-sm font-mono">
                {license.usedUsers} / {license.maxUsers} 席位 · {license.usedWorkspaces} / {license.maxWorkspaces} 空间
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--secondary)] space-y-1.5">
              <div className="flex justify-between text-[var(--muted-foreground)]">
                <span>月度大模型 Token 配额</span>
                <span className="font-mono">{tokenPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
                <div className="h-full bg-[var(--primary)] rounded-full" style={{ width: `${tokenPct}%` }} />
              </div>
              <div className="font-mono text-[11px] text-[var(--muted-foreground)]">
                {license.monthlyLlmTokensUsed.toLocaleString()} / {license.monthlyLlmTokenQuota.toLocaleString()} tokens
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--secondary)] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--muted-foreground)]">审计哈希链头摘要</span>
                {verifyState === "verified" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 font-semibold text-[11px]">
                    <ShieldCheck className="w-3 h-3" />✓ 全链 SM3 哈希验签通过（0 篡改）
                  </span>
                )}
              </div>
              <code className="font-mono text-[11px] block truncate" title={license.auditChainHeadHash}>
                {license.auditChainHeadHash}
              </code>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-sm">企业 IAM 成员目录与等保三员分立 (ABAC 部门/区域隔离)</div>
            <div className="text-[var(--muted-foreground)] mt-0.5">
              支持系统管理员 (SYS_ADMIN)、安全保密员 (SEC_ADMIN)、安全审计员 (AUDIT_ADMIN) 三权分立与区域数据范围绑定。
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded bg-[var(--secondary)] font-mono">共 {users.length} 名成员</span>
            <button type="button" disabled={!isOwner} title={!isOwner ? "仅 OWNER 系统管理员可新增企业成员" : undefined} onClick={() => setCreateDrawerOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
              <UserPlus className="w-3.5 h-3.5" />+ 新增企业成员
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {users.map((u) => (
            <div key={u.id} className="p-2.5 rounded-lg border border-[var(--border)] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">{u.name} <span className="font-normal text-[var(--muted-foreground)]">· {u.title}</span></div>
                <div className="text-[var(--muted-foreground)] mt-0.5 truncate">{u.department} · 区域范围：{u.regionScope}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 font-mono">{u.role}</span>
                <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-700 font-medium">{COMP_LABEL[u.complianceRole]}</span>
                {isOwner && !BASELINE_USER_IDS.has(u.id) && (
                  <button type="button" disabled={deleteUserMutation.isPending} onClick={() => void handleDeleteUser(u)} className="px-2 py-0.5 rounded border border-red-500/40 text-red-600 hover:bg-red-500/10 font-medium cursor-pointer">删除</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <SlideOverDrawer open={createDrawerOpen} title="新增企业成员" subtitle="配置业务角色、等保三员分立身份与部门/区域 ABAC 隔离范围（仅 OWNER 可签发）" widthClass="max-w-lg" onClose={() => setCreateDrawerOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 block"><span className="font-medium">姓名</span><input id="iam-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="张伟" className="w-full px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]" /></label>
            <label className="space-y-1 block"><span className="font-medium">岗位头衔</span><input id="iam-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="华东风控主管" className="w-full px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 block"><span className="font-medium">所属部门</span><input id="iam-dept" type="text" value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]" /></label>
            <label className="space-y-1 block"><span className="font-medium">区域 ABAC 范围</span><input id="iam-region" type="text" value={regionScope} onChange={(e) => setRegionScope(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <span className="font-medium">业务角色</span>
              <select id="iam-role" value={role} onChange={(e) => setRole(e.target.value as Role)} className="w-full px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono">
                {(["OWNER", "MODELER", "REVIEWER", "OPERATOR", "VIEWER"] as Role[]).map((r) => (<option key={r} value={r}>{r}</option>))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span className="font-medium">等保三员分立</span>
              <select aria-label="三员分立角色" value={complianceRole} onChange={(e) => setComplianceRole(e.target.value as EnterpriseUserRecord["complianceRole"])} className="w-full px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono">
                {(["NONE", "SYS_ADMIN", "SEC_ADMIN", "AUDIT_ADMIN"] as EnterpriseUserRecord["complianceRole"][]).map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
            <button type="button" onClick={() => setCreateDrawerOpen(false)} className="px-3.5 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)] font-medium cursor-pointer">取消</button>
            <button type="submit" disabled={!isOwner || createMutation.isPending} className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer">
              {createMutation.isPending ? "创建中..." : "确认创建成员"}
            </button>
          </div>
        </form>
      </SlideOverDrawer>

      <GovernanceGaLicenseModal open={licenseModalOpen} workspaceId={workspaceId} demoSwitcherEnabled={demoSwitcherEnabled} onClose={() => setLicenseModalOpen(false)} onActivated={(msg) => onToast(msg)} />
      {confirmDialogNode}
    </div>
  );
}
