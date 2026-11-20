import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../api/client";
import { ROLE_TIPS } from "../../utils/rbac";

interface QuarantineCsvToolsProps {
  workspaceId: string;
  canOperate: boolean;
  onReplayed: () => void;
  onToast: (msg: string) => void;
}

const SAMPLE_CSV = `row_key,source_table,violated_property,reason,repaired_expires_at
HT-2026-BAD1,public.contracts,ont:expiresAt,到期日早于签署日,2027-06-30`;

export function QuarantineCsvTools({
  workspaceId,
  canOperate,
  onReplayed,
  onToast,
}: QuarantineCsvToolsProps) {
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [exporting, setExporting] = useState(false);

  const importMutation = useMutation({
    mutationFn: () => api.importQuarantineCsv(workspaceId, csvText),
    onSuccess: (res) => {
      onReplayed();
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.downloadCommercialCsv(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/materializations/quarantine/export.csv`,
        `${workspaceId}-shacl-quarantine.csv`
      );
      onToast("已导出 SHACL 脏数据隔离记录 CSV");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "导出隔离记录 CSV 失败");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!csvText.trim()) return;
    importMutation.mutate();
  };

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-sm">SHACL 隔离数据离线修复与批量 CSV 重放工具</span>
        <button
          type="button"
          disabled={exporting}
          onClick={() => void handleExport()}
          className="px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)] font-medium disabled:opacity-50 cursor-pointer"
        >
          {exporting ? "导出中..." : "导出隔离记录 CSV"}
        </button>
      </div>

      <details className="rounded-lg border border-dashed border-[var(--border)] p-3">
        <summary className="font-medium text-[var(--primary)] cursor-pointer select-none">
          批量粘贴修复 CSV 重放（第 1 列 row_key，第 5 列 repaired_expires_at）
        </summary>
        <form onSubmit={handleImport} className="mt-2.5 space-y-2">
          <textarea
            rows={4}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            spellCheck={false}
            className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono text-[11px]"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!canOperate || importMutation.isPending}
              title={!canOperate ? ROLE_TIPS.operate : undefined}
              className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {importMutation.isPending ? "批量重放中..." : "提交 CSV 批量修复并重放入图"}
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
