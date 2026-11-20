/**
 * W3C SPARQL 1.1 Query / Update / Graph Store Protocol (GSP) Remote Adapter.
 * Enables stateless horizontal scaling of `lingdong-api` against a standalone
 * Oxigraph Server (`oxigraph/oxigraph`) or Apache Jena Fuseki cluster.
 */
export interface RemoteSparqlConfig {
  endpointUrl: string;
  queryPath?: string;
  updatePath?: string;
  storePath?: string;
  bearerToken?: string;
  defaultTimeoutMs?: number;
  maxLimit?: number;
}

const DESTRUCTIVE_UPDATE_RE = /\b(DROP\s+ALL|CLEAR\s+ALL|DROP\s+DEFAULT)\b/i;
const MUTATION_IN_SELECT_RE = /\b(INSERT|DELETE|LOAD|CLEAR|DROP|CREATE|MOVE|COPY|ADD)\b/i;

export function guardSparqlSelectQuery(rawQuery: string, maxLimit = 10000): string {
  const trimmed = rawQuery.trim();
  if (!trimmed) throw new Error("SPARQL 查询语句不能为空");
  if (MUTATION_IN_SELECT_RE.test(trimmed)) {
    throw new Error("只读查询通道拦截：禁止在 SELECT/ASK 端点执行写操作");
  }
  if (/\bLIMIT\s+\d+/i.test(trimmed) || /^\s*(PREFIX[\s\S]*?)?\bASK\b/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}\nLIMIT ${maxLimit}`;
}

export class RemoteSparqlAdapter {
  private readonly baseUrl: string;
  private readonly queryUrl: string;
  private readonly updateUrl: string;
  private readonly storeUrl: string;
  private readonly headers: Record<string, string>;
  private readonly defaultTimeoutMs: number;
  private readonly maxLimit: number;

  constructor(config: RemoteSparqlConfig) {
    this.baseUrl = config.endpointUrl.replace(/\/+$/, "");
    this.queryUrl = `${this.baseUrl}${config.queryPath ?? "/query"}`;
    this.updateUrl = `${this.baseUrl}${config.updatePath ?? "/update"}`;
    this.storeUrl = `${this.baseUrl}${config.storePath ?? "/store"}`;
    this.headers = config.bearerToken ? { Authorization: `Bearer ${config.bearerToken}` } : {};
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 5000;
    this.maxLimit = config.maxLimit ?? 10000;
  }

  public async executeSelect(
    rawQuery: string,
    timeoutMs = this.defaultTimeoutMs
  ): Promise<{ columns: string[]; rows: Array<Record<string, string>>; guardedQuery: string }> {
    const guardedQuery = guardSparqlSelectQuery(rawQuery, this.maxLimit);
    const resp = await fetch(this.queryUrl, {
      method: "POST",
      headers: {
        ...this.headers,
        "Content-Type": "application/sparql-query",
        Accept: "application/sparql-results+json",
      },
      body: guardedQuery,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      throw new Error(`远程图库 SPARQL 查询失败: HTTP ${resp.status}`);
    }
    const json = (await resp.json()) as {
      head?: { vars?: string[] };
      results?: { bindings?: Array<Record<string, { value?: string }>> };
    };
    const columns = json.head?.vars ?? [];
    const rows = (json.results?.bindings ?? []).map((b) => {
      const out: Record<string, string> = {};
      for (const col of columns) out[col] = b[col]?.value ?? "";
      return out;
    });
    return { columns, rows, guardedQuery };
  }

  public async putNamedGraphTurtle(
    graphUri: string,
    turtle: string,
    timeoutMs = this.defaultTimeoutMs
  ): Promise<void> {
    const url = `${this.storeUrl}?graph=${encodeURIComponent(graphUri)}`;
    const resp = await fetch(url, {
      method: "PUT",
      headers: { ...this.headers, "Content-Type": "text/turtle; charset=utf-8" },
      body: turtle,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      throw new Error(`远程图库 GSP PUT 写入失败: HTTP ${resp.status}`);
    }
  }

  public async executeUpdate(sparqlUpdate: string, timeoutMs = this.defaultTimeoutMs): Promise<void> {
    if (DESTRUCTIVE_UPDATE_RE.test(sparqlUpdate)) {
      throw new Error("图库安全拦截：禁止执行全库清零指令 (DROP/CLEAR ALL)");
    }
    const resp = await fetch(this.updateUrl, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/sparql-update" },
      body: sparqlUpdate,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      throw new Error(`远程图库 SPARQL Update 失败: HTTP ${resp.status}`);
    }
  }

  public async healthCheck(timeoutMs = 2000): Promise<{ ok: boolean; latencyMs: number; endpoint: string }> {
    const started = performance.now();
    try {
      const resp = await fetch(this.queryUrl, {
        method: "POST",
        headers: {
          ...this.headers,
          "Content-Type": "application/sparql-query",
          Accept: "application/sparql-results+json",
        },
        body: "ASK { ?s ?p ?o }",
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { ok: resp.ok, latencyMs: Math.round(performance.now() - started), endpoint: this.baseUrl };
    } catch {
      return { ok: false, latencyMs: Math.round(performance.now() - started), endpoint: this.baseUrl };
    }
  }
}
