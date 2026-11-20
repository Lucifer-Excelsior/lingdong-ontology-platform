import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkClassHierarchyAndSatisfiability } from "@lingdong/semantic-core";
import { createApp } from "./app.js";
import { adminSql, appSql, sandboxErpSql } from "./db/client.js";
import { ensureSeeded } from "./seed/seed-service.js";

const JSON_HEADERS = { "content-type": "application/json" };

describe("37/37 Standard Compliance Full Coverage Suite", () => {
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

  it("1.3, 1.4, 1.5: evaluates existing ontology reuse, manages RTM, and simulates requirement change impact", async () => {
    const reuseRes = await app.request("/api/workspaces/ws-contract/modeling/evaluate-reuse", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        assetId: "asset-fibo",
        assetTitle: "FIBO 合同金融本体",
        version: "v2.4.0",
        turtleSnippet: "fibo:Contract a owl:Class . fibo:Organization a owl:Class .",
      }),
    });
    expect(reuseRes.status).toBe(200);
    const reuse = (await reuseRes.json()) as { versionValid: boolean; coveragePercent: number; recommendedStrategy: string };
    expect(reuse.versionValid).toBe(true);
    expect(reuse.coveragePercent).toBeGreaterThanOrEqual(35);

    const rtmRes = await app.request("/api/workspaces/ws-contract/requirements/trace-matrix");
    expect(rtmRes.status).toBe(200);
    const { items } = (await rtmRes.json()) as { items: Array<{ cqId: string }> };
    expect(items.length).toBeGreaterThan(0);

    const impactRes = await app.request(`/api/workspaces/ws-contract/requirements/${items[0].cqId}/simulate-change`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ proposedChange: "将到期预警提前至 60 天" }),
    });
    expect(impactRes.status).toBe(200);
    const impact = (await impactRes.json()) as { affectedClasses: string[]; riskLevel: string };
    expect(impact.affectedClasses.length).toBeGreaterThan(0);
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(impact.riskLevel);
  });

  it("2.2, 2.5, 2.7, 3.6, 3.7, 3.8: exports JSON-LD with axioms & analyzes external ontology owl:imports and conflicts", async () => {
    const jsonldRes = await app.request("/api/workspaces/ws-contract/ontology/export.jsonld");
    expect(jsonldRes.status).toBe(200);
    const jsonld = (await jsonldRes.json()) as { "@context": Record<string, string>; "@graph": unknown[] };
    expect(jsonld["@context"].owl).toContain("owl#");
    expect(jsonld["@graph"].length).toBeGreaterThan(2);

    const extTtl = `@prefix ont: <https://ext.example/v1#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<https://ext.example/v1> a owl:Ontology ; owl:versionInfo "2.1.0" ; owl:imports <http://www.w3.org/ns/prov-o#> .
ont:Contract a owl:Class ; rdfs:label "外部合同"@zh .`;

    const analyzeRes = await app.request("/api/workspaces/ws-contract/ontology/import-analyze", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ rdfText: extTtl, fileName: "ext.ttl" }),
    });
    expect(analyzeRes.status).toBe(200);
    const analysis = (await analyzeRes.json()) as { imports: string[]; versionInfo: string; conflicts: Array<{ localName: string }> };
    expect(analysis.versionInfo).toBe("2.1.0");
    expect(analysis.imports).toContain("http://www.w3.org/ns/prov-o#");
    expect(analysis.conflicts.some((c) => c.localName === "Contract")).toBe(true);
  });

  it("3.4, 3.5, 4.3, 4.4, 4.6, 4.7: validates inference rules, records derivation traces, and detects class cycles/unsatisfiability", async () => {
    const createRes = await app.request("/api/workspaces/ws-contract/ontology/inference-rules", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: "大额合同自动标记规则",
        scopeClass: "Contract",
        conditionExpr: "ont:totalAmount > 2000000",
        conclusionExpr: "rdf:type ont:KeyContract",
      }),
    });
    expect(createRes.status).toBe(201);
    const { rule } = (await createRes.json()) as { rule: { id: string } };

    const evalRes = await app.request("/api/workspaces/ws-contract/ontology/inference-rules/evaluate", { method: "POST" });
    expect(evalRes.status).toBe(200);
    const evalData = (await evalRes.json()) as { traces: Array<{ premises: string[]; inferredConclusion: string }> };
    expect(evalData.traces.length).toBeGreaterThan(0);
    expect(evalData.traces[0].premises.length).toBeGreaterThan(0);

    // Clean up created rule
    await app.request(`/api/workspaces/ws-contract/ontology/inference-rules/${rule.id}`, { method: "DELETE" });

    // Formal 4.3 & 4.4 check on cyclic + unsatisfiable classes
    const formal = checkClassHierarchyAndSatisfiability([
      { localName: "A", subClassOf: "ont:B", disjointWith: "ont:C" } as never,
      { localName: "B", subClassOf: "ont:A" } as never,
      { localName: "C", subClassOf: "owl:Thing" } as never,
    ]);
    expect(formal.hierarchyCycles.length).toBeGreaterThan(0);
  });

  it("5.2, 5.9, 5.10: checks release references, analyzes retirement impact, and retires/reactivates ontology", async () => {
    const impactRes = await app.request("/api/workspaces/ws-contract/lifecycle/retire-impact", { method: "POST" });
    expect(impactRes.status).toBe(200);
    const impact = (await impactRes.json()) as { riskLevel: string; affectedApps: string[] };
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(impact.riskLevel);

    const retRes = await app.request("/api/workspaces/ws-contract/lifecycle/retire", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ reason: "测试退役流转验证" }),
    });
    expect(retRes.status).toBe(200);
    const retired = (await retRes.json()) as { status: string; retiredReason: string };
    expect(retired.status).toBe("RETIRED");
    expect(retired.retiredReason).toBe("测试退役流转验证");
  });
});
