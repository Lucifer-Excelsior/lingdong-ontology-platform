import { createHash } from "node:crypto";

export interface VerifiableReceipt {
  receiptId: string;
  protocol: "lingdong-sm3-receipt/v1";
  operation: string;
  workspaceId: string;
  baseUrl: string;
  executedAt: string;
  status: "VERIFIED" | "DEGRADED";
  payloadDigestSha256: string;
  auditChainHeadHash: string | null;
  auditChainAlgo: string;
  auditChainIntact: boolean | null;
  evidenceCount: number;
  receiptSignature: string;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function buildVerifiableReceipt(params: {
  operation: string;
  workspaceId: string;
  baseUrl: string;
  payload: unknown;
  evidenceCount?: number;
  auditChain?: {
    intact?: boolean;
    headHash?: string;
    hashAlgo?: string;
  } | null;
  executedAt?: string;
}): VerifiableReceipt {
  const executedAt = params.executedAt ?? new Date().toISOString();
  const payloadDigestSha256 = sha256Hex(canonicalJson(params.payload));
  const auditChainHeadHash = params.auditChain?.headHash ?? null;
  const auditChainIntact =
    typeof params.auditChain?.intact === "boolean" ? params.auditChain.intact : null;
  const auditChainAlgo = params.auditChain?.hashAlgo ?? "SM3";

  const signInput = [
    "lingdong-sm3-receipt/v1",
    params.operation,
    params.workspaceId,
    params.baseUrl,
    executedAt,
    payloadDigestSha256,
    auditChainHeadHash ?? "NO_CHAIN",
  ].join("|");

  const receiptSignature = sha256Hex(signInput);
  const receiptId = `rcpt_${receiptSignature.slice(0, 16)}`;

  return {
    receiptId,
    protocol: "lingdong-sm3-receipt/v1",
    operation: params.operation,
    workspaceId: params.workspaceId,
    baseUrl: params.baseUrl,
    executedAt,
    status: auditChainIntact === false ? "DEGRADED" : "VERIFIED",
    payloadDigestSha256,
    auditChainHeadHash,
    auditChainAlgo,
    auditChainIntact,
    evidenceCount: params.evidenceCount ?? 0,
    receiptSignature,
  };
}

export function verifyReceiptIntegrity(
  receipt: VerifiableReceipt,
  payload: unknown
): { valid: boolean; reason?: string } {
  const expectedPayloadDigest = sha256Hex(canonicalJson(payload));
  if (expectedPayloadDigest !== receipt.payloadDigestSha256) {
    return { valid: false, reason: "Payload digest mismatch (response modified)" };
  }
  const signInput = [
    receipt.protocol,
    receipt.operation,
    receipt.workspaceId,
    receipt.baseUrl,
    receipt.executedAt,
    receipt.payloadDigestSha256,
    receipt.auditChainHeadHash ?? "NO_CHAIN",
  ].join("|");
  const expectedSig = sha256Hex(signInput);
  if (expectedSig !== receipt.receiptSignature) {
    return { valid: false, reason: "Receipt signature mismatch" };
  }
  return { valid: true };
}
