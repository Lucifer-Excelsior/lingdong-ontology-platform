import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { GaStatusResponse, OfflineLicensePayload } from "../../api/ga-client";
import { ModalDialog } from "../../shell/ModalDialog";

export function GovernanceGaBadges({ gaStatus }: { gaStatus?: GaStatusResponse }) {
  if (!gaStatus) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-700 font-medium">
        {gaStatus.auditHashAlgo === "SM3" ? "国密 SM3 审计链" : "SHA-256 审计链"}
      </span>
      <span
        className={`px-2.5 py-1 rounded-full font-mono font-medium ${
          gaStatus.graphCluster.healthy ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-700"
        }`}
      >
        图库模式：{gaStatus.graphCluster.mode} · {gaStatus.graphCluster.healthy ? "healthy" : "unhealthy"} (
        {gaStatus.graphCluster.latencyMs}ms)
      </span>
      <span
        className={`px-2.5 py-1 rounded-full font-medium ${
          gaStatus.offlineLicenseActive ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-800"
        }`}
      >
        Ed25519 离线证书：{gaStatus.offlineLicenseActive ? "已激活" : "默认授权"}
      </span>
    </div>
  );
}

interface GovernanceGaLicenseModalProps {
  open: boolean;
  workspaceId: string;
  demoSwitcherEnabled?: boolean;
  onClose: () => void;
  onActivated: (message: string) => void;
}

export function GovernanceGaLicenseModal({
  open,
  workspaceId,
  demoSwitcherEnabled = true,
  onClose,
  onActivated,
}: GovernanceGaLicenseModalProps) {
  const queryClient = useQueryClient();
  const [licenseText, setLicenseText] = useState("");
  const [verifiedPayload, setVerifiedPayload] = useState<OfflineLicensePayload | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  const issueDemoMutation = useMutation({
    mutationFn: () => api.issueDemoLicense(),
    onSuccess: (res) => {
      setLicenseText(res.licenseText);
      setVerifiedPayload(null);
      setFeedback({ tone: "info", text: `${res.message}（可尝试篡改任意字符测试 Ed25519 防篡改拦截）` });
    },
    onError: (err: Error) => {
      setFeedback({ tone: "error", text: err.message });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: () => api.uploadOfflineLicense(licenseText.trim()),
    onSuccess: (res) => {
      setVerifiedPayload(res.payload);
      setFeedback({ tone: "success", text: res.message });
      void queryClient.invalidateQueries({ queryKey: ["gov-license", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["ga-status", workspaceId] });
      onActivated(res.message);
    },
    onError: (err: Error) => {
      setVerifiedPayload(null);
      setFeedback({ tone: "error", text: err.message });
    },
  });

  return (
    <ModalDialog open={open} onClose={onClose} titleId="ga-license-modal-title" maxWidthClass="max-w-2xl">
      <div className="p-6 space-y-4 text-xs">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div>
            <h2 id="ga-license-modal-title" className="text-base font-semibold text-[var(--foreground)]">
              激活离线 Ed25519 商业授权证书 (.lic)
            </h2>
            <p className="text-[var(--muted-foreground)] mt-1">
              适用于内网离线/信创专有云部署。粘贴以 <code className="font-mono">LINGDONG-LIC-V4:</code> 开头的厂商签名证书，系统将使用 Ed25519 公钥完成离线验签。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            className="px-2 py-1 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--secondary)] cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="ga-lic-textarea" className="font-medium text-[var(--foreground)]">
              离线授权证书内容 (LINGDONG-LIC-V4)
            </label>
            {demoSwitcherEnabled && (
              <button
                type="button"
                disabled={issueDemoMutation.isPending}
                onClick={() => issueDemoMutation.mutate()}
                className="px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--secondary)]/80 font-medium text-[var(--foreground)] disabled:opacity-50 cursor-pointer"
              >
                {issueDemoMutation.isPending ? "签发中..." : "签发 Ed25519 测试证书"}
              </button>
            )}
          </div>
          <textarea
            id="ga-lic-textarea"
            rows={6}
            value={licenseText}
            onChange={(e) => setLicenseText(e.target.value)}
            placeholder="LINGDONG-LIC-V4:<base64url_payload>.<base64url_ed25519_signature>"
            className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--background)] font-mono text-[11px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
          />
        </div>

        {feedback && (
          <div
            role="status"
            className={`p-3 rounded-xl border leading-relaxed ${
              feedback.tone === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800"
                : feedback.tone === "error"
                ? "bg-red-500/10 border-red-500/30 text-red-700"
                : "bg-blue-500/10 border-blue-500/30 text-blue-800"
            }`}
          >
            <div className="font-semibold">
              {feedback.tone === "success"
                ? "Ed25519 签名验证通过并已激活"
                : feedback.tone === "error"
                ? "验签被拒绝 / 证书疑似被篡改"
                : "测试证书已生成"}
            </div>
            <div className="mt-0.5 break-all">{feedback.text}</div>
          </div>
        )}

        {verifiedPayload && (
          <div className="p-3.5 rounded-xl bg-[var(--secondary)]/70 border border-[var(--border)] grid grid-cols-2 gap-2.5">
            <div>
              <div className="text-[var(--muted-foreground)]">证书编号</div>
              <div className="font-mono font-semibold mt-0.5">{verifiedPayload.licenseId}</div>
            </div>
            <div>
              <div className="text-[var(--muted-foreground)]">授权主体</div>
              <div className="font-semibold mt-0.5">{verifiedPayload.licensedTo}</div>
            </div>
            <div>
              <div className="text-[var(--muted-foreground)]">席位 / 月度 Token 配额</div>
              <div className="font-mono mt-0.5">
                {verifiedPayload.maxUsers} 席位 · {verifiedPayload.monthlyLlmTokenQuota.toLocaleString()} tokens
              </div>
            </div>
            <div>
              <div className="text-[var(--muted-foreground)]">有效期至</div>
              <div className="font-mono mt-0.5">{verifiedPayload.expiresAt}</div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--secondary)] cursor-pointer"
          >
            关闭
          </button>
          <button
            type="button"
            disabled={!licenseText.trim() || uploadMutation.isPending}
            onClick={() => uploadMutation.mutate()}
            className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {uploadMutation.isPending ? "正在验签..." : "验签并激活授权"}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
