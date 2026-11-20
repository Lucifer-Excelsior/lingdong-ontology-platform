import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { adminSql, appSql, sandboxErpSql, withTenantDb } from "./db/client.js";
import { credentials, workspaces } from "./db/schema.js";
import { ensureSeeded } from "./seed/seed-service.js";
import {
  resolveTenantSecret,
  signSessionToken,
  validateConnectorEndpoint,
} from "./security/guards.js";

describe("V3 Zero-Trust Security, PostgreSQL RLS, Oxigraph ABox & SoD Gates", () => {
  const app = createApp();

  beforeAll(async () => {
    await ensureSeeded();
    await adminSql`UPDATE execution_runs SET status = 'AWAITING_APPROVAL', approved_by = NULL WHERE id = 'plan-905'`;
  });

  afterAll(async () => {
    await adminSql.end();
    await appSql.end();
    await sandboxErpSql.end();
  });

  it("blocks spoofed privilege headers even on localhost and blocks cross-origin CSRF writes", async () => {
    const spoofedRes = await app.request("http://localhost:8280/api/bootstrap", {
      headers: {
        Host: "localhost:8280",
        "x-tenant-id": "tenant-other",
        "x-actor-role": "OWNER",
      },
    });
    expect(spoofedRes.status).toBe(401);

    const csrfRes = await app.request("http://localhost:8280/api/session/switch-actor", {
      method: "POST",
      headers: {
        Origin: "https://evil-attacker.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: "user-linyuan" }),
    });
    expect(csrfRes.status).toBe(403);
  });

  it("enforces PostgreSQL native Row-Level Security (RLS) and blocks cross-tenant secret exfiltration", async () => {
    // tenant-other cannot see tenant-caict workspaces at SQL kernel level!
    const otherWs = await withTenantDb("tenant-other", (txDb) => txDb.select().from(workspaces));
    expect(otherWs).toHaveLength(0);

    // tenant-caict cannot see tenant-other's credentials row or resolve its secret!
    await withTenantDb("tenant-caict", async (txDb) => {
      const credsVisible = await txDb.select().from(credentials);
      expect(credsVisible.some((c) => c.alias === "OTHER_TENANT_VAULT")).toBe(false);

      await expect(
        resolveTenantSecret(txDb, "tenant-caict", "OWNER", "OTHER_TENANT_VAULT")
      ).rejects.toThrow(/未注册凭据别名/);

      // VIEWER cannot resolve ERP_CONTRACT_DB even in same tenant
      await expect(
        resolveTenantSecret(txDb, "tenant-caict", "VIEWER", "ERP_CONTRACT_DB")
      ).rejects.toThrow(/无权使用凭据/);
    });
  });

  it("blocks SSRF IPv6 ULA / IPv4-mapped loopback & dangerous JDBC injection params", () => {
    expect(() => validateConnectorEndpoint("http://[fc00::1]:8080/api")).toThrow(/IPv6/);
    expect(() => validateConnectorEndpoint("http://[::ffff:127.0.0.1]:8080/api")).toThrow(/IPv6/);
    expect(() => validateConnectorEndpoint("http://169.254.169.254/latest/meta-data")).toThrow(/SSRF/);
    expect(() =>
      validateConnectorEndpoint("jdbc:postgresql://db.example.com:5432/app?socketFactory=org.evil.Shell")
    ).toThrow(/高危 JDBC/);
  });

  it("queries unified TBox+ABox in Oxigraph, masks VIEWER columns, refuses out-of-scope salary queries, and enforces SoD", async () => {
    // 1. Viewer SPARQL masks totalAmount
    const viewerCookie = `lingdong_v3_session=${signSessionToken({
      userId: "user-chennan",
      name: "陈楠",
      role: "VIEWER",
      tenantId: "tenant-caict",
    })}`;
    const sparqlRes = await app.request("http://localhost:8280/api/workspaces/ws-contract/sparql", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3200",
        Cookie: viewerCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceId: "ws-contract",
        query: "SELECT ?contractNo ?totalAmount WHERE { ?c a ont:Contract ; ont:contractNo ?contractNo ; ont:totalAmount ?totalAmount . }",
      }),
    });
    expect(sparqlRes.status).toBe(200);
    const sparqlJson = (await sparqlRes.json()) as { rows: Array<Record<string, string>>; maskedColumnsApplied: string[] };
    expect(sparqlJson.rows.length).toBeGreaterThanOrEqual(4);
    expect(sparqlJson.rows[0].totalAmount).toBe("***MASKED_BY_ROLE***");

    // 2. Agent refuses out-of-scope employee salary question
    const askSalaryRes = await app.request("http://localhost:8280/api/workspaces/ws-contract/agent/ask", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3200",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceId: "ws-contract",
        question: "请查询周明今年的年薪和奖金明细",
      }),
    });
    const askSalaryJson = (await askSalaryRes.json()) as { message: { content: string } };
    expect(askSalaryJson.message.content).toContain("安全策略拒答");

    // 3. Optimistic lock CAS conflict returns 409 on stale baseRevisionId
    const staleCommitRes = await app.request("http://localhost:8280/api/workspaces/ws-contract/changesets/commit", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3200",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceId: "ws-contract",
        baseRevisionId: "0000stale",
        proposalIds: ["prop-notice-days"],
      }),
    });
    expect(staleCommitRes.status).toBe(409);

    // 4. Separation of Duties (SoD): Linyuan (requester) CANNOT self-approve PLAN-905 (403), Zhangmin (REVIEWER) CAN!
    const selfApproveRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/agent/plans/plan-905/approve",
      {
        method: "POST",
        headers: { Origin: "http://localhost:3200" },
      }
    );
    expect(selfApproveRes.status).toBe(403);

    // Download immutable release .zip bundle
    const zipRes = await app.request(
      "http://localhost:8280/api/workspaces/ws-contract/releases/rel-v2-0-0/download"
    );
    expect(zipRes.status).toBe(200);
    expect(zipRes.headers.get("content-type")).toBe("application/zip");
    const zipBytes = new Uint8Array(await zipRes.arrayBuffer());
    expect(zipBytes.byteLength).toBeGreaterThan(200);
  });
});
