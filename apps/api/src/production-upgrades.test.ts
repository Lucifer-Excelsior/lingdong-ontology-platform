import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activeAboxGraphUri,
  evaluateShaclSparqlReport,
  RDF_NS,
  SemanticGraphStore,
  shaclGraphUri,
} from "@lingdong/semantic-core";
import { createApp } from "./app.js";
import { adminSql, appSql, sandboxErpSql, withTenantDb } from "./db/client.js";
import { deleteRuntimeKv, loadRuntimeKv, saveRuntimeKv } from "./db/runtime-kv.js";
import { ensureSeeded } from "./seed/seed-service.js";
import { executeGenericR2rmlMaterialization } from "./services/generic-r2rml-materializer.js";

describe("Production Upgrades Suite (Items #1, #3, #5, #6)", () => {
  const app = createApp();

  beforeAll(async () => {
    await ensureSeeded();
  });

  afterAll(async () => {
    await deleteRuntimeKv("tenant-caict", "test_ns", "cursor_1");
    await adminSql.end();
    await appSql.end();
    await sandboxErpSql.end();
  });

  it("Item #1: runs generic R2RML dynamic materialization over workspace semantic_mappings", async () => {
    const res = await withTenantDb("tenant-caict", (txDb) =>
      executeGenericR2rmlMaterialization({
        txDb,
        tenantId: "tenant-caict",
        callerRole: "OWNER",
        workspaceId: "ws-contract",
        classes: [],
        prevCursor: null,
        batchSize: 50,
      })
    );
    expect(res.mappedTables).toContain("public.contracts");
    expect(res.writtenTriples).toBeGreaterThan(10);
  });

  it("Item #3: persists runtime_kv_state in PostgreSQL with strict RLS tenant isolation", async () => {
    await saveRuntimeKv("tenant-caict", "test_ns", "cursor_1", { lastValue: "2026-12-01" });
    const own = await loadRuntimeKv<{ lastValue: string }>("tenant-caict", "test_ns", "cursor_1");
    expect(own?.lastValue).toBe("2026-12-01");

    const otherTenant = await loadRuntimeKv<{ lastValue: string }>("tenant-other", "test_ns", "cursor_1");
    expect(otherTenant).toBeNull();
  });

  it("Item #5: dynamically evaluates custom sh:sparql SHACL-SPARQL constraints in Oxigraph", () => {
    const store = new SemanticGraphStore();
    const ns = "https://example.org/test#";
    store.loadTurtleIntoGraph(
      `
      @prefix sh: <${RDF_NS.sh}> .
      @prefix ont: <${ns}> .
      ont:CustomShape a sh:NodeShape ;
        sh:sparql [
          sh:message "自定义跨跳规则违例：状态为 EXPIRED 却缺少归档标记"@zh ;
          sh:select "SELECT ?this WHERE { ?this a ont:Item ; ont:status 'EXPIRED' . FILTER NOT EXISTS { ?this ont:archived 'true' } }"
        ] .
      `,
      shaclGraphUri("ws-shacl-test", "r1")
    );
    store.writeTriplesToGraph(
      [
        { subject: `${ns}item/1`, predicate: `${RDF_NS.rdf}type`, object: `${ns}Item` },
        { subject: `${ns}item/1`, predicate: `${ns}status`, object: "EXPIRED", isLiteral: true },
      ],
      activeAboxGraphUri("ws-shacl-test"),
      true
    );
    const report = evaluateShaclSparqlReport(store, "ws-shacl-test", "r1", ns);
    expect(report.conforms).toBe(false);
    expect(report.violations[0]?.message).toContain("自定义跨跳规则违例");
    expect(report.validationReportTurtle).toContain("sh:conforms false");
  });

  it("Item #6: returns live telemetry metrics and authenticates trusted SSO proxy headers", async () => {
    process.env.TRUSTED_SSO_SECRET = "test-sso-secret-99";
    try {
      const govRes = await app.request("http://localhost:8280/api/workspaces/ws-contract/governance", {
        headers: {
          "x-sso-proxy-secret": "test-sso-secret-99",
          "x-forwarded-user": "sso-alice",
          "x-forwarded-name": "Alice",
          "x-forwarded-role": "REVIEWER",
          "x-forwarded-tenant": "tenant-caict",
        },
      });
      expect(govRes.status).toBe(200);
      const gov = (await govRes.json()) as {
        currentUser: { id: string; role: string };
        operationsMetrics: { rdfStoreStatus: string; millionScaleBaseline: string };
      };
      expect(gov.currentUser.id).toBe("sso-alice");
      expect(gov.currentUser.role).toBe("REVIEWER");
      expect(gov.operationsMetrics.rdfStoreStatus).toContain("实时在线");
      expect(gov.operationsMetrics.millionScaleBaseline).toContain("Quads");
    } finally {
      delete process.env.TRUSTED_SSO_SECRET;
    }
  });
});
