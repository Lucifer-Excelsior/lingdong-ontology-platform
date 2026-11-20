import { z } from "zod";
import { RoleSchema } from "./workspace-ontology.js";

export const AutonomyTierSchema = z.enum(["READ", "DRAFT", "CONFIRM", "APPROVE"]);
export type AutonomyTier = z.infer<typeof AutonomyTierSchema>;

export const RiskLevelSchema = z.enum(["LOW", "NONE", "MEDIUM", "HIGH"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const CapabilitySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  code: z.string(),
  name: z.string(),
  autonomyTier: AutonomyTierSchema,
  riskLevel: RiskLevelSchema,
  description: z.string(),
  targetEntityLocalName: z.string(),
  compensationCapabilityCode: z.string().nullable(),
  mcpExposed: z.boolean(),
  mcpUri: z.string().nullable(),
  quotaPerMinute: z.number().int().default(60),
});
export type Capability = z.infer<typeof CapabilitySchema>;

export const ExecutionStatusSchema = z.enum([
  "DRAFT_READY",
  "AWAITING_CONFIRMATION",
  "AWAITING_APPROVAL",
  "VERIFIED",
  "COMPENSATED",
  "REJECTED_POLICY",
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const ExecutionPlanRecordSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  planCode: z.string(),
  targetObjectLabel: z.string(),
  capabilityChain: z.string(),
  authAndIdempotencySummary: z.string(),
  status: ExecutionStatusSchema,
  statusLabel: z.string(),
  requestedBy: z.string(),
  approvedBy: z.string().nullable(),
  confirmationToken: z.string().nullable(),
  previewSummary: z.string().nullable(),
  createdAt: z.string(),
});
export type ExecutionPlanRecord = z.infer<typeof ExecutionPlanRecordSchema>;

export const SemanticAppSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  slug: z.string(),
  name: z.string(),
  activeVersion: z.string(),
  draftVersion: z.string(),
  boundRevisionId: z.string(),
  status: z.enum(["PUBLISHED", "DRAFT"]),
  benchmarkPassRate: z.number(),
  benchmarkDelta: z.string(),
  outOfScopeRefusalRate: z.number(),
  outOfScopeSummary: z.string(),
  regressionFailures: z.number().int(),
  totalBenchmarkCases: z.number().int(),
  capabilities: z.array(CapabilitySchema),
  executionPlans: z.array(ExecutionPlanRecordSchema),
});
export type SemanticApp = z.infer<typeof SemanticAppSchema>;

export const ConversationMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  citations: z.array(z.string()).default([]),
  pendingAction: z
    .object({
      planId: z.string(),
      planCode: z.string(),
      autonomyTier: AutonomyTierSchema,
      previewText: z.string(),
      confirmationToken: z.string(),
      status: ExecutionStatusSchema,
    })
    .nullable()
    .default(null),
  transparencyTrace: z.array(z.string()).default([]),
  createdAt: z.string(),
});
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

export const AgentAskInputSchema = z.object({
  workspaceId: z.string(),
  sessionId: z.string().default("default"),
  question: z.string().min(1).max(2000),
  portalMode: z.boolean().default(false),
});

export const ActionDecisionInputSchema = z.object({
  workspaceId: z.string(),
  planId: z.string(),
  confirmationToken: z.string().optional(),
  simulateDownstreamFailure: z.boolean().default(false),
});

export const QualityLayerDiagnosticSchema = z.object({
  layerCode: z.enum(["RDF_SYNTAX", "OWL2_EL_REASONING", "SHACL_SHAPES"]),
  title: z.string(),
  status: z.enum(["PASS", "WARN", "FAIL"]),
  engineLabel: z.string(),
  summary: z.string(),
  checkedCount: z.number().int(),
  violationCount: z.number().int(),
});
export type QualityLayerDiagnostic = z.infer<typeof QualityLayerDiagnosticSchema>;

export const ReleasePackageSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  version: z.string(),
  revisionId: z.string(),
  status: z.enum(["PUBLISHED", "AWAITING_REVIEW"]),
  submittedBy: z.string(),
  submittedById: z.string(),
  reviewedBy: z.string().nullable(),
  sha256ManifestHash: z.string(),
  publishedAt: z.string().nullable(),
});
export type ReleasePackage = z.infer<typeof ReleasePackageSchema>;

export const QualityAndReleaseSnapshotSchema = z.object({
  workspaceId: z.string(),
  revisionId: z.string(),
  allPassed: z.boolean(),
  executedAt: z.string(),
  diagnostics: z.array(QualityLayerDiagnosticSchema),
  validationReportTurtle: z.string().optional(),
  releases: z.array(ReleasePackageSchema),
  fdeChecks: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      passed: z.boolean(),
    })
  ),
});
export type QualityAndReleaseSnapshot = z.infer<typeof QualityAndReleaseSnapshotSchema>;

export const ModelRouteSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.enum(["OPENAI_COMPATIBLE", "LOCAL_DETERMINISTIC"]),
  modelId: z.string(),
  statusLabel: z.string(),
  statusTone: z.enum(["emerald", "neutral"]),
  purpose: z.string(),
  latencyMs: z.number().int(),
});
export type ModelRoute = z.infer<typeof ModelRouteSchema>;

export const AuditEventSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  category: z.enum(["ONTOLOGY_CHANGE", "CONTROLLED_ACTION", "RELEASE_APPROVAL", "DATA_MATERIALIZATION"]),
  categoryLabel: z.string(),
  actorDisplay: z.string(),
  summary: z.string(),
  actionableByMe: z.boolean().default(false),
  occurredAt: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const GovernanceSnapshotSchema = z.object({
  currentUser: z.object({
    id: z.string(),
    name: z.string(),
    role: RoleSchema,
    tenantId: z.string(),
  }),
  availableActors: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: RoleSchema,
      title: z.string(),
    })
  ),
  modelRoutes: z.array(ModelRouteSchema),
  auditEvents: z.array(AuditEventSchema),
  operationsMetrics: z.object({
    apiP95LatencyMs: z.number(),
    rdfStoreStatus: z.string(),
    rdfStoreDetail: z.string(),
    millionScaleBaseline: z.string(),
    millionScaleThroughput: z.string(),
    backupRpoStatus: z.string(),
    backupDetail: z.string(),
  }),
});
export type GovernanceSnapshot = z.infer<typeof GovernanceSnapshotSchema>;

export const ItuReviewItemSchema = z.object({
  id: z.string(),
  clauseRef: z.string(),
  severity: z.enum(["CONFLICT", "WARNING", "PASS"]),
  normativeVerb: z.string(),
  findingTitle: z.string(),
  sourceExcerpt: z.string(),
  ontologyRuleAnchor: z.string(),
  recommendation: z.string(),
});
export type ItuReviewItem = z.infer<typeof ItuReviewItemSchema>;

export const PortalSnapshotSchema = z.object({
  contractAlerts: z.array(
    z.object({
      contractNo: z.string(),
      title: z.string(),
      customerName: z.string(),
      expiresInDays: z.number().int(),
      expiresAt: z.string(),
      amountDisplay: z.string(),
      riskNote: z.string(),
      status: z.string(),
      pendingApprovalNote: z.string().nullable(),
      ownerName: z.string(),
    })
  ),
  ituReview: z.object({
    documentTitle: z.string(),
    termAlignmentRate: z.string(),
    conflictCount: z.number().int(),
    normativeRefValidRate: z.string(),
    items: z.array(ItuReviewItemSchema),
  }),
});
export type PortalSnapshot = z.infer<typeof PortalSnapshotSchema>;
