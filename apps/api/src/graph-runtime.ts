import { resolve } from "node:path";
import type { OntologyClass, OntologyProperty, SparqlQueryResult } from "@lingdong/contracts";
import {
  activeAboxGraphUri,
  executeGovernedSparql,
  guardSparqlSelectQuery,
  RDF_NS,
  RemoteSparqlAdapter,
  renderWorkspaceTurtle,
  SemanticGraphStore,
  shaclGraphUri,
  tboxGraphUri,
  type ExecuteSparqlOptions,
} from "@lingdong/semantic-core";

const STORE_PATH =
  process.env.OXIGRAPH_STORE_PATH ??
  resolve(process.cwd(), ".data/oxigraph-v3.nq");

export type GraphStoreMode = "embedded" | "remote_sparql";

export const graphStoreMode: GraphStoreMode =
  process.env.GRAPH_STORE_MODE === "remote_sparql" ? "remote_sparql" : "embedded";

export const remoteGraphAdapter: RemoteSparqlAdapter | null =
  graphStoreMode === "remote_sparql" && process.env.GRAPH_STORE_ENDPOINT
    ? new RemoteSparqlAdapter({
        endpointUrl: process.env.GRAPH_STORE_ENDPOINT,
        bearerToken: process.env.GRAPH_STORE_BEARER_TOKEN,
      })
    : null;

export const graphStore = new SemanticGraphStore(STORE_PATH);

export async function getGraphClusterStatus() {
  if (remoteGraphAdapter) {
    const probe = await remoteGraphAdapter.healthCheck();
    return {
      mode: "remote_sparql" as const,
      endpoint: probe.endpoint,
      healthy: probe.ok,
      latencyMs: probe.latencyMs,
      statelessClusterReady: true,
    };
  }
  return {
    mode: "embedded" as const,
    endpoint: STORE_PATH,
    healthy: true,
    latencyMs: 1,
    statelessClusterReady: false,
  };
}

export function syncRevisionToGraphStore(
  workspaceId: string,
  revisionCode: string,
  namespaceIri: string,
  classes: OntologyClass[],
  properties: OntologyProperty[]
): { ontologyTurtle: string; shaclTurtle: string; combinedTurtle: string } {
  const rendered = renderWorkspaceTurtle(namespaceIri, classes, properties);
  const tboxUri = tboxGraphUri(workspaceId, revisionCode);
  const shaclUri = shaclGraphUri(workspaceId, revisionCode);

  graphStore.loadTurtleIntoGraph(rendered.ontologyTurtle, tboxUri, true);
  graphStore.loadTurtleIntoGraph(rendered.shaclTurtle, shaclUri, true);

  if (remoteGraphAdapter) {
    void Promise.all([
      remoteGraphAdapter.putNamedGraphTurtle(tboxUri, rendered.ontologyTurtle),
      remoteGraphAdapter.putNamedGraphTurtle(shaclUri, rendered.shaclTurtle),
    ]).catch((err) => {
      console.error("[GA Remote Graph Store Sync Warning]", err);
    });
  }
  return rendered;
}

/**
 * V6.0 M1: True Stateless Unified SPARQL Query Router.
 * When `GRAPH_STORE_MODE=remote_sparql`, routes read queries 100% to the shared remote
 * SPARQL 1.1 cluster with identical read-only AST guard & RBAC sensitive-column masking,
 * eliminating multi-replica split-brain reads.
 */
export async function executeWorkspaceSparqlUnified(
  options: ExecuteSparqlOptions
): Promise<SparqlQueryResult> {
  if (graphStoreMode !== "remote_sparql" || !remoteGraphAdapter) {
    return executeGovernedSparql(graphStore, options);
  }

  const started = performance.now();
  const tboxUri = tboxGraphUri(options.workspaceId, options.revisionId);
  const aboxUri = activeAboxGraphUri(options.workspaceId);
  const guarded = guardSparqlSelectQuery(options.query, options.limit ?? 500);
  const prefixes = [
    `PREFIX ont: <${options.namespaceIri}>`,
    `PREFIX owl: <${RDF_NS.owl}>`,
    `PREFIX rdf: <${RDF_NS.rdf}>`,
    `PREFIX rdfs: <${RDF_NS.rdfs}>`,
    `PREFIX xsd: <${RDF_NS.xsd}>`,
  ].join("\n");
  const fullQuery = `${prefixes}\n${guarded.replace(/\bWHERE\b/i, `FROM <${tboxUri}> FROM <${aboxUri}> WHERE`)}`;
  const remoteRes = await remoteGraphAdapter.executeSelect(fullQuery);

  const sensitiveSet = new Set((options.sensitiveLocalNames ?? []).map((s) => s.toLowerCase()));
  const shouldMask = options.callerRole === "VIEWER" && sensitiveSet.size > 0;
  const maskedCols = new Set<string>();
  const rows = remoteRes.rows.map((r) => {
    if (!shouldMask) return r;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      if (sensitiveSet.has(k.toLowerCase())) {
        out[k] = "***（已脱敏）";
        maskedCols.add(k);
      } else {
        out[k] = v;
      }
    }
    return out;
  });

  return {
    columns: remoteRes.columns,
    rows,
    elapsedMs: Math.max(1, Math.round(performance.now() - started)),
    namedGraphsQueried: [tboxUri, aboxUri],
    maskedColumnsApplied: [...maskedCols],
  };
}
