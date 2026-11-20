import { useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { FdeBundleImportResult } from "../api/types";
import { ROLE_TIPS } from "../utils/rbac";

interface FdeImportPanelProps {
  canModel?: boolean;
  onSwitchWorkspace?: (workspaceId: string) => void;
  onToast: (msg: string) => void;
}

export function FdeImportPanel({ canModel = true, onSwitchWorkspace, onToast }: FdeImportPanelProps) {
  const queryClient = useQueryClient();
  const [bundleFile, setBundleFile] = useState<File | null>(null);
  const [targetSlug, setTargetSlug] = useState("");
  const [credentialMappingJson, setCredentialMappingJson] = useState("");
  const [importResult, setImportResult] = useState<FdeBundleImportResult | null>(null);

  const importMutation = useMutation({
    mutationFn: () => {
      if (!bundleFile) throw new Error("请先选择导出的标准方案包 (.zip)");
      const fd = new FormData();
      fd.append("file", bundleFile);
      if (targetSlug.trim()) fd.append("targetSlug", targetSlug.trim());
      return api.importFdeBundle(fd, credentialMappingJson);
    },
    onSuccess: (res) => {
      setImportResult(res);
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      void queryClient.invalidateQueries({ queryKey: ["governance"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setBundleFile(event.target.files?.[0] ?? null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bundleFile) {
      onToast("请选择 .zip 不可变交付方案包后再执行验签还原");
      return;
    }
    importMutation.mutate();
  };

  return (
    <section className="p-5 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-4 text-xs">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            跨环境方案包密码学验签与一键还原 (FDE Zero-Secret Import)
          </h2>
          <p className="text-[var(--muted-foreground)] mt-0.5">
            校验归档内 <code className="font-mono">manifest.json</code> 声明的 SHA-256 摘要，拦截内嵌明文密钥，自动重建本体修订、SHACL 形状与凭据别名槽位。
          </p>
        </div>
        <span className="px-2.5 py-1 rounded bg-[var(--secondary)] font-mono text-[var(--muted-foreground)] shrink-0">
          SHA-256 Manifest Guard
        </span>
      </div>

      <form onSubmit={handleSubmit} method="POST" className="grid grid-cols-12 gap-3 items-end">
        <div className="col-span-5 space-y-1">
          <label htmlFor="fde-bundle-file" className="block font-medium">
            选择不可变交付方案包 (.zip)
          </label>
          <input
            id="fde-bundle-file"
            name="file"
            type="file"
            aria-label="选择不可变交付方案包 (.zip)"
            accept=".zip,application/zip"
            onChange={handleFileChange}
            className="w-full px-3 py-1.5 rounded-lg border border-dashed border-[var(--border)] bg-[var(--secondary)] cursor-pointer"
          />
        </div>

        <div className="col-span-4 space-y-1">
          <label htmlFor="fde-target-slug" className="block font-medium">
            目标方案空间标识覆盖（可选）
          </label>
          <input
            id="fde-target-slug"
            name="targetSlug"
            type="text"
            value={targetSlug}
            onChange={(e) => setTargetSlug(e.target.value)}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="例如：contract-staging"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
          />
        </div>

        <div className="col-span-3">
          <button
            type="submit"
            disabled={importMutation.isPending || !canModel}
            title={!canModel ? ROLE_TIPS.model : undefined}
            className="w-full py-2 px-3 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {importMutation.isPending ? "SHA-256 验签还原中..." : "验签 SHA-256 清单并一键还原方案空间"}
          </button>
        </div>

        <div className="col-span-12 space-y-1">
          <label htmlFor="fde-cred-mapping" className="block font-medium">
            跨环境凭据别名重绑 (JSON，可选)
          </label>
          <input
            id="fde-cred-mapping"
            name="credentialMappingJson"
            type="text"
            value={credentialMappingJson}
            onChange={(e) => setCredentialMappingJson(e.target.value)}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder='{"ERP_CONTRACT_DB":"PROD_DM8_FINANCE"}'
            className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
          />
        </div>
      </form>

      <div className="p-3 rounded-lg bg-[var(--secondary)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <div className="font-medium text-[var(--foreground)]">lingdong-cli 离线 CI/CD 验签交付命令</div>
          <code className="font-mono text-[11px] text-[var(--muted-foreground)] block truncate">
            npx lingdong-cli verify-bundle ./bundle.zip
          </code>
        </div>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText("npx lingdong-cli verify-bundle ./bundle.zip");
            onToast("已复制 lingdong-cli CI/CD 验签命令");
          }}
          className="px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--background)] font-medium cursor-pointer shrink-0"
        >
          复制命令
        </button>
      </div>

      {importResult && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm text-emerald-700">
              ✓ {importResult.checksumVerified ? "SHA-256 清单验签通过" : "已导入"}：{importResult.workspaceName} (
              <code className="font-mono">{importResult.workspaceSlug}</code> · rev:{importResult.revisionId})
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-mono">
              {importResult.version}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-[var(--foreground)]">
              还原规模：<strong>{importResult.classesRestored}</strong> 个 OWL 本体类 ·{" "}
              <strong>{importResult.propertiesRestored}</strong> 个属性定义 · 已同步至顶栏「方案空间」切换器
            </span>
            {onSwitchWorkspace ? (
              <button
                type="button"
                onClick={() => onSwitchWorkspace(importResult.workspaceId)}
                className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-medium hover:opacity-90 cursor-pointer shrink-0"
              >
                立即切换至新还原空间 →
              </button>
            ) : (
              <span className="px-2.5 py-1 rounded bg-emerald-600/15 text-emerald-800 font-medium shrink-0">
                请在左上角「方案空间」下拉菜单切换至「{importResult.workspaceName}」
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[var(--muted-foreground)]">验签通过文件：</span>
            {importResult.verifiedFiles.map((f) => (
              <code key={f} className="px-2 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] font-mono">
                ✓ {f}
              </code>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[var(--muted-foreground)]">零明文凭据槽位绑定：</span>
            {importResult.credentialAliasesBound.map((alias) => (
              <code key={alias} className="px-2 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] font-mono">
                🔑 {alias}
              </code>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
