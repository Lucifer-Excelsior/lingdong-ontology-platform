import { and, eq } from "drizzle-orm";
import type { DataSourceKind } from "@lingdong/contracts";
import { sandboxErpSql, type AppDb } from "../db/client.js";
import { dataSources, schemaSnapshots, semanticMappings } from "../db/schema.js";

export interface ModelingDataSourceSummary {
  id: string;
  name: string;
  kind: DataSourceKind;
  connectionDisplayUrl: string;
  tables: Array<{
    schemaName: string;
    tableName: string;
    columns: Array<{ name: string; sqlType: string; nullable: boolean; isPrimaryKey: boolean }>;
  }>;
}

export async function listModelingDataSources(
  txDb: AppDb,
  workspaceId: string
): Promise<ModelingDataSourceSummary[]> {
  const dsRows = await txDb.select().from(dataSources).where(eq(dataSources.workspaceId, workspaceId));
  const result: ModelingDataSourceSummary[] = [];

  for (const ds of dsRows) {
    const snaps = await txDb
      .select()
      .from(schemaSnapshots)
      .where(eq(schemaSnapshots.dataSourceId, ds.id));
    const activeSnap = snaps.find((s) => s.isActiveBinding) ?? snaps[0];
    let tables = activeSnap?.snapshotJson?.tables ?? [];

    if (tables.length === 0 && ds.kind === "POSTGRESQL" && workspaceId === "ws-contract") {
      const cols = await sandboxErpSql<
        Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>
      >`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`;
      const map = new Map<string, { schemaName: string; tableName: string; rowCountEstimate: number; columns: Array<{ name: string; sqlType: string; nullable: boolean; isPrimaryKey: boolean }> }>();
      for (const c of cols) {
        const entry = map.get(c.table_name) ?? { schemaName: "public", tableName: c.table_name, rowCountEstimate: 10, columns: [] };
        entry.columns.push({
          name: c.column_name,
          sqlType: c.data_type.toUpperCase(),
          nullable: c.is_nullable === "YES",
          isPrimaryKey: c.column_name.endsWith("_id") || c.column_name.endsWith("_no"),
        });
        map.set(c.table_name, entry);
      }
      tables = Array.from(map.values());
    } else if (tables.length === 0 && ds.kind === "HTTP_OPENAPI") {
      tables = [
        {
          schemaName: "openapi",
          tableName: "GET /customers",
          rowCountEstimate: 120,
          columns: [
            { name: "external_id", sqlType: "STRING", nullable: false, isPrimaryKey: true },
            { name: "org_name", sqlType: "STRING", nullable: false, isPrimaryKey: false },
            { name: "unified_credit_code", sqlType: "STRING", nullable: true, isPrimaryKey: false },
          ],
        },
      ];
    }

    result.push({
      id: ds.id,
      name: ds.name,
      kind: ds.kind,
      connectionDisplayUrl: ds.connectionDisplayUrl,
      tables,
    });
  }
  return result;
}

export async function ensureAutoTaskMappingDraft(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  dataSourceId: string,
  namespaceIri: string
): Promise<boolean> {
  const existingMap = await txDb
    .select()
    .from(semanticMappings)
    .where(and(eq(semanticMappings.workspaceId, workspaceId), eq(semanticMappings.sourceTable, "public.follow_up_tasks")));
  if (existingMap.length > 0) return false;

  const nowId = Date.now();
  await txDb.insert(semanticMappings).values({
    id: `map-auto-tasks-${nowId}`,
    tenantId,
    workspaceId,
    dataSourceId,
    sourceTable: "public.follow_up_tasks",
    targetClassIri: `${namespaceIri}FollowUpTask`,
    targetClassDisplay: "ont:FollowUpTask (续签跟进工单 · 自动生成)",
    subjectIriTemplate: "https://ontology.caict.cn/contract/task/{task_id}",
    watermarkColumn: "task_id",
    rulesJson: [
      {
        id: `r-auto-1-${nowId}`,
        sourceColumn: "task_id",
        sqlType: "VARCHAR(64)",
        targetPropertyIri: `${namespaceIri}taskId`,
        targetPropertyDisplay: "ont:taskId",
        targetXsdOrClass: "xsd:string",
        isObjectBridge: false,
        maskForViewer: false,
        governanceNote: "主键自动映射",
      },
      {
        id: `r-auto-2-${nowId}`,
        sourceColumn: "contract_no",
        sqlType: "VARCHAR(64)",
        targetPropertyIri: `${namespaceIri}forContract`,
        targetPropertyDisplay: "ont:forContract",
        targetXsdOrClass: "对象引用 ont:Contract",
        isObjectBridge: true,
        bridgeIriTemplate: "https://ontology.caict.cn/contract/instance/{contract_no}",
        maskForViewer: false,
        governanceNote: "外键自动桥接至合同主实体",
      },
      {
        id: `r-auto-3-${nowId}`,
        sourceColumn: "status",
        sqlType: "VARCHAR(32)",
        targetPropertyIri: `${namespaceIri}taskStatus`,
        targetPropertyDisplay: "ont:taskStatus",
        targetXsdOrClass: "xsd:string",
        isObjectBridge: false,
        maskForViewer: false,
        governanceNote: "NOT NULL 自动绑定 SHACL 必填",
      },
    ],
  });
  return true;
}
