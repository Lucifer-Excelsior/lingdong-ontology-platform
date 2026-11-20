import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { WebhookTestResult } from "../../api/commercial-client";
import type { Capability } from "../../api/types";
import { ROLE_TIPS } from "../../utils/rbac";

interface WebhookDebuggerPanelProps {
  workspaceId: string;
  capabilities: Capability[];
  canModel: boolean;
  onToast: (msg: string) => void;
}

export function WebhookDebuggerPanel({
  workspaceId,
  capabilities,
  canModel,
  onToast,
}: WebhookDebuggerPanelProps) {
  const defaultCode =
    capabilities.find((c) => c.code === "CreateFollowUpTask")?.code ??
    capabilities[0]?.code ??
    "CreateFollowUpTask";
  const [capCode, setCapCode] = useState(defaultCode);
  const [webhookUrl, setWebhookUrl] = useState("https://erp-hook.example/api/follow-up");
  const [method, setMethod] = useState<"POST" | "PATCH" | "PUT">("POST");
  const [result, setResult] = useState<WebhookTestResult | null>(null);

  const testMutation = useMutation({
    mutationFn: () =>
      api.testCapabilityWebhook(workspaceId, capCode, {
        webhookUrl: webhookUrl.trim(),
        method,
        samplePayload: { dryRun: true, capabilityCode: capCode, workspaceId },
      }),
    onSuccess: (res) => {
      setResult(res);
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!webhookUrl.trim()) return;
    testMutation.mutate();
  };

  return (
    <details className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-xs">
      <summary className="font-semibold text-sm text-[var(--primary)] cursor-pointer select-none">
        外部 HTTP Webhook 执行器调试台（支持幂等键透传与 SSRF 拦截演练）
      </summary>
      <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-12 gap-3 items-end">
        <div className="col-span-3 space-y-1">
          <label htmlFor="wh-cap-code" className="block font-medium">目标受控能力</label>
          <select
            id="wh-cap-code"
            value={capCode}
            onChange={(e) => setCapCode(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono"
          >
            {capabilities.length > 0 ? (
              capabilities.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))
            ) : (
              <option value="CreateFollowUpTask">CreateFollowUpTask</option>
            )}
          </select>
        </div>
        <div className="col-span-2 space-y-1">
          <label htmlFor="wh-method" className="block font-medium">HTTP 方法</label>
          <select
            id="wh-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as "POST" | "PATCH" | "PUT")}
            className="w-full px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono"
          >
            <option value="POST">POST</option>
            <option value="PATCH">PATCH</option>
            <option value="PUT">PUT</option>
          </select>
        </div>
        <div className="col-span-5 space-y-1">
          <label htmlFor="wh-url" className="block font-medium">外部业务系统 Webhook 地址</label>
          <input
            id="wh-url"
            type="text"
            required
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            spellCheck={false}
            className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono"
          />
        </div>
        <div className="col-span-2">
          <button
            type="submit"
            disabled={!canModel || testMutation.isPending}
            title={!canModel ? ROLE_TIPS.model : undefined}
            className="w-full py-1.5 px-3 rounded bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {testMutation.isPending ? "拨测中..." : "Dry-Run 拨测"}
          </button>
        </div>
      </form>

      {result && (
        <div className="mt-3 p-3 rounded-lg bg-[var(--secondary)] border border-[var(--border)] space-y-1.5">
          <div className="flex flex-wrap items-center gap-3 font-mono">
            <span className={result.ok ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
              HTTP {result.httpStatus}
            </span>
            <span>延迟 {result.latencyMs}ms</span>
            <span>Idempotency-Key: {result.idempotencyKey}</span>
          </div>
          <pre className="p-2 rounded bg-[var(--background)] border border-[var(--border)] overflow-x-auto font-mono text-[11px]">
            {result.responsePreview}
          </pre>
        </div>
      )}
    </details>
  );
}
