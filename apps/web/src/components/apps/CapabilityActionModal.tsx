import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uxCrudApi } from "../../api/ux-crud-client";
import type { AutonomyTier, Capability } from "../../api/types";
import { ModalDialog } from "../../shell/ModalDialog";

interface CapabilityActionModalProps {
  open: boolean;
  mode: "trigger" | "edit";
  workspaceId: string;
  capability: Capability | null;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function CapabilityActionModal({
  open,
  mode,
  workspaceId,
  capability,
  onClose,
  onToast,
}: CapabilityActionModalProps) {
  const queryClient = useQueryClient();
  const [contractNo, setContractNo] = useState("HT-2026-0041");
  const [targetObjectLabel, setTargetObjectLabel] = useState("");
  const [paramsSummary, setParamsSummary] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [autonomyTier, setAutonomyTier] = useState<AutonomyTier>("READ");
  const [targetEntityLocalName, setTargetEntityLocalName] = useState("");
  const [mcpExposed, setMcpExposed] = useState(false);

  useEffect(() => {
    if (!capability || !open) return;
    setContractNo("HT-2026-0041");
    setTargetObjectLabel(`${capability.targetEntityLocalName} · HT-2026-0041`);
    setParamsSummary(`试运行 ${capability.name}`);
    setName(capability.name);
    setDescription(capability.description);
    setAutonomyTier(capability.autonomyTier);
    setTargetEntityLocalName(capability.targetEntityLocalName);
    setMcpExposed(capability.mcpExposed);
  }, [capability, open]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["apps", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["governance", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["portal", workspaceId] });
  };

  const triggerMutation = useMutation({
    mutationFn: () =>
      uxCrudApi.triggerCapability(workspaceId, capability!.id, {
        contractNo: contractNo.trim() || undefined,
        targetObjectLabel: targetObjectLabel.trim() || undefined,
        paramsSummary: paramsSummary.trim() || undefined,
      }),
    onSuccess: (res) => {
      invalidate();
      onToast(`${res.message}（计划 ${res.planCode} 已写入下方执行台账）`);
      onClose();
    },
    onError: (err: Error) => onToast(err.message),
  });

  const canExposeMcp = autonomyTier === "READ" || autonomyTier === "DRAFT";

  const updateMutation = useMutation({
    mutationFn: () =>
      uxCrudApi.updateCapability(workspaceId, capability!.id, {
        name: name.trim(),
        description: description.trim(),
        autonomyTier,
        targetEntityLocalName: targetEntityLocalName.trim(),
        mcpExposed: canExposeMcp ? mcpExposed : false,
      }),
    onSuccess: (res) => {
      invalidate();
      onToast(res.message);
      onClose();
    },
    onError: (err: Error) => onToast(err.message),
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!capability) return;
    if (mode === "trigger") {
      triggerMutation.mutate();
    } else {
      if (!name.trim() || !description.trim()) return;
      updateMutation.mutate();
    }
  };

  const pending = triggerMutation.isPending || updateMutation.isPending;

  return (
    <ModalDialog open={open && Boolean(capability)} onClose={onClose} titleId="cap-action-modal-title" maxWidthClass="max-w-lg">
      <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div>
            <h2 id="cap-action-modal-title" className="text-base font-semibold">
              {mode === "trigger" ? `试运行受控能力 · ${capability?.name ?? ""}` : `编辑受控能力 · ${capability?.code ?? ""}`}
            </h2>
            <p className="text-[var(--muted-foreground)] mt-0.5 font-mono">
              {capability?.code} · ont:{capability?.targetEntityLocalName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            className="px-2 py-1 rounded hover:bg-[var(--secondary)] text-[var(--muted-foreground)] cursor-pointer"
          >
            ✕
          </button>
        </div>

        {mode === "trigger" ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="cap-trig-contract" className="block font-medium">目标合同号 / 对象键</label>
              <input
                id="cap-trig-contract"
                type="text"
                value={contractNo}
                onChange={(e) => setContractNo(e.target.value)}
                placeholder="例如：HT-2026-0041"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="cap-trig-label" className="block font-medium">目标对象展示标识</label>
              <input
                id="cap-trig-label"
                type="text"
                value={targetObjectLabel}
                onChange={(e) => setTargetObjectLabel(e.target.value)}
                placeholder="例如：华东智算中心扩容合同"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="cap-trig-params" className="block font-medium">执行参数与上下文说明</label>
              <textarea
                id="cap-trig-params"
                rows={3}
                value={paramsSummary}
                onChange={(e) => setParamsSummary(e.target.value)}
                placeholder="输入试运行参数摘要，系统将按四级自治门禁生成不可变执行计划..."
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="cap-edit-name" className="block font-medium">业务动作名称</label>
              <input
                id="cap-edit-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="cap-edit-tier" className="block font-medium">四级自治门禁</label>
                <select
                  id="cap-edit-tier"
                  value={autonomyTier}
                  onChange={(e) => setAutonomyTier(e.target.value as AutonomyTier)}
                  className="w-full px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
                >
                  <option value="READ">1 · READ 只读</option>
                  <option value="DRAFT">2 · DRAFT 起草</option>
                  <option value="CONFIRM">3 · CONFIRM 确认</option>
                  <option value="APPROVE">4 · APPROVE 审批</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="cap-edit-entity" className="block font-medium">目标本体类</label>
                <input
                  id="cap-edit-entity"
                  type="text"
                  required
                  value={targetEntityLocalName}
                  onChange={(e) => setTargetEntityLocalName(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="cap-edit-desc" className="block font-medium">能力职责与约束说明</label>
              <textarea
                id="cap-edit-desc"
                rows={3}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]"
              />
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canExposeMcp}
                checked={canExposeMcp && mcpExposed}
                onChange={(e) => setMcpExposed(e.target.checked)}
                className="accent-[var(--primary)]"
              />
              <span className={!canExposeMcp ? "opacity-50" : ""}>暴露为只读 MCP 工具（仅 READ / DRAFT）</span>
            </label>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)] cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {pending ? "处理中..." : mode === "trigger" ? "生成执行计划" : "保存变更"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
