import { useEffect, useState, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { RdfImportPrecheckResult } from "../api/types";
import { ModalDialog } from "../shell/ModalDialog";
import { ROLE_TIPS } from "../utils/rbac";
import { getWorkspaceCopy } from "../utils/workspaceCopy";

interface RdfImportModalProps {
  workspaceId: string;
  open: boolean;
  canModel?: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function RdfImportModal({
  workspaceId,
  open,
  canModel = true,
  onClose,
  onToast,
}: RdfImportModalProps) {
  const queryClient = useQueryClient();
  const copy = getWorkspaceCopy(workspaceId);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filename, setFilename] = useState(copy.turtleSampleFilename);
  const [rdfContent, setRdfContent] = useState("");
  const [result, setResult] = useState<RdfImportPrecheckResult | null>(null);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setSelectedFile(null);
      setRdfContent("");
    }
  }, [open]);

  useEffect(() => {
    setResult(null);
    setSelectedFile(null);
    setRdfContent("");
    setFilename(copy.turtleSampleFilename);
  }, [workspaceId, copy.turtleSampleFilename]);

  const importMutation = useMutation({
    mutationFn: (commitImmediately: boolean) => {
      if (selectedFile) {
        const fd = new FormData();
        fd.append("file", selectedFile);
        fd.append("commitImmediately", commitImmediately ? "true" : "false");
        return api.importOntologyRdf(workspaceId, fd);
      }
      return api.importOntologyRdf(workspaceId, {
        filename: filename.trim() || "imported-ontology.ttl",
        content: rdfContent.trim(),
        commitImmediately,
      });
    },
    onSuccess: (res) => {
      setResult(res);
      void queryClient.invalidateQueries({ queryKey: ["ontology", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["ontology-revisions", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["modeling", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const f = event.target.files?.[0] ?? null;
    setSelectedFile(f);
    if (f) setFilename(f.name);
  };

  const triggerImport = (commitImmediately: boolean) => {
    if (!canModel) return;
    if (!selectedFile && !rdfContent.trim()) {
      onToast("请选择 RDF 文件或粘贴标准 Turtle / RDF-XML / JSON-LD 文本");
      return;
    }
    importMutation.mutate(commitImmediately);
  };

  return (
    <ModalDialog open={open} onClose={onClose} titleId="rdf-import-title" maxWidthClass="max-w-2xl">
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <h2 id="rdf-import-title" className="text-base font-semibold">
          导入外部标准本体与 SHACL 形状 (Turtle / RDF-XML / N-Triples / JSON-LD)
        </h2>
        <button
          type="button"
          aria-label="关闭 RDF 导入向导"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[var(--secondary)] text-xs cursor-pointer"
        >
          ✕
        </button>
      </div>

      <form
        method="POST"
        onSubmit={(e) => {
          e.preventDefault();
          triggerImport(false);
        }}
        className="p-5 space-y-3.5 text-xs max-h-[82vh] overflow-y-auto"
      >
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-7 space-y-1">
            <label htmlFor="rdf-import-file" className="block font-medium">
              上传本体文件 (.ttl / .rdf / .owl / .nt / .nq / .jsonld)
            </label>
            <input
              id="rdf-import-file"
              name="file"
              type="file"
              accept=".ttl,.rdf,.owl,.nt,.nq,.jsonld"
              onChange={handleFileChange}
              className="w-full px-3 py-1.5 rounded-lg border border-dashed border-[var(--border)] bg-[var(--secondary)] cursor-pointer"
            />
          </div>
          <div className="col-span-5 space-y-1">
            <label htmlFor="rdf-import-filename" className="block font-medium">
              溯源文件名标识
            </label>
            <input
              id="rdf-import-filename"
              name="filename"
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label htmlFor="rdf-import-content" className="font-medium">
              或直接粘贴标准 RDF / Turtle 源码
            </label>
            <button
              type="button"
              onClick={() => {
                setSelectedFile(null);
                setFilename(copy.turtleSampleFilename);
                setRdfContent(copy.turtleSampleContent);
              }}
              className="px-2.5 py-1 rounded bg-[var(--secondary)] text-[var(--primary)] font-medium hover:opacity-90 cursor-pointer"
            >
              {copy.turtleSampleBtn}
            </button>
          </div>
          <textarea
            id="rdf-import-content"
            name="content"
            rows={7}
            value={rdfContent}
            onChange={(e) => setRdfContent(e.target.value)}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={copy.turtleSamplePlaceholder}
            className="w-full p-3 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono leading-relaxed"
          />
        </div>

        {result && (
          <div className="p-3.5 rounded-xl bg-[var(--secondary)] border border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between gap-2 font-medium">
              <span>
                解析格式：<code className="font-mono">{result.formatDetected}</code> · 三元组：
                <strong className="mx-1">{result.parsedTriples}</strong>条 · 生成提案：
                <strong className="mx-1">{result.proposalsQueuedCount}</strong>项
              </span>
              <span
                className={`px-2 py-0.5 rounded ${
                  result.committed
                    ? "bg-emerald-500/15 text-emerald-700"
                    : "bg-blue-500/15 text-blue-700"
                }`}
              >
                {result.committed ? `已原子合入 rev:${result.revisionId ?? ""}` : "已入待审 ChangeSet 队列"}
              </span>
            </div>
            <div className="text-[var(--muted-foreground)]">
              识别本体类 ({result.discoveredClasses.length})：
              {result.discoveredClasses.map((c) => `${c.labelZh}(${c.localName})`).join("、") || "无"} · 识别属性 (
              {result.discoveredProperties.length})：
              {result.discoveredProperties.map((p) => `${p.labelZh}(${p.localName})`).join("、") || "无"}
            </div>
            {result.conflicts.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-[var(--border)] text-amber-700">
                <div className="font-semibold">发现 {result.conflicts.length} 项命名空间/同名冲突预警：</div>
                {result.conflicts.map((cf, idx) => (
                  <div key={idx} className="font-mono">
                    [{cf.conflictType}] {cf.entityKind} {cf.localName} — {cf.detail}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="pt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] font-medium hover:bg-[var(--secondary)] cursor-pointer"
          >
            关闭
          </button>
          <button
            type="submit"
            disabled={importMutation.isPending || !canModel}
            title={!canModel ? ROLE_TIPS.model : undefined}
            className="px-3.5 py-1.5 rounded-lg border border-[var(--primary)] text-[var(--primary)] font-medium hover:bg-[var(--secondary)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            运行导入冲突预检并入待审队列
          </button>
          <button
            type="button"
            disabled={importMutation.isPending || !canModel}
            title={!canModel ? ROLE_TIPS.model : undefined}
            onClick={() => triggerImport(true)}
            className="px-4 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            预检无误并立即合入画布
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
