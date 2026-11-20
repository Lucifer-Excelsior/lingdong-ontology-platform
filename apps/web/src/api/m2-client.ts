import type {
  ChangeSetProposal,
  DataSource,
  DocumentRecord,
  MaterializationRun,
  OntologyWorkspaceSnapshot,
  WatermarkScheduleState,
} from "./types";

async function sendJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    let errorMessage = `请求失败 (${response.status})`;
    try {
      const errBody = (await response.json()) as { message?: string; error?: string };
      if (errBody.message) errorMessage = errBody.message;
      else if (errBody.error) errorMessage = errBody.error;
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }
  return (await response.json()) as T;
}

export const m2Api = {
  async uploadDocumentMultipart(workspaceId: string, formData: FormData): Promise<DocumentRecord> {
    const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/documents`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      let msg = `上传失败 (${response.status})`;
      try {
        const err = (await response.json()) as { error?: string; message?: string };
        msg = err.error ?? err.message ?? msg;
      } catch {
        // ignore
      }
      throw new Error(msg);
    }
    return (await response.json()) as DocumentRecord;
  },

  extractDocProposals(
    workspaceId: string,
    payload: { documentId: string; chunkId?: string; instruction?: string }
  ) {
    return sendJson<{ proposals: ChangeSetProposal[]; engineUsed: string; message: string }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/modeling/extract`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },

  saveOntologyLayout(
    workspaceId: string,
    positions: Record<string, { x: number; y: number }>
  ) {
    return sendJson<{ updatedCount: number }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/ontology/layout`,
      { method: "POST", body: JSON.stringify({ positions }) }
    );
  },

  authorOntologyElement(
    workspaceId: string,
    payload: {
      kind: "ADD_OBJECT_PROPERTY" | "ADD_DATATYPE_PROPERTY" | "ADD_SHACL_CONSTRAINT";
      labelZh: string;
      localName: string;
      sourceClassLocalName: string;
      targetOrDatatype: string;
      minInclusive?: number;
      commitImmediately?: boolean;
    }
  ) {
    return sendJson<{
      committed: boolean;
      revisionId: string;
      snapshot: OntologyWorkspaceSnapshot;
      message: string;
    }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/ontology/author`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  registerDataSource(
    workspaceId: string,
    payload: {
      name: string;
      kind: DataSource["kind"];
      accessMode: "READ_ONLY" | "READ_WRITE" | "RDF_GSP";
      connectionUrl: string;
      credentialAlias: string;
    }
  ) {
    return sendJson<{ id: string; message: string }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/data-sources`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },

  updateMappingRule(
    workspaceId: string,
    mappingId: string,
    payload:
      | { type: "TOGGLE_MASK"; ruleId: string; maskForViewer: boolean }
      | {
          type: "ADD_RULE";
          sourceColumn: string;
          sqlType: string;
          targetPropertyLocalName: string;
          targetXsdOrClass: string;
          maskForViewer: boolean;
        }
  ) {
    return sendJson<{ rulesCount: number }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mappings/${encodeURIComponent(mappingId)}/rules`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },

  setMaterializationSchedule(
    workspaceId: string,
    payload: { enabled: boolean; intervalSeconds?: number }
  ) {
    return sendJson<{ schedule: WatermarkScheduleState; message: string }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/materializations/schedule`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },

  replayQuarantineRow(workspaceId: string, rowKey: string, repairedExpiresAt?: string) {
    return sendJson<{ run: MaterializationRun; message: string }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/materializations/quarantine/${encodeURIComponent(rowKey)}/replay`,
      { method: "POST", body: JSON.stringify({ repairedExpiresAt }) }
    );
  },
};
