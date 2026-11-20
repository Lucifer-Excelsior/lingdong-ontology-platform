import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type {
  ChangeSetProposal,
  ColumnMappingRule,
  ConversationMessage,
  DataSourceKind,
  DocumentChunk,
  OntologyClass,
  OntologyProperty,
  QuarantineRecord,
  Role,
  SchemaSnapshot,
  SemanticDiffItem,
  WorkItem,
} from "@lingdong/contracts";

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  title: text("title").notNull(),
  defaultRole: text("default_role").$type<Role>().notNull(),
});

export const credentials = pgTable("credentials", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  alias: text("alias").notNull(),
  envVarName: text("env_var_name").notNull(),
  allowedRoles: jsonb("allowed_roles").$type<Role[]>().notNull(),
  description: text("description").notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  versionLabel: text("version_label").notNull(),
  status: text("status").$type<"DRAFT" | "ACTIVE" | "PUBLISHED">().notNull(),
  description: text("description").notNull(),
  namespaceIri: text("namespace_iri").notNull(),
  activeRevisionId: text("active_revision_id").notNull(),
  publishedRevisionId: text("published_revision_id"),
  aboxInstanceCount: integer("abox_instance_count").default(0).notNull(),
  workItemsJson: jsonb("work_items_json").$type<WorkItem[]>().default([]).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").$type<Role>().notNull(),
});

export const competencyQuestions = pgTable("competency_questions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  code: text("code").notNull(),
  question: text("question").notNull(),
  coveredConcepts: jsonb("covered_concepts").$type<string[]>().notNull(),
  boundCapability: text("bound_capability").notNull(),
  status: text("status").$type<"PASSED" | "VERIFIED_READY" | "PENDING">().notNull(),
});

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  title: text("title").notNull(),
  parserStatus: text("parser_status").notNull(),
  chunkCount: integer("chunk_count").notNull(),
  anchoredAxiomCount: integer("anchored_axiom_count").notNull(),
  sha256Digest: text("sha256_digest").notNull(),
  chunksJson: jsonb("chunks_json").$type<DocumentChunk[]>().default([]).notNull(),
});

export const ontologyRevisions = pgTable("ontology_revisions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  revisionCode: text("revision_code").notNull(),
  parentRevisionCode: text("parent_revision_code"),
  sha256Hash: text("sha256_hash").notNull(),
  classesJson: jsonb("classes_json").$type<OntologyClass[]>().notNull(),
  propertiesJson: jsonb("properties_json").$type<OntologyProperty[]>().notNull(),
  diffItemsJson: jsonb("diff_items_json").$type<SemanticDiffItem[]>().default([]).notNull(),
  backwardCompatible: boolean("backward_compatible").default(true).notNull(),
  turtleSource: text("turtle_source").notNull(),
  tboxGraphUri: text("tbox_graph_uri").notNull(),
  shaclGraphUri: text("shacl_graph_uri").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const changesets = pgTable("changesets", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  baseRevisionCode: text("base_revision_code").notNull(),
  proposalsJson: jsonb("proposals_json").$type<ChangeSetProposal[]>().notNull(),
  status: text("status").$type<"OPEN" | "COMMITTED">().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dataSources = pgTable("data_sources", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  kind: text("kind").$type<DataSourceKind>().notNull(),
  accessMode: text("access_mode").$type<"READ_ONLY" | "READ_WRITE" | "RDF_GSP">().notNull(),
  status: text("status").$type<"LIVE" | "DEGRADED" | "OFFLINE">().notNull(),
  connectionDisplayUrl: text("connection_display_url").notNull(),
  credentialAlias: text("credential_alias").notNull(),
  summaryText: text("summary_text").notNull(),
  lastLatencyMs: integer("last_latency_ms").default(12).notNull(),
});

export const schemaSnapshots = pgTable("schema_snapshots", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  dataSourceId: text("data_source_id").notNull().references(() => dataSources.id),
  snapshotJson: jsonb("snapshot_json").$type<SchemaSnapshot>().notNull(),
  isActiveBinding: boolean("is_active_binding").default(true).notNull(),
});

export const semanticMappings = pgTable("semantic_mappings", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  dataSourceId: text("data_source_id").notNull().references(() => dataSources.id),
  sourceTable: text("source_table").notNull(),
  targetClassIri: text("target_class_iri").notNull(),
  targetClassDisplay: text("target_class_display").notNull(),
  subjectIriTemplate: text("subject_iri_template").notNull(),
  watermarkColumn: text("watermark_column").notNull(),
  rulesJson: jsonb("rules_json").$type<ColumnMappingRule[]>().notNull(),
});

export const materializationRuns = pgTable("materialization_runs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  batchCode: text("batch_code").notNull(),
  executedAt: text("executed_at").notNull(),
  syncMode: text("sync_mode").$type<"WATERMARK_INCREMENTAL" | "BASELINE_FULL">().notNull(),
  boundRevisionId: text("bound_revision_id").notNull(),
  writtenInstances: integer("written_instances").notNull(),
  writtenTriples: integer("written_triples").notNull(),
  quarantinedCount: integer("quarantined_count").notNull(),
  quarantineSummary: text("quarantine_summary").notNull(),
  status: text("status").$type<"COMMITTED" | "ROLLED_BACK">().notNull(),
  quarantineRecordsJson: jsonb("quarantine_records_json").$type<QuarantineRecord[]>().default([]).notNull(),
});

export const modelRoutes = pgTable("model_routes", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  provider: text("provider").$type<"OPENAI_COMPATIBLE" | "LOCAL_DETERMINISTIC">().notNull(),
  modelId: text("model_id").notNull(),
  statusLabel: text("status_label").notNull(),
  statusTone: text("status_tone").$type<"emerald" | "neutral">().notNull(),
  purpose: text("purpose").notNull(),
  latencyMs: integer("latency_ms").notNull(),
});

export const capabilities = pgTable("capabilities", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  autonomyTier: text("autonomy_tier").$type<"READ" | "DRAFT" | "CONFIRM" | "APPROVE">().notNull(),
  riskLevel: text("risk_level").$type<"LOW" | "NONE" | "MEDIUM" | "HIGH">().notNull(),
  description: text("description").notNull(),
  targetEntityLocalName: text("target_entity_local_name").notNull(),
  compensationCapabilityCode: text("compensation_capability_code"),
  mcpExposed: boolean("mcp_exposed").default(false).notNull(),
  mcpUri: text("mcp_uri"),
  quotaPerMinute: integer("quota_per_minute").default(60).notNull(),
});

export const semanticApps = pgTable("semantic_apps", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  activeVersion: text("active_version").notNull(),
  draftVersion: text("draft_version").notNull(),
  boundRevisionId: text("bound_revision_id").notNull(),
  status: text("status").$type<"PUBLISHED" | "DRAFT">().notNull(),
  benchmarkPassRate: integer("benchmark_pass_rate_bp").default(9820).notNull(),
  benchmarkDelta: text("benchmark_delta").notNull(),
  outOfScopeRefusalRate: integer("out_of_scope_refusal_bp").default(10000).notNull(),
  outOfScopeSummary: text("out_of_scope_summary").notNull(),
  regressionFailures: integer("regression_failures").default(0).notNull(),
  totalBenchmarkCases: integer("total_benchmark_cases").default(58).notNull(),
});

export const executionRuns = pgTable("execution_runs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  planCode: text("plan_code").notNull(),
  targetObjectLabel: text("target_object_label").notNull(),
  targetContractNo: text("target_contract_no"),
  capabilityCode: text("capability_code").notNull(),
  capabilityChain: text("capability_chain").notNull(),
  authAndIdempotencySummary: text("auth_and_idempotency_summary").notNull(),
  status: text("status")
    .$type<
      | "DRAFT_READY"
      | "AWAITING_CONFIRMATION"
      | "AWAITING_APPROVAL"
      | "VERIFIED"
      | "COMPENSATED"
      | "REJECTED_POLICY"
    >()
    .notNull(),
  statusLabel: text("status_label").notNull(),
  requestedBy: text("requested_by").notNull(),
  requestedById: text("requested_by_id").notNull(),
  approvedBy: text("approved_by"),
  confirmationToken: text("confirmation_token"),
  previewSummary: text("preview_summary"),
  conversationJson: jsonb("conversation_json").$type<ConversationMessage[]>().default([]).notNull(),
  createdAt: text("created_at").notNull(),
});

export const releases = pgTable("releases", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  version: text("version").notNull(),
  revisionId: text("revision_id").notNull(),
  status: text("status").$type<"PUBLISHED" | "AWAITING_REVIEW">().notNull(),
  submittedBy: text("submitted_by").notNull(),
  submittedById: text("submitted_by_id").notNull(),
  reviewedBy: text("reviewed_by"),
  sha256ManifestHash: text("sha256_manifest_hash").notNull(),
  publishedAt: text("published_at"),
});

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  category: text("category")
    .$type<"ONTOLOGY_CHANGE" | "CONTROLLED_ACTION" | "RELEASE_APPROVAL" | "DATA_MATERIALIZATION">()
    .notNull(),
  categoryLabel: text("category_label").notNull(),
  actorDisplay: text("actor_display").notNull(),
  summary: text("summary").notNull(),
  actionableByRole: text("actionable_by_role").$type<Role>(),
  occurredAt: text("occurred_at").notNull(),
});
