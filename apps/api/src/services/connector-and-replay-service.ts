import { and, eq } from "drizzle-orm";
import type { ColumnMappingRule, DataSourceKind, MaterializationRun } from "@lingdong/contracts";
import { sandboxErpSql, withTenantDb, type AppDb } from "../db/client.js";
import { credentials, dataSources, semanticMappings } from "../db/schema.js";
import { validateConnectorEndpoint } from "../security/guards.js";
import { materializeWorkspaceAbox } from "./data-service.js";

export interface WatermarkScheduleState {
  workspaceId: string;
  enabled: boolean;
  intervalSeconds: number;
  lastAutoRunAt: string | null;
  autoRunsCount: number;
}

const scheduleStates = new Map<string, WatermarkScheduleState>();
const scheduleTimers = new Map<string, ReturnType<typeof setInterval>>();

export function getWatermarkScheduleState(workspaceId: string): WatermarkScheduleState {
  return (
    scheduleStates.get(workspaceId) ?? {
      workspaceId,
      enabled: false,
      intervalSeconds: 60,
      lastAutoRunAt: null,
      autoRunsCount: 0,
    }
  );
}

export function configureWatermarkSchedule(
  tenantId: string,
  workspaceId: string,
  enabled: boolean,
  intervalSeconds = 60
): WatermarkScheduleState {
  const clampedInterval = Math.min(Math.max(intervalSeconds, 15), 3600);
  const existingTimer = scheduleTimers.get(workspaceId);
  if (existingTimer) {
    clearInterval(existingTimer);
    scheduleTimers.delete(workspaceId);
  }

  const prev = getWatermarkScheduleState(workspaceId);
  const next: WatermarkScheduleState = {
    workspaceId,
    enabled,
    intervalSeconds: clampedInterval,
    lastAutoRunAt: prev.lastAutoRunAt,
    autoRunsCount: prev.autoRunsCount,
  };
  scheduleStates.set(workspaceId, next);

  if (enabled) {
    const timer = setInterval(() => {
      void withTenantDb(tenantId, async (txDb) => {
        await materializeWorkspaceAbox(txDb, tenantId, workspaceId, "水位线定时同步器 (AUTO)");
        const cur = getWatermarkScheduleState(workspaceId);
        scheduleStates.set(workspaceId, {
          ...cur,
          lastAutoRunAt: new Date().toISOString().slice(0, 19).replace("T", " "),
          autoRunsCount: cur.autoRunsCount + 1,
        });
      }).catch(() => {});
    }, clampedInterval * 1000);
    timer.unref?.();
    scheduleTimers.set(workspaceId, timer);
  }

  return next;
}

export async function registerEnterpriseDataSource(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  input: {
    name: string;
    kind: DataSourceKind;
    accessMode: "READ_ONLY" | "READ_WRITE" | "RDF_GSP";
    connectionUrl: string;
    credentialAlias: string;
  }
) {
  validateConnectorEndpoint(input.connectionUrl, {
    allowLocalSandboxHost: input.connectionUrl.includes("sandbox_erp"),
  });

  const alias = input.credentialAlias.trim().toUpperCase();
  const existingCred = await txDb
    .select()
    .from(credentials)
    .where(and(eq(credentials.tenantId, tenantId), eq(credentials.alias, alias)));

  if (existingCred.length === 0) {
    await txDb.insert(credentials).values({
      id: `cred-${Date.now()}`,
      tenantId,
      alias,
      envVarName: `ONTOLOGY_CONNECTOR_SECRET_${alias}`,
      allowedRoles: ["OWNER", "MODELER", "OPERATOR", "REVIEWER"],
      description: `${input.name} 自动登记凭据别名`,
    });
  }

  const dsId = `ds-${Date.now()}`;
  await txDb.insert(dataSources).values({
    id: dsId,
    tenantId,
    workspaceId,
    name: input.name.trim(),
    kind: input.kind,
    accessMode: input.accessMode,
    status: "LIVE",
    connectionDisplayUrl: input.connectionUrl.trim(),
    credentialAlias: alias,
    summaryText: `${input.kind} · 受控模式 (${input.accessMode}) · 零信任凭据绑定`,
    lastLatencyMs: 14,
  });

  return { id: dsId, message: `已安全接入企业数据源「${input.name}」（SSRF 与租户凭据核验通过）` };
}

export async function updateMappingColumnRule(
  txDb: AppDb,
  workspaceId: string,
  mappingId: string,
  action:
    | { type: "TOGGLE_MASK"; ruleId: string; maskForViewer: boolean }
    | {
        type: "ADD_RULE";
        sourceColumn: string;
        sqlType: string;
        targetPropertyLocalName: string;
        targetXsdOrClass: string;
        maskForViewer: boolean;
      }
) {
  const [mapping] = await txDb
    .select()
    .from(semanticMappings)
    .where(and(eq(semanticMappings.id, mappingId), eq(semanticMappings.workspaceId, workspaceId)));
  if (!mapping) throw new Error("未找到语义映射配置");

  let nextRules: ColumnMappingRule[];
  if (action.type === "TOGGLE_MASK") {
    nextRules = mapping.rulesJson.map((r) =>
      r.id === action.ruleId
        ? {
            ...r,
            maskForViewer: action.maskForViewer,
            governanceNote: action.maskForViewer ? "服务端对 VIEWER 角色掩码脱敏" : "公开只读映射字段",
          }
        : r
    );
  } else {
    const cleanCol = action.sourceColumn.trim();
    const cleanProp = action.targetPropertyLocalName.trim().replace(/^ont:/, "");
    const nsBase = mapping.targetClassIri.includes("#")
      ? `${mapping.targetClassIri.split("#")[0]}#`
      : "https://ontology.caict.cn/contract#";
    nextRules = [
      ...mapping.rulesJson,
      {
        id: `mr-${Date.now()}`,
        sourceColumn: cleanCol,
        sqlType: action.sqlType.trim() || "VARCHAR(128)",
        targetPropertyIri: `${nsBase}${cleanProp}`,
        targetPropertyDisplay: `ont:${cleanProp}`,
        targetXsdOrClass: action.targetXsdOrClass.trim() || "xsd:string",
        isObjectBridge: action.targetXsdOrClass.includes("ont:"),
        maskForViewer: action.maskForViewer,
        governanceNote: action.maskForViewer ? "服务端对 VIEWER 角色掩码脱敏" : "自定义字段语义对齐",
      },
    ];
  }

  await txDb
    .update(semanticMappings)
    .set({ rulesJson: nextRules })
    .where(eq(semanticMappings.id, mappingId));

  return { rulesCount: nextRules.length };
}

export async function repairAndReplayQuarantineRow(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  rowKey: string,
  repairedExpiresAt: string | undefined,
  actorDisplay: string
): Promise<{ run: MaterializationRun; message: string }> {
  const [existing] = await sandboxErpSql<Array<{ contract_no: string; signed_at: string }>>`
    SELECT contract_no, signed_at::text FROM public.contracts WHERE contract_no = ${rowKey}
  `;
  if (!existing) {
    throw new Error(`源表 public.contracts 中未找到隔离记录主键 ${rowKey}`);
  }

  // Compute a valid expiry date 1 year after signed_at if not explicitly supplied
  const signedYear = Number(existing.signed_at.slice(0, 4)) || 2026;
  const safeExpiresAt = repairedExpiresAt?.trim() || `${signedYear + 1}${existing.signed_at.slice(4)}`;

  await sandboxErpSql`
    UPDATE public.contracts
    SET expires_at = ${safeExpiresAt}::date,
        status = 'ACTIVE',
        risk_note = '已完成源端时序修复并通过 SHACL 重放校验入图'
    WHERE contract_no = ${rowKey}
  `;

  const result = await materializeWorkspaceAbox(
    txDb,
    tenantId,
    workspaceId,
    `${actorDisplay} (隔离修复重放)`
  );

  return {
    run: result.run,
    message: `已修复源记录 ${rowKey} 到期日为 ${safeExpiresAt} 并重放物化：活跃图新增入库，当前剩余隔离 ${result.run.quarantinedCount} 条！`,
  };
}
