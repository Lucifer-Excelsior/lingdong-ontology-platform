import { z } from "zod";

export const DataSourceKindSchema = z.enum([
  "POSTGRESQL",
  "MYSQL",
  "ORACLE",
  "DAMENG_DM8",
  "KINGBASE_ES",
  "CLICKHOUSE",
  "KAFKA_CDC",
  "HTTP_OPENAPI",
  "RDF_SPARQL",
]);
export type DataSourceKind = z.infer<typeof DataSourceKindSchema>;

export const SchemaTableColumnSchema = z.object({
  name: z.string(),
  sqlType: z.string(),
  nullable: z.boolean(),
  isPrimaryKey: z.boolean().default(false),
});

export const SchemaTableSchema = z.object({
  schemaName: z.string(),
  tableName: z.string(),
  rowCountEstimate: z.number().int(),
  columns: z.array(SchemaTableColumnSchema),
});

export const SchemaSnapshotSchema = z.object({
  id: z.string(),
  dataSourceId: z.string(),
  versionTag: z.string(),
  capturedAt: z.string(),
  tableCount: z.number().int(),
  columnCount: z.number().int(),
  fingerprint: z.string(),
  isActiveBinding: z.boolean(),
  tables: z.array(SchemaTableSchema),
});
export type SchemaSnapshot = z.infer<typeof SchemaSnapshotSchema>;

export const DataSourceSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  kind: DataSourceKindSchema,
  accessMode: z.enum(["READ_ONLY", "READ_WRITE", "RDF_GSP"]),
  status: z.enum(["LIVE", "DEGRADED", "OFFLINE"]),
  connectionDisplayUrl: z.string(),
  credentialAlias: z.string(),
  summaryText: z.string(),
  lastLatencyMs: z.number().int(),
  snapshots: z.array(SchemaSnapshotSchema),
});
export type DataSource = z.infer<typeof DataSourceSchema>;

export const ColumnMappingRuleSchema = z.object({
  id: z.string(),
  sourceColumn: z.string(),
  sqlType: z.string(),
  targetPropertyIri: z.string(),
  targetPropertyDisplay: z.string(),
  targetXsdOrClass: z.string(),
  isObjectBridge: z.boolean().default(false),
  bridgeIriTemplate: z.string().optional(),
  maskForViewer: z.boolean().default(false),
  governanceNote: z.string(),
});
export type ColumnMappingRule = z.infer<typeof ColumnMappingRuleSchema>;

export const SemanticMappingSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  dataSourceId: z.string(),
  sourceTable: z.string(),
  targetClassIri: z.string(),
  targetClassDisplay: z.string(),
  subjectIriTemplate: z.string(),
  watermarkColumn: z.string(),
  rules: z.array(ColumnMappingRuleSchema),
});
export type SemanticMapping = z.infer<typeof SemanticMappingSchema>;

export const QuarantineRecordSchema = z.object({
  id: z.string(),
  sourceRowKey: z.string(),
  sourceTable: z.string(),
  violatedProperty: z.string(),
  reason: z.string(),
  rawPayloadSummary: z.string(),
});
export type QuarantineRecord = z.infer<typeof QuarantineRecordSchema>;

export const MaterializationRunSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  batchCode: z.string(),
  executedAt: z.string(),
  syncMode: z.enum(["WATERMARK_INCREMENTAL", "BASELINE_FULL"]),
  boundRevisionId: z.string(),
  writtenInstances: z.number().int(),
  writtenTriples: z.number().int(),
  quarantinedCount: z.number().int(),
  quarantineSummary: z.string(),
  status: z.enum(["COMMITTED", "ROLLED_BACK"]),
  quarantineRecords: z.array(QuarantineRecordSchema),
});
export type MaterializationRun = z.infer<typeof MaterializationRunSchema>;

export const SparqlQueryInputSchema = z.object({
  workspaceId: z.string(),
  query: z.string().min(10).max(4000),
  limit: z.number().int().min(1).max(200).default(50),
});

export const SparqlQueryResultSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.string())),
  elapsedMs: z.number(),
  namedGraphsQueried: z.array(z.string()),
  maskedColumnsApplied: z.array(z.string()),
});
export type SparqlQueryResult = z.infer<typeof SparqlQueryResultSchema>;
