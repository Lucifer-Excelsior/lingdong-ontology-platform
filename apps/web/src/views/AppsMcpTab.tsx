import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Capability } from "../api/types";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { ROLE_TIPS } from "../utils/rbac";

interface AppsMcpTabProps {
  workspaceId: string;
  mcpTools: Capability[];
  isOwner?: boolean;
  onToast: (msg: string) => void;
}

export function AppsMcpTab({ workspaceId, mcpTools, isOwner = false, onToast }: AppsMcpTabProps) {
  const queryClient = useQueryClient();
  const { ask, confirmDialogNode } = useConfirmDialog();
  const [tokenName, setTokenName] = useState("Claude-Desktop 只读语义挂载");
  const [roleScope, setRoleScope] = useState<"VIEWER" | "OPERATOR">("VIEWER");
  const [rawTokenOnce, setRawTokenOnce] = useState<string | null>(null);
  const [rpcProbeOutput, setRpcProbeOutput] = useState<string>("");

  useEffect(() => {
    setRawTokenOnce(null);
    setRpcProbeOutput("");
  }, [workspaceId]);

  const { data: tokenData } = useQuery({
    queryKey: ["mcp-tokens", workspaceId],
    queryFn: () => api.listMcpTokens(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const tokens = tokenData?.tokens ?? [];
  const mcpUrl = `${typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8280"}/mcp`;

  const mcpClientJson = JSON.stringify(
    {
      mcpServers: {
        "lingdong-ontology": {
          url: mcpUrl,
          transport: "streamable-http",
          headers: {
            Authorization: `Bearer ${rawTokenOnce ?? "<YOUR_MCP_READONLY_TOKEN>"}`,
          },
        },
      },
    },
    null,
    2
  );

  const issueTokenMutation = useMutation({
    mutationFn: () => api.createMcpToken(workspaceId, { name: tokenName.trim(), roleScope }),
    onSuccess: (res) => {
      setRawTokenOnce(res.rawTokenOnce);
      void queryClient.invalidateQueries({ queryKey: ["mcp-tokens", workspaceId] });
      onToast("已签发租户只读 MCP 令牌（明文仅展示一次，请立即复制保存）");
    },
    onError: (err: Error) => onToast(err.message),
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) => api.revokeMcpToken(workspaceId, tokenId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mcp-tokens", workspaceId] });
      onToast("已吊销指定 MCP 访问令牌");
    },
    onError: (err: Error) => onToast(err.message),
  });

  const probeMutation = useMutation({
    mutationFn: () => api.probeMcpJsonRpc(workspaceId, rawTokenOnce ?? undefined),
    onSuccess: (res) => {
      setRpcProbeOutput(JSON.stringify(res, null, 2));
      onToast("标准 MCP JSON-RPC 2.0 (tools/list) 握手探测成功");
    },
    onError: (err: Error) => onToast(err.message),
  });

  const handleIssueSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tokenName.trim()) {
      onToast("请填写外部客户端用途标识后再签发令牌");
      return;
    }
    issueTokenMutation.mutate();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto grid grid-cols-12 gap-5 text-xs">
      <div className="col-span-7 space-y-5">
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">已发布参数化只读工具与 MCP 映射目录</span>
            <button
              type="button"
              disabled={probeMutation.isPending}
              onClick={() => probeMutation.mutate()}
              className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 cursor-pointer"
            >
              {probeMutation.isPending ? "握手探测中..." : "在线发送标准 MCP JSON-RPC tools/list 握手探测"}
            </button>
          </div>
          {mcpTools.length === 0 ? (
            <div className="p-4 rounded-lg bg-[var(--secondary)] text-[var(--muted-foreground)] text-center">
              当前工作空间暂无已暴露的只读 MCP 工具，请在「受控能力与 DAG 编排」中勾选暴露 READ / DRAFT 能力。
            </div>
          ) : (
            mcpTools.map((tool) => (
              <div key={tool.id} className="p-3 rounded-lg border border-[var(--border)] flex items-center justify-between gap-3">
                <div>
                  <div className="font-mono font-semibold">{tool.mcpUri ?? `mcp://ontology/${tool.code}`}</div>
                  <div className="text-[var(--muted-foreground)] mt-0.5">配额：{tool.quotaPerMinute} 次/分钟 · {tool.description}</div>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium shrink-0">PUBLISHED</span>
              </div>
            ))
          )}

          {rpcProbeOutput && (
            <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
              <div className="font-semibold text-emerald-700">✓ POST /mcp (JSON-RPC 2.0) 实时握手响应：</div>
              <pre
                tabIndex={0}
                role="region"
                aria-label="MCP JSON-RPC 握手响应"
                className="p-3 rounded-lg bg-[var(--secondary)] font-mono overflow-x-auto max-h-48 leading-relaxed"
              >
                <code>{rpcProbeOutput}</code>
              </pre>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-3.5">
          <div className="font-semibold text-sm">签发租户只读 MCP 访问令牌</div>
          <form onSubmit={handleIssueSubmit} noValidate method="POST" className="grid grid-cols-12 gap-2.5 items-end">
            <div className="col-span-6 space-y-1">
              <label htmlFor="mcp-tok-name" className="block font-medium">外部客户端用途标识</label>
              <input
                id="mcp-tok-name"
                name="name"
                type="text"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                placeholder="例如：Claude-Desktop 只读语义挂载"
                className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)]"
              />
            </div>
            <div className="col-span-3 space-y-1">
              <label htmlFor="mcp-tok-scope" className="block font-medium">脱敏权限域</label>
              <select
                id="mcp-tok-scope"
                name="roleScope"
                value={roleScope}
                onChange={(e) => setRoleScope(e.target.value as "VIEWER" | "OPERATOR")}
                className="w-full px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono"
              >
                <option value="VIEWER">VIEWER (掩码脱敏)</option>
                <option value="OPERATOR">OPERATOR (业务只读)</option>
              </select>
            </div>
            <div className="col-span-3">
              <button
                type="submit"
                disabled={issueTokenMutation.isPending || !isOwner}
                title={!isOwner ? ROLE_TIPS.owner : undefined}
                className="w-full py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                签发新令牌
              </button>
            </div>
          </form>

          {rawTokenOnce && (
            <div className="p-3 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-amber-800">一次性明文令牌（服务端仅存 SHA-256 哈希）：</div>
                <code className="font-mono break-all text-[var(--foreground)]">{rawTokenOnce}</code>
              </div>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(rawTokenOnce);
                  onToast("已复制一次性 MCP 明文访问令牌");
                }}
                className="shrink-0 px-2.5 py-1 rounded bg-[var(--card)] border border-[var(--border)] font-medium cursor-pointer"
              >
                复制令牌
              </button>
            </div>
          )}

          <div className="space-y-2">
            {tokens.map((tok) => (
              <div
                key={tok.id}
                className="p-2.5 rounded-lg bg-[var(--secondary)] flex items-center justify-between gap-3"
              >
                <div>
                  <span className="font-medium">{tok.name}</span> ·{" "}
                  <code className="font-mono">{tok.maskedToken}</code> ·{" "}
                  <span className="font-mono text-[var(--muted-foreground)]">
                    {tok.roleScope} · {tok.createdAt}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={revokeTokenMutation.isPending || !isOwner}
                  title={!isOwner ? ROLE_TIPS.owner : undefined}
                  onClick={async () => {
                    const { confirmed } = await ask({
                      title: "吊销 MCP 访问令牌",
                      description: `确认吊销 MCP 访问令牌「${tok.name}」？吊销后外部客户端将立即断开访问。`,
                      confirmLabel: "确认吊销",
                      tone: "danger",
                    });
                    if (confirmed) revokeTokenMutation.mutate(tok.id);
                  }}
                  className="px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--card)] text-red-600 font-medium hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  吊销
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="col-span-5 rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-3 h-fit">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">MCP 客户端接入配置 (Streamable HTTP)</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(mcpClientJson);
              onToast("已复制 MCP Server 配置 JSON");
            }}
            className="px-2.5 py-1 rounded bg-[var(--secondary)] font-medium cursor-pointer"
          >
            复制 JSON
          </button>
        </div>
        <p className="text-[var(--muted-foreground)] leading-relaxed">
          当前环境接入端点：<code className="font-mono break-all">{mcpUrl}</code>；支持标准 Streamable HTTP 与 JSON-RPC 2.0 握手。
        </p>
        <pre tabIndex={0} role="region" aria-label="MCP 客户端接入配置 JSON" className="p-3 rounded-lg bg-[var(--secondary)] font-mono overflow-x-auto leading-relaxed">
          <code>{mcpClientJson}</code>
        </pre>
      </div>
      {confirmDialogNode}
    </div>
  );
}
