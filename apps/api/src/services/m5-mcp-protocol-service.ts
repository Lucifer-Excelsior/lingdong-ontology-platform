import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { eq } from "drizzle-orm";
import type { McpApiTokenView, Role } from "@lingdong/contracts";
import type { AppDb } from "../db/client.js";
import { deleteRuntimeKv, hydrateRuntimeNamespaceAllTenants, saveRuntimeKv } from "../db/runtime-kv.js";
import { capabilities, documents } from "../db/schema.js";
import type { SessionActor } from "../security/guards.js";
import { runWorkspaceSparql } from "./data-service.js";

interface StoredMcpToken {
  id: string;
  tenantId: string;
  workspaceId: string;
  name: string;
  sha256Hash: string;
  maskedToken: string;
  roleScope: "VIEWER" | "OPERATOR";
  createdAt: string;
}

const TOKEN_STORE_FILE = resolve(process.cwd(), ".data/mcp-tokens.json");
const mcpTokenStore = new Map<string, StoredMcpToken>();

function loadTokensFromDisk(): void {
  if (!existsSync(TOKEN_STORE_FILE)) return;
  try {
    const arr = JSON.parse(readFileSync(TOKEN_STORE_FILE, "utf8")) as StoredMcpToken[];
    for (const item of arr) mcpTokenStore.set(item.id, item);
  } catch {
    // ignore corrupt disk cache
  }
}

function saveTokensToDisk(): void {
  mkdirSync(dirname(TOKEN_STORE_FILE), { recursive: true });
  writeFileSync(TOKEN_STORE_FILE, JSON.stringify(Array.from(mcpTokenStore.values()), null, 2), "utf8");
}

loadTokensFromDisk();
void hydrateRuntimeNamespaceAllTenants<StoredMcpToken>("mcp_token").then((rows) => {
  for (const r of rows) mcpTokenStore.set(r.payload.id, r.payload);
});

export function issueMcpApiToken(
  tenantId: string,
  workspaceId: string,
  name: string,
  roleScope: "VIEWER" | "OPERATOR"
): { token: McpApiTokenView; rawTokenOnce: string } {
  const rawSecret = `ldmcp_${randomBytes(16).toString("hex")}`;
  const sha256Hash = createHash("sha256").update(rawSecret, "utf8").digest("hex");
  const id = `mcptok-${Date.now()}`;
  const createdAt = new Date().toISOString().slice(0, 16).replace("T", " ");
  const maskedToken = `${rawSecret.slice(0, 10)}••••••••${rawSecret.slice(-4)}`;

  const record: StoredMcpToken = {
    id,
    tenantId,
    workspaceId,
    name: name.trim() || "外部智能体只读挂载密钥",
    sha256Hash,
    maskedToken,
    roleScope,
    createdAt,
  };
  mcpTokenStore.set(id, record);
  saveTokensToDisk();
  void saveRuntimeKv(tenantId, "mcp_token", id, record as unknown as Record<string, unknown>).catch(() => {});

  return {
    token: { id, name: name.trim() || "外部智能体只读挂载密钥", maskedToken, roleScope, createdAt },
    rawTokenOnce: rawSecret,
  };
}

export function listMcpApiTokens(tenantId: string, workspaceId: string): McpApiTokenView[] {
  return Array.from(mcpTokenStore.values())
    .filter((t) => t.tenantId === tenantId && t.workspaceId === workspaceId)
    .map(({ id, name, maskedToken, roleScope, createdAt }) => ({
      id,
      name,
      maskedToken,
      roleScope,
      createdAt,
    }));
}

export function revokeMcpApiToken(tenantId: string, tokenId: string): boolean {
  const tok = mcpTokenStore.get(tokenId);
  if (!tok || tok.tenantId !== tenantId) return false;
  const deleted = mcpTokenStore.delete(tokenId);
  if (deleted) {
    saveTokensToDisk();
    void deleteRuntimeKv(tenantId, "mcp_token", tokenId).catch(() => {});
  }
  return deleted;
}

export function authenticateMcpBearerToken(authHeader?: string): SessionActor | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const raw = authHeader.slice(7).trim();
  const hash = createHash("sha256").update(raw, "utf8").digest("hex");
  for (const tok of mcpTokenStore.values()) {
    if (tok.sha256Hash === hash) {
      return {
        userId: `mcp-client-${tok.id}`,
        name: `MCP:${tok.name}`,
        role: tok.roleScope as Role,
        tenantId: tok.tenantId,
        mcpWorkspaceId: tok.workspaceId,
      };
    }
  }
  return null;
}

export async function handleStandardMcpJsonRpc(
  txDb: AppDb,
  actor: SessionActor,
  rpcBody: { jsonrpc?: string; id?: string | number | null; method: string; params?: Record<string, unknown> }
) {
  const id = rpcBody.id ?? 1;
  const workspaceId = String(rpcBody.params?.workspaceId ?? actor.mcpWorkspaceId ?? "ws-contract");

  if (actor.mcpWorkspaceId && actor.mcpWorkspaceId !== workspaceId) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32003,
        message: `零信任越权拦截：当前 MCP 令牌仅授权访问空间 ${actor.mcpWorkspaceId}，禁止跨空间访问 ${workspaceId}`,
      },
    };
  }

  if (rpcBody.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: { name: "lingdong-ontology-v3-mcp", version: "3.0.0" },
      },
    };
  }

  if (rpcBody.method === "notifications/initialized") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  if (rpcBody.method === "tools/list") {
    const caps = await txDb.select().from(capabilities).where(eq(capabilities.workspaceId, workspaceId));
    const tools = caps
      .filter((c) => c.mcpExposed && (c.autonomyTier === "READ" || c.autonomyTier === "DRAFT"))
      .map((c) => ({
        name: c.code,
        description: c.description,
        inputSchema: {
          type: "object",
          properties: { workspaceId: { type: "string", default: workspaceId }, limit: { type: "number", default: 20 } },
        },
      }));
    return { jsonrpc: "2.0", id, result: { tools } };
  }

  if (rpcBody.method === "tools/call") {
    const toolName = String(rpcBody.params?.name ?? "");
    const caps = await txDb.select().from(capabilities).where(eq(capabilities.workspaceId, workspaceId));
    const allowedCap = caps.find(
      (c) => c.code === toolName && c.mcpExposed && (c.autonomyTier === "READ" || c.autonomyTier === "DRAFT")
    );
    if (!allowedCap) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32602,
          message: `MCP 门禁拦截：工具 "${toolName || "(empty)"}" 未在空间 ${workspaceId} 的只读/起草白名单中开放`,
        },
      };
    }
    if (toolName === "FindExpiringContracts") {
      const sparqlRes = await runWorkspaceSparql(
        txDb,
        workspaceId,
        actor.role,
        `SELECT ?contractNo ?label ?expiresAt ?totalAmount ?status WHERE {
          ?c a ont:Contract ; ont:contractNo ?contractNo ; rdfs:label ?label ;
             ont:expiresAt ?expiresAt ; ont:totalAmount ?totalAmount ; ont:status ?status .
        } ORDER BY ?expiresAt LIMIT 20`
      );
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(sparqlRes.rows, null, 2) }],
          isError: false,
        },
      };
    }
    const docs = await txDb.select().from(documents).where(eq(documents.workspaceId, workspaceId));
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(docs.flatMap((d) => d.chunksJson), null, 2) }],
        isError: false,
      },
    };
  }

  if (rpcBody.method === "resources/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        resources: [
          { uri: `urn:ws:${workspaceId}:abox:active`, name: "Active Governed ABox Graph", mimeType: "text/turtle" },
        ],
      },
    };
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${rpcBody.method}` },
  };
}
