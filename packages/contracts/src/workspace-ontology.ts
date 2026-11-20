import { z } from "zod";

export const RoleSchema = z.enum(["OWNER", "MODELER", "OPERATOR", "REVIEWER", "VIEWER"]);
export type Role = z.infer<typeof RoleSchema>;

export const WorkspaceStatusSchema = z.enum(["DRAFT", "ACTIVE", "PUBLISHED"]);
export type WorkspaceStatus = z.infer<typeof WorkspaceStatusSchema>;

export const WorkspaceSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  slug: z.string(),
  name: z.string(),
  versionLabel: z.string(),
  status: WorkspaceStatusSchema,
  description: z.string(),
  namespaceIri: z.string(),
  activeRevisionId: z.string(),
  publishedRevisionId: z.string().nullable(),
  classCount: z.number().int(),
  propertyCount: z.number().int(),
  shaclCount: z.number().int(),
  aboxInstanceCount: z.number().int(),
  pendingProposalCount: z.number().int(),
  updatedAt: z.string(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const CompetencyQuestionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  code: z.string(),
  question: z.string(),
  coveredConcepts: z.array(z.string()),
  boundCapability: z.string(),
  status: z.enum(["PASSED", "VERIFIED_READY", "PENDING"]),
});
export type CompetencyQuestion = z.infer<typeof CompetencyQuestionSchema>;

export const CreateCompetencyQuestionInputSchema = z.object({
  workspaceId: z.string(),
  code: z.string().min(2).max(24),
  question: z.string().min(4).max(300),
  coveredConcepts: z.array(z.string()).min(1),
  boundCapability: z.string().min(1),
});

export const WorkItemSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  category: z.enum(["modeling", "exec", "data", "release"]),
  title: z.string(),
  subtitle: z.string(),
  actionLabel: z.string(),
  targetView: z.enum(["overview", "modeling", "ontology", "data", "apps", "release", "governance"]),
  dialogTarget: z.enum(["changeset", "none"]).default("none"),
  status: z.enum(["OPEN", "RESOLVED"]),
});
export type WorkItem = z.infer<typeof WorkItemSchema>;

export const DocumentChunkSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  chunkCode: z.string(),
  startOffset: z.number().int(),
  endOffset: z.number().int(),
  content: z.string(),
  highlightText: z.string().optional(),
});
export type DocumentChunk = z.infer<typeof DocumentChunkSchema>;

export const DocumentRecordSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  parserStatus: z.string(),
  chunkCount: z.number().int(),
  anchoredAxiomCount: z.number().int(),
  sha256Digest: z.string(),
  chunks: z.array(DocumentChunkSchema).optional(),
});
export type DocumentRecord = z.infer<typeof DocumentRecordSchema>;

export const SemanticAssetSchema = z.object({
  id: z.string(),
  categoryBadge: z.string(),
  categoryTone: z.enum(["blue", "emerald", "purple"]),
  version: z.string(),
  title: z.string(),
  description: z.string(),
  enabledInWorkspace: z.boolean(),
  turtleSnippet: z.string(),
});
export type SemanticAsset = z.infer<typeof SemanticAssetSchema>;

export const ShaclConstraintSchema = z.object({
  id: z.string(),
  propertyIri: z.string(),
  propertyLocalName: z.string(),
  datatype: z.string().optional(),
  minCount: z.number().int().optional(),
  maxCount: z.number().int().optional(),
  minInclusive: z.number().optional(),
  pattern: z.string().optional(),
  lessThanOrEqualsProperty: z.string().optional(),
  severity: z.enum(["Violation", "Warning"]),
  description: z.string(),
});
export type ShaclConstraint = z.infer<typeof ShaclConstraintSchema>;

export const OntologyPropertySchema = z.object({
  iri: z.string(),
  localName: z.string(),
  labelZh: z.string(),
  kind: z.enum(["ObjectProperty", "DatatypeProperty"]),
  domainIri: z.string(),
  domainLocalName: z.string(),
  rangeIri: z.string(),
  rangeLocalName: z.string(),
  subPropertyOf: z.string().optional(),
  characteristics: z.string(),
  sensitiveMask: z.boolean().default(false),
});
export type OntologyProperty = z.infer<typeof OntologyPropertySchema>;

export const OntologyClassSchema = z.object({
  iri: z.string(),
  localName: z.string(),
  labelZh: z.string(),
  labelEn: z.string(),
  description: z.string(),
  roleKind: z.enum(["master", "controlled_write", "knowledge", "actor"]),
  subClassOf: z.string(),
  equivalentClass: z.string().optional(),
  disjointWith: z.string().optional(),
  positionX: z.number(),
  positionY: z.number(),
  instanceCount: z.number().int(),
  sourceTable: z.string().optional(),
  controlledActionCount: z.number().int().default(0),
  properties: z.array(OntologyPropertySchema),
  shaclConstraints: z.array(ShaclConstraintSchema),
  downstreamMappings: z.array(z.string()),
  downstreamCapabilities: z.array(z.string()),
});
export type OntologyClass = z.infer<typeof OntologyClassSchema>;

export const EvidenceSourceRefSchema = z.object({
  kind: z.enum(["DOCUMENT", "MULTIMODAL", "DATABASE_SCHEMA"]),
  label: z.string(),
  detail: z.string(),
});
export type EvidenceSourceRef = z.infer<typeof EvidenceSourceRefSchema>;

export const ChangeSetProposalSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  kind: z.enum(["ADD_CLASS", "ADD_DATATYPE_PROPERTY", "ADD_OBJECT_PROPERTY", "ADD_SHACL_CONSTRAINT"]),
  title: z.string(),
  localName: z.string(),
  targetClassLocalName: z.string(),
  rangeOrDatatype: z.string(),
  minInclusive: z.number().optional(),
  evidenceAnchor: z.string(),
  rationale: z.string(),
  confidence: z.enum(["STRONG", "WEAK"]),
  selectedByDefault: z.boolean(),
  status: z.enum(["PENDING", "COMMITTED", "DEFERRED"]),
  fusionStatus: z.enum(["CORROBORATED", "CONFLICT_DETECTED", "SINGLE_SOURCE"]).optional(),
  evidenceSources: z.array(EvidenceSourceRefSchema).optional(),
  conflictNote: z.string().optional(),
});
export type ChangeSetProposal = z.infer<typeof ChangeSetProposalSchema>;

export const SemanticDiffItemSchema = z.object({
  changeType: z.enum(["ADDED", "MODIFIED", "REMOVED"]),
  summary: z.string(),
});
export type SemanticDiffItem = z.infer<typeof SemanticDiffItemSchema>;

export const InferredRelationSchema = z.object({
  id: z.string(),
  sourceLocalName: z.string(),
  targetLocalName: z.string(),
  label: z.string(),
  reasoningRule: z.enum(["SUBCLASS_CLOSURE", "PROPERTY_CHAIN", "INVERSE_ROLE", "ELK_CLASSIFICATION"]),
});
export type InferredRelation = z.infer<typeof InferredRelationSchema>;

export const OntologyWorkspaceSnapshotSchema = z.object({
  workspaceId: z.string(),
  revisionId: z.string(),
  previousRevisionId: z.string().nullable(),
  backwardCompatible: z.boolean(),
  consistent: z.boolean(),
  classes: z.array(OntologyClassSchema),
  properties: z.array(OntologyPropertySchema),
  inferredRelations: z.array(InferredRelationSchema).optional(),
  turtleSource: z.string(),
  diffItems: z.array(SemanticDiffItemSchema),
  pendingProposals: z.array(ChangeSetProposalSchema),
});
export type OntologyWorkspaceSnapshot = z.infer<typeof OntologyWorkspaceSnapshotSchema>;

export const CommitChangeSetInputSchema = z.object({
  workspaceId: z.string(),
  baseRevisionId: z.string(),
  proposalIds: z.array(z.string()).min(1),
});

export const QuickCreateAssetInputSchema = z.object({
  workspaceId: z.string(),
  assetKind: z.enum(["OWL_CLASS", "PROPERTY", "DATA_SOURCE", "COMPETENCY_QUESTION", "CONTROLLED_ACTION"]),
  labelZh: z.string().min(1).max(80),
  localName: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "标识符需以字母开头且仅含字母、数字、下划线或连字符"),
  targetClassLocalName: z.string().optional(),
  extraConfig: z.string().optional(),
});
