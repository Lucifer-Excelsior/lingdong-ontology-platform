import type {
  AppsWorkspaceResponse,
  BenchmarkCaseResult,
  BootstrapResponse,
  ChangeSetProposal,
  CompetencyQuestion,
  ConversationMessage,
  DataWorkspaceResponse,
  DocumentRecord,
  ExecutionPlanRecord,
  GovernanceSnapshot,
  MaterializationRun,
  ModelingResponse,
  OntologySnapshotView,
  OverviewResponse,
  PortalSnapshot,
  QualityReleaseView,
  ReleasePackage,
  SchemaSnapshot,
  SemanticApp,
  SparqlQueryResult,
  SwitchActorResponse,
  WatermarkCursorState,
} from "./types";
import { m2Api } from "./m2-client";
import { uxCrudApi } from "./ux-crud-client";
import { stdComplianceApi } from "./std-compliance-client";
import { m3m6Api } from "./m3-m6-client";
import { commercialApi, setCommercialActorHeader } from "./commercial-client";
import { gaApi } from "./ga-client";

export interface CreateCqPayload {
  workspaceId: string;
  code: string;
  question: string;
  coveredConcepts: string[];
  boundCapability: string;
}

export interface QuickCreatePayload {
  workspaceId: string;
  assetKind:
    | "OWL_CLASS"
    | "PROPERTY"
    | "DATA_SOURCE"
    | "COMPETENCY_QUESTION"
    | "CONTROLLED_ACTION";
  labelZh: string;
  localName: string;
  targetClassLocalName?: string;
  extraConfig?: string;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let errorMessage = `请求失败 (${response.status})`;
    try {
      const errBody = (await response.json()) as { message?: string; error?: string };
      errorMessage = errBody.message ?? errBody.error ?? errorMessage;
    } catch {
      // keep status fallback
    }
    throw Object.assign(new Error(errorMessage), { status: response.status });
  }
  return (await response.json()) as T;
}

export const api = {
  getBootstrap(workspaceId?: string) {
    const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    return requestJson<BootstrapResponse>(`/api/bootstrap${qs}`);
  },
  switchActor(userId: string, workspaceId?: string) {
    setCommercialActorHeader(userId);
    return requestJson<SwitchActorResponse>("/api/session/switch-actor", {
      method: "POST",
      body: JSON.stringify({ userId, workspaceId }),
    });
  },
  getOverview(workspaceId: string) {
    return requestJson<OverviewResponse>(`/api/workspaces/${encodeURIComponent(workspaceId)}/overview`);
  },
  createCompetencyQuestion(workspaceId: string, payload: CreateCqPayload) {
    return requestJson<CompetencyQuestion>(`/api/workspaces/${encodeURIComponent(workspaceId)}/cqs`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getModeling(workspaceId: string) {
    return requestJson<ModelingResponse>(`/api/workspaces/${encodeURIComponent(workspaceId)}/modeling`);
  },
  extractProposals(workspaceId: string, payload: { documentId: string; instruction?: string }) {
    return requestJson<{ proposals: ChangeSetProposal[] }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/modeling/extract`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },
  uploadDocument(workspaceId: string, payload: { title: string; content: string }) {
    return requestJson<DocumentRecord>(`/api/workspaces/${encodeURIComponent(workspaceId)}/documents`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getOntology(workspaceId: string) {
    return requestJson<OntologySnapshotView>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/ontology`
    );
  },
  commitChangeSet(workspaceId: string, payload: { baseRevisionId: string; proposalIds: string[] }) {
    return requestJson<{ revisionId: string; snapshot: OntologySnapshotView }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/changesets/commit`,
      { method: "POST", body: JSON.stringify({ workspaceId, ...payload }) }
    );
  },
  quickCreate(workspaceId: string, payload: QuickCreatePayload) {
    return requestJson<{ message: string }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/quick-create`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },
  getData(workspaceId: string) {
    return requestJson<DataWorkspaceResponse>(`/api/workspaces/${encodeURIComponent(workspaceId)}/data`);
  },
  testDataSource(workspaceId: string, dsId: string) {
    return requestJson<{ ok: boolean; latencyMs: number; message: string }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/data-sources/${encodeURIComponent(dsId)}/test`,
      { method: "POST", body: JSON.stringify({ workspaceId }) }
    );
  },
  captureSnapshot(workspaceId: string, dsId: string) {
    return requestJson<{ snapshot: SchemaSnapshot; message: string }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/data-sources/${encodeURIComponent(dsId)}/snapshot`,
      { method: "POST", body: JSON.stringify({ workspaceId }) }
    );
  },
  runMaterialization(workspaceId: string, resetCursor = false) {
    return requestJson<{ run: MaterializationRun; cursor?: WatermarkCursorState; message: string }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/materializations/run`,
      { method: "POST", body: JSON.stringify({ workspaceId, resetCursor }) }
    );
  },
  runSparql(workspaceId: string, query: string, limit = 50) {
    return requestJson<SparqlQueryResult>(`/api/workspaces/${encodeURIComponent(workspaceId)}/sparql`, {
      method: "POST",
      body: JSON.stringify({ workspaceId, query, limit }),
    });
  },
  getApps(workspaceId: string) {
    return requestJson<AppsWorkspaceResponse>(`/api/workspaces/${encodeURIComponent(workspaceId)}/apps`);
  },
  askAgent(workspaceId: string, payload: { question: string; portalMode?: boolean; sessionId?: string }) {
    return requestJson<{ message: ConversationMessage; plans: ExecutionPlanRecord[] }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/agent/ask`,
      {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          sessionId: payload.sessionId ?? "default",
          question: payload.question,
          portalMode: payload.portalMode ?? false,
        }),
      }
    );
  },
  confirmPlan(workspaceId: string, planId: string, confirmationToken?: string) {
    return requestJson<{ plan: ExecutionPlanRecord; message: string }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/agent/plans/${encodeURIComponent(planId)}/confirm`,
      { method: "POST", body: JSON.stringify({ workspaceId, planId, confirmationToken }) }
    );
  },
  approvePlan(workspaceId: string, planId: string) {
    return requestJson<{ plan: ExecutionPlanRecord; message: string }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/agent/plans/${encodeURIComponent(planId)}/approve`,
      { method: "POST", body: JSON.stringify({ workspaceId, planId }) }
    );
  },
  evaluateApp(workspaceId: string) {
    return requestJson<{
      app: SemanticApp;
      benchmarkCases?: BenchmarkCaseResult[];
      caseResults?: BenchmarkCaseResult[];
      message: string;
    }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/apps/evaluate`, {
      method: "POST",
      body: JSON.stringify({ workspaceId }),
    });
  },
  getRelease(workspaceId: string) {
    return requestJson<QualityReleaseView>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/release`
    );
  },
  diagnoseRelease(workspaceId: string) {
    return requestJson<QualityReleaseView>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/release/diagnose`,
      { method: "POST", body: JSON.stringify({ workspaceId }) }
    );
  },
  approveRelease(workspaceId: string, releaseId: string) {
    return requestJson<{ release: ReleasePackage; message: string }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/releases/${encodeURIComponent(releaseId)}/approve`,
      { method: "POST", body: JSON.stringify({ workspaceId }) }
    );
  },
  getReleaseDownloadUrl(workspaceId: string, releaseId: string) {
    return `/api/workspaces/${encodeURIComponent(workspaceId)}/releases/${encodeURIComponent(releaseId)}/download`;
  },
  getGovernance(workspaceId: string) {
    return requestJson<GovernanceSnapshot>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/governance`
    );
  },
  getLlmConfig() {
    return requestJson<{
      enabled: boolean;
      providerLabel: string;
      baseUrl: string;
      modelId: string;
      hasApiKey: boolean;
      maskedApiKey: string;
      activeMode: "LIVE_LLM" | "LOCAL_DETERMINISTIC";
      updatedAt: string;
    }>("/api/governance/llm-config");
  },
  saveLlmConfig(payload: { enabled: boolean; baseUrl: string; modelId: string; apiKey?: string }) {
    return requestJson<{
      config: {
        enabled: boolean;
        baseUrl: string;
        modelId: string;
        hasApiKey: boolean;
        maskedApiKey: string;
        activeMode: "LIVE_LLM" | "LOCAL_DETERMINISTIC";
      };
      message: string;
    }>("/api/governance/llm-config", { method: "POST", body: JSON.stringify(payload) });
  },
  testLlmConnection() {
    return requestJson<{ ok: boolean; latencyMs: number; message: string }>(
      "/api/governance/llm-test",
      { method: "POST", body: JSON.stringify({}) }
    );
  },
  getPortal(workspaceId: string) {
    return requestJson<PortalSnapshot>(`/api/workspaces/${encodeURIComponent(workspaceId)}/portal`);
  },
  ...m2Api,
  ...m3m6Api,
  ...commercialApi,
  ...gaApi,
  ...uxCrudApi,
  ...stdComplianceApi,
};
