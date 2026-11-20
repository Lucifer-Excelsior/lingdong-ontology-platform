import { Hono } from "hono";
import { withTenantDb } from "../db/client.js";
import { requireRoles, type SessionActor } from "../security/guards.js";
import {
  deleteCapabilityRecord,
  deleteDataSourceCascade,
  deleteDocumentAndProposals,
  dismissChangeSetProposal,
  triggerCapabilityDryRunPlan,
  updateCapabilityRecord,
  updateOrDeleteEnterpriseUser,
} from "../services/ux-crud-service.js";
import {
  deleteOntologyBranch,
  deleteOntologyClassSafe,
  proposeCandidateRelease,
  rejectCandidateRelease,
} from "../services/ux-ontology-release-crud.js";

type AppEnv = { Variables: { actor: SessionActor } };

const modelerGuard = requireRoles("OWNER", "MODELER");
const operatorGuard = requireRoles("OWNER", "MODELER", "OPERATOR");
const reviewerGuard = requireRoles("OWNER", "REVIEWER");
const ownerGuard = requireRoles("OWNER");

export const uxCrudRoutes = new Hono<AppEnv>();

uxCrudRoutes.patch("/workspaces/:id/capabilities/:capId", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const body = await c.req.json();
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await updateCapabilityRecord(txDb, actor.tenantId, c.req.param("id"), c.req.param("capId"), `${actor.name} (${actor.role})`, body))
  );
});

uxCrudRoutes.delete("/workspaces/:id/capabilities/:capId", modelerGuard, async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await deleteCapabilityRecord(txDb, actor.tenantId, c.req.param("id"), c.req.param("capId"), `${actor.name} (${actor.role})`))
  );
});

uxCrudRoutes.post("/workspaces/:id/capabilities/:capId/trigger", operatorGuard, async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json().catch(() => ({}))) as { targetObjectLabel?: string; contractNo?: string; paramsSummary?: string };
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await triggerCapabilityDryRunPlan(txDb, actor.tenantId, c.req.param("id"), c.req.param("capId"), actor, body), 201)
  );
});

uxCrudRoutes.post("/workspaces/:id/releases/propose", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json().catch(() => ({}))) as { version?: string; notes?: string };
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await proposeCandidateRelease(txDb, actor.tenantId, c.req.param("id"), actor, body), 201)
  );
});

uxCrudRoutes.post("/workspaces/:id/releases/:releaseId/reject", reviewerGuard, async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await rejectCandidateRelease(txDb, actor.tenantId, c.req.param("id"), c.req.param("releaseId"), `${actor.name} (${actor.role})`, body.reason))
  );
});

uxCrudRoutes.delete("/workspaces/:id/ontology/classes/:classId", modelerGuard, async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await deleteOntologyClassSafe(txDb, actor.tenantId, c.req.param("id"), c.req.param("classId"), `${actor.name} (${actor.role})`))
  );
});

uxCrudRoutes.delete("/workspaces/:id/ontology/branches/:branchId", modelerGuard, async (c) => {
  const actor = c.get("actor");
  return c.json(await deleteOntologyBranch(actor.tenantId, c.req.param("id"), c.req.param("branchId")));
});

uxCrudRoutes.delete("/workspaces/:id/data-sources/:dsId", modelerGuard, async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await deleteDataSourceCascade(txDb, c.req.param("id"), c.req.param("dsId")))
  );
});

uxCrudRoutes.delete("/workspaces/:id/documents/:docId", modelerGuard, async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await deleteDocumentAndProposals(txDb, c.req.param("id"), c.req.param("docId")))
  );
});

uxCrudRoutes.delete("/workspaces/:id/changesets/proposals/:proposalId", modelerGuard, async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await dismissChangeSetProposal(txDb, c.req.param("id"), c.req.param("proposalId")))
  );
});

uxCrudRoutes.patch("/governance/users/:userId", ownerGuard, async (c) => {
  const actor = c.get("actor");
  const body = await c.req.json();
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await updateOrDeleteEnterpriseUser(txDb, actor.tenantId, c.req.param("userId"), "UPDATE", body))
  );
});

uxCrudRoutes.delete("/governance/users/:userId", ownerGuard, async (c) => {
  const actor = c.get("actor");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await updateOrDeleteEnterpriseUser(txDb, actor.tenantId, c.req.param("userId"), "DELETE"))
  );
});
