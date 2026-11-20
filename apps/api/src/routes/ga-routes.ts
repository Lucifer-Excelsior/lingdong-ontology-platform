import { scryptSync, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { resolveAuditHashAlgo } from "@lingdong/semantic-core";
import { withTenantDb } from "../db/client.js";
import { users } from "../db/schema.js";
import { getGraphClusterStatus } from "../graph-runtime.js";
import { isOriginAllowed, issueSessionCookie, requireRoles, SESSION_COOKIE, type SessionActor } from "../security/guards.js";
import { isProductionAuthMode } from "../security/oidc-jwks.js";
import {
  clearDistributedRateLimit,
  incrementDistributedRateLimit,
  revokeSessionToken,
} from "../security/redis-store.js";
import {
  activateOfflineLicense,
  consumeAndCheckLlmTokens,
  getActiveOfflineLicense,
  getMonthlyTokenUsage,
  issueSignedDemoLicense,
  LlmQuotaExceededError,
  processImApprovalCallback,
} from "../services/ga-license-and-quota.js";

type AppEnv = { Variables: { actor: SessionActor } };

const ownerGuard = requireRoles("OWNER");
const loginFailures = new Map<string, { count: number; lockedUntilMs: number }>();

/**
 * Public GA endpoints (reachable even in APP_ENV=production before login, or by IM servers via HMAC).
 */
export const gaPublicRoutes = new Hono<AppEnv>();

gaPublicRoutes.get("/auth/mode", (c) => {
  const prod = isProductionAuthMode();
  return c.json({
    appEnv: prod ? "production" : "development",
    demoSwitcherEnabled: !prod,
    oidcConfigured: Boolean(process.env.OIDC_ISSUER_URL || process.env.OIDC_JWKS_URI),
    oidcLoginUrl: process.env.OIDC_LOGIN_URL ?? null,
    auditHashAlgo: resolveAuditHashAlgo(),
  });
});

gaPublicRoutes.post("/auth/login", async (c) => {
  if (!isOriginAllowed(c.req.header("origin"))) {
    return c.json({ error: "CSRF Origin 校验失败：拒绝跨站登录请求" }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { username?: string; passcode?: string; tenantId?: string };
  const key = (body.username ?? "").trim().toLowerCase();
  if (!key || !body.passcode) {
    return c.json({ error: "请输入账号与安全口令" }, 400);
  }

  // Evict expired lockouts to prevent unbounded memory growth
  if (loginFailures.size > 500) {
    const now = Date.now();
    for (const [k, v] of loginFailures) {
      if (v.lockedUntilMs > 0 && v.lockedUntilMs <= now) loginFailures.delete(k);
    }
  }

  const state = loginFailures.get(key);
  if (state && state.lockedUntilMs > Date.now()) {
    return c.json({ error: "连续登录失败次数过多，账号已锁定 5 分钟" }, 429);
  }

  const expectedPasscode = process.env.ENTERPRISE_ADMIN_PASSCODE ?? "Lingdong@2026";
  const salt = "lingdong-v4-scrypt-salt";
  const aHash = scryptSync(body.passcode, salt, 32);
  const bHash = scryptSync(expectedPasscode, salt, 32);
  if (!timingSafeEqual(aHash, bHash)) {
    const rl = await incrementDistributedRateLimit(`login:${key}`, 300);
    loginFailures.set(key, {
      count: rl.count,
      lockedUntilMs: rl.count >= 5 ? Date.now() + 5 * 60 * 1000 : 0,
    });
    const status = rl.count >= 5 ? 429 : 401;
    return c.json({ error: `账号或安全口令错误（剩余尝试 ${Math.max(0, 5 - rl.count)} 次）` }, status);
  }

  const tenantId = (body.tenantId ?? "tenant-caict").trim();
  const matched = await withTenantDb(tenantId, async (txDb) => {
    const all = await txDb.select().from(users);
    return all.find((u) => u.id.toLowerCase() === key || u.name.toLowerCase() === key) ?? null;
  });
  if (!matched) {
    return c.json({ error: "账号或安全口令错误" }, 401);
  }

  loginFailures.delete(key);
  await clearDistributedRateLimit(`login:${key}`);
  const actor: SessionActor = {
    userId: matched.id,
    name: matched.name,
    role: matched.defaultRole,
    tenantId,
  };
  issueSessionCookie(c, actor);
  return c.json({ ok: true, actor, message: `企业生产登录成功：${actor.name} (${actor.role})` });
});

gaPublicRoutes.post("/auth/logout", async (c) => {
  if (!isOriginAllowed(c.req.header("origin"))) {
    return c.json({ error: "CSRF Origin 校验失败" }, 403);
  }
  const rawToken = getCookie(c, SESSION_COOKIE);
  if (rawToken) {
    await revokeSessionToken(rawToken);
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true, message: "已安全退出企业会话并吊销当前令牌" });
});

gaPublicRoutes.post("/webhooks/im-callback/:channel", async (c) => {
  const rawCh = c.req.param("channel").toUpperCase();
  if (rawCh !== "WECOM" && rawCh !== "DINGTALK" && rawCh !== "FEISHU") {
    return c.json({ error: "不支持的 IM 回调通道" }, 400);
  }
  const rawBody = await c.req.text();
  const tenantId = c.req.header("x-lingdong-tenant") ?? "tenant-caict";
  try {
    return await withTenantDb(tenantId, async (txDb) =>
      c.json(
        await processImApprovalCallback(
          txDb,
          tenantId,
          rawCh,
          c.req.header("x-lingdong-timestamp"),
          c.req.header("x-lingdong-signature"),
          rawBody
        )
      )
    );
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "IM 双向回调校验失败" }, 401);
  }
});

/**
 * Authenticated GA endpoints.
 */
export const gaProtectedRoutes = new Hono<AppEnv>();

gaProtectedRoutes.get("/workspaces/:id/ga/status", async (c) => {
  const actor = c.get("actor");
  const [graphCluster, activeLicense, tokenUsage] = await Promise.all([
    getGraphClusterStatus(),
    getActiveOfflineLicense(actor.tenantId),
    getMonthlyTokenUsage(actor.tenantId),
  ]);
  return c.json({
    appEnv: isProductionAuthMode() ? "production" : "development",
    auditHashAlgo: resolveAuditHashAlgo(),
    graphCluster,
    offlineLicenseActive: Boolean(activeLicense),
    offlineLicense: activeLicense,
    tokenUsage,
  });
});

gaProtectedRoutes.post("/governance/license/upload", ownerGuard, async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json().catch(() => ({}))) as { licenseText?: string };
  if (!body.licenseText?.trim()) {
    return c.json({ error: "请粘贴或上传 Ed25519 离线 .lic 授权证书内容" }, 400);
  }
  const result = await activateOfflineLicense(actor.tenantId, body.licenseText);
  return c.json(result, 200);
});

gaProtectedRoutes.post("/governance/license/issue-demo", ownerGuard, async (c) => {
  if (isProductionAuthMode()) {
    return c.json({ error: "生产环境已禁用演示授权证书签发接口，请使用离线 lingdong-cli sign-license" }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { licensedTo?: string; maxUsers?: number };
  const licText = issueSignedDemoLicense({
    licensedTo: body.licensedTo?.trim() || "中国信息通信研究院 · 政企智能语义中心",
    maxUsers: body.maxUsers ?? 200,
  });
  return c.json({ licenseText: licText, alg: "Ed25519", message: "已使用厂商 Ed25519 私钥签发离线 .lic 测试证书" });
});

gaProtectedRoutes.post("/workspaces/:id/ga/quota/consume", async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json().catch(() => ({}))) as { tokens?: number };
  try {
    const out = await consumeAndCheckLlmTokens(actor.tenantId, Number(body.tokens ?? 500));
    return c.json({ ok: true, ...out });
  } catch (err) {
    if (err instanceof LlmQuotaExceededError) {
      return c.json(
        { error: err.message, code: "LLM_QUOTA_EXCEEDED", usedTokens: err.usedTokens, quotaTokens: err.quotaTokens },
        429
      );
    }
    throw err;
  }
});
