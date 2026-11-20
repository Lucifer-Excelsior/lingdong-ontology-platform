import type {
  AuditEvent,
  AutonomyTier,
  BenchmarkCaseResult,
  Capability,
  ChangeSetProposal,
  CompetencyQuestion,
  ConfigureCapabilityInput,
  ConversationMessage,
  DataSource,
  DocumentRecord,
  EntityResolutionRule,
  EvidenceSourceRef,
  ExecutionPlanRecord,
  FdeBundleImportResult,
  GovernanceSnapshot,
  InferredRelation,
  MaterializationRun,
  McpApiTokenView,
  OntologyClass,
  OntologyProperty,
  OntologyWorkspaceSnapshot,
  PortalSnapshot,
  QualityAndReleaseSnapshot,
  RdfImportConflict,
  RdfImportPrecheckResult,
  ReleasePackage,
  RevisionSummary,
  RiskLevel,
  Role,
  SchemaSnapshot,
  SemanticApp,
  SemanticAsset,
  SemanticDiffItem,
  SemanticMapping,
  SparqlQueryResult,
  WorkItem,
  Workspace,
} from "@lingdong/contracts";

export type PersonaMode = "engineering" | "portal";

export type EngineeringViewId =
  | "overview"
  | "modeling"
  | "ontology"
  | "data"
  | "apps"
  | "release"
  | "governance";

export type ActiveViewId = EngineeringViewId | "portal";
export type PortalAppId = "contract" | "itu";
export type OntologyMode = "graph" | "axioms" | "turtle" | "diff";

export type DialogId =
  | "changeset"
  | "command"
  | "create"
  | "create-cq"
  | "tutorial"
  | "contract"
  | null;

export const VIEW_TITLES: Record<ActiveViewId, string> = {
  overview: "总览、CQ 目标与任务中心",
  modeling: "向导建模、资料证据与标准资产",
  ontology: "本体专家画布",
  data: "数据接入、语义映射与 ABox 物化",
  apps: "语义应用、DAG 编排与 MCP 暴露",
  release: "W3C 质量门禁与职责分离发布",
  governance: "模型路由、RBAC 审计与规模监控",
  portal: "受治理企业业务智能门户",
};

export interface BootstrapResponse {
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  governance: GovernanceSnapshot;
}

export interface SwitchActorResponse {
  actor: {
    id?: string;
    userId?: string;
    name: string;
    role: Role;
    tenantId?: string;
    title?: string;
  };
  governance: GovernanceSnapshot;
}

export interface OverviewResponse {
  workspace: Workspace;
  workItems: WorkItem[];
  competencyQuestions: CompetencyQuestion[];
  recentAuditEvents: AuditEvent[];
}

export type FusionModality = "DOCUMENT" | "MULTIMODAL" | "DATABASE_SCHEMA";

export interface ModelingDataSourceColumn {
  name: string;
  sqlType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
}

export interface ModelingDataSourceTable {
  schemaName: string;
  tableName: string;
  columns: ModelingDataSourceColumn[];
}

export interface ModelingDataSource {
  id: string;
  name: string;
  kind: "POSTGRESQL" | "HTTP_OPENAPI" | "RDF_SPARQL";
  connectionDisplayUrl: string;
  tables: ModelingDataSourceTable[];
}

export interface FuseModelingPayload {
  documentIds: string[];
  dataSourceIds: string[];
  selectedTables?: string[];
  instruction?: string;
  autoGenerateMappings?: boolean;
}

export interface FusionSummary {
  sourcesAnalyzed: number;
  modalitiesUsed: FusionModality[];
  corroboratedCount: number;
  conflictCount: number;
  singleSourceCount: number;
  autoMappedTables: string[];
}

export interface FuseModelingResponse {
  proposals: ChangeSetProposal[];
  engineUsed: string;
  fusionSummary: FusionSummary;
  message: string;
}

export interface ModelingResponse {
  documents: DocumentRecord[];
  semanticAssets: SemanticAsset[];
  pendingProposals: ChangeSetProposal[];
  dataSources?: ModelingDataSource[];
}

export interface WatermarkScheduleState {
  workspaceId: string;
  enabled: boolean;
  intervalSeconds: number;
  lastAutoRunAt: string | null;
  autoRunsCount: number;
}

export interface WatermarkCursorState {
  lastValue: string | null;
  batchSize: number;
  updatedAt: string | null;
}

export type OntologySnapshotView = OntologyWorkspaceSnapshot & {
  inferredRelations?: InferredRelation[];
};

export type QualityReleaseView = QualityAndReleaseSnapshot & {
  validationReportTurtle?: string;
};

export interface DataWorkspaceResponse {
  dataSources: DataSource[];
  mappings: SemanticMapping[];
  materializationRuns: MaterializationRun[];
  defaultSparql: string;
  schedule?: WatermarkScheduleState;
  watermarkCursor?: WatermarkCursorState;
  entityResolutionRules?: EntityResolutionRule[];
}

export interface AppsWorkspaceResponse {
  app: SemanticApp;
  conversation: ConversationMessage[];
  mcpConfigJson: string;
  benchmarkCases?: BenchmarkCaseResult[];
  caseResults?: BenchmarkCaseResult[];
}

export type {
  AuditEvent,
  AutonomyTier,
  BenchmarkCaseResult,
  Capability,
  ChangeSetProposal,
  CompetencyQuestion,
  ConfigureCapabilityInput,
  ConversationMessage,
  DataSource,
  DocumentRecord,
  EntityResolutionRule,
  EvidenceSourceRef,
  ExecutionPlanRecord,
  FdeBundleImportResult,
  GovernanceSnapshot,
  InferredRelation,
  MaterializationRun,
  McpApiTokenView,
  OntologyClass,
  OntologyProperty,
  OntologyWorkspaceSnapshot,
  PortalSnapshot,
  QualityAndReleaseSnapshot,
  RdfImportConflict,
  RdfImportPrecheckResult,
  ReleasePackage,
  RevisionSummary,
  RiskLevel,
  SchemaSnapshot,
  SemanticApp,
  SemanticAsset,
  SemanticDiffItem,
  SemanticMapping,
  SparqlQueryResult,
  WorkItem,
  Workspace,
};
