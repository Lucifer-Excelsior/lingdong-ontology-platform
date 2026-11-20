import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { validateConnectorEndpoint } from "../security/guards.js";

const SECRET_KEY = createHash("sha256")
  .update(process.env.LINGDONG_SESSION_SECRET ?? "lingdong-v3-dev-hmac-secret-do-not-use-in-prod")
  .digest();

function encryptSecret(raw: string): string {
  if (!raw) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", SECRET_KEY, iv);
  const enc = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  return `enc:v1:${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc.toString("hex")}`;
}

function decryptSecret(stored: string): string {
  if (!stored.startsWith("enc:v1:")) return stored;
  const [, , ivHex, tagHex, dataHex] = stored.split(":");
  if (!ivHex || !tagHex || !dataHex) return "";
  try {
    const decipher = createDecipheriv("aes-256-gcm", SECRET_KEY, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export interface StoredLlmConfig {
  enabled: boolean;
  providerLabel: string;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  updatedAt: string;
}

export interface PublicLlmConfigView {
  enabled: boolean;
  providerLabel: string;
  baseUrl: string;
  modelId: string;
  hasApiKey: boolean;
  maskedApiKey: string;
  activeMode: "LIVE_LLM" | "LOCAL_DETERMINISTIC";
  updatedAt: string;
}

const CONFIG_FILE = resolve(process.cwd(), ".data/llm-runtime-config.json");

function maskKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "****";
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}

function readDiskConfigs(): Record<string, StoredLlmConfig> {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Record<string, StoredLlmConfig>;
  } catch {
    return {};
  }
}

function writeDiskConfigs(map: Record<string, StoredLlmConfig>): void {
  mkdirSync(dirname(CONFIG_FILE), { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(map, null, 2), "utf8");
}

export function getEffectiveLlmConfig(tenantId: string): StoredLlmConfig {
  const map = readDiskConfigs();
  const saved = map[tenantId];
  const envKey = (process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY ?? "").trim();
  const envBase = (process.env.OPENAI_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1").trim();
  const envModel = (process.env.OPENAI_MODEL ?? "qwen-max").trim();

  if (saved) {
    return {
      ...saved,
      apiKey: decryptSecret(saved.apiKey) || envKey,
    };
  }

  return {
    enabled: Boolean(envKey),
    providerLabel: "OpenAI 兼容接口 (Qwen / DeepSeek / vLLM)",
    baseUrl: envBase,
    modelId: envModel,
    apiKey: envKey,
    updatedAt: "默认读取 .env 环境变量",
  };
}

export function getPublicLlmConfigView(tenantId: string): PublicLlmConfigView {
  const cfg = getEffectiveLlmConfig(tenantId);
  const hasKey = Boolean(cfg.apiKey.trim());
  return {
    enabled: cfg.enabled,
    providerLabel: cfg.providerLabel,
    baseUrl: cfg.baseUrl,
    modelId: cfg.modelId,
    hasApiKey: hasKey,
    maskedApiKey: maskKey(cfg.apiKey),
    activeMode: cfg.enabled && hasKey ? "LIVE_LLM" : "LOCAL_DETERMINISTIC",
    updatedAt: cfg.updatedAt,
  };
}

export function saveTenantLlmConfig(
  tenantId: string,
  input: {
    enabled: boolean;
    providerLabel?: string;
    baseUrl: string;
    modelId: string;
    apiKey?: string;
  }
): PublicLlmConfigView {
  const cleanBase = input.baseUrl.trim();
  if (cleanBase) {
    validateConnectorEndpoint(cleanBase, { allowLocalSandboxHost: true });
  }
  const map = readDiskConfigs();
  const prev = getEffectiveLlmConfig(tenantId);
  const nextKey =
    input.apiKey !== undefined && input.apiKey.trim() !== ""
      ? input.apiKey.trim()
      : prev.apiKey;

  map[tenantId] = {
    enabled: input.enabled,
    providerLabel: input.providerLabel?.trim() || "OpenAI 兼容接口 (自定义配置)",
    baseUrl: cleanBase,
    modelId: input.modelId.trim(),
    apiKey: encryptSecret(nextKey),
    updatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
  };
  writeDiskConfigs(map);
  return getPublicLlmConfigView(tenantId);
}

export async function testTenantLlmConnection(tenantId: string): Promise<{
  ok: boolean;
  latencyMs: number;
  message: string;
}> {
  const cfg = getEffectiveLlmConfig(tenantId);
  if (!cfg.apiKey.trim()) {
    return {
      ok: false,
      latencyMs: 0,
      message: "当前尚未填写 API Key，系统正运行在「Oxigraph 确定性离线兜底」模式。填写密钥保存后即可连通外部大模型。",
    };
  }
  const started = performance.now();
  const openai = createOpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl || undefined,
  });
  const res = await generateText({
    model: openai(cfg.modelId),
    prompt: "请仅回复 OK 两个字母。",
    maxTokens: 12,
  });
  const latencyMs = Math.round(performance.now() - started);
  return {
    ok: true,
    latencyMs,
    message: `大模型连通成功 (${cfg.modelId} · ${latencyMs}ms)：返回 "${res.text.trim().slice(0, 24)}"`,
  };
}
