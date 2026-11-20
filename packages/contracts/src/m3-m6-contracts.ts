import { z } from "zod";
import { AutonomyTierSchema, RiskLevelSchema } from "./agent-governance.js";
export { InferredRelationSchema, type InferredRelation } from "./workspace-ontology.js";

export const RdfImportConflictSchema = z.object({
  localName: z.string(),
  entityKind: z.enum(["Class", "Property"]),
  conflictType: z.enum(["ALREADY_EXISTS", "NAMESPACE_MISMATCH"]),
  detail: z.string(),
});
export type RdfImportConflict = z.infer<typeof RdfImportConflictSchema>;

export const RdfImportPrecheckResultSchema = z.object({
  formatDetected: z.string(),
  parsedTriples: z.number().int(),
  discoveredClasses: z.array(
    z.object({
      localName: z.string(),
      labelZh: z.string(),
      iri: z.string(),
      subClassOf: z.string(),
    })
  ),
  discoveredProperties: z.array(
    z.object({
      localName: z.string(),
      labelZh: z.string(),
      kind: z.enum(["ObjectProperty", "DatatypeProperty"]),
      domainLocalName: z.string(),
      rangeLocalName: z.string(),
    })
  ),
  conflicts: z.array(RdfImportConflictSchema),
  proposalsQueuedCount: z.number().int(),
  committed: z.boolean(),
  revisionId: z.string().optional(),
  message: z.string(),
});
export type RdfImportPrecheckResult = z.infer<typeof RdfImportPrecheckResultSchema>;

export const RevisionSummarySchema = z.object({
  revisionCode: z.string(),
  parentRevisionCode: z.string().nullable(),
  sha256Hash: z.string(),
  classCount: z.number().int(),
  propertyCount: z.number().int(),
  backwardCompatible: z.boolean(),
  createdBy: z.string(),
  createdAt: z.string(),
});
export type RevisionSummary = z.infer<typeof RevisionSummarySchema>;

export const EntityResolutionRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetClassLocalName: z.string(),
  matchKeyExpression: z.string(),
  canonicalPrefix: z.string(),
  lastMergedCount: z.number().int(),
  lastExecutedAt: z.string().nullable(),
});
export type EntityResolutionRule = z.infer<typeof EntityResolutionRuleSchema>;

export const BenchmarkCaseResultSchema = z.object({
  caseCode: z.string(),
  category: z.enum(["SPARQL_FACT", "PROVO_CLAUSE", "GOVERNED_ACTION", "OUT_OF_SCOPE_REFUSAL"]),
  categoryLabel: z.string(),
  question: z.string(),
  expectedAssertion: z.string(),
  actualSummary: z.string(),
  passed: z.boolean(),
  latencyMs: z.number(),
});
export type BenchmarkCaseResult = z.infer<typeof BenchmarkCaseResultSchema>;

export const McpApiTokenViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  maskedToken: z.string(),
  roleScope: z.enum(["VIEWER", "OPERATOR"]),
  createdAt: z.string(),
});
export type McpApiTokenView = z.infer<typeof McpApiTokenViewSchema>;

export const ConfigureCapabilityInputSchema = z.object({
  code: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  name: z.string().min(2).max(80),
  autonomyTier: AutonomyTierSchema,
  riskLevel: RiskLevelSchema,
  targetEntityLocalName: z.string().min(1),
  description: z.string().min(4).max(300),
  executionTemplate: z.string().optional(),
  compensationCapabilityCode: z.string().nullable().optional(),
  mcpExposed: z.boolean().default(false),
});
export type ConfigureCapabilityInput = z.infer<typeof ConfigureCapabilityInputSchema>;

export const FdeBundleImportResultSchema = z.object({
  workspaceId: z.string(),
  workspaceSlug: z.string(),
  workspaceName: z.string(),
  version: z.string(),
  revisionId: z.string(),
  checksumVerified: z.boolean(),
  verifiedFiles: z.array(z.string()),
  classesRestored: z.number().int(),
  propertiesRestored: z.number().int(),
  credentialAliasesBound: z.array(z.string()),
  message: z.string(),
});
export type FdeBundleImportResult = z.infer<typeof FdeBundleImportResultSchema>;
