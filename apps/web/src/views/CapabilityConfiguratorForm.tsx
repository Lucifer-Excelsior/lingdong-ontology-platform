import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AutonomyTier, RiskLevel } from "../api/types";
import { ROLE_TIPS } from "../utils/rbac";
import { getWorkspaceCopy } from "../utils/workspaceCopy";

interface CapabilityConfiguratorFormProps {
  workspaceId: string;
  canModel?: boolean;
  onToast: (msg: string) => void;
}

export function CapabilityConfiguratorForm({
  workspaceId,
  canModel = true,
  onToast,
}: CapabilityConfiguratorFormProps) {
  const queryClient = useQueryClient();
  const copy = getWorkspaceCopy(workspaceId);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [autonomyTier, setAutonomyTier] = useState<AutonomyTier>("CONFIRM");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("MEDIUM");
  const [targetEntityLocalName, setTargetEntityLocalName] = useState(copy.defaultConcept);

  useEffect(() => {
    setTargetEntityLocalName(copy.defaultConcept);
  }, [workspaceId, copy.defaultConcept]);
  const [compensationCode, setCompensationCode] = useState("");
  const [executionTemplate, setExecutionTemplate] = useState("");
  const [description, setDescription] = useState("");
  const [mcpExposed, setMcpExposed] = useState(false);

  const canExposeMcp = autonomyTier === "READ" || autonomyTier === "DRAFT";

  const configMutation = useMutation({
    mutationFn: () =>
      api.configureCapability(workspaceId, {
        code: code.trim(),
        name: name.trim(),
        autonomyTier,
        riskLevel,
        targetEntityLocalName: targetEntityLocalName.trim(),
        description: description.trim(),
        executionTemplate: executionTemplate.trim() || undefined,
        compensationCapabilityCode: compensationCode.trim() || null,
        mcpExposed: canExposeMcp ? mcpExposed : false,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["apps", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
      setCode("");
      setName("");
      setDescription("");
      setExecutionTemplate("");
      setCompensationCode("");
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim() || !name.trim() || !description.trim()) return;
    configMutation.mutate();
  };

  return (
    <details className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-xs">
      <summary className="font-semibold text-sm text-[var(--primary)] cursor-pointer select-none">
        + 可视化编排注册新受控业务动作
      </summary>
      <form onSubmit={handleSubmit} method="POST" className="mt-4 grid grid-cols-12 gap-3 items-end">
        <div className="col-span-3 space-y-1">
          <label htmlFor="cap-code-input" className="block font-medium">
            能力动作编码 (PascalCase)
          </label>
          <input
            id="cap-code-input"
            name="code"
            type="text"
            required
            pattern="^[A-Za-z][A-Za-z0-9_]*$"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="DispatchLegalNotice"
            className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono"
          />
        </div>

        <div className="col-span-3 space-y-1">
          <label htmlFor="cap-name-input" className="block font-medium">
            业务动作名称
          </label>
          <input
            id="cap-name-input"
            name="name"
            type="text"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="签发逾期催告通知单"
            className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)]"
          />
        </div>

        <div className="col-span-2 space-y-1">
          <label htmlFor="cap-tier-select" className="block font-medium">
            四级自治门禁
          </label>
          <select
            id="cap-tier-select"
            name="autonomyTier"
            value={autonomyTier}
            onChange={(e) => setAutonomyTier(e.target.value as AutonomyTier)}
            className="w-full px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono"
          >
            <option value="READ">1 · READ 只读</option>
            <option value="DRAFT">2 · DRAFT 起草</option>
            <option value="CONFIRM">3 · CONFIRM 确认</option>
            <option value="APPROVE">4 · APPROVE 独立审批</option>
          </select>
        </div>

        <div className="col-span-2 space-y-1">
          <label htmlFor="cap-risk-select" className="block font-medium">
            风险等级
          </label>
          <select
            id="cap-risk-select"
            name="riskLevel"
            value={riskLevel}
            onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}
            className="w-full px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono"
          >
            <option value="NONE">NONE (无副作用)</option>
            <option value="LOW">LOW (低风险)</option>
            <option value="MEDIUM">MEDIUM (中风险)</option>
            <option value="HIGH">HIGH (高风险写)</option>
          </select>
        </div>

        <div className="col-span-2 space-y-1">
          <label htmlFor="cap-entity-input" className="block font-medium">
            目标本体类
          </label>
          <input
            id="cap-entity-input"
            name="targetEntityLocalName"
            type="text"
            required
            value={targetEntityLocalName}
            onChange={(e) => setTargetEntityLocalName(e.target.value)}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono"
          />
        </div>

        <div className="col-span-4 space-y-1">
          <label htmlFor="cap-desc-input" className="block font-medium">
            能力职责与后置 SHACL 约束说明
          </label>
          <input
            id="cap-desc-input"
            name="description"
            type="text"
            required
            minLength={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="校验合同逾期状态并生成催告记录，写后执行 SHACL 状态核验"
            className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)]"
          />
        </div>

        <div className="col-span-3 space-y-1">
          <label htmlFor="cap-tpl-input" className="block font-medium">
            执行模板（SQL / SPARQL / API 可选）
          </label>
          <input
            id="cap-tpl-input"
            name="executionTemplate"
            type="text"
            value={executionTemplate}
            onChange={(e) => setExecutionTemplate(e.target.value)}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="POST /erp/notices/{contractNo}"
            className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono"
          />
        </div>

        <div className="col-span-2 space-y-1">
          <label htmlFor="cap-comp-input" className="block font-medium">
            失败补偿动作编码
          </label>
          <input
            id="cap-comp-input"
            name="compensationCapabilityCode"
            type="text"
            value={compensationCode}
            onChange={(e) => setCompensationCode(e.target.value)}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="RevertNoticeStatus"
            className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono"
          />
        </div>

        <div className="col-span-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <input
              id="cap-mcp-chk"
              name="mcpExposed"
              type="checkbox"
              disabled={!canExposeMcp}
              checked={canExposeMcp && mcpExposed}
              onChange={(e) => setMcpExposed(e.target.checked)}
              className="accent-[var(--primary)]"
            />
            <label htmlFor="cap-mcp-chk" className={!canExposeMcp ? "opacity-50" : ""}>
              暴露只读 MCP
            </label>
          </div>
          <button
            type="submit"
            disabled={configMutation.isPending || !canModel}
            title={!canModel ? ROLE_TIPS.model : undefined}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {configMutation.isPending ? "保存中..." : "注册编排动作"}
          </button>
        </div>
      </form>
    </details>
  );
}
