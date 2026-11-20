import { buildVerifiableReceipt, type VerifiableReceipt } from "./receipt.js";

export interface LingDongClientOptions {
  baseUrl?: string;
  workspaceId?: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export interface ReceiptEnvelope<T> {
  data: T;
  receipt?: VerifiableReceipt;
}

export class LingDongClient {
  readonly baseUrl: string;
  readonly defaultWorkspaceId: string;
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LingDongClientOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.LINGDONG_BASE_URL ??
      "https://lingdong-demo-production.up.railway.app"
    ).replace(/\/+$/, "");
    this.defaultWorkspaceId =
      options.workspaceId ?? process.env.LINGDONG_WORKSPACE_ID ?? "ws-contract";
    this.token = options.token ?? process.env.LINGDONG_TOKEN;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`HTTP ${res.status} non-JSON response from ${path}: ${text.slice(0, 160)}`);
    }
    if (!res.ok) {
      const msg = (parsed as { error?: string })?.error ?? `HTTP ${res.status}`;
      throw new Error(`LingDong API error (${res.status}) on ${path}: ${msg}`);
    }
    return parsed as T;
  }

  private async wrapWithReceipt<T>(
    operation: string,
    workspaceId: string,
    data: T,
    withReceipt?: boolean,
    evidenceCount = 0
  ): Promise<ReceiptEnvelope<T>> {
    if (!withReceipt) return { data };
    let auditChain: { intact?: boolean; headHash?: string; hashAlgo?: string } | null = null;
    try {
      auditChain = await this.verifyAuditChain(workspaceId);
    } catch {
      auditChain = null;
    }
    return {
      data,
      receipt: buildVerifiableReceipt({
        operation,
        workspaceId,
        baseUrl: this.baseUrl,
        payload: data,
        evidenceCount,
        auditChain,
      }),
    };
  }

  async health(): Promise<Record<string, unknown>> {
    return this.request("GET", "/health");
  }

  async listWorkspaces(): Promise<Array<Record<string, unknown>>> {
    const res = await this.request<{ workspaces?: Array<Record<string, unknown>> }>(
      "GET",
      "/api/bootstrap"
    );
    return res.workspaces ?? [];
  }

  async ask(
    question: string,
    opts?: { workspaceId?: string; receipt?: boolean }
  ): Promise<ReceiptEnvelope<Record<string, unknown>>> {
    const ws = opts?.workspaceId ?? this.defaultWorkspaceId;
    const data = await this.request<Record<string, unknown>>(
      "POST",
      `/api/workspaces/${encodeURIComponent(ws)}/portal/nl-query`,
      { question }
    );
    const ev = Array.isArray(data.evidenceAnchors) ? data.evidenceAnchors.length : 0;
    return this.wrapWithReceipt("portal.nl-query", ws, data, opts?.receipt, ev);
  }

  async simulateWhatIf(
    targetEntityCode: string,
    opts?: { workspaceId?: string; riskThresholdWan?: number; receipt?: boolean }
  ): Promise<ReceiptEnvelope<Record<string, unknown>>> {
    const ws = opts?.workspaceId ?? this.defaultWorkspaceId;
    const data = await this.request<Record<string, unknown>>(
      "POST",
      `/api/workspaces/${encodeURIComponent(ws)}/portal/whatif-simulate`,
      { targetEntityCode, riskThresholdWan: opts?.riskThresholdWan ?? 500 }
    );
    const affected =
      typeof data.affectedCount === "number"
        ? data.affectedCount
        : Array.isArray(data.affectedNodes)
          ? data.affectedNodes.length
          : 0;
    return this.wrapWithReceipt("portal.whatif-simulate", ws, data, opts?.receipt, affected);
  }

  async coReview(
    targetContractNo: string,
    opts?: { workspaceId?: string; receipt?: boolean }
  ): Promise<ReceiptEnvelope<Record<string, unknown>>> {
    const ws = opts?.workspaceId ?? this.defaultWorkspaceId;
    const data = await this.request<Record<string, unknown>>(
      "POST",
      `/api/workspaces/${encodeURIComponent(ws)}/v7/multi-agent-review`,
      { targetContractNo }
    );
    const agents = Array.isArray(data.specialists) ? data.specialists.length : 0;
    return this.wrapWithReceipt("v7.multi-agent-review", ws, data, opts?.receipt, agents);
  }

  async detectLineageDrift(opts?: {
    workspaceId?: string;
    droppedColumns?: string[];
    receipt?: boolean;
  }): Promise<ReceiptEnvelope<Record<string, unknown>>> {
    const ws = opts?.workspaceId ?? this.defaultWorkspaceId;
    const data = await this.request<Record<string, unknown>>(
      "POST",
      `/api/workspaces/${encodeURIComponent(ws)}/lineage/drift-scan`,
      { simulatedDroppedColumns: opts?.droppedColumns ?? [] }
    );
    return this.wrapWithReceipt("lineage.drift-scan", ws, data, opts?.receipt, 0);
  }

  async verifyAuditChain(workspaceId?: string): Promise<Record<string, unknown>> {
    const ws = workspaceId ?? this.defaultWorkspaceId;
    return this.request("GET", `/api/workspaces/${encodeURIComponent(ws)}/governance/audit-chain/verify`);
  }

  async listTemplates(workspaceId?: string): Promise<Record<string, unknown>> {
    const ws = workspaceId ?? this.defaultWorkspaceId;
    return this.request("GET", `/api/workspaces/${encodeURIComponent(ws)}/v7/templates`);
  }

  async getMetrics(workspaceId?: string): Promise<Record<string, unknown>> {
    const ws = workspaceId ?? this.defaultWorkspaceId;
    return this.request("GET", `/api/workspaces/${encodeURIComponent(ws)}/v7/metrics`);
  }
}
