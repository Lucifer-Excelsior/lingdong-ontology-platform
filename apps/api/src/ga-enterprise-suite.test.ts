import { generateKeyPairSync, sign } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { adminSql, appSql, sandboxErpSql } from "./db/client.js";
import { ensureSeeded } from "./seed/seed-service.js";
import { verifyJwtWithJwk } from "./security/oidc-jwks.js";
import { probeViaDriverRegistry } from "./services/connectors/driver-registry.js";
import { signImCallbackBody } from "./services/ga-license-and-quota.js";

const JSON_HEADERS = { "content-type": "application/json" };

describe("V4.0 Enterprise GA Production Hardening Suite (GA-1..GA-4)", () => {
  const app = createApp();

  beforeAll(async () => {
    await ensureSeeded();
  });

  afterAll(async () => {
    await adminSql.end();
    await appSql.end();
    await sandboxErpSql.end();
  });

  it("GA-1 & GA-2: exposes graph cluster status and unified driver registry (PG + ClickHouse + Xinchuang DM8)", async () => {
    const statusRes = await app.request("/api/workspaces/ws-contract/ga/status");
    expect(statusRes.status).toBe(200);
    const status = (await statusRes.json()) as { auditHashAlgo: string; graphCluster: { healthy: boolean } };
    expect(status.auditHashAlgo).toBe("SM3");
    expect(status.graphCluster.healthy).toBe(true);

    const dm8 = await probeViaDriverRegistry({
      kind: "DAMENG_DM8",
      connectionUrl: "dm://finance.corp.internal:5236/ERP",
      secret: "test",
      isLocalSandbox: false,
    });
    expect(dm8.driverMode).toBe("XINCHUANG_SIDECAR");

    const ch = await probeViaDriverRegistry({
      kind: "CLICKHOUSE",
      connectionUrl: "clickhouse://olap.corp.internal:8123/default",
      secret: "test",
      isLocalSandbox: false,
    });
    expect(ch.detail).toContain("ClickHouse");
  });

  it("GA-3: verifies OIDC JWKS RS256 signatures, enterprise login cookie, and Ed25519 offline .lic activation", async () => {
    // 1. Real RS256 JWK signature verification
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" });
    const h = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const p = Buffer.from(
      JSON.stringify({ iss: "https://idp.corp.example", aud: "lingdong-v4", sub: "u-sso-1", name: "SSO 管理员", role: "OWNER", exp: Math.floor(Date.now() / 1000) + 600 })
    ).toString("base64url");
    const sig = sign("RSA-SHA256", Buffer.from(`${h}.${p}`), privateKey).toString("base64url");

    const validJwt = verifyJwtWithJwk(`${h}.${p}.${sig}`, jwk, "https://idp.corp.example", "lingdong-v4");
    expect(validJwt.valid).toBe(true);
    expect(validJwt.actor?.role).toBe("OWNER");

    const badJwt = verifyJwtWithJwk(`${h}.${p}.tamperedSig`, jwk, "https://idp.corp.example", "lingdong-v4");
    expect(badJwt.valid).toBe(false);

    // 2. Enterprise production login endpoint
    const badLogin = await app.request("/api/auth/login", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: "林远", passcode: "WrongPass" }),
    });
    expect(badLogin.status).toBe(401);

    const okLogin = await app.request("/api/auth/login", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: "林远", passcode: "Lingdong@2026" }),
    });
    expect(okLogin.status).toBe(200);
    expect(okLogin.headers.get("set-cookie")).toContain("lingdong_v3_session=");

    // 3. Ed25519 offline .lic issue + upload + tamper rejection
    const issueRes = await app.request("/api/governance/license/issue-demo", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ licensedTo: "国家电网智能本体中心", maxUsers: 500 }),
    });
    expect(issueRes.status).toBe(200);
    const { licenseText } = (await issueRes.json()) as { licenseText: string };

    const upRes = await app.request("/api/governance/license/upload", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ licenseText }),
    });
    expect(upRes.status).toBe(200);

    const tamperRes = await app.request("/api/governance/license/upload", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ licenseText: `${licenseText.slice(0, -4)}AAAA` }),
    });
    expect(tamperRes.status).toBe(400);
  });

  it("GA-4: verifies HMAC-SHA256 bidirectional IM approval callback and 429 LLM Token hard quota circuit breaker", async () => {
    const rawBody = JSON.stringify({
      workspaceId: "ws-contract",
      targetType: "ACTION_PLAN",
      targetRef: "plan-ga-demo",
      decision: "APPROVE",
      approverName: "张敏",
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const secret = process.env.IM_CALLBACK_HMAC_SECRET ?? "lingdong-ga-im-callback-secret";
    const sig = signImCallbackBody(ts, rawBody, secret);

    const badCb = await app.request("/api/webhooks/im-callback/WECOM", {
      method: "POST",
      headers: { "content-type": "application/json", "x-lingdong-timestamp": ts, "x-lingdong-signature": "bad" },
      body: rawBody,
    });
    expect(badCb.status).toBe(401);

    const okCb = await app.request("/api/webhooks/im-callback/WECOM", {
      method: "POST",
      headers: { "content-type": "application/json", "x-lingdong-timestamp": ts, "x-lingdong-signature": sig },
      body: rawBody,
    });
    expect(okCb.status).toBe(200);
    const cbJson = (await okCb.json()) as { ok: boolean; algo: string; auditHash: string };
    expect(cbJson.ok).toBe(true);
    expect(cbJson.algo).toBe("SM3");
    expect(cbJson.auditHash.length).toBe(64);

    // LLM Token hard quota circuit breaker -> HTTP 429
    const quotaRes = await app.request("/api/workspaces/ws-contract/ga/quota/consume", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ tokens: 99_999_999 }),
    });
    expect(quotaRes.status).toBe(429);
    const qJson = (await quotaRes.json()) as { code: string };
    expect(qJson.code).toBe("LLM_QUOTA_EXCEEDED");
  });
});
