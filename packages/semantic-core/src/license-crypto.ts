import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

export interface OfflineLicensePayload {
  licenseId: string;
  licensedTo: string;
  edition: string;
  maxWorkspaces: number;
  maxUsers: number;
  monthlyLlmTokenQuota: number;
  issuedAt: string;
  expiresAt: string;
  features: string[];
}

export interface SignedLicenseEnvelope {
  alg: "Ed25519";
  payload: OfflineLicensePayload;
  signature: string;
}

export interface LicenseVerificationResult {
  valid: boolean;
  expired: boolean;
  reason?: string;
  payload?: OfflineLicensePayload;
}

export function generateLicenseKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

function canonicalPayloadBytes(payload: OfflineLicensePayload): Buffer {
  const ordered = {
    edition: payload.edition,
    expiresAt: payload.expiresAt,
    features: [...payload.features].sort(),
    issuedAt: payload.issuedAt,
    licenseId: payload.licenseId,
    licensedTo: payload.licensedTo,
    maxUsers: payload.maxUsers,
    maxWorkspaces: payload.maxWorkspaces,
    monthlyLlmTokenQuota: payload.monthlyLlmTokenQuota,
  };
  return Buffer.from(JSON.stringify(ordered), "utf8");
}

/**
 * Signs an offline commercial `.lic` payload using Ed25519 (zero external dependencies).
 * Returns a Base64-encoded JSON envelope prefixed with `LINGDONG-LIC-V4:`.
 */
export function signOfflineLicense(payload: OfflineLicensePayload, privateKeyPem: string): string {
  const privKey = createPrivateKey(privateKeyPem);
  const sig = sign(null, canonicalPayloadBytes(payload), privKey).toString("base64");
  const envelope: SignedLicenseEnvelope = { alg: "Ed25519", payload, signature: sig };
  return `LINGDONG-LIC-V4:${Buffer.from(JSON.stringify(envelope), "utf8").toString("base64")}`;
}

export function verifyOfflineLicense(
  licText: string,
  publicKeyPem: string,
  nowMs = Date.now()
): LicenseVerificationResult {
  const trimmed = licText.trim();
  const rawB64 = trimmed.startsWith("LINGDONG-LIC-V4:")
    ? trimmed.slice("LINGDONG-LIC-V4:".length).trim()
    : trimmed;

  let envelope: SignedLicenseEnvelope;
  try {
    envelope = JSON.parse(Buffer.from(rawB64, "base64").toString("utf8")) as SignedLicenseEnvelope;
  } catch {
    return { valid: false, expired: false, reason: "授权文件格式损坏，无法解析 Base64/JSON 信封" };
  }

  if (envelope.alg !== "Ed25519" || !envelope.payload || typeof envelope.signature !== "string") {
    return { valid: false, expired: false, reason: "不支持的授权签名算法或缺少载荷字段" };
  }

  try {
    const pubKey = createPublicKey(publicKeyPem);
    const ok = verify(
      null,
      canonicalPayloadBytes(envelope.payload),
      pubKey,
      Buffer.from(envelope.signature, "base64")
    );
    if (!ok) {
      return { valid: false, expired: false, reason: "Ed25519 数字签名校验失败（授权文件疑似被篡改）" };
    }
  } catch {
    return { valid: false, expired: false, reason: "公钥解析失败或签名格式非法" };
  }

  const expMs = Date.parse(envelope.payload.expiresAt);
  if (Number.isNaN(expMs) || expMs < nowMs) {
    return {
      valid: false,
      expired: true,
      payload: envelope.payload,
      reason: `商业授权已于 ${envelope.payload.expiresAt} 到期，请联系厂商续签 .lic 证书`,
    };
  }

  return { valid: true, expired: false, payload: envelope.payload };
}
