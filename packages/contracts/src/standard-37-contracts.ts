import { z } from "zod";

// 1.3 Existing Ontology Applicability & Reuse Assessment
export const OntologyReuseAssessmentSchema = z.object({
  assetId: z.string(),
  assetTitle: z.string(),
  versionValid: z.boolean(),
  versionNote: z.string(),
  coveragePercent: z.number().int().min(0).max(100),
  semanticConsistency: z.enum(["CONSISTENT", "MINOR_CONFLICT", "CONFLICT"]),
  matchedConcepts: z.array(z.string()),
  missingConcepts: z.array(z.string()),
  recommendedStrategy: z.enum(["IMPORT_REFERENCE", "EXTEND_SUBCLASS", "PARTIAL_MERGE"]),
  strategyLabel: z.string(),
});
export type OntologyReuseAssessment = z.infer<typeof OntologyReuseAssessmentSchema>;

// 1.4 & 1.5 Requirement Traceability Matrix & Change Impact
export const RequirementTraceEntrySchema = z.object({
  cqId: z.string(),
  cqCode: z.string(),
  question: z.string(),
  mappedClasses: z.array(z.string()),
  mappedProperties: z.array(z.string()),
  mappedRules: z.array(z.string()),
  verificationStatus: z.enum(["VERIFIED", "PARTIAL", "UNCOVERED"]),
  updatedAt: z.string(),
});
export type RequirementTraceEntry = z.infer<typeof RequirementTraceEntrySchema>;

export const RequirementChangeImpactSchema = z.object({
  cqId: z.string(),
  cqCode: z.string(),
  proposedChange: z.string(),
  affectedClasses: z.array(z.string()),
  affectedProperties: z.array(z.string()),
  affectedRules: z.array(z.string()),
  affectedCapabilities: z.array(z.string()),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  recommendation: z.string(),
});
export type RequirementChangeImpact = z.infer<typeof RequirementChangeImpactSchema>;

// 3.4, 3.5, 4.6, 4.7 Custom Inference Rules & Derivation Traces
export const InferenceRuleRecordSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  scopeClass: z.string(),
  conditionExpr: z.string(),
  conclusionExpr: z.string(),
  enabled: z.boolean(),
  syntaxValid: z.boolean(),
  syntaxMessage: z.string(),
  conflictWarnings: z.array(z.string()),
  createdBy: z.string(),
  updatedAt: z.string(),
});
export type InferenceRuleRecord = z.infer<typeof InferenceRuleRecordSchema>;

export const InferenceDerivationTraceSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  ruleName: z.string(),
  subjectIri: z.string(),
  premises: z.array(z.string()),
  reasoningStep: z.string(),
  inferredConclusion: z.string(),
  validationResult: z.enum(["PASS", "FAIL"]),
  evaluatedAt: z.string(),
});
export type InferenceDerivationTrace = z.infer<typeof InferenceDerivationTraceSchema>;

// 3.7 & 3.8 External Ontology Import Analysis & Conflict Resolution
export const ExternalImportConflictSchema = z.object({
  localName: z.string(),
  kind: z.enum(["CLASS", "PROPERTY"]),
  existingLabel: z.string(),
  incomingLabel: z.string(),
  defaultResolution: z.enum(["KEEP_EXISTING", "OVERWRITE", "RENAME"]),
});
export type ExternalImportConflict = z.infer<typeof ExternalImportConflictSchema>;

export const ExternalImportAnalysisSchema = z.object({
  ontologyIri: z.string(),
  namespaceIri: z.string(),
  versionInfo: z.string(),
  imports: z.array(z.string()),
  parsedClasses: z.number().int(),
  parsedProperties: z.number().int(),
  conflicts: z.array(ExternalImportConflictSchema),
});
export type ExternalImportAnalysis = z.infer<typeof ExternalImportAnalysisSchema>;

// 5.9 & 5.10 Ontology Retirement & Impact Analysis
export const OntologyRetirementStateSchema = z.object({
  workspaceId: z.string(),
  status: z.enum(["ACTIVE", "RETIRED"]),
  retiredReason: z.string().nullable(),
  retiredAt: z.string().nullable(),
  retiredBy: z.string().nullable(),
});
export type OntologyRetirementState = z.infer<typeof OntologyRetirementStateSchema>;

export const OntologyRetirementImpactSchema = z.object({
  workspaceId: z.string(),
  activeAboxInstances: z.number().int(),
  referencingWorkspaces: z.array(z.string()),
  affectedApps: z.array(z.string()),
  affectedCapabilities: z.array(z.string()),
  affectedMcpTools: z.array(z.string()),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  recommendation: z.string(),
});
export type OntologyRetirementImpact = z.infer<typeof OntologyRetirementImpactSchema>;
