export interface V7TemplateSampleClassDto {
  localName: string;
  labelZh: string;
  description: string;
  roleKind: string;
}

export interface V7IndustryTemplateDto {
  id: string;
  industry: string;
  name: string;
  standardRef: string;
  summary: string;
  classCount: number;
  shaclRuleCount: number;
  sampleClasses: V7TemplateSampleClassDto[];
  installed?: boolean;
}

export type EcaTriggerEvent = "CONTRACT_UPSERT" | "SUPPLIER_RISK_SIGNAL" | "MATERIALIZATION_QUARANTINE";
export type EcaActionType = "PUSH_IM_ALERT" | "CREATE_RENEWAL_TASK" | "FREEZE_PAYMENT_APPROVAL";

export interface V7EcaRuleDto {
  id: string;
  name: string;
  triggerEvent: EcaTriggerEvent;
  conditionExpr: string;
  actionType: EcaActionType;
  enabled: boolean;
  triggerCount: number;
  lastTriggeredAt: string | null;
  createdBy: string;
}

export interface V7EcaLogDto {
  id: string;
  ruleName: string;
  eventPayloadSummary: string;
  actionTaken: string;
  status: "EXECUTED" | "SKIPPED_DISABLED";
  executedAt: string;
}

export type SourceSystemType = "CRM" | "ERP" | "FINANCE";

export interface V7SourceEntityRecordDto {
  sourceSystem: SourceSystemType;
  sourceId: string;
  displayName: string;
  taxCode: string;
  region: string;
  creditRating: string;
  updatedAt: string;
}

export interface V7EntityResolutionItemDto {
  id: string;
  entityType: string;
  similarityScore: number;
  matchReason: string;
  status: "PENDING" | "MERGED";
  goldenRecordId: string | null;
  goldenDisplayName: string | null;
  authoritativeSystem: SourceSystemType;
  left: V7SourceEntityRecordDto;
  right: V7SourceEntityRecordDto;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface V7EntityResolutionResponse {
  items: V7EntityResolutionItemDto[];
  pendingCount: number;
  mergedCount: number;
}

export type EmbedWidgetType = "entity-360" | "nl-sparql" | "whatif";

export interface V7EmbedSdkResponse {
  widget: EmbedWidgetType;
  iframeSnippet: string;
  webComponentSnippet: string;
  embedUrl: string;
}

export interface V7SemanticKpiMetricDto {
  code: string;
  name: string;
  value: string;
  unit: string;
  canonicalFormula: string;
  ownerDept: string;
  trendLabel: string;
  tone: "emerald" | "amber" | "rose" | "indigo";
}

export interface V7SpecialistAgentVerdictDto {
  agentRole: "LEGAL_AGENT" | "FINANCE_AGENT" | "SUPPLY_CHAIN_AGENT";
  agentTitle: string;
  riskScore: number;
  verdict: "APPROVE" | "CONDITIONAL" | "REJECT";
  keyFindings: string[];
  evidenceRef: string;
}

export interface V7MultiAgentReviewReportDto {
  reviewId: string;
  targetRef: string;
  generatedAt: string;
  overallVerdict: "APPROVE" | "CONDITIONAL" | "REJECT";
  compositeRiskScore: number;
  executiveSummary: string;
  specialists: V7SpecialistAgentVerdictDto[];
}

async function requestV7Json<T>(url: string, init?: RequestInit): Promise<T> {
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
    } catch { /* fallback */ }
    throw Object.assign(new Error(msg), { status: response.status });
  }
  return (await response.json()) as T;
}

const enc = encodeURIComponent;
const post = <T>(url: string, body?: unknown) =>
  requestV7Json<T>(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const v7Api = {
  listTemplates: (wsId: string) =>
    requestV7Json<{ templates: V7IndustryTemplateDto[] }>(`/api/workspaces/${enc(wsId)}/v7/templates`),
  installTemplate: (wsId: string, tplId: string) =>
    post<{ ok: boolean; revisionCode: string; addedCount: number; message: string }>(`/api/workspaces/${enc(wsId)}/v7/templates/${enc(tplId)}/install`),
  listEcaRules: (wsId: string) =>
    requestV7Json<{ rules: V7EcaRuleDto[]; logs: V7EcaLogDto[] }>(`/api/workspaces/${enc(wsId)}/v7/eca-rules`),
  createEcaRule: (wsId: string, payload: { name: string; triggerEvent: EcaTriggerEvent; conditionExpr: string; actionType: EcaActionType }) =>
    post<{ ok: boolean; rule?: V7EcaRuleDto; message?: string }>(`/api/workspaces/${enc(wsId)}/v7/eca-rules`, payload),
  toggleEcaRule: (wsId: string, ruleId: string) =>
    post<{ rule?: V7EcaRuleDto; message?: string }>(`/api/workspaces/${enc(wsId)}/v7/eca-rules/${enc(ruleId)}/toggle`),
  simulateTriggerEcaRule: (wsId: string, ruleId: string, sampleEventSummary?: string) =>
    post<{ ok: boolean; log?: V7EcaLogDto; message?: string }>(`/api/workspaces/${enc(wsId)}/v7/eca-rules/${enc(ruleId)}/simulate-trigger`, sampleEventSummary ? { sampleEventSummary } : {}),
  listEntityResolution: (wsId: string) =>
    requestV7Json<V7EntityResolutionResponse>(`/api/workspaces/${enc(wsId)}/v7/entity-resolution`),
  mergeEntityPair: (wsId: string, pairId: string, authoritativeSystem: SourceSystemType) =>
    post<{ ok: boolean; item?: V7EntityResolutionItemDto; message?: string }>(`/api/workspaces/${enc(wsId)}/v7/entity-resolution/${enc(pairId)}/merge`, { authoritativeSystem }),
  splitEntityPair: (wsId: string, pairId: string) =>
    post<{ ok?: boolean; item?: V7EntityResolutionItemDto; message?: string }>(`/api/workspaces/${enc(wsId)}/v7/entity-resolution/${enc(pairId)}/split`),
  getEmbedSdk: (wsId: string, widget: EmbedWidgetType) =>
    requestV7Json<V7EmbedSdkResponse>(`/api/workspaces/${enc(wsId)}/v7/embed-sdk?widget=${enc(widget)}`),
  getMetrics: (wsId: string) =>
    requestV7Json<{ metrics: V7SemanticKpiMetricDto[]; computedAt: string }>(`/api/workspaces/${enc(wsId)}/v7/metrics`),
  generateBriefing: (wsId: string) =>
    post<{ title: string; generatedAt: string; markdown: string }>(`/api/workspaces/${enc(wsId)}/v7/executive-briefing`),
  runMultiAgentReview: (wsId: string, targetRef?: string) =>
    post<V7MultiAgentReviewReportDto>(`/api/workspaces/${enc(wsId)}/v7/multi-agent-review`, targetRef ? { targetRef } : {}),
};
