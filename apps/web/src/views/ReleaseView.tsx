import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { uxCrudApi } from "../api/ux-crud-client";
import type { GovernanceSnapshot } from "../api/types";
import { ModernTabList, ModernTabPanel } from "../shell/ModernTabs";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { OntologyRetirementDrawer } from "../components/release/OntologyRetirementDrawer";
import { getRolePermissions, ROLE_TIPS } from "../utils/rbac";
import { FdeImportPanel } from "./FdeImportPanel";

type ReleaseSubTab = "q" | "sod" | "fde";

interface ReleaseViewProps {
  workspaceId: string;
  currentUser?: GovernanceSnapshot["currentUser"];
  onSwitchWorkspace?: (workspaceId: string) => void;
  onToast: (msg: string) => void;
}

const DEFAULT_VALIDATION_REPORT_TTL = `@prefix sh: <http://www.w3.org/ns/shacl#> .\n[] a sh:ValidationReport ; sh:conforms true .`;

export function ReleaseView({ workspaceId, currentUser, onSwitchWorkspace, onToast }: ReleaseViewProps) {
  const queryClient = useQueryClient();
  const { ask, confirmDialogNode } = useConfirmDialog();
  const [subTab, setSubTab] = useState<ReleaseSubTab>("q");
  const [nextVersion, setNextVersion] = useState("v2.1");
  const [retireOpen, setRetireOpen] = useState(false);

  const { data } = useQuery({ queryKey: ["release", workspaceId], queryFn: () => api.getRelease(workspaceId), enabled: Boolean(workspaceId) });
  const { data: lifecycleData } = useQuery({ queryKey: ["lifecycle-status", workspaceId], queryFn: () => api.getLifecycleStatus(workspaceId), enabled: Boolean(workspaceId) });

  const diagnostics = data?.diagnostics ?? [];
  const releases = data?.releases ?? [];
  const fdeChecks = data?.fdeChecks ?? [];
  const reportTurtle = data?.validationReportTurtle ?? DEFAULT_VALIDATION_REPORT_TTL;
  const { isOwner, canModel, canOperate, canApprove } = getRolePermissions(currentUser?.role);
  const lifecycleStatus = lifecycleData?.retirement.status ?? "ACTIVE";

  const invalidateRelease = () => {
    void queryClient.invalidateQueries({ queryKey: ["release", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["governance", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
  };

  const diagnoseMutation = useMutation({
    mutationFn: () => api.diagnoseRelease(workspaceId),
    onSuccess: (res) => {
      queryClient.setQueryData(["release", workspaceId], res);
      onToast(
        res.allPassed
          ? "W3C 三层诊断全部通过：RDF 0 错误 · OWL 2 EL 0 冲突 · SHACL 0 违规"
          : "质量诊断已完成，请检视 SHACL 验证报告"
      );
    },
    onError: (err: Error) => onToast(err.message),
  });

  const proposeMutation = useMutation({
    mutationFn: () => uxCrudApi.proposeRelease(workspaceId, { version: nextVersion.trim() || undefined }),
    onSuccess: (res) => { invalidateRelease(); onToast(res.message); },
    onError: (err: Error) => onToast(err.message),
  });

  const approveMutation = useMutation({
    mutationFn: (releaseId: string) => api.approveRelease(workspaceId, releaseId),
    onSuccess: (res) => { invalidateRelease(); onToast(res.message); },
    onError: (err: Error) => onToast(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: (payload: { releaseId: string; reason?: string }) =>
      uxCrudApi.rejectRelease(workspaceId, payload.releaseId, payload.reason),
    onSuccess: (res) => { invalidateRelease(); onToast(res.message); },
    onError: (err: Error) => onToast(err.message),
  });

  const handleRejectRelease = async (releaseId: string, version: string) => {
    const { confirmed, inputValue } = await ask({
      title: `驳回候选版本 ${version}`,
      description: `驳回后该候选发布包将退回建模人修改，请填写驳回原因供审计留痕。`,
      confirmLabel: "确认驳回",
      tone: "warning",
      inputLabel: "驳回原因",
      inputPlaceholder: "请输入驳回原因...",
      inputDefaultValue: "需补充约束核验后重新提交",
    });
    if (confirmed) rejectMutation.mutate({ releaseId, reason: inputValue || undefined });
  };

  const handleApproveRelease = async (releaseId: string, version: string) => {
    const { confirmed } = await ask({
      title: `签署并发布 ${version}`,
      description: `确认独立签署并正式发布不可变版本 ${version}？发布后将锁定 SHA-256 清单摘要并写入防篡改审计链。`,
      confirmLabel: "签署并发布",
      tone: "primary",
    });
    if (confirmed) approveMutation.mutate(releaseId);
  };

  return (
    <main className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 pt-3 bg-[var(--card)] border-b border-[var(--border)] flex items-center justify-between">
        <ModernTabList
          idPrefix="rel"
          ariaLabel="质量与发布页签"
          value={subTab}
          onChange={setSubTab}
          options={[
            { value: "q", label: "1. W3C 三层质量诊断" },
            { value: "sod", label: "2. 独立审核与不可变发布包" },
            { value: "fde", label: "3. FDE 跨环境交付就绪度" },
          ]}
        />
        <div className="pb-2.5">
          <button type="button" disabled={diagnoseMutation.isPending || !canOperate} title={!canOperate ? ROLE_TIPS.operate : undefined} onClick={() => diagnoseMutation.mutate()} className="px-3 py-1 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            {diagnoseMutation.isPending ? "诊断运行中..." : "运行当前修订诊断"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <ModernTabPanel idPrefix="rel" value="q" activeValue={subTab} onSelect={setSubTab}>
          <div className="p-6 max-w-6xl mx-auto space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-4">
              {diagnostics.map((diag) => (
                <div key={diag.layerCode} className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-sm">{diag.title}</span>
                    <span className={`font-semibold ${diag.status === "PASS" ? "text-emerald-600" : diag.status === "WARN" ? "text-amber-600" : "text-red-600"}`}>{diag.status}</span>
                  </div>
                  <div className="font-mono text-[var(--muted-foreground)]">{diag.engineLabel}</div>
                  <p className="text-[var(--muted-foreground)]">{diag.summary}</p>
                </div>
              ))}
            </div>

            <details className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
              <summary className="font-semibold text-sm text-[var(--primary)] cursor-pointer select-none">检视标准 W3C sh:ValidationReport (Turtle)</summary>
              <div className="mt-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted-foreground)]">基于活跃 ABox 命名图与冻结 SHACL Shapes 实时生成的标准 W3C 验证报告</span>
                  <button type="button" onClick={() => { void navigator.clipboard?.writeText(reportTurtle); onToast("已复制 W3C sh:ValidationReport (Turtle)"); }} className="px-2.5 py-1 rounded bg-[var(--secondary)] font-medium cursor-pointer">复制报告 Turtle</button>
                </div>
                <pre tabIndex={0} role="region" aria-label="SHACL 验证报告" className="p-3.5 rounded-lg bg-[var(--secondary)] font-mono overflow-x-auto leading-relaxed">
                  <code>{reportTurtle}</code>
                </pre>
              </div>
            </details>
          </div>
        </ModernTabPanel>

        <ModernTabPanel idPrefix="rel" value="sod" activeValue={subTab} onSelect={setSubTab}>
          <div className="p-6 max-w-6xl mx-auto space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">发起候选发布审核</span>
                  <span className={`px-2 py-0.5 rounded font-medium ${lifecycleStatus === "RETIRED" ? "bg-rose-500/15 text-rose-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                    {lifecycleStatus === "RETIRED" ? "RETIRED · 已退役" : "ACTIVE"}
                  </span>
                </div>
                <div className="text-[var(--muted-foreground)] mt-0.5">
                  基于当前活跃修订冻结 OWL 本体、SHACL 形状与能力清单，提交至独立复核人签署。
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => setRetireOpen(true)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)] font-medium cursor-pointer">
                  引用核验与退役治理
                </button>
                <input type="text" aria-label="候选版本号" value={nextVersion} onChange={(e) => setNextVersion(e.target.value)} placeholder="v2.1" className="w-24 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono" />
                <button type="button" disabled={proposeMutation.isPending || !canModel} title={!canModel ? ROLE_TIPS.model : undefined} onClick={() => proposeMutation.mutate()} className="px-3.5 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                  {proposeMutation.isPending ? "提交中..." : "+ 基于当前修订发起候选发布"}
                </button>
              </div>
            </div>

            {releases.length === 0 ? (
              <div className="p-8 rounded-xl bg-[var(--card)] border border-[var(--border)] text-center text-[var(--muted-foreground)]">
                当前工作空间暂无候选或已发布不可变方案包，可点击上方「+ 基于当前修订发起候选发布」直接提交。
              </div>
            ) : (
              releases.map((rel) => {
                const isSelfSubmitter = currentUser?.id === rel.submittedById;
                return (
                  <div key={rel.id} className="p-5 rounded-xl bg-[var(--card)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          {rel.status === "AWAITING_REVIEW" ? "待签署候选发布：" : "已发布不可变方案包："}
                          <code className="font-mono ml-1">{rel.version}</code>（冻结修订 <code className="font-mono">{rel.revisionId}</code>）
                        </span>
                        <span className={`px-2 py-0.5 rounded font-medium ${rel.status === "PUBLISHED" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/15 text-amber-600"}`}>
                          {rel.status}
                        </span>
                      </div>
                      <div className="text-[var(--muted-foreground)]">
                        提交人：<strong>{rel.submittedBy}</strong> ·{" "}
                        {rel.reviewedBy
                          ? `签署审核人：${rel.reviewedBy} · 发布于 ${rel.publishedAt ?? ""}`
                          : "职责分离规则：提交人不可批准自己的提交，需由非提交人的 REVIEWER 角色独立签署。"}
                      </div>
                      <div className="font-mono text-[var(--muted-foreground)]">SHA-256 清单摘要：{rel.sha256ManifestHash}</div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {rel.status === "AWAITING_REVIEW" && (
                        <>
                          <button type="button" disabled={rejectMutation.isPending || !canApprove} title={!canApprove ? ROLE_TIPS.approve : undefined} onClick={() => void handleRejectRelease(rel.id, rel.version)} className="px-3 py-2 rounded-lg border border-red-500/40 text-red-600 hover:bg-red-500/10 font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                            {rejectMutation.isPending ? "驳回中..." : "驳回候选版本"}
                          </button>
                          <button type="button" disabled={approveMutation.isPending || !canApprove} title={!canApprove ? ROLE_TIPS.approve : undefined} onClick={() => void handleApproveRelease(rel.id, rel.version)} aria-label={isSelfSubmitter ? "签署并发布（当前为提交人本人，将验证服务端职责分离拦截）" : "签署并发布"} className="px-3.5 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                            {approveMutation.isPending ? "签署中..." : "签署并发布"}
                          </button>
                        </>
                      )}
                      <a href={api.getReleaseDownloadUrl(workspaceId, rel.id)} download onClick={() => onToast(`开始下载 ${rel.version} 标准方案包 (.zip，含 ontology.ttl / shapes.ttl / manifest.json)`)} className="px-3.5 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)] font-medium">
                        下载 {rel.version} 方案包 (.zip)
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ModernTabPanel>

        <ModernTabPanel idPrefix="rel" value="fde" activeValue={subTab} onSelect={setSubTab}>
          <div className="p-6 max-w-6xl mx-auto space-y-5 text-xs">
            <div className="grid grid-cols-2 gap-4">
              {fdeChecks.map((chk, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{chk.title}</span>
                    <span className="text-emerald-600 font-medium">{chk.passed ? "✓ 已核验" : "待核验"}</span>
                  </div>
                  <p className="text-[var(--muted-foreground)]">{chk.description}</p>
                </div>
              ))}
            </div>
            <FdeImportPanel canModel={canModel} onSwitchWorkspace={onSwitchWorkspace} onToast={onToast} />
          </div>
        </ModernTabPanel>
      </div>
      <OntologyRetirementDrawer workspaceId={workspaceId} open={retireOpen} isOwner={isOwner} onClose={() => setRetireOpen(false)} onToast={onToast} />
      {confirmDialogNode}
    </main>
  );
}
