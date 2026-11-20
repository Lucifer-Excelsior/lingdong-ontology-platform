import { Hono } from "hono";
import { withTenantDb } from "../db/client.js";
import { requireRoles, type SessionActor } from "../security/guards.js";
import {
  analyzeOntologyRetirementImpact,
  evaluateExistingOntologyReuse,
  getOntologyImportsAndRefs,
  getOntologyRetirementState,
  getRequirementTraceMatrix,
  setOntologyRetirementStatus,
  simulateRequirementChangeImpact,
  upsertRequirementTrace,
} from "../services/std-requirements-lifecycle-service.js";
import {
  analyzeExternalImportForWorkspace,
  createInferenceRule,
  evaluateInferenceRulesWithTraces,
  exportWorkspaceJsonLd,
  listInferenceDerivationTraces,
  listInferenceRules,
  toggleOrDeleteInferenceRule,
  updateClassAxioms,
  updatePropertyAxioms,
} from "../services/std-axioms-rules-service.js";

type AppEnv = { Variables: { actor: SessionActor } };

const modelerGuard = requireRoles("OWNER", "MODELER");
const ownerGuard = requireRoles("OWNER");

export const stdComplianceRoutes = new Hono<AppEnv>();

// 1.3 Existing Ontology Reuse Assessment
stdComplianceRoutes.post("/workspaces/:id/modeling/evaluate-reuse", async (c) => {
  const actor = c.get("actor");
  const body = await c.req.json();
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await evaluateExistingOntologyReuse(txDb, c.req.param("id"), body))
  );
});

// 1.4 & 1.5 Requirement Traceability Matrix & Change Impact
stdComplianceRoutes.get("/workspaces/:id/requirements/trace-matrix", async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json({ items: await getRequirementTraceMatrix(txDb, actor.tenantId, c.req.param("id")) })
  );
});

stdComplianceRoutes.post("/workspaces/:id/requirements/:cqId/trace", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const body = await c.req.json();
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await upsertRequirementTrace(txDb, actor.tenantId, c.req.param("id"), c.req.param("cqId"), body))
  );
});

stdComplianceRoutes.post("/workspaces/:id/requirements/:cqId/simulate-change", async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json().catch(() => ({}))) as { proposedChange?: string };
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(
      await simulateRequirementChangeImpact(
        txDb,
        actor.tenantId,
        c.req.param("id"),
        c.req.param("cqId"),
        body.proposedChange ?? ""
      )
    )
  );
});

// 2.2, 2.5, 2.7 Equivalent Class, Property Characteristics & Property Hierarchy
stdComplianceRoutes.patch("/workspaces/:id/ontology/classes/:localName/axioms", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const body = await c.req.json();
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(
      await updateClassAxioms(
        txDb,
        actor.tenantId,
        c.req.param("id"),
        c.req.param("localName"),
        `${actor.name} (${actor.role})`,
        body
      )
    )
  );
});

stdComplianceRoutes.patch("/workspaces/:id/ontology/properties/:localName/axioms", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const body = await c.req.json();
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(
      await updatePropertyAxioms(
        txDb,
        actor.tenantId,
        c.req.param("id"),
        c.req.param("localName"),
        `${actor.name} (${actor.role})`,
        body
      )
    )
  );
});

// 3.4, 3.5, 4.6, 4.7 Inference Rules & Derivation Traces
stdComplianceRoutes.get("/workspaces/:id/ontology/inference-rules", async (c) => {
  const actor = c.get("actor");
  const [rules, traces] = await Promise.all([
    listInferenceRules(actor.tenantId, c.req.param("id")),
    listInferenceDerivationTraces(actor.tenantId, c.req.param("id")),
  ]);
  return c.json({ rules, traces });
});

stdComplianceRoutes.post("/workspaces/:id/ontology/inference-rules", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const body = await c.req.json();
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await createInferenceRule(txDb, actor.tenantId, c.req.param("id"), `${actor.name} (${actor.role})`, body), 201)
  );
});

stdComplianceRoutes.patch("/workspaces/:id/ontology/inference-rules/:ruleId/toggle", modelerGuard, async (c) => {
  const actor = c.get("actor");
  return c.json(await toggleOrDeleteInferenceRule(actor.tenantId, c.req.param("id"), c.req.param("ruleId"), "TOGGLE"));
});

stdComplianceRoutes.delete("/workspaces/:id/ontology/inference-rules/:ruleId", modelerGuard, async (c) => {
  const actor = c.get("actor");
  return c.json(await toggleOrDeleteInferenceRule(actor.tenantId, c.req.param("id"), c.req.param("ruleId"), "DELETE"));
});

stdComplianceRoutes.post("/workspaces/:id/ontology/inference-rules/evaluate", async (c) => {
  const actor = c.get("actor");
  return c.json(await evaluateInferenceRulesWithTraces(actor.tenantId, c.req.param("id")));
});

// 3.6, 3.7, 3.8 JSON-LD Export & External Import Metadata/Conflict Analysis
stdComplianceRoutes.get("/workspaces/:id/ontology/export.jsonld", async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) => {
    const jsonld = await exportWorkspaceJsonLd(txDb, actor.tenantId, c.req.param("id"));
    return new Response(JSON.stringify(jsonld, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/ld+json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${c.req.param("id")}-ontology.jsonld"`,
      },
    });
  });
});

stdComplianceRoutes.post("/workspaces/:id/ontology/import-analyze", async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json()) as { rdfText?: string; fileName?: string };
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await analyzeExternalImportForWorkspace(txDb, c.req.param("id"), body.rdfText ?? "", body.fileName ?? "external.ttl"))
  );
});

// 5.2, 5.9, 5.10 Reference Checks & Ontology Retirement Lifecycle
stdComplianceRoutes.get("/workspaces/:id/lifecycle/status", async (c) => {
  const actor = c.get("actor");
  const [retirement, imports] = await Promise.all([
    getOntologyRetirementState(actor.tenantId, c.req.param("id")),
    getOntologyImportsAndRefs(actor.tenantId, c.req.param("id")),
  ]);
  return c.json({ retirement, imports });
});

stdComplianceRoutes.post("/workspaces/:id/lifecycle/retire-impact", async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await analyzeOntologyRetirementImpact(txDb, c.req.param("id")))
  );
});

stdComplianceRoutes.post("/workspaces/:id/lifecycle/retire", ownerGuard, async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await setOntologyRetirementStatus(txDb, actor.tenantId, c.req.param("id"), `${actor.name} (${actor.role})`, "RETIRED", body.reason))
  );
});

stdComplianceRoutes.post("/workspaces/:id/lifecycle/reactivate", ownerGuard, async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await setOntologyRetirementStatus(txDb, actor.tenantId, c.req.param("id"), `${actor.name} (${actor.role})`, "ACTIVE"))
  );
});
