import type {
  ExternalImportAnalysis,
  InferenceDerivationTrace,
  InferenceRuleRecord,
  OntologyRetirementImpact,
  OntologyRetirementState,
  OntologyReuseAssessment,
  RequirementChangeImpact,
  RequirementTraceEntry,
} from "@lingdong/contracts";

async function stdRequest<T>(path: string, init?: RequestInit): Promise<T> {
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

export const stdComplianceApi = {
  evaluateReuse(wsId: string, input: { assetId: string; assetTitle: string; version: string; turtleSnippet: string }) {
    return stdRequest<OntologyReuseAssessment>(`/api/workspaces/${wsId}/modeling/evaluate-reuse`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  getRequirementTraceMatrix(wsId: string) {
    return stdRequest<{ items: RequirementTraceEntry[] }>(`/api/workspaces/${wsId}/requirements/trace-matrix`);
  },
  upsertRequirementTrace(wsId: string, cqId: string, patch: { mappedClasses: string[]; mappedProperties: string[]; mappedRules: string[] }) {
    return stdRequest<RequirementTraceEntry>(`/api/workspaces/${wsId}/requirements/${cqId}/trace`, {
      method: "POST",
      body: JSON.stringify(patch),
    });
  },
  simulateRequirementChange(wsId: string, cqId: string, proposedChange: string) {
    return stdRequest<RequirementChangeImpact>(`/api/workspaces/${wsId}/requirements/${cqId}/simulate-change`, {
      method: "POST",
      body: JSON.stringify({ proposedChange }),
    });
  },
  updateClassAxioms(wsId: string, localName: string, patch: { subClassOf?: string; equivalentClass?: string; disjointWith?: string }) {
    return stdRequest<{ ok: boolean; revisionCode: string; message: string }>(
      `/api/workspaces/${wsId}/ontology/classes/${encodeURIComponent(localName)}/axioms`,
      { method: "PATCH", body: JSON.stringify(patch) }
    );
  },
  updatePropertyAxioms(wsId: string, localName: string, patch: { subPropertyOf?: string; characteristics?: string }) {
    return stdRequest<{ ok: boolean; revisionCode: string; message: string }>(
      `/api/workspaces/${wsId}/ontology/properties/${encodeURIComponent(localName)}/axioms`,
      { method: "PATCH", body: JSON.stringify(patch) }
    );
  },
  listInferenceRules(wsId: string) {
    return stdRequest<{ rules: InferenceRuleRecord[]; traces: InferenceDerivationTrace[] }>(
      `/api/workspaces/${wsId}/ontology/inference-rules`
    );
  },
  createInferenceRule(wsId: string, input: { name: string; scopeClass: string; conditionExpr: string; conclusionExpr: string }) {
    return stdRequest<{ rule: InferenceRuleRecord; rules: InferenceRuleRecord[]; message: string }>(
      `/api/workspaces/${wsId}/ontology/inference-rules`,
      { method: "POST", body: JSON.stringify(input) }
    );
  },
  toggleInferenceRule(wsId: string, ruleId: string) {
    return stdRequest<{ ok: boolean; rules: InferenceRuleRecord[]; message: string }>(
      `/api/workspaces/${wsId}/ontology/inference-rules/${ruleId}/toggle`,
      { method: "PATCH" }
    );
  },
  deleteInferenceRule(wsId: string, ruleId: string) {
    return stdRequest<{ ok: boolean; rules: InferenceRuleRecord[]; message: string }>(
      `/api/workspaces/${wsId}/ontology/inference-rules/${ruleId}`,
      { method: "DELETE" }
    );
  },
  evaluateInferenceRules(wsId: string) {
    return stdRequest<{ traces: InferenceDerivationTrace[]; passedCount: number; message: string }>(
      `/api/workspaces/${wsId}/ontology/inference-rules/evaluate`,
      { method: "POST" }
    );
  },
  analyzeExternalImport(wsId: string, rdfText: string, fileName = "external.ttl") {
    return stdRequest<ExternalImportAnalysis>(`/api/workspaces/${wsId}/ontology/import-analyze`, {
      method: "POST",
      body: JSON.stringify({ rdfText, fileName }),
    });
  },
  getLifecycleStatus(wsId: string) {
    return stdRequest<{
      retirement: OntologyRetirementState;
      imports: Array<{ iri: string; version: string; status: string }>;
    }>(`/api/workspaces/${wsId}/lifecycle/status`);
  },
  analyzeRetirementImpact(wsId: string) {
    return stdRequest<OntologyRetirementImpact>(`/api/workspaces/${wsId}/lifecycle/retire-impact`, { method: "POST" });
  },
  retireOntology(wsId: string, reason: string) {
    return stdRequest<OntologyRetirementState>(`/api/workspaces/${wsId}/lifecycle/retire`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
  reactivateOntology(wsId: string) {
    return stdRequest<OntologyRetirementState>(`/api/workspaces/${wsId}/lifecycle/reactivate`, { method: "POST" });
  },
};
