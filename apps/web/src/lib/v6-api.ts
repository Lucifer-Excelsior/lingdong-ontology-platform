export interface V6BranchDto {
  id: string;
  branchName: string;
  baseRevisionCode: string;
  classes: { localName: string; labelZh: string; subClassOf?: string }[];
  status: string;
  createdBy: string;
  createdAt: string;
}

export interface ApprovalStageDto {
  stageOrder: number;
  stageName: string;
  status: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface V6MergeRequestDto {
  id: string;
  branchId: string;
  branchName: string;
  title: string;
  addedClasses: string[];
  modifiedClasses: string[];
  conflictItems: string[];
  approvalChain: ApprovalStageDto[];
  status: string;
  mergedRevisionCode?: string;
}

export interface BranchesResponse {
  branches: V6BranchDto[];
  mergeRequests: V6MergeRequestDto[];
}

export interface DriftNodeDto {
  sourceTable: string;
  sourceColumn: string;
  targetProperty: string;
  affectedShaclCount: number;
  affectedCapabilities: string[];
  affectedApps: string[];
  status: "HEALTHY" | "BROKEN_COLUMN_DROPPED" | "TYPE_DRIFT";
  recommendation: string;
}

export interface LineageDriftScanResponse {
  workspaceId: string;
  scannedAt: string;
  totalLinks: number;
  brokenCount: number;
  driftCount: number;
  simulatedChange?: string | null;
  nodes: DriftNodeDto[];
}

export interface OrgUnitDto {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  level: number;
  workspaceIds: string[];
  memberCount: number;
}

export interface FederationResponse {
  binding: { parentWorkspaceId: string; parentWorkspaceName: string; inheritedRevisionCode: string; overridePolicy: string; syncedAt: string } | null;
  items: { classLocalName: string; labelZh: string; status: string; detail: string }[];
  conflictCount: number;
  upstreamNewCount: number;
}

export interface AuditChainVerifyResponse {
  intact: boolean;
  totalEntries: number;
  algo: string;
  headHash: string;
  brokenAtSeq: number | null;
  reason?: string | null;
  recentEntries: { seqNo: number; currHash: string; actorDisplay: string; payloadSummary: string; createdAt: string }[];
}

export interface KmsSecretDto {
  alias: string;
  envVarName: string;
  provider: string;
  version: number;
  fingerprint: string;
  lastRotatedAt: string;
  rotatedBy: string;
}

async function requestV6Json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let msg = `请求失败 (${response.status})`;
    try {
      const errBody = (await response.json()) as { message?: string; error?: string };
      msg = errBody.message ?? errBody.error ?? msg;
    } catch {
      // keep status fallback
    }
    throw Object.assign(new Error(msg), { status: response.status });
  }
  return (await response.json()) as T;
}

const enc = encodeURIComponent;
const post = <T>(url: string, body?: unknown) =>
  requestV6Json<T>(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const v6Api = {
  listBranches: (wsId: string) => requestV6Json<BranchesResponse>(`/api/workspaces/${enc(wsId)}/branches`),
  createBranch: (wsId: string, branchName: string) =>
    post<{ branch?: V6BranchDto; message?: string }>(`/api/workspaces/${enc(wsId)}/branches`, { branchName }),
  addBranchClass: (wsId: string, branchId: string, payload: { localName: string; labelZh: string; subClassOf?: string }) =>
    post<{ message?: string }>(`/api/workspaces/${enc(wsId)}/branches/${enc(branchId)}/classes`, payload),
  createMergeRequest: (wsId: string, payload: { branchId: string; title: string }) =>
    post<{ mergeRequest?: V6MergeRequestDto; message?: string }>(`/api/workspaces/${enc(wsId)}/merge-requests`, payload),
  approveMergeRequest: (wsId: string, mrId: string) =>
    post<{ mergeRequest?: V6MergeRequestDto; message?: string }>(`/api/workspaces/${enc(wsId)}/merge-requests/${enc(mrId)}/approve`),
  mergeMergeRequest: (wsId: string, mrId: string) =>
    post<{ mergeRequest?: V6MergeRequestDto; message?: string }>(`/api/workspaces/${enc(wsId)}/merge-requests/${enc(mrId)}/merge`),
  scanLineageDrift: (wsId: string, payload: { droppedColumn?: string; typeChangedColumn?: string } = {}) =>
    post<LineageDriftScanResponse>(`/api/workspaces/${enc(wsId)}/lineage/drift-scan`, payload),
  listOrgUnits: () => requestV6Json<{ units: OrgUnitDto[] }>("/api/org/units"),
  getFederation: (wsId: string) => requestV6Json<FederationResponse>(`/api/workspaces/${enc(wsId)}/federation`),
  bindFederation: (wsId: string, payload: { parentWorkspaceId: string; overridePolicy: string; pullUpstreamClasses: boolean }) =>
    post<{ message?: string }>(`/api/workspaces/${enc(wsId)}/federation/bind`, payload),
  verifyAuditChain: (wsId: string) => requestV6Json<AuditChainVerifyResponse>(`/api/workspaces/${enc(wsId)}/governance/audit-chain/verify`),
  appendAuditChain: (wsId: string, summary: string) =>
    post<{ message?: string }>(`/api/workspaces/${enc(wsId)}/governance/audit-chain/append`, { summary }),
  listKmsSecrets: (wsId: string) => requestV6Json<{ secrets: KmsSecretDto[] }>(`/api/workspaces/${enc(wsId)}/governance/kms-secrets`),
  rotateKmsSecret: (wsId: string, alias: string) =>
    post<{ secret?: KmsSecretDto; message?: string }>(`/api/workspaces/${enc(wsId)}/governance/kms-secrets/${enc(alias)}/rotate`),
};
