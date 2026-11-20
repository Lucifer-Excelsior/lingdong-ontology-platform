import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { ModalDialog } from "../shell/ModalDialog";
import { ROLE_TIPS } from "../utils/rbac";

interface DocumentUploadModalProps {
  workspaceId: string;
  open: boolean;
  canModel?: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

function isImageFile(file: File | null): boolean {
  if (!file) return false;
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|svg)$/i.test(file.name);
}

export function DocumentUploadModal({
  workspaceId,
  open,
  canModel = true,
  onClose,
  onToast,
}: DocumentUploadModalProps) {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");

  const imageSelected = isImageFile(selectedFile);

  useEffect(() => {
    if (!selectedFile || !isImageFile(selectedFile)) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (selectedFile) {
        const fd = new FormData();
        fd.append("file", selectedFile);
        if (docTitle.trim()) fd.append("title", docTitle.trim());
        if (docContent.trim()) fd.append("content", docContent.trim());
        return api.uploadDocumentMultipart(workspaceId, fd);
      }
      return api.uploadDocument(workspaceId, {
        title: docTitle.trim(),
        content: docContent.trim(),
      });
    },
    onSuccess: (doc) => {
      void queryClient.invalidateQueries({ queryKey: ["modeling", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
      setSelectedFile(null);
      setDocTitle("");
      setDocContent("");
      onClose();
      onToast(`已完成《${doc.title}》解析入池 (${doc.parserStatus} · ${doc.chunkCount} 个证据块)`);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const f = event.target.files?.[0] ?? null;
    setSelectedFile(f);
    if (f && !docTitle.trim()) {
      setDocTitle(f.name);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile && (!docTitle.trim() || !docContent.trim())) {
      onToast("请选择文档或图片文件，或填写资料标题与正文内容");
      return;
    }
    uploadMutation.mutate();
  };

  return (
    <ModalDialog open={open} onClose={onClose} titleId="upload-doc-title" maxWidthClass="max-w-lg">
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <h2 id="upload-doc-title" className="text-base font-semibold">
          上传文档或多模态图件（PDF / DOCX / MD / PNG / JPG / SVG）
        </h2>
        <button
          type="button"
          aria-label="关闭上传弹窗"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[var(--secondary)] text-xs cursor-pointer"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} method="POST" className="p-5 space-y-3.5 text-xs">
        <div className="space-y-1">
          <label htmlFor="upload-doc-file" className="block font-medium">
            上传文档或多模态图件（PDF / DOCX / MD / PNG / JPG / SVG）
          </label>
          <input
            id="upload-doc-file"
            name="file"
            type="file"
            accept=".pdf,.docx,.md,.txt,.png,.jpg,.jpeg,.webp,.svg"
            onChange={handleFileChange}
            className="w-full px-3 py-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--secondary)] cursor-pointer"
          />
        </div>

        {imageSelected && previewUrl && selectedFile && (
          <div className="p-2.5 rounded-lg border border-purple-500/30 bg-purple-500/[0.04] space-y-2">
            <div className="flex items-center justify-between text-[11px] text-purple-700 font-medium">
              <span>🖼️ 多模态图件预览（ER 图 / 流程图 / 扫描表）</span>
              <span className="font-mono">{Math.max(1, Math.round(selectedFile.size / 1024))} KB</span>
            </div>
            <img
              src={previewUrl}
              alt={selectedFile.name}
              className="max-h-40 w-full rounded-md border border-[var(--border)] object-contain bg-[var(--background)]"
            />
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="upload-doc-name" className="block font-medium">
            资料或图件名称
          </label>
          <input
            id="upload-doc-name"
            name="title"
            type="text"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="例如：合同履约核心 ER 架构图.png 或 2026 算力采购管理规范.pdf"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="upload-doc-body" className="block font-medium">
            {imageSelected
              ? "图件/多模态语义标注说明（可选，辅助识别图中实体、关系与字段口径）"
              : "或直接粘贴条款正文（未选择文件时必填）"}
          </label>
          <textarea
            id="upload-doc-body"
            name="content"
            rows={4}
            value={docContent}
            onChange={(e) => setDocContent(e.target.value)}
            placeholder={
              imageSelected
                ? "例如：该 ER 图展示了合同主表 (contracts) 与续签跟进任务 (follow_up_tasks) 之间的 1:N 关联，重点核对违约金上限字段..."
                : "例如：第一条 凡算力租赁框架合同金额超过 300 万元，须在到期前 45 个自然日发起续签评估..."
            }
            className="w-full p-3 rounded-lg border border-[var(--border)] bg-[var(--background)]"
          />
        </div>

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
            disabled={uploadMutation.isPending || !canModel}
            title={!canModel ? ROLE_TIPS.model : undefined}
            className="px-4 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {uploadMutation.isPending ? "解析入池中..." : "解析并加入多源证据池"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
