import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type {
  DataSource,
  MaterializationRun,
  Role,
  SchemaSnapshot,
  SemanticMapping,
} from "@lingdong/contracts";
import { sandboxErpSql, type AppDb } from "../db/client.js";
import {
  dataSources,
  materializationRuns,
  schemaSnapshots,
  semanticMappings,
} from "../db/schema.js";
import { resolveTenantSecret, validateConnectorEndpoint } from "../security/guards.js";

export async function getDataWorkspace(txDb: AppDb, workspaceId: string) {
  const dsRows = await txDb
    .select()
    .from(dataSources)
    .where(eq(dataSources.workspaceId, workspaceId));

  const snapRows = await txDb.select().from(schemaSnapshots);
  const snapsByDs = new Map<string, SchemaSnapshot[]>();
  for (const s of snapRows) {
    const arr = snapsByDs.get(s.dataSourceId) ?? [];
    arr.push({ ...s.snapshotJson, isActiveBinding: s.isActiveBinding });
    snapsByDs.set(s.dataSourceId, arr);
  }

  const formattedSources: DataSource[] = dsRows.map((d) => ({
    id: d.id,
    workspaceId: d.workspaceId,
    name: d.name,
    kind: d.kind,
    accessMode: d.accessMode,
    status: d.status,
    connectionDisplayUrl: d.connectionDisplayUrl,
    credentialAlias: d.credentialAlias,
    summaryText: d.summaryText,
    lastLatencyMs: d.lastLatencyMs,
    snapshots: snapsByDs.get(d.id) ?? [],
  }));

  const mapRows = await txDb
    .select()
    .from(semanticMappings)
    .where(eq(semanticMappings.workspaceId, workspaceId));

  const mappings: SemanticMapping[] = mapRows.map((m) => ({
    id: m.id,
    workspaceId: m.workspaceId,
    dataSourceId: m.dataSourceId,
    sourceTable: m.sourceTable,
    targetClassIri: m.targetClassIri,
    targetClassDisplay: m.targetClassDisplay,
    subjectIriTemplate: m.subjectIriTemplate,
    watermarkColumn: m.watermarkColumn,
    rules: m.rulesJson,
  }));

  const runRows = await txDb
    .select()
    .from(materializationRuns)
    .where(eq(materializationRuns.workspaceId, workspaceId))
    .orderBy(desc(materializationRuns.executedAt));

  const runs: MaterializationRun[] = runRows.map((r) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    batchCode: r.batchCode,
    executedAt: r.executedAt,
    syncMode: r.syncMode,
    boundRevisionId: r.boundRevisionId,
    writtenInstances: r.writtenInstances,
    writtenTriples: r.writtenTriples,
    quarantinedCount: r.quarantinedCount,
    quarantineSummary: r.quarantineSummary,
    status: r.status,
    quarantineRecords: r.quarantineRecordsJson,
  }));

  const defaultSparql =
    workspaceId === "ws-itu"
      ? `SELECT ?draft ?label WHERE {\n  ?draft a ont:RecommendationDraft .\n  OPTIONAL { ?draft rdfs:label ?label }\n} LIMIT 50`
      : workspaceId === "ws-supply"
        ? `SELECT ?cls ?label WHERE {\n  ?cls a owl:Class .\n  OPTIONAL { ?cls rdfs:label ?label }\n} LIMIT 50`
        : workspaceId === "ws-contract"
          ? `SELECT ?contract ?contractNo ?expiresAt ?totalAmount ?status WHERE {\n  ?contract a ont:Contract ;\n    ont:contractNo ?contractNo ;\n    ont:expiresAt ?expiresAt ;\n    ont:totalAmount ?totalAmount ;\n    ont:status ?status .\n  FILTER(?expiresAt <= "2026-12-31"^^xsd:date)\n} ORDER BY ?expiresAt LIMIT 50`
          : `SELECT ?entity ?type ?label WHERE {\n  ?entity a ?type .\n  OPTIONAL { ?entity rdfs:label ?label }\n} LIMIT 50`;

  return { dataSources: formattedSources, mappings, materializationRuns: runs, defaultSparql };
}

export async function testDataSourceConnection(
  txDb: AppDb,
  tenantId: string,
  callerRole: Role,
  workspaceId: string,
  dataSourceId: string
) {
  const [ds] = await txDb
    .select()
    .from(dataSources)
    .where(and(eq(dataSources.id, dataSourceId), eq(dataSources.workspaceId, workspaceId)));
  if (!ds) throw new Error("未找到指定数据源");

  await resolveTenantSecret(txDb, tenantId, callerRole, ds.credentialAlias);
  validateConnectorEndpoint(ds.connectionDisplayUrl, { allowLocalSandboxHost: true });

  const started = performance.now();
  const res = await sandboxErpSql`SELECT version() AS ver`;
  const latencyMs = Math.max(2, Math.round(performance.now() - started));

  await txDb
    .update(dataSources)
    .set({ lastLatencyMs: latencyMs, status: "LIVE" })
    .where(eq(dataSources.id, dataSourceId));

  return {
    ok: true,
    latencyMs,
    message: `连接测试通过：PostgreSQL 握手 ${latencyMs}ms (${String(res[0]?.ver ?? "").split(" ").slice(0, 2).join(" ")})，租户凭据校验正常`,
  };
}

export async function captureSchemaSnapshot(
  txDb: AppDb,
  tenantId: string,
  callerRole: Role,
  workspaceId: string,
  dataSourceId: string
): Promise<{ snapshot: SchemaSnapshot; message: string }> {
  const [ds] = await txDb
    .select()
    .from(dataSources)
    .where(and(eq(dataSources.id, dataSourceId), eq(dataSources.workspaceId, workspaceId)));
  if (!ds) throw new Error("未找到指定数据源");

  await resolveTenantSecret(txDb, tenantId, callerRole, ds.credentialAlias);

  const cols = await sandboxErpSql<
    Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>
  >`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `;

  const tableMap = new Map<string, SchemaSnapshot["tables"][number]>();
  for (const col of cols) {
    const entry = tableMap.get(col.table_name) ?? {
      schemaName: "public",
      tableName: col.table_name,
      rowCountEstimate: 10,
      columns: [],
    };
    entry.columns.push({
      name: col.column_name,
      sqlType: col.data_type.toUpperCase(),
      nullable: col.is_nullable === "YES",
      isPrimaryKey: col.column_name.endsWith("_id") || col.column_name.endsWith("_no") || col.column_name === "id",
    });
    tableMap.set(col.table_name, entry);
  }

  const tables = Array.from(tableMap.values());
  const totalCols = tables.reduce((s, t) => s + t.columns.length, 0);
  const fingerprint = createHash("sha256").update(JSON.stringify(tables)).digest("hex").slice(0, 8);
  const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ");
  const snapshotId = `snap-${Date.now()}`;

  const snapshot: SchemaSnapshot = {
    id: snapshotId,
    dataSourceId,
    versionTag: `${nowStr} · 实时快照 (${tables.length} 张表 · ${totalCols} 字段 · 当前绑定) [${fingerprint}]`,
    capturedAt: nowStr,
    tableCount: tables.length,
    columnCount: totalCols,
    fingerprint,
    isActiveBinding: true,
    tables,
  };

  await txDb
    .update(schemaSnapshots)
    .set({ isActiveBinding: false })
    .where(eq(schemaSnapshots.dataSourceId, dataSourceId));

  await txDb.insert(schemaSnapshots).values({
    id: snapshotId,
    tenantId,
    dataSourceId,
    snapshotJson: snapshot,
    isActiveBinding: true,
  });

  return {
    snapshot,
    message: `已完成最新表结构快照采集：识别 ${tables.length} 张物理表、${totalCols} 个字段 [${fingerprint}]`,
  };
}
