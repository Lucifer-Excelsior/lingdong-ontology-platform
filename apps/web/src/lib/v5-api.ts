export interface ClusterHealthResponse {
  instanceId: string;
  statelessReady: boolean;
  postgres: { healthy: boolean };
  redis: { mode: "redis" | "memory_fallback"; healthy: boolean; latencyMs: number };
  graphStore: {
    mode: "embedded" | "remote_sparql";
    endpoint: string;
    healthy: boolean;
    latencyMs: number;
    statelessClusterReady: boolean;
  };
  checkedAt: string;
}

export type AsyncJobType = "MATERIALIZE_BATCH" | "MULTI_SOURCE_FUSION" | "SHACL_FULL_AUDIT";
export type AsyncJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export interface AsyncJobDto {
  id: string;
  workspaceId: string;
  jobType: AsyncJobType;
  status: AsyncJobStatus;
  progressPct: number;
  stageLabel: string;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  attempts: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface NlQueryResponse {
  question: string;
  engine: "LLM_TEXT_TO_SPARQL" | "SEMANTIC_INTENT_COMPILER";
  intentSummary: string;
  generatedSparql: string;
  columns: string[];
  rows: Record<string, string>[];
  durationMs: number;
  subgraphNodes: { id: string; label: string; kind: string }[];
  subgraphEdges: { source: string; target: string; label: string }[];
  evidenceAnchors: { documentTitle: string; chunkIndex: number; excerpt: string; matchedTerm: string }[];
}

export type WhatIfScenario = "SUPPLIER_DEFAULT" | "CONTRACT_TERMINATION" | "RISK_THRESHOLD_TIGHTEN";

export interface WhatIfSimulateResponse {
  simulationId: string;
  shadowGraphUri: string;
  shadowGraphCleaned: boolean;
  scenario: WhatIfScenario;
  targetEntityId?: string;
  thresholdWan?: number;
  affectedCount: number;
  totalExposureWan: number;
  violatedShaclCount: number;
  affectedNodes: {
    entityId: string;
    entityType: string;
    hopDistance: number;
    riskLevel: string;
    exposureAmountWan: number;
    impactReason: string;
  }[];
  recommendedActions: { capabilityCode: string; label: string; urgency: string }[];
  summary: string;
}

export type SecurityClearance = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL";
export type WorkspaceRole = "OWNER" | "MODELER" | "OPERATOR" | "REVIEWER" | "VIEWER";

export interface AbacPolicyDto {
  enabled: boolean;
  roleClearance: Record<WorkspaceRole, SecurityClearance>;
  confidentialFields: string[];
  internalFields: string[];
  maskToken: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AbacPolicyResponse {
  policy: AbacPolicyDto;
  callerRole: WorkspaceRole;
  callerClearance: SecurityClearance;
}

export interface AbacPreviewResponse {
  simulateRole: WorkspaceRole;
  callerClearance: SecurityClearance;
  redactedCellCount: number;
  redactedColumns: string[];
  rows: Record<string, string>[];
}

async function requestV5Json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
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

export const v5Api = {
  getClusterHealth() {
    return requestV5Json<ClusterHealthResponse>("/api/cluster/health");
  },
  listJobs(wsId: string) {
    return requestV5Json<{ jobs: AsyncJobDto[]; instanceId: string }>(`/api/workspaces/${encodeURIComponent(wsId)}/jobs`);
  },
  dispatchJob(wsId: string, jobType: AsyncJobType) {
    return requestV5Json<{ job: AsyncJobDto; message: string }>(`/api/workspaces/${encodeURIComponent(wsId)}/jobs`, {
      method: "POST",
      body: JSON.stringify({ jobType }),
    });
  },
  getJobStreamUrl(wsId: string, jobId: string) {
    return `/api/workspaces/${encodeURIComponent(wsId)}/jobs/${encodeURIComponent(jobId)}/stream`;
  },
  runNlQuery(wsId: string, question: string) {
    return requestV5Json<NlQueryResponse>(`/api/workspaces/${encodeURIComponent(wsId)}/portal/nl-query`, {
      method: "POST",
      body: JSON.stringify({ question }),
    });
  },
  runWhatIfSimulate(wsId: string, payload: { scenario: WhatIfScenario; targetEntityId?: string; thresholdWan?: number }) {
    return requestV5Json<WhatIfSimulateResponse>(`/api/workspaces/${encodeURIComponent(wsId)}/portal/whatif-simulate`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getAbacPolicy(wsId: string) {
    return requestV5Json<AbacPolicyResponse>(`/api/workspaces/${encodeURIComponent(wsId)}/governance/abac-policy`);
  },
  updateAbacPolicy(
    wsId: string,
    payload: Partial<Pick<AbacPolicyDto, "enabled" | "roleClearance" | "confidentialFields" | "internalFields" | "maskToken">>
  ) {
    return requestV5Json<{ ok: boolean; policy: AbacPolicyDto; message: string }>(
      `/api/workspaces/${encodeURIComponent(wsId)}/governance/abac-policy`,
      { method: "PUT", body: JSON.stringify(payload) }
    );
  },
  previewAbacRedaction(wsId: string, simulateRole: WorkspaceRole) {
    return requestV5Json<AbacPreviewResponse>(`/api/workspaces/${encodeURIComponent(wsId)}/governance/abac-preview`, {
      method: "POST",
      body: JSON.stringify({ simulateRole }),
    });
  },
};
