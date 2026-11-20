import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import type { OntologyClass, QuarantineRecord, Role } from "@lingdong/contracts";
import {
  activeAboxGraphUri,
  evaluateRowAgainstClassShacl,
  RDF_NS,
  type TripleInput,
} from "@lingdong/semantic-core";
import { sandboxErpSql, type AppDb } from "../db/client.js";
import { dataSources, semanticMappings } from "../db/schema.js";
import { graphStore } from "../graph-runtime.js";
import { resolveTenantSecret, validateConnectorEndpoint } from "../security/guards.js";

const SAFE_SQL_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function parseSafeTable(raw: string): { schema: string; table: string } {
  const parts = raw.split(".");
  const schema = parts.length === 2 ? parts[0] : "public";
  const table = parts.length === 2 ? parts[1] : parts[0];
  if (!SAFE_SQL_IDENT.test(schema) || !SAFE_SQL_IDENT.test(table)) {
    throw new Error(`R2RML 安全拦截：非法 SQL 表名标识符 (${raw})`);
  }
  return { schema, table };
}

function assertSafeColumn(col: string): string {
  if (!SAFE_SQL_IDENT.test(col)) {
    throw new Error(`R2RML 安全拦截：非法 SQL 列名标识符 (${col})`);
  }
  return col;
}

function mapXsdDatatype(targetXsdOrClass: string): string | undefined {
  if (!targetXsdOrClass.startsWith("xsd:")) return undefined;
  return `${RDF_NS.xsd}${targetXsdOrClass.slice(4)}`;
}

function expandIriTemplate(template: string, row: Record<string, unknown>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, col) =>
    encodeURIComponent(String(row[col] ?? "unknown"))
  );
}

export interface GenericR2rmlResult {
  mappedTables: string[];
  writtenInstances: number;
  writtenTriples: number;
  quarantineRecords: QuarantineRecord[];
  maxWatermark: string | null;
}

/**
 * Item #1: Generic R2RML-style dynamic materializer that reads ANY workspace's
 * `semantic_mappings` + `data_sources`, connects to local sandbox OR external
 * PostgreSQL pools safely, evaluates class SHACL constraints, and upserts RDF
 * triples into Oxigraph `abox:active`.
 */
export async function executeGenericR2rmlMaterialization(params: {
  txDb: AppDb;
  tenantId: string;
  callerRole: Role;
  workspaceId: string;
  classes: OntologyClass[];
  prevCursor: string | null;
  batchSize: number;
}): Promise<GenericR2rmlResult> {
  const mappings = await params.txDb
    .select()
    .from(semanticMappings)
    .where(eq(semanticMappings.workspaceId, params.workspaceId));

  const aboxUri = activeAboxGraphUri(params.workspaceId);
  const subjectsToReplace = new Set<string>();
  const triplesToUpsert: TripleInput[] = [];
  const quarantineRecords: QuarantineRecord[] = [];
  const mappedTables: string[] = [];
  let maxWatermark = params.prevCursor;

  for (const mapping of mappings) {
    const [ds] = await params.txDb
      .select()
      .from(dataSources)
      .where(and(eq(dataSources.id, mapping.dataSourceId), eq(dataSources.workspaceId, params.workspaceId)));
    if (!ds || ds.kind !== "POSTGRESQL") continue;

    const secret = await resolveTenantSecret(params.txDb, params.tenantId, params.callerRole, ds.credentialAlias);
    const isLocalSandbox =
      ds.connectionDisplayUrl.includes("sandbox_erp") || ds.connectionDisplayUrl.includes("erp-db");
    validateConnectorEndpoint(ds.connectionDisplayUrl, { allowLocalSandboxHost: isLocalSandbox });

    const { schema, table } = parseSafeTable(mapping.sourceTable);
    const rules = mapping.rulesJson ?? [];
    const colSet = new Set<string>();
    for (const r of rules) colSet.add(assertSafeColumn(r.sourceColumn));
    const templateCols = Array.from(mapping.subjectIriTemplate.matchAll(/\{([a-zA-Z0-9_]+)\}/g)).map((m) =>
      assertSafeColumn(m[1])
    );
    for (const tc of templateCols) colSet.add(tc);
    const wmCol = mapping.watermarkColumn ? assertSafeColumn(mapping.watermarkColumn) : null;
    if (wmCol) colSet.add(wmCol);
    if (colSet.size === 0) continue;

    const selectCols = Array.from(colSet)
      .map((c) => `"${c}"::text AS "${c}"`)
      .join(", ");
    const baseQuery = `SELECT ${selectCols} FROM "${schema}"."${table}"`;
    const queryText =
      wmCol && params.prevCursor
        ? `${baseQuery} WHERE "${wmCol}"::text >= $1 ORDER BY "${wmCol}" ASC LIMIT $2`
        : wmCol
          ? `${baseQuery} ORDER BY "${wmCol}" ASC LIMIT $1`
          : `${baseQuery} LIMIT $1`;
    const queryParams = wmCol && params.prevCursor ? [params.prevCursor, params.batchSize] : [params.batchSize];

    const sqlClient = isLocalSandbox
      ? sandboxErpSql
      : postgres(ds.connectionDisplayUrl.replace(/^jdbc:/i, ""), { max: 1, connect_timeout: 4, password: secret });

    let rows: Array<Record<string, unknown>> = [];
    try {
      rows = (await sqlClient.unsafe(queryText, queryParams)) as Array<Record<string, unknown>>;
    } finally {
      if (!isLocalSandbox) await sqlClient.end();
    }

    const targetCls = params.classes.find((c) => c.iri === mapping.targetClassIri);
    mappedTables.push(mapping.sourceTable);

    for (const row of rows) {
      const rowKey = String(row[templateCols[0] ?? Array.from(colSet)[0]] ?? "row");
      if (targetCls) {
        const valsByLocal: Record<string, unknown> = {};
        for (const r of rules) {
          const local = r.targetPropertyIri.slice(Math.max(r.targetPropertyIri.lastIndexOf("#"), r.targetPropertyIri.lastIndexOf("/")) + 1);
          const v = row[r.sourceColumn];
          valsByLocal[local] = r.targetXsdOrClass === "xsd:decimal" || r.targetXsdOrClass === "xsd:integer" ? Number(v) : v;
        }
        const violation = evaluateRowAgainstClassShacl(targetCls, rowKey, mapping.sourceTable, valsByLocal);
        if (violation) {
          quarantineRecords.push(violation);
          continue;
        }
      }

      if (wmCol && row[wmCol]) {
        const wmStr = String(row[wmCol]);
        if (!maxWatermark || wmStr > maxWatermark) maxWatermark = wmStr;
      }

      const subjIri = expandIriTemplate(mapping.subjectIriTemplate, row);
      subjectsToReplace.add(subjIri);
      triplesToUpsert.push({ subject: subjIri, predicate: `${RDF_NS.rdf}type`, object: mapping.targetClassIri });

      for (const r of rules) {
        const rawVal = row[r.sourceColumn];
        if (rawVal === null || rawVal === undefined || String(rawVal).trim() === "") continue;
        if (r.isObjectBridge && r.bridgeIriTemplate) {
          triplesToUpsert.push({
            subject: subjIri,
            predicate: r.targetPropertyIri,
            object: expandIriTemplate(r.bridgeIriTemplate, row),
          });
        } else {
          triplesToUpsert.push({
            subject: subjIri,
            predicate: r.targetPropertyIri,
            object: String(rawVal),
            isLiteral: true,
            datatypeIri: mapXsdDatatype(r.targetXsdOrClass),
          });
        }
      }
    }
  }

  if (subjectsToReplace.size > 0) {
    graphStore.deleteSubjectsInGraph(subjectsToReplace, aboxUri);
    graphStore.writeTriplesToGraph(triplesToUpsert, aboxUri, false);
  }

  return {
    mappedTables,
    writtenInstances: graphStore.countDistinctSubjectsInGraph(aboxUri),
    writtenTriples: graphStore.countQuadsInGraph(aboxUri),
    quarantineRecords,
    maxWatermark,
  };
}
