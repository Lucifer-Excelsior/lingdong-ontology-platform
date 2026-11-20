import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { OntologyReuseAssessment } from "@lingdong/contracts";
import { api } from "../../api/client";
import type { SemanticAsset } from "../../api/types";
import { ROLE_TIPS } from "../../utils/rbac";

interface SemanticAssetLibraryProps {
  workspaceId: string;
  assets: SemanticAsset[];
  canModel: boolean;
  onToast: (msg: string) => void;
}

const CONSISTENCY_LABEL: Record<OntologyReuseAssessment["semanticConsistency"], { text: string; cls: string }> = {
  CONSISTENT: { text: "语义一致", cls: "bg-emerald-500/10 text-emerald-600" },
  MINOR_CONFLICT: { text: "轻微语义冲突", cls: "bg-amber-500/15 text-amber-600" },
  CONFLICT: { text: "存在语义冲突", cls: "bg-rose-500/15 text-rose-600" },
};

const toneBadgeClass = (tone: "blue" | "emerald" | "purple") => {
  if (tone === "blue") return "bg-blue-500/15 text-blue-600";
  if (tone === "emerald") return "bg-emerald-500/15 text-emerald-600";
  return "bg-purple-500/15 text-purple-600";
};

export function SemanticAssetLibrary({
  workspaceId,
  assets,
  canModel,
  onToast,
}: SemanticAssetLibraryProps) {
  const queryClient = useQueryClient();
  const [assessments, setAssessments] = useState<Record<string, OntologyReuseAssessment>>({});

  const precheckAssetMutation = useMutation({
    mutationFn: (asset: SemanticAsset) =>
      api.importOntologyRdf(workspaceId, {
        filename: `${asset.id}.ttl`,
        content: asset.turtleSnippet,
        commitImmediately: false,
      }),
    onSuccess: (res, asset) => {
      void queryClient.invalidateQueries({ queryKey: ["modeling", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["ontology", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      const conflictNote =
        res.conflicts.length === 0
          ? "无命名空间冲突，可安全复用"
          : `检出 ${res.conflicts.length} 项命名空间/定义提示`;
      onToast(
        `${asset.title} 导入预检完成：解析 ${res.parsedTriples} 条三元组 · ${res.discoveredClasses.length} 个类（${conflictNote}）`
      );
    },
    onError: (err: Error) => onToast(err.message),
  });

  const evaluateMutation = useMutation({
    mutationFn: (asset: SemanticAsset) =>
      api.evaluateReuse(workspaceId, {
        assetId: asset.id,
        assetTitle: asset.title,
        version: asset.version,
        turtleSnippet: asset.turtleSnippet,
      }),
    onSuccess: (res) => {
      setAssessments((prev) => ({ ...prev, [res.assetId]: res }));
      onToast(`${res.assetTitle} 适用性评估完成：覆盖率 ${res.coveragePercent}% · 推荐策略：${res.strategyLabel}`);
    },
    onError: (err: Error) => onToast(err.message),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto grid grid-cols-3 gap-4 text-xs">
      {assets.map((asset) => {
        const assess = assessments[asset.id];
        const evaluatingThis = evaluateMutation.isPending && evaluateMutation.variables?.id === asset.id;
        const precheckingThis = precheckAssetMutation.isPending && precheckAssetMutation.variables?.id === asset.id;
        return (
          <div
            key={asset.id}
            className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] flex flex-col justify-between space-y-2.5"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded font-semibold ${toneBadgeClass(asset.categoryTone)}`}>
                  {asset.categoryBadge}
                </span>
                <span className="font-mono text-[var(--muted-foreground)]">{asset.version}</span>
              </div>
              <div className="text-sm font-semibold">{asset.title}</div>
              <p className="text-[var(--muted-foreground)]">{asset.description}</p>
              <details className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2">
                <summary className="font-medium text-[var(--primary)] cursor-pointer select-none">
                  查看 Turtle 源码
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto font-mono text-[11px] leading-relaxed text-[var(--foreground)] whitespace-pre-wrap">
                  <code>{asset.turtleSnippet}</code>
                </pre>
              </details>

              {assess && (
                <div className="p-2.5 rounded-lg bg-[var(--secondary)]/60 border border-[var(--border)] space-y-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 font-medium">
                      覆盖率 {assess.coveragePercent}%
                    </span>
                    <span className={`px-1.5 py-0.5 rounded font-medium ${CONSISTENCY_LABEL[assess.semanticConsistency].cls}`}>
                      {CONSISTENCY_LABEL[assess.semanticConsistency].text}
                    </span>
                    <span
                      title={assess.versionNote}
                      className={`px-1.5 py-0.5 rounded font-medium ${assess.versionValid ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/15 text-amber-600"}`}
                    >
                      {assess.versionValid ? "版本有效" : "版本需核验"}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--foreground)] font-medium">
                    推荐策略：{assess.strategyLabel}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={evaluatingThis}
                onClick={() => evaluateMutation.mutate(asset)}
                className="py-1.5 px-2 rounded-md border border-[var(--primary)]/40 text-[var(--primary)] hover:bg-[var(--primary)]/10 font-medium disabled:opacity-50 cursor-pointer"
              >
                {evaluatingThis ? "评估中..." : "适用性评估"}
              </button>
              <button
                type="button"
                disabled={precheckAssetMutation.isPending || !canModel}
                title={!canModel ? ROLE_TIPS.model : undefined}
                onClick={() => precheckAssetMutation.mutate(asset)}
                className={`py-1.5 px-2 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                  asset.enabledInWorkspace
                    ? "bg-[var(--secondary)] text-[var(--foreground)]"
                    : "border border-[var(--border)] hover:bg-[var(--secondary)]"
                }`}
              >
                {precheckingThis ? "预检中..." : asset.enabledInWorkspace ? "✓ 重新预检" : "导入预检"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
