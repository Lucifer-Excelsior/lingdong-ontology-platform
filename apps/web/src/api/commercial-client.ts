import type {
  BusinessFeedback,
  CommercialLicenseInfo,
  EnterpriseUserRecord,
  Entity360Profile,
  ImpactSimulationResult,
  OntologyBranch,
  PortalAppConfig,
  Role,
} from "@lingdong/contracts";

let currentActorId: string | undefined;

export function setCommercialActorHeader(userId?: string) {
  currentActorId = userId;
}

function actorHeaders(): Record<string, string> {
  return currentActorId ? { "x-demo-user-id": currentActorId } : {};
}

async function fetchCommercialJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...actorHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    let msg = `请求失败 (${response.status})`;
    try {
      const err = (await response.json()) as { message?: string; error?: string };
      msg = err.message ?? err.error ?? msg;
    } catch {
      // keep status fallback
    }
    throw new Error(msg);
  }
  return (await response.json()) as T;
}

export async function downloadCommercialCsv(path: string, filename: string): Promise<void> {
  const response = await fetch(path, {
    method: "GET",
    credentials: "same-origin",
    headers: actorHeaders(),
  });
  if (!response.ok) {
    let msg = `导出失败 (${response.status})`;
    try {
      const err = (await response.json()) as { message?: string; error?: string };
      msg = err.message ?? err.error ?? msg;
    } catch {
      // keep status fallback
    }
    throw new Error(msg);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export interface WebhookTestResult {
  ok: boolean;
  httpStatus: number;
  latencyMs: number;
  idempotencyKey: string;
  responsePreview: string;
  message: string;
}

export const commercialApi = {
  downloadCommercialCsv,

  listOntologyBranches(wsId: string) {
    return fetchCommercialJson<{ branches: OntologyBranch[] }>(
      `/api/workspaces/${encodeURIComponent(wsId)}/ontology/branches`
    );
  },

  createOntologyBranch(wsId: string, body: { name: string; description?: string }) {
    return fetchCommercialJson<{ branch: OntologyBranch; branches: OntologyBranch[]; message: string }>(
      `/api/workspaces/${encodeURIComponent(wsId)}/ontology/branches`,
      { method: "POST", body: JSON.stringify(body) }
    );
  },

  mergeOntologyBranch(wsId: string, branchId: string) {
    return fetchCommercialJson<{ branch: OntologyBranch; branches: OntologyBranch[]; message: string }>(
      `/api/workspaces/${encodeURIComponent(wsId)}/ontology/branches/${encodeURIComponent(branchId)}/merge`,
      { method: "POST", body: JSON.stringify({}) }
    );
  },

  simulateOntologyImpact(
    wsId: string,
    body: {
      operation: "DELETE_CLASS" | "RENAME_CLASS" | "DELETE_PROPERTY" | "ADD_SHACL_CONSTRAINT";
      targetLocalName: string;
      minInclusive?: number;
    }
  ) {
    return fetchCommercialJson<ImpactSimulationResult>(
      `/api/workspaces/${encodeURIComponent(wsId)}/ontology/simulate-impact`,
      { method: "POST", body: JSON.stringify(body) }
    );
  },

  importQuarantineCsv(wsId: string, csvText: string) {
    return fetchCommercialJson<{ replayedCount: number; rowKeys: string[]; message: string }>(
      `/api/workspaces/${encodeURIComponent(wsId)}/materializations/quarantine/import-csv`,
      { method: "POST", body: JSON.stringify({ csvText }) }
    );
  },

  testCapabilityWebhook(
    wsId: string,
    code: string,
    body: { webhookUrl: string; method?: "POST" | "PATCH" | "PUT"; samplePayload?: Record<string, unknown> }
  ) {
    return fetchCommercialJson<WebhookTestResult>(
      `/api/workspaces/${encodeURIComponent(wsId)}/capabilities/${encodeURIComponent(code)}/test-webhook`,
      { method: "POST", body: JSON.stringify(body) }
    );
  },

  getEntity360(wsId: string, entityKey: string) {
    return fetchCommercialJson<Entity360Profile>(
      `/api/workspaces/${encodeURIComponent(wsId)}/portal/entity-360/${encodeURIComponent(entityKey)}`
    );
  },

  getPortalConfig(wsId: string) {
    return fetchCommercialJson<PortalAppConfig>(
      `/api/workspaces/${encodeURIComponent(wsId)}/portal/config`
    );
  },

  savePortalConfig(wsId: string, body: PortalAppConfig) {
    return fetchCommercialJson<{ config: PortalAppConfig; message: string }>(
      `/api/workspaces/${encodeURIComponent(wsId)}/portal/config`,
      { method: "POST", body: JSON.stringify(body) }
    );
  },

  listPortalFeedback(wsId: string) {
    return fetchCommercialJson<{ items: BusinessFeedback[] }>(
      `/api/workspaces/${encodeURIComponent(wsId)}/portal/feedback`
    );
  },

  submitPortalFeedback(
    wsId: string,
    body: { question: string; rating: "UP" | "DOWN"; correctionNote?: string }
  ) {
    return fetchCommercialJson<{ feedback: BusinessFeedback; totalCount: number; message: string }>(
      `/api/workspaces/${encodeURIComponent(wsId)}/portal/feedback`,
      { method: "POST", body: JSON.stringify(body) }
    );
  },

  pushPortalImCard(
    wsId: string,
    body: { channel?: "WECOM" | "DINGTALK" | "FEISHU"; title: string; summary: string; targetRef: string }
  ) {
    return fetchCommercialJson<{
      ok: boolean;
      channel: string;
      cardPayload: Record<string, unknown>;
      message: string;
    }>(`/api/workspaces/${encodeURIComponent(wsId)}/portal/im-push`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  listGovernanceUsers() {
    return fetchCommercialJson<{ users: EnterpriseUserRecord[] }>("/api/governance/users");
  },

  createGovernanceUser(body: {
    name: string;
    title: string;
    role: Role;
    department: string;
    regionScope: string;
    complianceRole: EnterpriseUserRecord["complianceRole"];
  }) {
    return fetchCommercialJson<{ user: EnterpriseUserRecord; message: string }>("/api/governance/users", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  getGovernanceLicense(wsId: string) {
    return fetchCommercialJson<CommercialLicenseInfo>(
      `/api/workspaces/${encodeURIComponent(wsId)}/governance/license`
    );
  },
};
