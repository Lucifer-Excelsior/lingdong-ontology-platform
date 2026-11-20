import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { createMiddleware } from "hono/factory";
import { getCookie, setCookie } from "hono/cookie";
import type { Role } from "@lingdong/contracts";
import type { AppDb } from "../db/client.js";
import { credentials } from "../db/schema.js";
import { isProductionAuthMode, verifyBearerAgainstJwksUri } from "./oidc-jwks.js";
import { isSessionRevoked } from "./redis-store.js";
import { resolveOidcOrProxyActor } from "./telemetry-and-oidc.js";

export interface SessionActor {
  userId: string;
  name: string;
  role: Role;
  tenantId: string;
  mcpWorkspaceId?: string;
}

export function requireRoles(...allowed: Role[]) {
  return createMiddleware(async (c, next) => {
    const actor = c.get("actor") as SessionActor | undefined;
    if (!actor || !allowed.includes(actor.role)) {
      return c.json(
        {
          error: `RBAC 权限拦截：当前角色 ${actor?.role ?? "UNKNOWN"} 无权执行此操作（需 ${allowed.join(" / ")}）`,
        },
        403
      );
    }
    await next();
  });
}

const DEFAULT_DEV_SESSION_SECRET = "lingdong-v3-dev-hmac-secret-do-not-use-in-prod";
export const SESSION_COOKIE = "lingdong_v3_session";
const SESSION_SECRET = process.env.LINGDONG_SESSION_SECRET ?? DEFAULT_DEV_SESSION_SECRET;

export const ALLOWED_ORIGIN_LIST = (
  process.env.ALLOWED_ORIGINS ??
  "http://localhost:3200,http://127.0.0.1:3200,http://localhost:8280,http://127.0.0.1:8280"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = new Set(ALLOWED_ORIGIN_LIST);

export function isOriginAllowed(origin: string | undefined): boolean {
  return !origin || ALLOWED_ORIGINS.has(origin);
}

export function assertProductionSecretsConfigured(): void {
  if (!isProductionAuthMode()) return;
  const missing: string[] = [];
  if (!process.env.LINGDONG_SESSION_SECRET || process.env.LINGDONG_SESSION_SECRET === DEFAULT_DEV_SESSION_SECRET) {
    missing.push("LINGDONG_SESSION_SECRET");
  }
  if (!process.env.IM_CALLBACK_HMAC_SECRET) {
    missing.push("IM_CALLBACK_HMAC_SECRET");
  }
  if (missing.length > 0) {
    throw new Error(`生产环境安全启动拦截：缺少必须配置的密钥环境变量 (${missing.join(", ")})`);
  }
}

const DEFAULT_DEV_ACTOR: SessionActor = {
  userId: "user-linyuan",
  name: "林远",
  role: "OWNER",
  tenantId: "tenant-caict",
};

export function signSessionToken(actor: SessionActor, ttlSeconds = 60 * 60 * 12): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ ...actor, iat: nowSec, exp: nowSec + ttlSeconds }),
    "utf8"
  ).toString("base64url");
  const sig = createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined): SessionActor | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionActor & { exp?: number };
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof parsed.exp === "number" && parsed.exp <= nowSec) return null;
    return { userId: parsed.userId, name: parsed.name, role: parsed.role, tenantId: parsed.tenantId };
  } catch {
    return null;
  }
}

export function issueSessionCookie(c: Context, actor: SessionActor): void {
  setCookie(c, SESSION_COOKIE, signSessionToken(actor), {
    httpOnly: true,
    secure: isProductionAuthMode(),
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

/**
 * Zero-Trust Auth & Origin/CSRF Middleware:
 * 1. Rejects mutating requests from untrusted Origin headers (CSRF defense).
 * 2. NEVER trusts `Host: localhost` or raw `x-actor-*` / `x-tenant-id` client headers
 *    unless accompanied by a verified `GATEWAY_TOKEN` matching server configuration.
 */
export async function zeroTrustAuthMiddleware(c: Context, next: Next) {
  const method = c.req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const origin = c.req.header("origin");
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return c.json({ error: "CSRF Origin 校验失败：拒绝跨站写操作" }, 403);
    }
  }

  const configuredGatewayToken = process.env.PLATFORM_GATEWAY_TOKEN;
  const suppliedGatewayToken = c.req.header("x-gateway-token");
  const hasRawActorHeaders = Boolean(
    c.req.header("x-tenant-id") || c.req.header("x-actor-id") || c.req.header("x-actor-role")
  );

  // Block spoofed privilege headers even if Host is localhost (constant-time token check)!
  if (hasRawActorHeaders) {
    const tokenMatch =
      Boolean(configuredGatewayToken && suppliedGatewayToken) &&
      Buffer.byteLength(configuredGatewayToken!) === Buffer.byteLength(suppliedGatewayToken!) &&
      timingSafeEqual(Buffer.from(configuredGatewayToken!), Buffer.from(suppliedGatewayToken!));
    if (!tokenMatch) {
      return c.json(
        { error: "零信任鉴权拦截：严禁客户端直传未签名租户/角色特权请求头" },
        401
      );
    }
    const gatewayActor: SessionActor = {
      userId: c.req.header("x-actor-id") ?? DEFAULT_DEV_ACTOR.userId,
      name: c.req.header("x-actor-name") ?? DEFAULT_DEV_ACTOR.name,
      role: (c.req.header("x-actor-role") as Role | undefined) ?? "VIEWER",
      tenantId: c.req.header("x-tenant-id") ?? DEFAULT_DEV_ACTOR.tenantId,
    };
    c.set("actor", gatewayActor);
    return next();
  }

  const authHeader = c.req.header("authorization");
  if (authHeader?.startsWith("Bearer ") && process.env.OIDC_JWKS_URI) {
    const jwksActor = await verifyBearerAgainstJwksUri(authHeader.slice(7));
    if (jwksActor) {
      c.set("actor", jwksActor);
      return next();
    }
    return c.json({ error: "OIDC JWKS 令牌验签失败" }, 401);
  }

  const oidcActor = resolveOidcOrProxyActor(c);
  if (oidcActor) {
    c.set("actor", oidcActor);
    return next();
  }

  const rawCookie = getCookie(c, SESSION_COOKIE);
  const cookieActor = rawCookie && !(await isSessionRevoked(rawCookie)) ? verifySessionToken(rawCookie) : null;
  if (cookieActor) {
    c.set("actor", cookieActor);
    return next();
  }

  if (configuredGatewayToken || isProductionAuthMode()) {
    return c.json({ error: "未登录或缺少有效企业会话凭证" }, 401);
  }

  // Local developer studio default session (signed cookie bound to default workspace architect)
  c.set("actor", DEFAULT_DEV_ACTOR);
  return next();
}

/**
 * Tenant-Scoped Credential Resolver (Fixes legacy P0-2 cross-tenant secret exfiltration):
 * Queries `credentials` table scoped to `tenantId` FIRST and verifies caller `role`
 * BEFORE resolving the secret from `process.env`.
 */
export async function resolveTenantSecret(
  txDb: AppDb,
  tenantId: string,
  callerRole: Role,
  alias: string
): Promise<string> {
  const rows = await txDb
    .select()
    .from(credentials)
    .where(and(eq(credentials.tenantId, tenantId), eq(credentials.alias, alias)));

  const cred = rows[0];
  if (!cred) {
    throw new Error(`凭据访问被拒绝：当前租户 (${tenantId}) 未注册凭据别名 "${alias}"`);
  }
  if (!cred.allowedRoles.includes(callerRole)) {
    throw new Error(`凭据访问被拒绝：角色 ${callerRole} 无权使用凭据 "${alias}"`);
  }
  const envSecret = process.env[cred.envVarName];
  if (!envSecret && isProductionAuthMode()) {
    throw new Error(`生产凭据未就绪：环境变量 ${cred.envVarName} 未配置`);
  }
  return envSecret ?? `dev-secret-for-${cred.alias}`;
}

export { validateConnectorEndpoint } from "./ssrf-guard.js";
