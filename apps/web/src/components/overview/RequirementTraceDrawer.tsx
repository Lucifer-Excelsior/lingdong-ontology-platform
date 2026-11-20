import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RequirementChangeImpact, RequirementTraceEntry } from "@lingdong/contracts";
import { api } from "../../api/client";
import { SlideOverDrawer } from "../SlideOverDrawer";
import { ROLE_TIPS } from "../../utils/rbac";

interface RequirementTraceDrawerProps {
  workspaceId: string;
  open: boolean;
  canModel: boolean;
  onClose: () => void;
}

const STATUS_BADGE: Record<RequirementTraceEntry["verificationStatus"], string> = {
  VERIFIED: "bg-emerald-500/10 text-emerald-600",
  PARTIAL: "bg-amber-500/15 text-amber-600",
  UNCOVERED: "bg-rose-500/15 text-rose-600",
};

const RISK_BADGE: Record<RequirementChangeImpact["riskLevel"], string> = {
  LOW: "bg-emerald-500/10 text-emerald-600",
  MEDIUM: "bg-amber-500/15 text-amber-600",
  HIGH: "bg-rose-500/15 text-rose-600",
};

const splitCsv = (val: string) =>
  val
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

export function RequirementTraceDrawer({
  workspaceId,
  open,
  canModel,
  onClose,
}: RequirementTraceDrawerProps) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftClasses, setDraftClasses] = useState("");
  const [draftProps, setDraftProps] = useState("");
  const [draftRules, setDraftRules] = useState("");
  const [changeInputs, setChangeInputs] = useState<Record<string, string>>({});
  const [impacts, setImpacts] = useState<Record<string, RequirementChangeImpact>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["requirement-trace", workspaceId],
    queryFn: () => api.getRequirementTraceMatrix(workspaceId),
    enabled: open && Boolean(workspaceId),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: { cqId: string; mappedClasses: string[]; mappedProperties: string[]; mappedRules: string[] }) =>
      api.upsertRequirementTrace(workspaceId, payload.cqId, {
        mappedClasses: payload.mappedClasses,
        mappedProperties: payload.mappedProperties,
        mappedRules: payload.mappedRules,
      }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["requirement-trace", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
      setEditingId(null);
      setNotice(`已保存 ${updated.cqCode} 的本体追踪映射`);
    },
    onError: (err: Error) => setNotice(err.message),
  });

  const simulateMutation = useMutation({
    mutationFn: (payload: { cqId: string; proposedChange: string }) =>
      api.simulateRequirementChange(workspaceId, payload.cqId, payload.proposedChange),
    onSuccess: (res) => {
      setImpacts((prev) => ({ ...prev, [res.cqId]: res }));
      setNotice(null);
    },
    onError: (err: Error) => setNotice(err.message),
  });

  const startEdit = (item: RequirementTraceEntry) => {
    setEditingId(item.cqId);
    setDraftClasses(item.mappedClasses.join(", "));
    setDraftProps(item.mappedProperties.join(", "));
    setDraftRules(item.mappedRules.join(", "));
  };

  const items = data?.items ?? [];

  return (
    <SlideOverDrawer
      open={open}
      onClose={onClose}
      widthClass="max-w-2xl"
      title="需求追踪矩阵与变更影响分析"
      subtitle="建立能力问题 (CQ) 与本体类、属性、规则的双向追溯，并在变更前量化评估影响范围。"
      badge={<span className="px-2 py-0.5 rounded-full bg-[var(--secondary)] text-xs font-medium">{items.length} 项 CQ</span>}
    >
      <div className="space-y-4 text-xs">
        {notice && (
          <div className="px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-[var(--foreground)]">
            {notice}
          </div>
        )}
        {isLoading ? (
          <div className="py-8 text-center text-[var(--muted-foreground)]">正在加载需求追踪矩阵...</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-[var(--muted-foreground)]">暂无能力问题记录，请先在总览页新增 CQ。</div>
        ) : (
          items.map((item) => {
            const isEditing = editingId === item.cqId;
            const impact = impacts[item.cqId];
            const changeText = changeInputs[item.cqId] ?? "";
            return (
              <div key={item.cqId} className="p-4 rounded-xl border border-[var(--border)] bg-[var(--background)] space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-[var(--primary)]">{item.cqCode}</span>
                      <span className={`px-2 py-0.5 rounded font-medium ${STATUS_BADGE[item.verificationStatus]}`}>
                        {item.verificationStatus}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-[var(--foreground)]">{item.question}</div>
                  </div>
                  <button
                    type="button"
                    disabled={!canModel}
                    title={!canModel ? ROLE_TIPS.model : undefined}
                    onClick={() => (isEditing ? setEditingId(null) : startEdit(item))}
                    className="shrink-0 px-2.5 py-1 rounded-md border border-[var(--border)] hover:bg-[var(--secondary)] font-medium disabled:opacity-50 cursor-pointer"
                  >
                    {isEditing ? "取消" : "编辑映射"}
                  </button>
                </div>

                {isEditing ? (
                  <div className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-2">
                    <div>
                      <label className="block text-[var(--muted-foreground)] mb-0.5">映射本体类（逗号分隔）</label>
                      <input type="text" value={draftClasses} onChange={(e) => setDraftClasses(e.target.value)} className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono" />
                    </div>
                    <div>
                      <label className="block text-[var(--muted-foreground)] mb-0.5">映射属性（逗号分隔）</label>
                      <input type="text" value={draftProps} onChange={(e) => setDraftProps(e.target.value)} className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono" />
                    </div>
                    <div>
                      <label className="block text-[var(--muted-foreground)] mb-0.5">映射规则 / SHACL（逗号分隔）</label>
                      <input type="text" value={draftRules} onChange={(e) => setDraftRules(e.target.value)} className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono" />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        disabled={saveMutation.isPending}
                        onClick={() =>
                          saveMutation.mutate({
                            cqId: item.cqId,
                            mappedClasses: splitCsv(draftClasses),
                            mappedProperties: splitCsv(draftProps),
                            mappedRules: splitCsv(draftRules),
                          })
                        }
                        className="px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-50 cursor-pointer"
                      >
                        {saveMutation.isPending ? "保存中..." : "保存追踪映射"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                      <div className="text-[var(--muted-foreground)] mb-1">映射类</div>
                      <div className="font-mono break-all">{item.mappedClasses.join(", ") || "—"}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                      <div className="text-[var(--muted-foreground)] mb-1">映射属性</div>
                      <div className="font-mono break-all">{item.mappedProperties.join(", ") || "—"}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                      <div className="text-[var(--muted-foreground)] mb-1">映射规则</div>
                      <div className="font-mono break-all">{item.mappedRules.join(", ") || "—"}</div>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-[var(--border)] space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={changeText}
                      onChange={(e) => setChangeInputs((prev) => ({ ...prev, [item.cqId]: e.target.value }))}
                      placeholder="输入拟变更需求，如：增加供应商ESG评级与违约金上限..."
                      className="flex-1 px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--card)]"
                    />
                    <button
                      type="button"
                      disabled={simulateMutation.isPending || !changeText.trim()}
                      onClick={() => simulateMutation.mutate({ cqId: item.cqId, proposedChange: changeText.trim() })}
                      className="shrink-0 px-3 py-1.5 rounded-md bg-[var(--secondary)] hover:bg-[var(--border)]/60 font-medium disabled:opacity-50 cursor-pointer"
                    >
                      需求变更影响分析
                    </button>
                  </div>

                  {impact && (
                    <div className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">变更影响预演结果</span>
                        <span className={`px-2 py-0.5 rounded font-semibold ${RISK_BADGE[impact.riskLevel]}`}>
                          风险等级：{impact.riskLevel}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                        <div>受影响类：<code className="font-mono">{impact.affectedClasses.join(", ") || "无"}</code></div>
                        <div>受影响属性：<code className="font-mono">{impact.affectedProperties.join(", ") || "无"}</code></div>
                        <div>受影响规则：<code className="font-mono">{impact.affectedRules.join(", ") || "无"}</code></div>
                        <div>受影响能力：<code className="font-mono">{impact.affectedCapabilities.join(", ") || "无"}</code></div>
                      </div>
                      <div className="text-[var(--muted-foreground)] pt-1 border-t border-[var(--border)]">
                        建议：{impact.recommendation}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </SlideOverDrawer>
  );
}
