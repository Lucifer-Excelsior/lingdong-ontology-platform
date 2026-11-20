import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, GitBranch, GitMerge, GitPullRequest, Plus, RefreshCw, X } from "lucide-react";
import { v6Api } from "../../lib/v6-api";

interface OntologyBranchPrPanelProps {
  workspaceId: string;
  open: boolean;
  canModel: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function OntologyBranchPrPanel({ workspaceId, open, canModel, onClose, onToast }: OntologyBranchPrPanelProps) {
  const qc = useQueryClient();
  const [branchName, setBranchName] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [localName, setLocalName] = useState("");
  const [labelZh, setLabelZh] = useState("");
  const [subClassOf, setSubClassOf] = useState("");
  const [prTitle, setPrTitle] = useState("");

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["v6-branches", workspaceId],
    queryFn: () => v6Api.listBranches(workspaceId),
    enabled: open && Boolean(workspaceId),
  });

  const branches = data?.branches ?? [];
  const mergeRequests = data?.mergeRequests ?? [];
  const activeBranch = branches.find((b) => b.id === selectedBranchId) ?? branches[0];
  const refresh = () => void qc.invalidateQueries({ queryKey: ["v6-branches", workspaceId] });

  const createBranchMut = useMutation({
    mutationFn: (name: string) => v6Api.createBranch(workspaceId, name),
    onSuccess: (res) => {
      refresh();
      if (res.branch?.id) setSelectedBranchId(res.branch.id);
      setBranchName("");
      onToast(res.message || "特性分支已创建");
    },
    onError: (e: Error) => onToast(e.message),
  });

  const addClassMut = useMutation({
    mutationFn: (p: { branchId: string; localName: string; labelZh: string; subClassOf?: string }) =>
      v6Api.addBranchClass(workspaceId, p.branchId, { localName: p.localName, labelZh: p.labelZh, subClassOf: p.subClassOf || undefined }),
    onSuccess: (res) => {
      refresh();
      setLocalName("");
      setLabelZh("");
      setSubClassOf("");
      onToast(res.message || "已在分支内添加本体类");
    },
    onError: (e: Error) => onToast(e.message),
  });

  const createPrMut = useMutation({
    mutationFn: (p: { branchId: string; title: string }) => v6Api.createMergeRequest(workspaceId, p),
    onSuccess: (res) => { refresh(); setPrTitle(""); onToast(res.message || "已提交合并请求 (PR)"); },
    onError: (e: Error) => onToast(e.message),
  });

  const approvePrMut = useMutation({
    mutationFn: (mrId: string) => v6Api.approveMergeRequest(workspaceId, mrId),
    onSuccess: (res) => { refresh(); onToast(res.message || "已签署当前审批阶段"); },
    onError: (e: Error) => onToast(e.message),
  });

  const mergePrMut = useMutation({
    mutationFn: (mrId: string) => v6Api.mergeMergeRequest(workspaceId, mrId),
    onSuccess: (res) => { refresh(); void qc.invalidateQueries({ queryKey: ["ontology", workspaceId] }); onToast(res.message || "PR 已合并至主干 main"); },
    onError: (e: Error) => onToast(e.message),
  });

  if (!open) return null;

  const onCreateBranch = (e: FormEvent) => { e.preventDefault(); if (branchName.trim()) createBranchMut.mutate(branchName.trim()); };
  const onAddClass = (e: FormEvent) => {
    e.preventDefault();
    if (activeBranch && localName.trim() && labelZh.trim()) addClassMut.mutate({ branchId: activeBranch.id, localName: localName.trim(), labelZh: labelZh.trim(), subClassOf: subClassOf.trim() });
  };
  const onCreatePr = (e: FormEvent) => { e.preventDefault(); if (activeBranch && prTitle.trim()) createPrMut.mutate({ branchId: activeBranch.id, title: prTitle.trim() }); };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[1px]">
      <div className="w-full max-w-xl bg-[var(--card)] h-full border-l border-[var(--border)] shadow-2xl flex flex-col">
        <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-indigo-600" />
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Git 风格本体分支与 PR 审批</h3>
              <p className="text-[11px] text-[var(--muted-foreground)]">支持特性分支建模、三路语义 Diff 与双阶段审批合入主干</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => void refetch()} className="p-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--secondary)] text-[var(--muted-foreground)] cursor-pointer" title="刷新">
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-[var(--secondary)] text-[var(--muted-foreground)] cursor-pointer" aria-label="关闭">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          <form onSubmit={onCreateBranch} className="flex gap-2">
            <input
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="新建分支名，如 feat/group-esg"
              className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] font-mono"
            />
            <button type="submit" disabled={!canModel || createBranchMut.isPending} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50 cursor-pointer">
              <Plus className="w-3.5 h-3.5" />新建分支
            </button>
          </form>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--foreground)]">特性分支列表 ({branches.length})</span>
              {activeBranch && <span className="font-mono text-[11px] text-[var(--muted-foreground)]">base: {activeBranch.baseRevisionCode}</span>}
            </div>
            {branches.length === 0 ? (
              <div className="text-[var(--muted-foreground)] py-2">暂无特性分支，请先创建一个分支进行隔离建模。</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {branches.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBranchId(b.id)}
                    className={`px-2.5 py-1 rounded-md border font-mono transition cursor-pointer ${
                      activeBranch?.id === b.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-[var(--card)] text-[var(--foreground)]/85 border-[var(--border)] hover:border-indigo-300"
                    }`}
                  >
                    {b.branchName} ({b.classes.length}) · {b.status}
                  </button>
                ))}
              </div>
            )}

            {activeBranch && activeBranch.status !== "MERGED" && (
              <div className="pt-2 border-t border-[var(--border)] space-y-2.5">
                <form onSubmit={onAddClass} className="grid grid-cols-3 gap-2">
                  <input value={localName} onChange={(e) => setLocalName(e.target.value)} placeholder="类英文名 (EsgMetric)" className="px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] font-mono" />
                  <input value={labelZh} onChange={(e) => setLabelZh(e.target.value)} placeholder="中文标签 (ESG指标)" className="px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]" />
                  <div className="flex gap-1.5">
                    <input value={subClassOf} onChange={(e) => setSubClassOf(e.target.value)} placeholder="父类(可选)" className="min-w-0 flex-1 px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] font-mono" />
                    <button type="submit" disabled={!canModel || addClassMut.isPending} className="px-2.5 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer shrink-0">
                      加类
                    </button>
                  </div>
                </form>
                <form onSubmit={onCreatePr} className="flex gap-2">
                  <input value={prTitle} onChange={(e) => setPrTitle(e.target.value)} placeholder={`提交 PR 标题（源自 ${activeBranch.branchName}）`} className="flex-1 px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]" />
                  <button type="submit" disabled={!canModel || createPrMut.isPending} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50 cursor-pointer">
                    <GitPullRequest className="w-3.5 h-3.5" />发起 PR
                  </button>
                </form>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="font-semibold text-[var(--foreground)]">合并请求与双阶段审批 ({mergeRequests.length})</div>
            {mergeRequests.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-center text-[var(--muted-foreground)]">暂无 PR 记录</div>
            ) : (
              mergeRequests.map((mr) => {
                const allApproved = mr.approvalChain.length > 0 && mr.approvalChain.every((s) => s.status === "APPROVED");
                const isMerged = mr.status === "MERGED";
                return (
                  <div key={mr.id} className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-[var(--foreground)]">{mr.title}</div>
                        <div className="font-mono text-[11px] text-[var(--muted-foreground)] mt-0.5">
                          {mr.branchName} → main {mr.mergedRevisionCode ? `· rev:${mr.mergedRevisionCode}` : ""}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${isMerged ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : allApproved ? "bg-indigo-50 text-indigo-700 border border-indigo-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                        {mr.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">+{mr.addedClasses.length} 新增类{mr.addedClasses.length ? `: ${mr.addedClasses.join(", ")}` : ""}</span>
                      <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">~{mr.modifiedClasses.length} 修改</span>
                      <span className={`px-2 py-0.5 rounded border ${mr.conflictItems.length > 0 ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-[var(--secondary)]/60 text-[var(--muted-foreground)] border-[var(--border)]"}`}>
                        {mr.conflictItems.length} 冲突
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {mr.approvalChain.map((st) => (
                        <span key={st.stageOrder} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${st.status === "APPROVED" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-[var(--secondary)]/60 text-[var(--muted-foreground)] border-[var(--border)]"}`}>
                          <CheckCircle2 className="w-3 h-3" />
                          L{st.stageOrder} {st.stageName} ({st.status === "APPROVED" ? st.approvedBy || "已批" : "待审"})
                        </span>
                      ))}
                    </div>

                    {!isMerged && (
                      <div className="flex items-center justify-end gap-2 pt-1">
                        {!allApproved && (
                          <button type="button" disabled={approvePrMut.isPending} onClick={() => approvePrMut.mutate(mr.id)} className="px-2.5 py-1 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium cursor-pointer disabled:opacity-50">
                            签署审批阶段
                          </button>
                        )}
                        <button type="button" disabled={mergePrMut.isPending || !allApproved} onClick={() => mergePrMut.mutate(mr.id)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium cursor-pointer disabled:opacity-50">
                          <GitMerge className="w-3.5 h-3.5" />合并至 main
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
