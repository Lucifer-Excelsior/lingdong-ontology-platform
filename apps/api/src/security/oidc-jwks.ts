import { createPublicKey, verify, type JsonWebKey } from "node:crypto";
import type { Role } from "@lingdong/contracts";
import type { SessionActor } from "./guards.js";

const VALID_ROLES = new Set<Role>(["OWNER", "MODELER", "OPERATOR", "REVIEWER", "VIEWER"]);

interface CachedJwks {
  keys: Array<JsonWebKey & { kid?: string; alg?: string }>;
  fetchedAtMs: number;
}

let jwksCache: CachedJwks | null = null;
const JWKS_TTL_MS = 5 * 60 * 1000;

export function isProductionAuthMode(): boolean {
  return (process.env.APP_ENV ?? "development").toLowerCase() === "production";
}

export function verifyJwtWithJwk(
  token: string,
  jwk: JsonWebKey,
  expectedIssuer?: string,
  expectedAudience?: string
): { valid: boolean; actor?: SessionActor; reason?: string } {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return { valid: false, reason: "JWT 格式非法" };
  const [headerB64, payloadB64, sigB64] = parts;

  let header: { alg?: string; kid?: string };
  let claims: {
    iss?: string;
    aud?: string | string[];
    exp?: number;
    sub?: string;
    name?: string;
    tenant_id?: string;
    role?: string;
  };
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as { alg?: string; kid?: string };
    claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "JWT Header/Payload 解码失败" };
  }

  const alg = header.alg === "ES256" ? "sha256" : header.alg === "RS256" ? "RSA-SHA256" : null;
  if (!alg) return { valid: false, reason: `不支持的 OIDC 签名算法: ${header.alg ?? "unknown"}` };

  try {
    const pubKey = createPublicKey({ key: jwk, format: "jwk" });
    const sigOk = verify(
      alg,
      Buffer.from(`${headerB64}.${payloadB64}`, "utf8"),
      header.alg === "ES256" ? { key: pubKey, dsaEncoding: "ieee-p1363" } : pubKey,
      Buffer.from(sigB64, "base64url")
    );
    if (!sigOk) return { valid: false, reason: "OIDC JWKS 数字签名校验失败" };
  } catch {
    return { valid: false, reason: "JWKS 公钥验签异常" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (expectedIssuer && claims.iss !== expectedIssuer) {
    return { valid: false, reason: "OIDC Issuer 不匹配" };
  }
  if (expectedAudience) {
    const audOk = Array.isArray(claims.aud)
      ? claims.aud.includes(expectedAudience)
      : claims.aud === expectedAudience;
    if (!audOk) return { valid: false, reason: "OIDC Audience 不匹配" };
  }
  if (typeof claims.exp !== "number" || claims.exp <= nowSec) {
    return { valid: false, reason: "OIDC Token 缺少 exp 声明或已过期" };
  }
  if (!claims.sub) return { valid: false, reason: "缺少 sub 声明" };

  const role = (claims.role ?? "VIEWER").toUpperCase() as Role;
  return {
    valid: true,
    actor: {
      userId: claims.sub,
      name: claims.name ?? claims.sub,
      role: VALID_ROLES.has(role) ? role : "VIEWER",
      tenantId: claims.tenant_id ?? "tenant-caict",
    },
  };
}

export async function verifyBearerAgainstJwksUri(token: string): Promise<SessionActor | null> {
  const jwksUri = process.env.OIDC_JWKS_URI;
  if (!jwksUri) return null;

  if (!jwksCache || Date.now() - jwksCache.fetchedAtMs > JWKS_TTL_MS) {
    try {
      const resp = await fetch(jwksUri, { signal: AbortSignal.timeout(3000) });
      if (!resp.ok) return null;
      const body = (await resp.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
      jwksCache = { keys: body.keys ?? [], fetchedAtMs: Date.now() };
    } catch {
      return null;
    }
  }

  for (const key of jwksCache.keys) {
    const res = verifyJwtWithJwk(
      token,
      key,
      process.env.OIDC_ISSUER_URL,
      process.env.OIDC_AUDIENCE
    );
    if (res.valid && res.actor) return res.actor;
  }
  return null;
}
