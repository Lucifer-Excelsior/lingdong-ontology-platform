import type {
  Capability,
  ConfigureCapabilityInput,
  ConversationMessage,
  ExecutionPlanRecord,
  FdeBundleImportResult,
  FuseModelingPayload,
  FuseModelingResponse,
  McpApiTokenView,
  OntologySnapshotView,
  RdfImportPrecheckResult,
  RevisionSummary,
  SemanticDiffItem,
} from "./types";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetch(url, {
    ...init,
    headers: isFormData
      ? { ...(init?.headers ?? {}) }
      : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let msg = `请求失败 (${response.status})`;
    try {
      const err = (await response.json()) as { error?: string; message?: string };
      msg = err.error ?? err.message ?? msg;
    } catch {
      // keep status fallback
    }
    throw new Error(msg);
  }
  return (await response.json()) as T;
}

export interface StreamCallbacks {
  onStep?: (stepText: string) => void;
  onDelta?: (deltaText: string) => void;
}

export const m3m6Api = {
  fuseModelingEvidence(workspaceId: string, payload: FuseModelingPayload) {
    return fetchJson<FuseModelingResponse>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/modeling/fuse`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },

  importOntologyRdf(
    workspaceId: string,
    payload: FormData | { filename: string; content: string; commitImmediately: boolean }
  ) {
    return fetchJson<RdfImportPrecheckResult>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/ontology/import-rdf`,
      {
        method: "POST",
        body: payload instanceof FormData ? payload : JSON.stringify(payload),
      }
    );
  },

  getOntologyRevisions(workspaceId: string) {
    return fetchJson<{ revisions: RevisionSummary[] }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/ontology/revisions`
    );
  },

  getOntologyDiff(workspaceId: string, fromRev: string, toRev: string) {
    const qs = `?from=${encodeURIComponent(fromRev)}&to=${encodeURIComponent(toRev)}`;
    return fetchJson<{
      fromRevisionId: string;
      toRevisionId: string;
      backwardCompatible: boolean;
      items: SemanticDiffItem[];
    }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/ontology/diff${qs}`);
  },

  rollbackOntologyRevision(workspaceId: string, targetRevisionCode: string) {
    return fetchJson<{ revisionId: string; snapshot: OntologySnapshotView; message: string }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/ontology/rollback`,
      { method: "POST", body: JSON.stringify({ targetRevisionCode }) }
    );
  },

  importFdeBundle(formData: FormData, credentialMappingJson?: string) {
    if (credentialMappingJson?.trim()) {
      formData.set("credentialMappingJson", credentialMappingJson.trim());
    }
    return fetchJson<FdeBundleImportResult>("/api/releases/import-bundle", {
      method: "POST",
      body: formData,
    });
  },

  runEntityResolution(workspaceId: string) {
    return fetchJson<{ mergedCount: number; sampleLinks: string[]; message: string }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/entity-resolution/run`,
      { method: "POST", body: JSON.stringify({ workspaceId }) }
    );
  },

  dryRunMapping(workspaceId: string, mappingId: string) {
    return fetchJson<{
      rows: Array<{
        rowKey: string;
        subjectIri: string;
        mappedFields: Record<string, string>;
        shaclStatus: "PASS" | "QUARANTINE";
        shaclMessage?: string;
      }>;
      message: string;
    }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mappings/${encodeURIComponent(mappingId)}/dry-run`,
      { method: "POST", body: JSON.stringify({ workspaceId }) }
    );
  },

  configureCapability(workspaceId: string, payload: ConfigureCapabilityInput) {
    return fetchJson<{ capability: Capability; message: string }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/capabilities/configure`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },

  async listMcpTokens(workspaceId: string): Promise<{ tokens: McpApiTokenView[] }> {
    const res = await fetchJson<McpApiTokenView[] | { tokens?: McpApiTokenView[] }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mcp-tokens`
    );
    return { tokens: Array.isArray(res) ? res : (res.tokens ?? []) };
  },

  createMcpToken(
    workspaceId: string,
    payload: { name: string; roleScope: "VIEWER" | "OPERATOR" }
  ) {
    return fetchJson<{ token: McpApiTokenView; rawTokenOnce: string; message?: string }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mcp-tokens`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },

  revokeMcpToken(workspaceId: string, tokenId: string) {
    return fetchJson<{ revoked?: boolean; message?: string }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mcp-tokens/${encodeURIComponent(tokenId)}`,
      { method: "DELETE" }
    );
  },

  probeMcpJsonRpc(workspaceId: string, bearerToken?: string) {
    const headers: Record<string, string> = {};
    if (bearerToken?.trim()) headers.Authorization = `Bearer ${bearerToken.trim()}`;
    return fetchJson<Record<string, unknown>>("/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: { workspaceId },
      }),
    });
  },

  async askAgentStream(
    workspaceId: string,
    payload: { question: string; portalMode?: boolean; sessionId?: string },
    callbacks?: StreamCallbacks
  ): Promise<{ message: ConversationMessage; plans: ExecutionPlanRecord[] }> {
    const reqBody = JSON.stringify({
      workspaceId,
      sessionId: payload.sessionId ?? "default",
      question: payload.question,
      portalMode: payload.portalMode ?? false,
    });

    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/agent/ask-stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: reqBody,
        }
      );

      if (!response.ok || !response.body) {
        throw new Error(`SSE unavailable (${response.status})`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        return (await response.json()) as { message: ConversationMessage; plans: ExecutionPlanRecord[] };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      let doneResult: { message: ConversationMessage; plans: ExecutionPlanRecord[] } | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) {
            currentEvent = "";
            continue;
          }
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
            continue;
          }
          if (!line.startsWith("data:")) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          const evt = JSON.parse(jsonStr) as Record<string, unknown>;
          const kind = String(evt.type ?? currentEvent ?? "");
          if (kind === "step") {
            const stepText = String(evt.step ?? evt.label ?? evt.text ?? evt.detail ?? "");
            if (stepText) callbacks?.onStep?.(stepText);
          } else if (kind === "delta") {
            const deltaText = String(evt.delta ?? evt.chunk ?? evt.text ?? evt.content ?? "");
            if (deltaText) callbacks?.onDelta?.(deltaText);
          } else if (kind === "done" && evt.message) {
            doneResult = {
              message: evt.message as ConversationMessage,
              plans: (evt.plans as ExecutionPlanRecord[]) ?? [],
            };
          } else if (kind === "error") {
            throw new Error(String(evt.error ?? evt.message ?? "流式推理异常"));
          }
        }
      }

      if (doneResult) return doneResult;
    } catch {
      // Clean fallback to synchronous askAgent endpoint
    }

    return fetchJson<{ message: ConversationMessage; plans: ExecutionPlanRecord[] }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/agent/ask`,
      { method: "POST", body: reqBody }
    );
  },
};
