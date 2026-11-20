import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { ROLE_TIPS } from "../../utils/rbac";
import { useConfirmDialog } from "../ConfirmDialog";

interface OntologyBranchBarProps {
  workspaceId: string;
  revisionId?: string;
  canModel: boolean;
  onToast: (msg: string) => void;
}

export function OntologyBranchBar({
  workspaceId,
  revisionId,
  canModel,
  onToast,
}: OntologyBranchBarProps) {
  const queryClient = useQueryClient();
  const { ask, confirmDialogNode } = useConfirmDialog();
  const [selectedBranchId, setSelectedBranchId] = useState<string>("main");
  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");

  const { data } = useQuery({
    queryKey: ["ontology-branches", workspaceId],
    queryFn: () => api.listOntologyBranches(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const branches = data?.branches ?? [];
  const activeBranch = branches.find((b) => b.id === selectedBranchId);

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createOntologyBranch(workspaceId, { name }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["ontology-branches", workspaceId] });
      setSelectedBranchId(res.branch.id);
      setNewBranchName("");
      setCreating(false);
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const mergeMutation = useMutation({
    mutationFn: (branchId: string) => api.mergeOntologyBranch(workspaceId, branchId),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["ontology-branches", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["ontology", workspaceId] });
      setSelectedBranchId("main");
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (branchId: string) => api.deleteOntologyBranch(workspaceId, branchId),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["ontology-branches", workspaceId] });
      setSelectedBranchId("main");
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const handleCreate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    createMutation.mutate(newBranchName.trim());
  };

  return (
    <div className="px-4 py-1.5 border-b border-[var(--border)] bg-[var(--secondary)]/60 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-[var(--muted-foreground)]">⎇ 语义分支</span>
        <select
          aria-label="本体协作分支选择"
          value={selectedBranchId}
          onChange={(e) => setSelectedBranchId(e.target.value)}
          className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--card)] font-mono text-xs"
        >
          <option value="main">main (主干 · {revisionId ?? "HEAD"})</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} [{b.status === "OPEN" ? "进行中" : "已合并"}] · base:{b.baseRevisionCode}
            </option>
          ))}
        </select>

        {activeBranch && (
          <span
            className={`px-2 py-0.5 rounded-full font-medium ${
              activeBranch.status === "OPEN"
                ? "bg-blue-500/15 text-blue-700"
                : "bg-emerald-500/15 text-emerald-700"
            }`}
          >
            {activeBranch.status === "OPEN" ? "OPEN 特性分支" : "MERGED 已合入"}
          </span>
        )}

        {activeBranch?.status === "OPEN" && (
          <button
            type="button"
            disabled={!canModel || mergeMutation.isPending}
            title={!canModel ? ROLE_TIPS.model : undefined}
            onClick={async () => {
              const { confirmed } = await ask({
                title: "合并特性分支至主干",
                description: `确认将特性分支「${activeBranch.name}」合并至主干 main 吗？`,
                confirmLabel: "确认合并",
                tone: "primary",
              });
              if (confirmed) mergeMutation.mutate(activeBranch.id);
            }}
            className="px-2.5 py-1 rounded bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {mergeMutation.isPending ? "合并中..." : "合并至 main"}
          </button>
        )}

        {activeBranch && (
          <button
            type="button"
            disabled={!canModel || deleteMutation.isPending}
            title={!canModel ? ROLE_TIPS.model : undefined}
            onClick={async () => {
              const { confirmed } = await ask({
                title: "删除特性分支",
                description: `确认删除分支「${activeBranch.name}」吗？此操作不可撤销。`,
                confirmLabel: "确认删除",
                tone: "danger",
              });
              if (confirmed) deleteMutation.mutate(activeBranch.id);
            }}
            className="px-2.5 py-1 rounded border border-rose-500/30 text-rose-600 font-medium hover:bg-rose-500/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {deleteMutation.isPending ? "删除中..." : "删除"}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {creating ? (
          <form onSubmit={handleCreate} className="flex items-center gap-1.5">
            <input
              type="text"
              required
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="feat/q4-compliance"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-44 px-2 py-1 rounded border border-[var(--border)] bg-[var(--card)] font-mono"
            />
            <button
              type="submit"
              disabled={!canModel || createMutation.isPending}
              className="px-2.5 py-1 rounded bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-50 cursor-pointer"
            >
              创建
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-2 py-1 rounded border border-[var(--border)] text-[var(--muted-foreground)] cursor-pointer"
            >
              取消
            </button>
          </form>
        ) : (
          <button
            type="button"
            disabled={!canModel}
            title={!canModel ? ROLE_TIPS.model : undefined}
            onClick={() => setCreating(true)}
            className="px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            + 新建特性分支
          </button>
        )}
      </div>
      {confirmDialogNode}
    </div>
  );
}
