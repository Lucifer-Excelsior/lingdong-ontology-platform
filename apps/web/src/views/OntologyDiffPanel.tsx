import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { OntologySnapshotView } from "../api/types";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { getRolePermissions, ROLE_TIPS } from "../utils/rbac";

interface OntologyDiffPanelProps {
  workspaceId: string;
  snapshot?: OntologySnapshotView;
  currentRole?: string;
  onToast: (msg: string) => void;
}

export function OntologyDiffPanel({ workspaceId, snapshot, currentRole, onToast }: OntologyDiffPanelProps) {
  const queryClient = useQueryClient();
  const { ask, confirmDialogNode } = useConfirmDialog();
  const { canModel } = getRolePermissions(currentRole);
  const [fromRev, setFromRev] = useState("");
  const [toRev, setToRev] = useState("");

  const { data: revData } = useQuery({
    queryKey: ["ontology-revisions", workspaceId],
    queryFn: () => api.getOntologyRevisions(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const revisions = revData?.revisions ?? [];

  useEffect(() => {
    if (revisions.length === 0) return;
    const latestCode = snapshot?.revisionId ?? revisions[0]!.revisionCode;
    const prevCode =
      snapshot?.previousRevisionId ??
      revisions[1]?.revisionCode ??
      revisions[revisions.length - 1]!.revisionCode;
    if (!toRev || !revisions.some((r) => r.revisionCode === toRev)) setToRev(latestCode);
    if (!fromRev || !revisions.some((r) => r.revisionCode === fromRev)) setFromRev(prevCode);
  }, [revisions, snapshot?.revisionId, snapshot?.previousRevisionId, fromRev, toRev]);

  const effectiveFrom = fromRev || snapshot?.previousRevisionId || "";
  const effectiveTo = toRev || snapshot?.revisionId || "";

  const { data: diffData } = useQuery({
    queryKey: ["ontology-diff", workspaceId, effectiveFrom, effectiveTo],
    queryFn: () => api.getOntologyDiff(workspaceId, effectiveFrom, effectiveTo),
    enabled: Boolean(workspaceId && effectiveFrom && effectiveTo),
  });

  const rollbackMutation = useMutation({
    mutationFn: (targetRevisionCode: string) =>
      api.rollbackOntologyRevision(workspaceId, targetRevisionCode),
    onSuccess: (res) => {
      setToRev(res.revisionId);
      void queryClient.invalidateQueries({ queryKey: ["ontology", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["ontology-revisions", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["ontology-diff", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["release", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["governance", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const items = diffData?.items ?? snapshot?.diffItems ?? [];
  const backwardCompatible = diffData?.backwardCompatible ?? snapshot?.backwardCompatible ?? true;

  return (
    <div className="flex-1 p-5 overflow-y-auto space-y-4 text-xs">
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-3.5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor="diff-from-rev" className="block font-medium text-[var(--muted-foreground)]">
                基线版本 (From)
              </label>
              <select
                id="diff-from-rev"
                name="fromRevision"
                value={effectiveFrom}
                onChange={(e) => setFromRev(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
              >
                {revisions.length > 0 ? (
                  revisions.map((r, idx) => (
                    <option key={`${r.revisionCode}-${idx}`} value={r.revisionCode}>
                      rev:{r.revisionCode} ({r.classCount}类/{r.propertyCount}属性 · {r.createdAt})
                    </option>
                  ))
                ) : (
                  <option value={effectiveFrom || "baseline"}>rev:{effectiveFrom || "baseline"}</option>
                )}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="diff-to-rev" className="block font-medium text-[var(--muted-foreground)]">
                对比版本 (To)
              </label>
              <select
                id="diff-to-rev"
                name="toRevision"
                value={effectiveTo}
                onChange={(e) => setToRev(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
              >
                {revisions.length > 0 ? (
                  revisions.map((r, idx) => (
                    <option key={`${r.revisionCode}-${idx}`} value={r.revisionCode}>
                      rev:{r.revisionCode} ({r.classCount}类/{r.propertyCount}属性 · {r.createdAt})
                    </option>
                  ))
                ) : (
                  <option value={effectiveTo || "current"}>rev:{effectiveTo || "current"}</option>
                )}
              </select>
            </div>
          </div>

          <span
            className={`px-2.5 py-1 rounded font-medium ${
              backwardCompatible ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
            }`}
          >
            {backwardCompatible ? "✓ 向后兼容（无破坏性删除）" : "⚠ 含不兼容破坏性变更"}
          </span>
        </div>

        <div className="space-y-2 font-mono">
          {items.length === 0 ? (
            <div className="p-3 rounded-lg bg-[var(--secondary)] text-[var(--muted-foreground)]">
              所选两个修订快照的本体类、对象关系与数据属性完全一致（0 项差异）。
            </div>
          ) : (
            items.map((item, i) => (
              <div
                key={i}
                className={`p-2.5 rounded-lg ${
                  item.changeType === "ADDED"
                    ? "bg-emerald-500/10 text-emerald-700"
                    : item.changeType === "MODIFIED"
                    ? "bg-amber-500/10 text-amber-700"
                    : "bg-red-500/10 text-red-700"
                }`}
              >
                {/^[+~-]/.test(item.summary.trim())
                  ? item.summary
                  : `${item.changeType === "ADDED" ? "+ " : item.changeType === "MODIFIED" ? "~ " : "- "}${item.summary}`}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">不可变本体修订时光机历史 ({revisions.length} 个快照)</span>
          <span className="text-[var(--muted-foreground)]">采用前滚追加新修订恢复，保留完整审计链</span>
        </div>
        <div className="space-y-2">
          {revisions.map((rev, idx) => {
            const isCurrent = rev.revisionCode === snapshot?.revisionId;
            return (
              <div
                key={`${rev.revisionCode}-${idx}`}
                className="p-3 rounded-lg border border-[var(--border)] flex items-center justify-between gap-3"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="font-mono font-semibold text-sm">rev:{rev.revisionCode}</code>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 font-medium">
                        当前活跃修订
                      </span>
                    )}
                    <span className="text-[var(--muted-foreground)] font-mono">
                      SHA-256: {rev.sha256Hash.slice(0, 12)}…
                    </span>
                  </div>
                  <div className="text-[var(--muted-foreground)]">
                    {rev.classCount} 类 · {rev.propertyCount} 属性 · 提交者：{rev.createdBy} · {rev.createdAt}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isCurrent || rollbackMutation.isPending || !canModel}
                  title={!canModel ? ROLE_TIPS.model : undefined}
                  onClick={async () => {
                    const { confirmed } = await ask({
                      title: "前滚恢复本体修订快照",
                      description: `确认前滚恢复至修订版本 rev:${rev.revisionCode} 吗？系统将追加一条新的恢复修订以保留完整审计链。`,
                      confirmLabel: "确认前滚恢复",
                      tone: "warning",
                    });
                    if (confirmed) rollbackMutation.mutate(rev.revisionCode);
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-lg border border-[var(--border)] font-medium hover:bg-[var(--secondary)] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isCurrent ? "当前生效中" : "前滚恢复至此版本"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {confirmDialogNode}
    </div>
  );
}
