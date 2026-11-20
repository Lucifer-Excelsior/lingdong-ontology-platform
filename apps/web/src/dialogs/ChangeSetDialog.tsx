import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ChangeSetProposal } from "../api/types";
import { ModalDialog } from "../shell/ModalDialog";
import { ROLE_TIPS } from "../utils/rbac";

interface ChangeSetDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  baseRevisionId: string;
  proposals: ChangeSetProposal[];
  canModel?: boolean;
  onToast: (msg: string) => void;
}

export function ChangeSetDialog({
  open,
  onClose,
  workspaceId,
  baseRevisionId,
  proposals,
  canModel = true,
  onToast,
}: ChangeSetDialogProps) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setSelectedIds(
        proposals.filter((p) => p.selectedByDefault || p.confidence === "STRONG").map((p) => p.id)
      );
    }
  }, [open, proposals]);

  const commitMutation = useMutation({
    mutationFn: (proposalIds: string[]) =>
      api.commitChangeSet(workspaceId, { baseRevisionId, proposalIds }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["modeling", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["ontology", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["governance", workspaceId] });
      onToast(`已通过 ChangeSet 门禁原子提交 ${selectedIds.length} 项提案，生成新修订 ${res.revisionId}`);
      onClose();
    },
    onError: (err: Error) => {
      onToast(err.message);
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (proposalId: string) => api.dismissProposal(workspaceId, proposalId),
    onSuccess: (res, proposalId) => {
      setSelectedIds((prev) => prev.filter((id) => id !== proposalId));
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["modeling", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["ontology", workspaceId] });
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const allSelected = proposals.length > 0 && selectedIds.length === proposals.length;

  const toggleProposal = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedIds.length === 0) {
      onToast("请至少勾选 1 条待合入的候选提案");
      return;
    }
    commitMutation.mutate(selectedIds);
  };

  return (
    <ModalDialog open={open} onClose={onClose} titleId="cs-title" maxWidthClass="max-w-xl">
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <div>
          <h2 id="cs-title" className="text-base font-semibold">
            审阅待提交语义变更集 (ChangeSet)
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            基于 <code className="font-mono">baseRevision: {baseRevisionId}</code> 乐观锁校验，仅已勾选提案原子写入 Oxigraph。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {proposals.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds(allSelected ? [] : proposals.map((p) => p.id))}
              className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-xs font-medium hover:bg-[var(--secondary)] cursor-pointer"
            >
              {allSelected ? "清空" : "全选"} ({selectedIds.length}/{proposals.length})
            </button>
          )}
          <button
            type="button"
            aria-label="关闭弹窗"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--secondary)] text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} method="POST">
        <div className="p-5 space-y-2.5 text-xs max-h-[60vh] overflow-y-auto">
          {proposals.length === 0 ? (
            <div className="p-4 rounded-xl bg-[var(--secondary)] text-[var(--muted-foreground)] text-center">
              当前工作空间暂无待审 ChangeSet 提案，可在「向导建模与资料」中从制度证据抽取。
            </div>
          ) : (
            proposals.map((prop) => {
              const inputId = `cs-prop-${prop.id}`;
              const checked = selectedIds.includes(prop.id);
              return (
                <div
                  key={prop.id}
                  className="flex items-start gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]"
                >
                  <input
                    id={inputId}
                    name="proposalIds"
                    type="checkbox"
                    value={prop.id}
                    checked={checked}
                    onChange={() => toggleProposal(prop.id)}
                    className="mt-1 accent-[var(--primary)] cursor-pointer"
                  />
                  <label htmlFor={inputId} className="flex-1 cursor-pointer space-y-0.5">
                    <div className="font-semibold text-sm text-[var(--foreground)]">
                      {prop.title.includes(prop.localName) ? (
                        prop.title
                      ) : (
                        <>
                          {prop.title} (<code className="font-mono">{prop.localName}</code>)
                        </>
                      )}
                    </div>
                    <div className="text-[var(--muted-foreground)]">
                      目标：<code className="font-mono">ont:{prop.targetClassLocalName}</code> · 值域/约束：
                      <code className="font-mono"> {prop.rangeOrDatatype}</code> · 证据：
                      <code className="font-mono"> {prop.evidenceAnchor}</code>
                    </div>
                    <div className="text-[var(--muted-foreground)]">{prop.rationale}</div>
                  </label>
                  <button
                    type="button"
                    disabled={dismissMutation.isPending || !canModel}
                    title={!canModel ? ROLE_TIPS.model : "丢弃该候选提案"}
                    onClick={() => dismissMutation.mutate(prop.id)}
                    className="shrink-0 px-2 py-1 rounded-md border border-rose-500/30 text-rose-600 hover:bg-rose-500/10 font-medium disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                  >
                    丢弃
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-[var(--border)] flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:bg-[var(--secondary)] cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={commitMutation.isPending || proposals.length === 0 || !canModel}
            title={!canModel ? ROLE_TIPS.model : undefined}
            className="px-4 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {commitMutation.isPending ? "正在原子提交..." : "原子提交变更"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
