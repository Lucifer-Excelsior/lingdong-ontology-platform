import oxigraph from "oxigraph";
import type {
  OntologyClass,
  QuarantineRecord,
  Role,
  SparqlQueryResult,
} from "@lingdong/contracts";
import {
  activeAboxGraphUri,
  RDF_NS,
  SemanticGraphStore,
  tboxGraphUri,
} from "./store.js";

const FORBIDDEN_SPARQL_MUTATION = /\b(INSERT|DELETE|CLEAR|DROP|LOAD|CREATE|COPY|MOVE|ADD)\b/i;

export interface ExecuteSparqlOptions {
  workspaceId: string;
  revisionId: string;
  namespaceIri: string;
  query: string;
  callerRole: Role;
  sensitiveLocalNames?: string[];
  limit?: number;
}

export function executeGovernedSparql(
  graphStore: SemanticGraphStore,
  options: ExecuteSparqlOptions
): SparqlQueryResult {
  const rawQuery = options.query.trim();
  if (FORBIDDEN_SPARQL_MUTATION.test(rawQuery)) {
    throw new Error("SPARQL 安全守卫拦截：仅允许受控只读 SELECT / ASK 查询，禁止写或图管理语句。");
  }
  if (!/\b(SELECT|ASK)\b/i.test(rawQuery)) {
    throw new Error("SPARQL 安全守卫拦截：查询必须以 SELECT 或 ASK 主句执行。");
  }

  const started = performance.now();
  const tboxUri = tboxGraphUri(options.workspaceId, options.revisionId);
  const aboxUri = activeAboxGraphUri(options.workspaceId);

  const prefixes = [
    `PREFIX ont: <${options.namespaceIri}>`,
    `PREFIX owl: <${RDF_NS.owl}>`,
    `PREFIX rdfs: <${RDF_NS.rdfs}>`,
    `PREFIX rdf: <${RDF_NS.rdf}>`,
    `PREFIX sh: <${RDF_NS.sh}>`,
    `PREFIX xsd: <${RDF_NS.xsd}>`,
    `PREFIX prov: <${RDF_NS.prov}>`,
  ].join("\n");

  const maxLimit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const hasLimit = /\bLIMIT\s+\d+/i.test(rawQuery);
  const fullQuery = `${prefixes}\n${rawQuery}${hasLimit ? "" : `\nLIMIT ${maxLimit}`}`;

  const sensitiveSet = new Set((options.sensitiveLocalNames ?? ["totalAmount"]).map((s) => s.toLowerCase()));
  const maskPredicateForViewer = (predIri: string): boolean => {
    if (options.callerRole !== "VIEWER" || sensitiveSet.size === 0) return false;
    const hashIdx = predIri.lastIndexOf("#");
    const slashIdx = predIri.lastIndexOf("/");
    const local = predIri.slice(Math.max(hashIdx, slashIdx) + 1).toLowerCase();
    return sensitiveSet.has(local);
  };

  // Materialize temporary union store for TBox + active ABox query isolation (with alias-proof VIEWER predicate masking)
  const unionStore = new oxigraph.Store();
  for (const gUri of [tboxUri, aboxUri]) {
    const quads = graphStore.store.match(null, null, null, oxigraph.namedNode(gUri));
    for (const q of quads) {
      const safeObj =
        gUri === aboxUri && maskPredicateForViewer(q.predicate.value)
          ? oxigraph.literal("***MASKED_BY_ROLE***")
          : q.object;
      unionStore.add(oxigraph.quad(q.subject, q.predicate, safeObj, oxigraph.defaultGraph()));
    }
  }

  // Materialize OWL 2 EL / RDFS subClassOf transitive entailment onto unionStore for query accuracy
  const subClassQuads = unionStore.match(null, oxigraph.namedNode(`${RDF_NS.rdfs}subClassOf`), null);
  const parentMap = new Map<string, Set<string>>();
  for (const sc of subClassQuads) {
    if (sc.subject.termType === "NamedNode" && sc.object.termType === "NamedNode") {
      const set = parentMap.get(sc.subject.value) ?? new Set<string>();
      set.add(sc.object.value);
      parentMap.set(sc.subject.value, set);
    }
  }
  const rdfType = oxigraph.namedNode(`${RDF_NS.rdf}type`);
  for (const typeQuad of unionStore.match(null, rdfType, null)) {
    const visited = new Set<string>();
    const queue = [typeQuad.object.value];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const sup of parentMap.get(cur) ?? []) {
        if (!visited.has(sup)) {
          visited.add(sup);
          queue.push(sup);
          unionStore.add(oxigraph.quad(typeQuad.subject, rdfType, oxigraph.namedNode(sup)));
        }
      }
    }
  }

  const rawResults = unionStore.query(fullQuery);
  const maskedColumnsApplied: string[] = [];

  if (typeof rawResults === "boolean") {
    return {
      columns: ["askResult"],
      rows: [{ askResult: String(rawResults) }],
      elapsedMs: Number((performance.now() - started).toFixed(2)),
      namedGraphsQueried: [tboxUri, aboxUri],
      maskedColumnsApplied: [],
    };
  }

  const columnsSet = new Set<string>();
  const rows: Record<string, string>[] = [];
  for (const binding of rawResults as Array<Map<string | oxigraph.Variable, oxigraph.Term>>) {
    const row: Record<string, string> = {};
    for (const [variable, term] of binding.entries()) {
      const colName = typeof variable === "string" ? variable : variable.value;
      columnsSet.add(colName);
      if (
        term.value === "***MASKED_BY_ROLE***" ||
        (options.callerRole === "VIEWER" && sensitiveSet.has(colName.toLowerCase()))
      ) {
        row[colName] = "***MASKED_BY_ROLE***";
        if (!maskedColumnsApplied.includes(colName)) maskedColumnsApplied.push(colName);
      } else {
        row[colName] = term.value;
      }
    }
    rows.push(row);
    if (rows.length >= maxLimit) break;
  }

  return {
    columns: Array.from(columnsSet),
    rows,
    elapsedMs: Number((performance.now() - started).toFixed(2)),
    namedGraphsQueried: [tboxUri, aboxUri],
    maskedColumnsApplied,
  };
}

export function evaluateRowAgainstClassShacl(
  ontologyClass: OntologyClass,
  rowKey: string,
  sourceTable: string,
  valuesByLocalName: Record<string, unknown>
): QuarantineRecord | null {
  for (const constraint of ontologyClass.shaclConstraints) {
    const val = valuesByLocalName[constraint.propertyLocalName];
    if ((constraint.minCount ?? 0) >= 1 && (val === undefined || val === null || String(val).trim() === "")) {
      return {
        id: `q-${rowKey}-${constraint.propertyLocalName}`,
        sourceRowKey: rowKey,
        sourceTable,
        violatedProperty: constraint.propertyIri,
        reason: `违反 SHACL 必填约束 (${constraint.propertyLocalName} sh:minCount 1)`,
        rawPayloadSummary: JSON.stringify(valuesByLocalName),
      };
    }
    if (val !== undefined && val !== null && constraint.minInclusive !== undefined) {
      const numVal = Number(val);
      if (Number.isNaN(numVal) || numVal < constraint.minInclusive) {
        return {
          id: `q-${rowKey}-${constraint.propertyLocalName}`,
          sourceRowKey: rowKey,
          sourceTable,
          violatedProperty: constraint.propertyIri,
          reason: `违反 SHACL 数值下界 (${constraint.propertyLocalName} < ${constraint.minInclusive})`,
          rawPayloadSummary: JSON.stringify(valuesByLocalName),
        };
      }
    }
    if (val && constraint.lessThanOrEqualsProperty) {
      const upperVal = valuesByLocalName[constraint.lessThanOrEqualsProperty];
      if (upperVal && String(val) > String(upperVal)) {
        return {
          id: `q-${rowKey}-${constraint.propertyLocalName}`,
          sourceRowKey: rowKey,
          sourceTable,
          violatedProperty: constraint.propertyIri,
          reason: `违反 SHACL 时序闭合规则：合同到期日 (${String(upperVal)}) 早于签署日 (${String(val)})`,
          rawPayloadSummary: JSON.stringify(valuesByLocalName),
        };
      }
    }
  }
  return null;
}
