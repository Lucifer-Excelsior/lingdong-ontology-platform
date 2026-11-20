import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { adminSql, appSql, sandboxErpSql } from "./db/client.js";
import { signSessionToken, validateConnectorEndpoint, verifySessionToken } from "./security/guards.js";
import { ensureSeeded } from "./seed/seed-service.js";

const JSON_HEADERS = { "content-type": "application/json" };

describe("P0/P1/P2 Production Security & Hardening Regression Suite", () => {
  const app = createApp();

  beforeAll(async () => {
    await ensureSeeded();
  });

  afterAll(async () => {
    await app.request("/api/workspaces/ws-contract/lifecycle/reactivate", { method: "POST" });
    await adminSql.end();
    await appSql.end();
    await sandboxErpSql.end();
  });

  it("P0-2: rejects unknown username login with 401 instead of escalating to OWNER", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: "attacker_nonexistent_user", passcode: "Lingdong@2026" }),
    });
    expect(res.status).toBe(401);
  });

  it("P0-3: rejects expired HMAC session tokens in verifySessionToken", () => {
    const expired = signSessionToken(
      { userId: "user-linyuan", name: "林远", role: "OWNER", tenantId: "tenant-caict" },
      -10
    );
    expect(verifySessionToken(expired)).toBeNull();

    const valid = signSessionToken(
      { userId: "user-linyuan", name: "林远", role: "OWNER", tenantId: "tenant-caict" },
      300
    );
    expect(verifySessionToken(valid)?.userId).toBe("user-linyuan");
  });

  it("P0-1: ignores unsigned/forged Bearer JWT when OIDC_JWKS_URI is unset", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "forged-attacker", name: "Attacker", role: "OWNER", tenant_id: "tenant-other" })
    ).toString("base64url");
    const forgedJwt = `${header}.${payload}.unsigned`;

    const res = await app.request("/api/bootstrap", {
      headers: { Authorization: `Bearer ${forgedJwt}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { currentUser?: { id?: string } };
    expect(body.currentUser?.id).not.toBe("forged-attacker");
  });

  it("P0-5: blocks 0.0.0.0, decimal/hex encoded IPv4, and IPv6 unspecified in SSRF guard", () => {
    expect(() => validateConnectorEndpoint("http://0.0.0.0:8280/api")).toThrow(/SSRF/);
    expect(() => validateConnectorEndpoint("http://2130706433/admin")).toThrow(/SSRF/);
    expect(() => validateConnectorEndpoint("http://0x7f000001/admin")).toThrow(/SSRF/);
    expect(() => validateConnectorEndpoint("http://[::]:8280/")).toThrow(/SSRF/);
  });

  it("P2-11/12: exposes real PG readiness on /readyz and attaches X-Request-Id header", async () => {
    const res = await app.request("/readyz");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    const body = (await res.json()) as { ready: boolean; postgres: string };
    expect(body.ready).toBe(true);
    expect(body.postgres).toBe("ok");
  });

  it("P1-7: enforces write freeze on RETIRED workspace until reactivated", async () => {
    const retireRes = await app.request("/api/workspaces/ws-contract/lifecycle/retire", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        reason: "安全加固回归测试：验证退役后冻结写操作",
        replacementIri: "http://lingdong.caict.ac.cn/ont/contract/v2#",
      }),
    });
    expect(retireRes.status).toBe(200);

    const blockedRes = await app.request("/api/workspaces/ws-contract/ontology/classes/Contract/axioms", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ disjointWith: "ont:Party" }),
    });
    expect(blockedRes.status).toBe(400);
    const errBody = (await blockedRes.json()) as { error?: string };
    expect(errBody.error).toContain("退役");

    const reactivateRes = await app.request("/api/workspaces/ws-contract/lifecycle/reactivate", { method: "POST" });
    expect(reactivateRes.status).toBe(200);
  });
});
