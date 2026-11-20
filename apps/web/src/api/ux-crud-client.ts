import type { Role } from "@lingdong/contracts";

async function uxRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `请求失败 (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const uxCrudApi = {
  updateCapability(
    wsId: string,
    capId: string,
    patch: {
      name?: string;
      description?: string;
      autonomyTier?: "READ" | "DRAFT" | "CONFIRM" | "APPROVE";
      targetEntityLocalName?: string;
      mcpExposed?: boolean;
    }
  ) {
    return uxRequest<{ ok: boolean; message: string }>(
      `/api/workspaces/${wsId}/capabilities/${capId}`,
      { method: "PATCH", body: JSON.stringify(patch) }
    );
  },
  deleteCapability(wsId: string, capId: string) {
    return uxRequest<{ ok: boolean; message: string }>(
      `/api/workspaces/${wsId}/capabilities/${capId}`,
      { method: "DELETE" }
    );
  },
  triggerCapability(
    wsId: string,
    capId: string,
    input: { targetObjectLabel?: string; contractNo?: string; paramsSummary?: string }
  ) {
    return uxRequest<{ planId: string; planCode: string; status: string; statusLabel: string; message: string }>(
      `/api/workspaces/${wsId}/capabilities/${capId}/trigger`,
      { method: "POST", body: JSON.stringify(input) }
    );
  },
  proposeRelease(wsId: string, input: { version?: string; notes?: string }) {
    return uxRequest<{ id: string; version: string; revisionId: string; message: string }>(
      `/api/workspaces/${wsId}/releases/propose`,
      { method: "POST", body: JSON.stringify(input) }
    );
  },
  rejectRelease(wsId: string, releaseId: string, reason?: string) {
    return uxRequest<{ ok: boolean; message: string }>(
      `/api/workspaces/${wsId}/releases/${releaseId}/reject`,
      { method: "POST", body: JSON.stringify({ reason }) }
    );
  },
  deleteOntologyClass(wsId: string, classLocalName: string) {
    return uxRequest<{ ok: boolean; revisionCode: string; message: string }>(
      `/api/workspaces/${wsId}/ontology/classes/${encodeURIComponent(classLocalName)}`,
      { method: "DELETE" }
    );
  },
  deleteOntologyBranch(wsId: string, branchId: string) {
    return uxRequest<{ ok: boolean; message: string }>(
      `/api/workspaces/${wsId}/ontology/branches/${branchId}`,
      { method: "DELETE" }
    );
  },
  deleteDataSource(wsId: string, dsId: string) {
    return uxRequest<{ ok: boolean; message: string }>(
      `/api/workspaces/${wsId}/data-sources/${dsId}`,
      { method: "DELETE" }
    );
  },
  deleteDocument(wsId: string, docId: string) {
    return uxRequest<{ ok: boolean; message: string }>(
      `/api/workspaces/${wsId}/documents/${docId}`,
      { method: "DELETE" }
    );
  },
  dismissProposal(wsId: string, proposalId: string) {
    return uxRequest<{ ok: boolean; remaining: number; message: string }>(
      `/api/workspaces/${wsId}/changesets/proposals/${proposalId}`,
      { method: "DELETE" }
    );
  },
  updateGovernanceUser(
    userId: string,
    patch: { role?: Role; department?: string; regionScope?: string; complianceRole?: "NONE" | "SYS_ADMIN" | "SEC_ADMIN" | "AUDIT_ADMIN" }
  ) {
    return uxRequest<{ ok: boolean; message: string }>(
      `/api/governance/users/${userId}`,
      { method: "PATCH", body: JSON.stringify(patch) }
    );
  },
  deleteGovernanceUser(userId: string) {
    return uxRequest<{ ok: boolean; message: string }>(
      `/api/governance/users/${userId}`,
      { method: "DELETE" }
    );
  },
};
