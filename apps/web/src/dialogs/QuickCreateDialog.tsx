import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type QuickCreatePayload } from "../api/client";
import { ModalDialog } from "../shell/ModalDialog";
import { ROLE_TIPS } from "../utils/rbac";
import { getWorkspaceCopy } from "../utils/workspaceCopy";

type AssetKind = QuickCreatePayload["assetKind"];

interface QuickCreateDialogProps {
  open: boolean;
  defaultKind?: AssetKind;
  workspaceId: string;
  canModel?: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function QuickCreateDialog({
  open,
  defaultKind = "OWL_CLASS",
  workspaceId,
  canModel = true,
  onClose,
  onToast,
}: QuickCreateDialogProps) {
  const queryClient = useQueryClient();
  const copy = getWorkspaceCopy(workspaceId);
  const [assetKind, setAssetKind] = useState<AssetKind>(defaultKind);
  const [labelZh, setLabelZh] = useState("");
  const [localName, setLocalName] = useState("");
  const [extraConfig, setExtraConfig] = useState("");

  useEffect(() => {
    if (open) {
      setAssetKind(defaultKind);
      setLabelZh("");
      setLocalName(defaultKind === "COMPETENCY_QUESTION" ? "CQ-04" : "");
      setExtraConfig(defaultKind === "COMPETENCY_QUESTION" ? copy.defaultConceptsCsv : "");
    }
  }, [open, defaultKind, copy.defaultConceptsCsv]);

  const handleKindChange = (nextKind: AssetKind) => {
    setAssetKind(nextKind);
    setLabelZh("");
    setLocalName(nextKind === "COMPETENCY_QUESTION" ? "CQ-04" : "");
    setExtraConfig(nextKind === "COMPETENCY_QUESTION" ? copy.defaultConceptsCsv : "");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (assetKind === "COMPETENCY_QUESTION") {
        const concepts = extraConfig
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        await api.createCompetencyQuestion(workspaceId, {
          workspaceId,
          code: localName.trim(),
          question: labelZh.trim(),
          coveredConcepts: concepts.length > 0 ? concepts : [copy.defaultConcept],
          boundCapability: copy.defaultCapability,
        });
        return `已新增能力问题 ${localName.trim()} 并纳入回归追踪表`;
      }
      const res = await api.quickCreate(workspaceId, {
        workspaceId,
        assetKind,
        labelZh: labelZh.trim(),
        localName: localName.trim(),
        extraConfig: extraConfig.trim() || undefined,
      });
      return res.message;
    },
    onSuccess: (message) => {
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["modeling", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["ontology", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["data", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["apps", workspaceId] });
      onToast(message);
      onClose();
    },
    onError: (err: Error) => {
      onToast(err.message);
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      const firstInvalid = form.querySelector<HTMLElement>(":invalid");
      firstInvalid?.focus();
      return;
    }
    createMutation.mutate();
  };

  const isCq = assetKind === "COMPETENCY_QUESTION";

  return (
    <ModalDialog open={open} onClose={onClose} titleId="crt-title" maxWidthClass="max-w-md">
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <h2 id="crt-title" className="text-base font-semibold">
          {isCq ? "新增方案能力问题 (CQ)" : "快速新建受治理资产"}
        </h2>
        <button
          type="button"
          aria-label="关闭新建弹窗"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[var(--secondary)] text-xs cursor-pointer"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} method="POST" className="p-5 space-y-3.5 text-xs">
        <div className="space-y-1">
          <label htmlFor="qc-asset-kind" className="block font-medium">
            资产类型
          </label>
          <select
            id="qc-asset-kind"
            name="assetKind"
            value={assetKind}
            onChange={(e) => handleKindChange(e.target.value as AssetKind)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]"
          >
            <option value="OWL_CLASS">本体实体类 (OWL Class)</option>
            <option value="PROPERTY">对象关系 / 数据属性 (Property)</option>
            <option value="DATA_SOURCE">企业数据源连接 (PostgreSQL / HTTP)</option>
            <option value="COMPETENCY_QUESTION">方案能力问题 (Competency Question)</option>
            <option value="CONTROLLED_ACTION">受控业务动作 (Controlled Action)</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="qc-label-zh" className="block font-medium">
            {isCq ? "能力问题描述 *" : "中文业务名称 *"}
          </label>
          <input
            id="qc-label-zh"
            name="labelZh"
            type="text"
            required
            minLength={isCq ? 4 : 1}
            maxLength={isCq ? 300 : 80}
            value={labelZh}
            onChange={(e) => {
              e.currentTarget.setCustomValidity("");
              setLabelZh(e.target.value);
            }}
            placeholder={isCq ? copy.cqPlaceholder : "例如：业务实体节点"}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="qc-local-name" className="block font-medium">
            {isCq ? "问题编号 (Code) *" : "技术标识符 (Local Name) *"}
          </label>
          <input
            id="qc-local-name"
            name="localName"
            type="text"
            required
            pattern="^[A-Za-z][A-Za-z0-9_\-]*$"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={localName}
            onChange={(e) => {
              e.currentTarget.setCustomValidity("");
              setLocalName(e.target.value);
            }}
            onInvalid={(e) =>
              e.currentTarget.setCustomValidity("需以英文字母开头，仅含字母、数字、下划线或连字符")
            }
            placeholder={isCq ? "例如：CQ-04" : "例如：PaymentMilestone"}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
          />
        </div>

        {isCq && (
          <div className="space-y-1">
            <label htmlFor="qc-extra-concepts" className="block font-medium">
              覆盖本体概念（逗号分隔）
            </label>
            <input
              id="qc-extra-concepts"
              name="coveredConcepts"
              type="text"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={extraConfig}
              onChange={(e) => setExtraConfig(e.target.value)}
              placeholder={copy.defaultConceptsCsv}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
            />
          </div>
        )}

        <div className="pt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-[var(--border)] font-medium hover:bg-[var(--secondary)] cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending || !canModel}
            title={!canModel ? ROLE_TIPS.model : undefined}
            className="px-4 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {createMutation.isPending ? "保存中..." : isCq ? "新增 CQ" : "加入草稿"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
