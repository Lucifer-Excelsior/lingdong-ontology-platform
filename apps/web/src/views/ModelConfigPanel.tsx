import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { api } from "../api/client";
import { getRolePermissions, ROLE_TIPS } from "../utils/rbac";

interface ModelConfigPanelProps {
  currentRole?: string;
}

export function ModelConfigPanel({ currentRole }: ModelConfigPanelProps) {
  const queryClient = useQueryClient();
  const { isOwner } = getRolePermissions(currentRole);
  const { data } = useQuery({
    queryKey: ["llm-config"],
    queryFn: () => api.getLlmConfig(),
  });

  const [enabled, setEnabled] = useState(true);
  const [baseUrl, setBaseUrl] = useState("https://dashscope.aliyuncs.com/compatible-mode/v1");
  const [modelId, setModelId] = useState("qwen-max");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string>("");

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setBaseUrl(data.baseUrl);
      setModelId(data.modelId);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.saveLlmConfig({
        enabled,
        baseUrl: baseUrl.trim(),
        modelId: modelId.trim(),
        apiKey: apiKeyInput.trim() || undefined,
      }),
    onSuccess: (res) => {
      setApiKeyInput("");
      setStatusBanner(res.message);
      void queryClient.invalidateQueries({ queryKey: ["llm-config"] });
      void queryClient.invalidateQueries({ queryKey: ["governance"] });
    },
    onError: (err: Error) => setStatusBanner(err.message),
  });

  const testMutation = useMutation({
    mutationFn: () => api.testLlmConnection(),
    onSuccess: (res) => setStatusBanner(res.message),
    onError: (err: Error) => setStatusBanner(err.message),
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveMutation.mutate();
  };

  const isLive = Boolean(data?.enabled && data?.hasApiKey && data?.activeMode === "LIVE_LLM");

  return (
    <section
      id="model-config-panel"
      aria-labelledby="llm-self-config-heading"
      className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-5 space-y-4 text-xs scroll-mt-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 id="llm-self-config-heading" className="text-sm font-semibold">
              自定义企业大模型接入配置（OpenAI 兼容协议 · 热生效）
            </h2>
            <span
              className={`px-2 py-0.5 rounded font-medium ${
                isLive
                  ? "bg-emerald-500/15 text-emerald-600"
                  : "bg-amber-500/15 text-amber-700"
              }`}
            >
              {isLive ? "已启用外部真大模型 Tool-Calling" : "待配置密钥 · 当前运行离线确定性兜底"}
            </span>
          </div>
          <p className="text-[var(--muted-foreground)] mt-1">
            可直接在此粘贴阿里云百炼 Qwen、DeepSeek、本地 vLLM / Ollama 或 OpenAI 接口参数（也可编辑根目录{" "}
            <code className="font-mono">platform-v3/.env</code>）。密钥落盘后仅显示掩码，永不明文回显。
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            id="llm-enable-checkbox"
            name="enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-[var(--primary)] cursor-pointer"
          />
          <label htmlFor="llm-enable-checkbox" className="font-medium cursor-pointer">
            启用外部大模型推理
          </label>
        </div>
      </div>

      <form onSubmit={handleSubmit} method="POST" aria-labelledby="llm-self-config-heading" className="grid grid-cols-12 gap-3.5 items-end">
        <div className="col-span-5 space-y-1">
          <label htmlFor="llm-base-url" className="block font-medium">
            API Base URL（OpenAI 兼容地址）
          </label>
          <input
            id="llm-base-url"
            name="baseUrl"
            type="url"
            required
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
          />
        </div>

        <div className="col-span-3 space-y-1">
          <label htmlFor="llm-model-id" className="block font-medium">
            模型标识 (Model ID)
          </label>
          <input
            id="llm-model-id"
            name="modelId"
            type="text"
            required
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="qwen-max / deepseek-chat"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
          />
        </div>

        <div className="col-span-4 space-y-1">
          <label htmlFor="llm-api-key" className="block font-medium">
            API Key {data?.hasApiKey ? `（已存 ${data.maskedApiKey}，留空保持不变）` : "（未配置）"}
          </label>
          <div className="relative flex items-center">
            <input
              id="llm-api-key"
              name="apiKey"
              type={showKey ? "text" : "password"}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={data?.hasApiKey ? "输入新密钥以覆盖..." : "sk-..."}
              className="w-full pl-3 pr-9 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
            />
            <button
              type="button"
              aria-pressed={showKey}
              aria-label={showKey ? "隐藏密钥" : "显示密钥"}
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-2 p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
            >
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="col-span-12 flex items-center justify-between pt-1">
          <div role="status" aria-live="polite" className="text-[var(--muted-foreground)]">
            {statusBanner || `最近配置来源：${data?.updatedAt ?? "默认读取 .env"}`}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={testMutation.isPending || !isOwner}
              title={!isOwner ? ROLE_TIPS.ownerLlm : undefined}
              onClick={() => testMutation.mutate()}
              className="px-3.5 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {testMutation.isPending ? "探测中..." : "测试模型连通性"}
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending || !isOwner}
              title={!isOwner ? ROLE_TIPS.ownerLlm : undefined}
              className="px-4 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {saveMutation.isPending ? "保存中..." : "保存配置并立即生效"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
