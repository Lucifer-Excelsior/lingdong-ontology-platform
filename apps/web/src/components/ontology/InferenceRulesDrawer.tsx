import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferenceDerivationTrace } from "@lingdong/contracts";
import { api } from "../../api/client";
import { SlideOverDrawer } from "../SlideOverDrawer";
import { ROLE_TIPS } from "../../utils/rbac";
import { JsonLdImportTab } from "./JsonLdImportTab";

interface InferenceRulesDrawerProps {
  workspaceId: string;
  open: boolean;
  canModel: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

type DrawerTab = "rules" | "jsonld";

export function InferenceRulesDrawer({
  workspaceId,
  open,
  canModel,
  onClose,
  onToast,
}: InferenceRulesDrawerProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<DrawerTab>("rules");
  const [name, setName] = useState("");
  const [scopeClass, setScopeClass] = useState("Contract");
  const [conditionExpr, setConditionExpr] = useState("");
  const [conclusionExpr, setConclusionExpr] = useState("");
  const [latestTraces, setLatestTraces] = useState<InferenceDerivationTrace[] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["inference-rules", workspaceId],
    queryFn: () => api.listInferenceRules(workspaceId),
    enabled: open && Boolean(workspaceId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["inference-rules", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["ontology", workspaceId] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.createInferenceRule(workspaceId, {
        name: name.trim(),
        scopeClass: scopeClass.trim() || "Contract",
        conditionExpr: conditionExpr.trim(),
        conclusionExpr: conclusionExpr.trim(),
      }),
    onSuccess: (res) => {
      invalidate();
      setName("");
      setConditionExpr("");
      setConclusionExpr("");
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (ruleId: string) => api.toggleInferenceRule(workspaceId, ruleId),
    onSuccess: (res) => { invalidate(); onToast(res.message); },
    onError: (err: Error) => onToast(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => api.deleteInferenceRule(workspaceId, ruleId),
    onSuccess: (res) => { invalidate(); onToast(res.message); },
    onError: (err: Error) => onToast(err.message),
  });

  const evaluateMutation = useMutation({
    mutationFn: () => api.evaluateInferenceRules(workspaceId),
    onSuccess: (res) => {
      setLatestTraces(res.traces);
      invalidate();
      onToast(res.message || `推理有效性测试完成：${res.passedCount}/${res.traces.length} 条通过`);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !conditionExpr.trim() || !conclusionExpr.trim()) return;
    createMutation.mutate();
  };

  const rules = data?.rules ?? [];
  const traces = latestTraces ?? data?.traces ?? [];

  return (
    <SlideOverDrawer
      open={open}
      onClose={onClose}
      widthClass="max-w-2xl"
      title="推理规则、有效性验证与标准导出"
      subtitle="管理 SWRL/OWL 自定义推理规则、生成可追溯推理证据链，并支持 JSON-LD 导出与外部导入冲突预检。"
    >
      <div className="space-y-4 text-xs">
        <div className="flex gap-1 p-1 rounded-lg bg-[var(--secondary)] border border-[var(--border)]">
          {(
            [
              ["rules", `推理规则与有效性测试 (${rules.length})`],
              ["jsonld", "JSON-LD 与导入冲突分析"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 py-1.5 rounded-md font-medium transition cursor-pointer ${
                tab === id
                  ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "jsonld" ? (
          <JsonLdImportTab workspaceId={workspaceId} onToast={onToast} />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--muted-foreground)]">
                共 {rules.length} 条推理规则（已启用 {rules.filter((r) => r.enabled).length} 条）
              </span>
              <button
                type="button"
                disabled={evaluateMutation.isPending}
                onClick={() => evaluateMutation.mutate()}
                className="px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {evaluateMutation.isPending ? "推理验证中..." : "运行推理有效性测试"}
              </button>
            </div>

            <details className="rounded-xl border border-dashed border-[var(--border)] p-3 bg-[var(--background)]">
              <summary className="font-medium text-[var(--primary)] cursor-pointer select-none">
                + 新增推理规则
              </summary>
              <form onSubmit={handleCreate} className="mt-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="规则名称，如：高风险合同传递推导" className="px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--card)]" />
                  <input type="text" required value={scopeClass} onChange={(e) => setScopeClass(e.target.value)} placeholder="作用域类，如 Contract" className="px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--card)] font-mono" />
                </div>
                <input type="text" required value={conditionExpr} onChange={(e) => setConditionExpr(e.target.value)} placeholder="前提条件，如：ont:amount > 1000000 && ont:hasRiskFlag == true" className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--card)] font-mono" />
                <input type="text" required value={conclusionExpr} onChange={(e) => setConclusionExpr(e.target.value)} placeholder="推导结论，如：ont:requiresDualApproval(?x, true)" className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--card)] font-mono" />
                <div className="flex justify-end">
                  <button type="submit" disabled={!canModel || createMutation.isPending} title={!canModel ? ROLE_TIPS.model : undefined} className="px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-50 cursor-pointer">
                    {createMutation.isPending ? "保存中..." : "保存规则"}
                  </button>
                </div>
              </form>
            </details>

            {isLoading ? (
              <div className="py-6 text-center text-[var(--muted-foreground)]">加载推理规则中...</div>
            ) : (
              <div className="space-y-2.5">
                {rules.map((rule) => (
                  <div key={rule.id} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--background)] space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-sm">{rule.name}</span>
                          <span className="px-1.5 py-0.5 rounded bg-[var(--secondary)] font-mono">{rule.scopeClass}</span>
                          <span className={`px-1.5 py-0.5 rounded font-medium ${rule.syntaxValid ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>
                            {rule.syntaxValid ? "语法有效" : `语法异常: ${rule.syntaxMessage}`}
                          </span>
                          {rule.conflictWarnings.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 font-medium">
                              ⚠ {rule.conflictWarnings.length} 项冲突提示
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-[var(--muted-foreground)] break-all">
                          IF {rule.conditionExpr} ⇒ {rule.conclusionExpr}
                        </div>
                        {rule.conflictWarnings.length > 0 && (
                          <div className="text-[11px] text-amber-600">{rule.conflictWarnings.join("；")}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button type="button" disabled={!canModel || toggleMutation.isPending} title={!canModel ? ROLE_TIPS.model : undefined} onClick={() => toggleMutation.mutate(rule.id)} className={`px-2 py-1 rounded border font-medium disabled:opacity-50 cursor-pointer ${rule.enabled ? "border-emerald-500/40 text-emerald-600" : "border-[var(--border)] text-[var(--muted-foreground)]"}`}>
                          {rule.enabled ? "已启用" : "已停用"}
                        </button>
                        <button type="button" disabled={!canModel || deleteMutation.isPending} title={!canModel ? ROLE_TIPS.model : undefined} onClick={() => deleteMutation.mutate(rule.id)} className="px-2 py-1 rounded border border-rose-500/30 text-rose-600 hover:bg-rose-500/10 font-medium disabled:opacity-50 cursor-pointer">
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {traces.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                <div className="font-semibold text-sm">可追溯推理证据链 ({traces.length})</div>
                {traces.map((tr) => (
                  <div key={tr.id} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{tr.ruleName} · <code className="font-mono text-[var(--muted-foreground)]">{tr.subjectIri}</code></span>
                      <span className={`px-2 py-0.5 rounded font-semibold ${tr.validationResult === "PASS" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>
                        {tr.validationResult}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      前提证据：{tr.premises.join(" ∧ ")}
                    </div>
                    <div className="text-[11px]">推理步骤：{tr.reasoningStep}</div>
                    <div className="text-[11px] font-mono text-[var(--primary)]">推导结论：{tr.inferredConclusion}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </SlideOverDrawer>
  );
}
