import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { OntologyClass } from "../api/types";
import { ModalDialog } from "../shell/ModalDialog";
import { ROLE_TIPS } from "../utils/rbac";

interface ConnectEdgeModalProps {
  workspaceId: string;
  open: boolean;
  classes: OntologyClass[];
  initialSource: string;
  initialTarget: string;
  canModel?: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function ConnectEdgeModal({
  workspaceId,
  open,
  classes,
  initialSource,
  initialTarget,
  canModel = true,
  onClose,
  onToast,
}: ConnectEdgeModalProps) {
  const queryClient = useQueryClient();
  const [sourceCls, setSourceCls] = useState(initialSource || classes[0]?.localName || "");
  const [targetCls, setTargetCls] = useState(initialTarget || classes[1]?.localName || classes[0]?.localName || "");
  const [labelZh, setLabelZh] = useState("");
  const [localName, setLocalName] = useState("");

  useEffect(() => {
    if (!open) return;
    const valid = new Set(classes.map((c) => c.localName));
    setSourceCls(valid.has(initialSource) ? initialSource : classes[0]?.localName ?? "");
    setTargetCls(
      valid.has(initialTarget)
        ? initialTarget
        : classes[1]?.localName ?? classes[0]?.localName ?? ""
    );
  }, [open, initialSource, initialTarget, classes]);

  const authorMutation = useMutation({
    mutationFn: (commitImmediately: boolean) =>
      api.authorOntologyElement(workspaceId, {
        kind: "ADD_OBJECT_PROPERTY",
        labelZh: labelZh.trim(),
        localName: localName.trim(),
        sourceClassLocalName: sourceCls,
        targetOrDatatype: targetCls,
        commitImmediately,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["ontology", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["modeling", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
      setLabelZh("");
      setLocalName("");
      onClose();
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const canSubmit = Boolean(labelZh.trim() && localName.trim() && sourceCls && targetCls);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !canModel) return;
    authorMutation.mutate(true);
  };

  return (
    <ModalDialog open={open} onClose={onClose} titleId="connect-edge-title" maxWidthClass="max-w-md">
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <h2 id="connect-edge-title" className="text-base font-semibold">
          建立本体对象关系 (ObjectProperty 连线)
        </h2>
        <button
          type="button"
          aria-label="关闭对象关系弹窗"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[var(--secondary)] text-xs cursor-pointer"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} method="POST" className="p-5 space-y-3.5 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="edge-source-cls" className="block font-medium">
              起点定义域 (Domain)
            </label>
            <select
              id="edge-source-cls"
              name="sourceClass"
              value={sourceCls}
              onChange={(e) => setSourceCls(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
            >
              {classes.map((c) => (
                <option key={c.localName} value={c.localName}>
                  ont:{c.localName} ({c.labelZh})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="edge-target-cls" className="block font-medium">
              终点值域 (Range)
            </label>
            <select
              id="edge-target-cls"
              name="targetClass"
              value={targetCls}
              onChange={(e) => setTargetCls(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
            >
              {classes.map((c) => (
                <option key={c.localName} value={c.localName}>
                  ont:{c.localName} ({c.labelZh})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="edge-label-zh" className="block font-medium">
            中文关系名称 *
          </label>
          <input
            id="edge-label-zh"
            name="labelZh"
            type="text"
            required
            value={labelZh}
            onChange={(e) => setLabelZh(e.target.value)}
            placeholder="例如：经办责任人"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="edge-local-name" className="block font-medium">
            英文技术标识符 (Local Name) *
          </label>
          <input
            id="edge-local-name"
            name="localName"
            type="text"
            required
            pattern="[A-Za-z][A-Za-z0-9_]*"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="例如：managedBy"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
          />
        </div>

        <div className="pt-2 flex justify-end gap-2">
          <button
            type="button"
            disabled={!canSubmit || authorMutation.isPending || !canModel}
            title={!canModel ? ROLE_TIPS.model : undefined}
            onClick={() => authorMutation.mutate(false)}
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] font-medium hover:bg-[var(--secondary)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            仅加入待审 ChangeSet
          </button>
          <button
            type="submit"
            disabled={!canSubmit || authorMutation.isPending || !canModel}
            title={!canModel ? ROLE_TIPS.model : undefined}
            className="px-4 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {authorMutation.isPending ? "合入中..." : "创建并立即合入画布"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
