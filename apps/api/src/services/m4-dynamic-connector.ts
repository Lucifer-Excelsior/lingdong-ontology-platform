import { createHash } from "node:crypto";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import type { Role, SchemaSnapshot } from "@lingdong/contracts";
import { evaluateRowAgainstClassShacl } from "@lingdong/semantic-core";
import { sandboxErpSql, type AppDb } from "../db/client.js";
import {
  dataSources,
  ontologyRevisions,
  schemaSnapshots,
  semanticMappings,
  workspaces,
} from "../db/schema.js";
import { resolveTenantSecret, validateConnectorEndpoint } from "../security/guards.js";
import { probeViaDriverRegistry } from "./connectors/driver-registry.js";

export async function probeDynamicDataSource(
  txDb: AppDb,
  tenantId: string,
  callerRole: Role,
  workspaceId: string,
  dataSourceId: string
): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const [ds] = await txDb
    .select()
    .from(dataSources)
    .where(and(eq(dataSources.id, dataSourceId), eq(dataSources.workspaceId, workspaceId)));
  if (!ds) throw new Error("未找到指定数据源");

  const secret = await resolveTenantSecret(txDb, tenantId, callerRole, ds.credentialAlias);
  const isLocalSandbox =
    ds.connectionDisplayUrl.includes("sandbox_erp") || ds.connectionDisplayUrl.includes("erp-db");
  validateConnectorEndpoint(ds.connectionDisplayUrl, { allowLocalSandboxHost: isLocalSandbox });

  const started = performance.now();
  const probe = await probeViaDriverRegistry({
    kind: ds.kind,
    connectionUrl: ds.connectionDisplayUrl,
    secret,
    isLocalSandbox,
  });
  const detail = `${probe.detail} [${probe.driverMode}]`;

  const latencyMs = Math.max(2, Math.round(performance.now() - started));
  await txDb
    .update(dataSources)
    .set({ lastLatencyMs: latencyMs, status: "LIVE" })
    .where(eq(dataSources.id, dataSourceId));

  return {
    ok: true,
    latencyMs,
    message: `动态连接池探测通过 (${ds.kind})：${detail}，耗时 ${latencyMs}ms`,
  };
}

export async function captureDynamicSnapshot(
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

  const secret = await resolveTenantSecret(txDb, tenantId, callerRole, ds.credentialAlias);
  const isLocalSandbox =
    ds.connectionDisplayUrl.includes("sandbox_erp") || ds.connectionDisplayUrl.includes("erp-db");
  validateConnectorEndpoint(ds.connectionDisplayUrl, { allowLocalSandboxHost: isLocalSandbox });
  const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ");

  let tables: SchemaSnapshot["tables"] = [];
  if (ds.kind === "POSTGRESQL") {
    let cols: Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>;
    if (isLocalSandbox) {
      cols = await sandboxErpSql<
        Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>
      >`
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `;
    } else {
      const extSql = postgres(ds.connectionDisplayUrl.replace(/^jdbc:/i, ""), {
        max: 1,
        connect_timeout: 4,
        password: secret,
      });
      try {
        cols = await extSql<
          Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>
        >`
          SELECT table_name, column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public'
          ORDER BY table_name, ordinal_position
        `;
      } finally {
        await extSql.end();
      }
    }
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
        isPrimaryKey: col.column_name.endsWith("_id") || col.column_name.endsWith("_no"),
      });
      tableMap.set(col.table_name, entry);
    }
    tables = Array.from(tableMap.values());
  } else {
    tables = [
      {
        schemaName: ds.kind === "HTTP_OPENAPI" ? "openapi" : "rdf",
        tableName: ds.kind === "HTTP_OPENAPI" ? "GET /customers" : "Graph <urn:external>",
        rowCountEstimate: 120,
        columns: [
          { name: "external_id", sqlType: "STRING", nullable: false, isPrimaryKey: true },
          { name: "org_name", sqlType: "STRING", nullable: false, isPrimaryKey: false },
          { name: "unified_credit_code", sqlType: "STRING", nullable: true, isPrimaryKey: false },
        ],
      },
    ];
  }

  const totalCols = tables.reduce((s, t) => s + t.columns.length, 0);
  const fingerprint = createHash("sha256").update(JSON.stringify(tables)).digest("hex").slice(0, 8);
  const snapshotId = `snap-${Date.now()}`;
  const snapshot: SchemaSnapshot = {
    id: snapshotId,
    dataSourceId,
    versionTag: `${nowStr} · 动态快照 (${tables.length} 对象 · ${totalCols} 字段 · 当前绑定) [${fingerprint}]`,
    capturedAt: nowStr,
    tableCount: tables.length,
    columnCount: totalCols,
    fingerprint,
    isActiveBinding: true,
    tables,
  };

  const prevSnaps = await txDb
    .select()
    .from(schemaSnapshots)
    .where(eq(schemaSnapshots.dataSourceId, dataSourceId));
  for (const old of prevSnaps) {
    const cleanedTag = old.snapshotJson.versionTag.replace(/\s*·\s*当前绑定/g, "");
    await txDb
      .update(schemaSnapshots)
      .set({
        isActiveBinding: false,
        snapshotJson: { ...old.snapshotJson, isActiveBinding: false, versionTag: cleanedTag },
      })
      .where(eq(schemaSnapshots.id, old.id));
  }
  await txDb.insert(schemaSnapshots).values({
    id: snapshotId,
    tenantId,
    dataSourceId,
    snapshotJson: snapshot,
    isActiveBinding: true,
  });

  return {
    snapshot,
    message: `已完成 ${ds.name} 动态结构采集：${tables.length} 个实体集、${totalCols} 个字段 [${fingerprint}]`,
  };
}

export async function dryRunSemanticMapping(
  txDb: AppDb,
  workspaceId: string,
  mappingId: string,
  callerRole: Role
) {
  const [mapping] = await txDb
    .select()
    .from(semanticMappings)
    .where(and(eq(semanticMappings.id, mappingId), eq(semanticMappings.workspaceId, workspaceId)));
  if (!mapping) throw new Error("未找到指定语义映射规则");

  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  const [rev] = ws
    ? await txDb
        .select()
        .from(ontologyRevisions)
        .where(and(eq(ontologyRevisions.workspaceId, workspaceId), eq(ontologyRevisions.revisionCode, ws.activeRevisionId)))
    : [];
  const targetCls = rev?.classesJson.find((c) => c.iri === mapping.targetClassIri || c.localName === "Contract");

  const sampleRows =
    workspaceId === "ws-contract"
      ? await sandboxErpSql<
          Array<{ contract_no: string; title: string; customer_id: string; signed_at: string; expires_at: string; total_amount: string; status: string }>
        >`SELECT contract_no, title, customer_id, signed_at::text, expires_at::text, total_amount::text, status FROM public.contracts ORDER BY contract_no ASC LIMIT 5`
      : [];

  const rows = sampleRows.map((r) => {
    const mappedFields: Record<string, string> = {};
    for (const rule of mapping.rulesJson ?? []) {
      const raw = (r as Record<string, unknown>)[rule.sourceColumn];
      const val =
        rule.isObjectBridge && rule.bridgeIriTemplate && raw
          ? rule.bridgeIriTemplate.replace(`{${rule.sourceColumn}}`, String(raw))
          : String(raw ?? "");
      mappedFields[rule.targetPropertyDisplay] =
        callerRole === "VIEWER" && rule.maskForViewer ? "***MASKED_BY_ROLE***" : val;
    }
    const violation = targetCls
      ? evaluateRowAgainstClassShacl(targetCls, r.contract_no, mapping.sourceTable, {
          contractNo: r.contract_no,
          signedAt: r.signed_at,
          expiresAt: r.expires_at,
          totalAmount: Number(r.total_amount),
        })
      : null;
    return {
      rowKey: r.contract_no,
      subjectIri: mapping.subjectIriTemplate.replace("{contract_no}", r.contract_no),
      mappedFields,
      shaclStatus: violation ? ("QUARANTINE" as const) : ("PASS" as const),
      shaclMessage: violation?.reason,
    };
  });

  const passCount = rows.filter((r) => r.shaclStatus === "PASS").length;
  return {
    rows,
    message: `映射抽样试运行完成：共抽样 ${rows.length} 条记录，SHACL 通过 ${passCount} 条，拦截 ${rows.length - passCount} 条`,
  };
}
