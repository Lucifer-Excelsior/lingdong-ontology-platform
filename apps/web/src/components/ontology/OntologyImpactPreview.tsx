import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ImpactSimulationResult } from "@lingdong/contracts";
import { api } from "../../api/client";
import { useConfirmDialog } from "../ConfirmDialog";

interface OntologyImpactPreviewProps {
  workspaceId: string;
  targetLocalName: string;
  onToast: (msg: string) => void;
}

const RISK_STYLE: Record<ImpactSimulationResult["riskLevel"], string> = {
  SAFE: "bg-emerald-500/15 text-emerald-700 border-emerald-300",
  WARN: "bg-amber-500/15 text-amber-700 border-amber-300",
  BREAKING: "bg-red-500/15 text-red-700 border-red-300",
};

export function OntologyImpactPreview({
  workspaceId,
  targetLocalName,
  onToast,
}: OntologyImpactPreviewProps) {
  const queryClient = useQueryClient();
  const { ask, confirmDialogNode } = useConfirmDialog();
  const [result, setResult] = useState<ImpactSimulationResult | null>(null);

  useEffect(() => {
    setResult(null);
  }, [workspaceId, targetLocalName]);

  const simMutation = useMutation({
    mutationFn: () =>
      api.simulateOntologyImpact(workspaceId, {
        operation: "DELETE_CLASS",
        targetLocalName,
      }),
    onSuccess: (res) => {
      setResult(res);
      onToast(`影响面预检完成 [${res.riskLevel}]：${res.recommendation}`);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const deleteClassMutation = useMutation({
    mutationFn: (classLocalName: string) => api.deleteOntologyClass(workspaceId, classLocalName),
    onSuccess: (res) => {
      setResult(null);
      void queryClient.invalidateQueries({ queryKey: ["ontology", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={simMutation.isPending}
        onClick={() => simMutation.mutate()}
        className="shrink-0 px-2.5 py-1 rounded-md border border-[var(--border)] text-xs text-[var(--muted-foreground)] hover:text-red-600 whitespace-nowrap disabled:opacity-50 cursor-pointer"
      >
        {simMutation.isPending ? "预检中..." : "归档预检"}
      </button>

      {result && (
        <div className={`p-2.5 rounded-lg border text-xs space-y-1.5 ${RISK_STYLE[result.riskLevel]}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">破坏性变更预检 · {result.riskLevel}</span>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="text-[11px] opacity-70 hover:opacity-100 cursor-pointer"
            >
              收起
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[11px]">
            <span>受影响 ABox 实例：{result.affectedInstanceCount}</span>
            <span>受影响映射：{result.brokenMappings.length}</span>
            <span>受影响能力：{result.brokenCapabilities.length}</span>
            <span>受影响 MCP 工具：{result.brokenMcpTools.length}</span>
          </div>
          {(result.brokenMappings.length > 0 || result.brokenCapabilities.length > 0 || result.brokenMcpTools.length > 0) && (
            <div className="text-[11px] font-mono break-all opacity-90">
              {[...result.brokenMappings, ...result.brokenCapabilities, ...result.brokenMcpTools].slice(0, 6).join(" · ")}
            </div>
          )}
          <div className="text-[11px] leading-relaxed">{result.recommendation}</div>
          <div className="pt-1 flex justify-end">
            <button
              type="button"
              disabled={deleteClassMutation.isPending}
              onClick={async () => {
                const warnMsg =
                  result.riskLevel === "BREAKING"
                    ? `高危破坏性变更警告！删除本体类「${result.targetLocalName}」将影响 ${result.affectedInstanceCount} 个实例、${result.brokenMappings.length} 条映射与 ${result.brokenCapabilities.length} 项能力。\n\n确认仍要归档删除此类吗？`
                    : `确认归档删除本体类「${result.targetLocalName}」吗？`;
                const { confirmed } = await ask({
                  title: result.riskLevel === "BREAKING" ? "高危破坏性变更确认" : "确认归档删除本体类",
                  description: warnMsg,
                  confirmLabel: "确认归档删除",
                  tone: "danger",
                });
                if (confirmed) deleteClassMutation.mutate(result.targetLocalName);
              }}
              className="px-2.5 py-1 rounded bg-rose-600 text-white text-[11px] font-medium hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
            >
              {deleteClassMutation.isPending ? "归档删除中..." : "确认归档删除此类"}
            </button>
          </div>
        </div>
      )}
      {confirmDialogNode}
    </div>
  );
}
