import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  computeAuditHash,
  generateLicenseKeyPair,
  resolveAuditHashAlgo,
  signOfflineLicense,
  verifyOfflineLicense,
  type OfflineLicensePayload,
} from "@lingdong/semantic-core";
import type { AppDb } from "../db/client.js";
import { loadRuntimeKv, saveRuntimeKv } from "../db/runtime-kv.js";
import { auditEvents, executionRuns, releases } from "../db/schema.js";

const LICENSE_NS = "ga_offline_license";
const QUOTA_NS = "ga_llm_token_quota";

// Ephemeral fallback vendor keypair for dev/demo when LINGDONG_LICENSE_PUBLIC_KEY_PEM is unset
const DEV_KEYPAIR = generateLicenseKeyPair();

export function getVendorLicensePublicKeyPem(): string {
  return process.env.LINGDONG_LICENSE_PUBLIC_KEY_PEM ?? DEV_KEYPAIR.publicKeyPem;
}

export function issueSignedDemoLicense(overrides?: Partial<OfflineLicensePayload>): string {
  const privatePem = process.env.LINGDONG_LICENSE_PRIVATE_KEY_PEM ?? DEV_KEYPAIR.privateKeyPem;
  const payload: OfflineLicensePayload = {
    licenseId: overrides?.licenseId ?? `LIC-GA-${Date.now()}`,
    licensedTo: overrides?.licensedTo ?? "中国信息通信研究院 · 政企智能语义中心",
    edition: overrides?.edition ?? "灵·洞本体工作站 V4.0 Enterprise GA (信创兼容)",
    maxWorkspaces: overrides?.maxWorkspaces ?? 50,
    maxUsers: overrides?.maxUsers ?? 200,
    monthlyLlmTokenQuota: overrides?.monthlyLlmTokenQuota ?? 10_000_000,
    issuedAt: overrides?.issuedAt ?? new Date().toISOString(),
    expiresAt: overrides?.expiresAt ?? "2028-12-31T23:59:59Z",
    features: overrides?.features ?? ["REMOTE_SPARQL", "SM3_AUDIT", "XINCHUANG_BRIDGE", "IM_BIDIRECTIONAL"],
  };
  return signOfflineLicense(payload, privatePem);
}

export async function activateOfflineLicense(
  tenantId: string,
  licText: string,
  publicKeyPem = getVendorLicensePublicKeyPem()
) {
  const verified = verifyOfflineLicense(licText, publicKeyPem);
  if (!verified.valid || !verified.payload) {
    throw new Error(verified.reason ?? "离线授权证书验签失败");
  }
  await saveRuntimeKv(tenantId, LICENSE_NS, "active", {
    licText: licText.trim(),
    payload: verified.payload,
    activatedAt: new Date().toISOString(),
  });
  return { valid: true, payload: verified.payload, message: `离线 Ed25519 授权证书已生效 (${verified.payload.licenseId})` };
}

export async function getActiveOfflineLicense(tenantId: string): Promise<OfflineLicensePayload | null> {
  const saved = await loadRuntimeKv<{ licText: string; payload: OfflineLicensePayload }>(
    tenantId,
    LICENSE_NS,
    "active"
  );
  if (!saved?.licText) return null;
  const check = verifyOfflineLicense(saved.licText, getVendorLicensePublicKeyPem());
  return check.valid && check.payload ? check.payload : null;
}

export class LlmQuotaExceededError extends Error {
  public readonly statusCode = 429;
  public readonly usedTokens: number;
  public readonly quotaTokens: number;
  constructor(usedTokens: number, quotaTokens: number) {
    super(`月度大模型 Token 配额已耗尽 (${usedTokens.toLocaleString()} / ${quotaTokens.toLocaleString()})，已触发网关级硬熔断`);
    this.usedTokens = usedTokens;
    this.quotaTokens = quotaTokens;
  }
}

export async function getMonthlyTokenUsage(tenantId: string): Promise<{ used: number; quota: number; monthKey: string }> {
  const monthKey = new Date().toISOString().slice(0, 7);
  const saved = await loadRuntimeKv<{ used: number }>(tenantId, QUOTA_NS, monthKey);
  const activeLic = await getActiveOfflineLicense(tenantId);
  const quota = activeLic?.monthlyLlmTokenQuota ?? 10_000_000;
  return { used: saved?.used ?? 160_400, quota, monthKey };
}

export async function consumeAndCheckLlmTokens(
  tenantId: string,
  deltaTokens: number
): Promise<{ used: number; quota: number; remaining: number }> {
  const current = await getMonthlyTokenUsage(tenantId);
  const nextUsed = current.used + Math.max(0, Math.round(deltaTokens));
  if (nextUsed > current.quota) {
    throw new LlmQuotaExceededError(nextUsed, current.quota);
  }
  await saveRuntimeKv(tenantId, QUOTA_NS, current.monthKey, { used: nextUsed });
  return { used: nextUsed, quota: current.quota, remaining: current.quota - nextUsed };
}

export function signImCallbackBody(timestampSec: string, rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestampSec}.${rawBody}`).digest("hex");
}

export async function processImApprovalCallback(
  txDb: AppDb,
  tenantId: string,
  channel: "WECOM" | "DINGTALK" | "FEISHU",
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
  rawBody: string
): Promise<{ ok: boolean; action: string; targetRef: string; auditHash: string; algo: string; message: string }> {
  const secret = process.env.IM_CALLBACK_HMAC_SECRET ?? "lingdong-ga-im-callback-secret";
  if (!timestampHeader || !signatureHeader) {
    throw new Error("IM 回调鉴权失败：缺少 X-Lingdong-Timestamp 或 X-Lingdong-Signature 请求头");
  }
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) {
    throw new Error("IM 回调防重放拦截：请求时间戳超出 5 分钟有效窗口");
  }
  const expectedSig = signImCallbackBody(timestampHeader, rawBody, secret);
  const a = Buffer.from(signatureHeader.replace(/^sha256=/i, ""), "utf8");
  const b = Buffer.from(expectedSig, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("IM 回调签名校验失败：HMAC-SHA256 摘要不匹配");
  }

  const parsed = JSON.parse(rawBody) as {
    workspaceId?: string;
    targetType: "ACTION_PLAN" | "RELEASE";
    targetRef: string;
    decision: "APPROVE" | "REJECT";
    approverName: string;
  };
  const wsId = parsed.workspaceId ?? "ws-contract";
  const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ");

  if (parsed.targetType === "ACTION_PLAN") {
    const newStatus = parsed.decision === "APPROVE" ? "VERIFIED" : "REJECTED_POLICY";
    await txDb
      .update(executionRuns)
      .set({
        status: newStatus,
        statusLabel: parsed.decision === "APPROVE" ? `${channel} 审批通过` : `${channel} 审批驳回`,
        approvedBy: `${parsed.approverName} (${channel} IM 回执)`,
      })
      .where(eq(executionRuns.id, parsed.targetRef));
  } else if (parsed.targetType === "RELEASE") {
    await txDb
      .update(releases)
      .set({
        status: parsed.decision === "APPROVE" ? "PUBLISHED" : "AWAITING_REVIEW",
        reviewedBy: `${parsed.approverName} (${channel} IM ${parsed.decision})`,
        publishedAt: parsed.decision === "APPROVE" ? nowStr : null,
      })
      .where(eq(releases.id, parsed.targetRef));
  }

  const algo = resolveAuditHashAlgo();
  const summary = `[${channel} 双向回调] ${parsed.approverName} 对 ${parsed.targetType}:${parsed.targetRef} 执行 ${parsed.decision}`;
  const auditHash = computeAuditHash(`${wsId}|${parsed.targetRef}|${summary}|${nowStr}`, algo);

  await txDb.insert(auditEvents).values({
    id: `aud-imcb-${Date.now()}`,
    tenantId,
    workspaceId: wsId,
    category: "RELEASE_APPROVAL",
    categoryLabel: `IM 双向审批 (${algo})`,
    actorDisplay: `${parsed.approverName} (${channel})`,
    summary: `${summary} [${algo}:${auditHash.slice(0, 16)}]`,
    occurredAt: nowStr,
  });

  return {
    ok: true,
    action: parsed.decision,
    targetRef: parsed.targetRef,
    auditHash,
    algo,
    message: `已验签并完成 ${channel} 双向审批回执 (${parsed.targetRef} → ${parsed.decision})`,
  };
}
