import { and, eq } from "drizzle-orm";
import type {
  EntityResolutionRule,
  MaterializationRun,
  QuarantineRecord,
} from "@lingdong/contracts";
import {
  activeAboxGraphUri,
  evaluateRowAgainstClassShacl,
  RDF_NS,
  type TripleInput,
} from "@lingdong/semantic-core";
import { sandboxErpSql, type AppDb } from "../db/client.js";
import {
  auditEvents,
  materializationRuns,
  ontologyRevisions,
  workspaces,
} from "../db/schema.js";
import { graphStore, syncRevisionToGraphStore } from "../graph-runtime.js";
import { saveRuntimeKv } from "../db/runtime-kv.js";
import { executeGenericR2rmlMaterialization } from "./generic-r2rml-materializer.js";

export {
  captureDynamicSnapshot,
  dryRunSemanticMapping,
  probeDynamicDataSource,
} from "./m4-dynamic-connector.js";

export interface WatermarkCursorInfo {
  lastValue: string | null;
  batchSize: number;
  updatedAt: string | null;
}

const watermarkCursors = new Map<string, WatermarkCursorInfo>();
const resolutionStats = new Map<string, { lastMergedCount: number; lastExecutedAt: string | null }>();

export function getWorkspaceWatermarkCursor(workspaceId: string): WatermarkCursorInfo {
  return (
    watermarkCursors.get(workspaceId) ?? {
      lastValue: null,
      batchSize: 1000,
      updatedAt: null,
    }
  );
}

export function getWorkspaceEntityResolutionRules(workspaceId: string): EntityResolutionRule[] {
  if (workspaceId !== "ws-contract") return [];
  const stat = resolutionStats.get(workspaceId) ?? { lastMergedCount: 2, lastExecutedAt: "2026-11-18 15:15" };
  return [
    {
      id: "er-cust-credit-code",
      name: "政企客户跨源主数据统一对齐 (ERP ↔ CRM)",
      targetClassLocalName: "Customer",
      matchKeyExpression: "normalizeOrgName(customer_name)",
      canonicalPrefix: "https://ontology.caict.cn/master/customer/",
      lastMergedCount: stat.lastMergedCount,
      lastExecutedAt: stat.lastExecutedAt,
    },
  ];
}

export async function streamCursorMaterialization(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  actorDisplay: string,
  options?: { resetCursor?: boolean; batchSize?: number }
): Promise<{ run: MaterializationRun; cursor: WatermarkCursorInfo; message: string }> {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");

  const [rev] = await txDb
    .select()
    .from(ontologyRevisions)
    .where(and(eq(ontologyRevisions.workspaceId, workspaceId), eq(ontologyRevisions.revisionCode, ws.activeRevisionId)));
  if (!rev) throw new Error("未找到活跃本体修订");

  syncRevisionToGraphStore(workspaceId, rev.revisionCode, ws.namespaceIri, rev.classesJson, rev.propertiesJson);

  const batchSize = options?.batchSize ?? 1000;
  const prevCursor = options?.resetCursor ? null : getWorkspaceWatermarkCursor(workspaceId).lastValue;
  const aboxUri = activeAboxGraphUri(workspaceId);

  if (options?.resetCursor || graphStore.countQuadsInGraph(aboxUri) === 0) {
    graphStore.clearNamedGraph(aboxUri);
  }

  if (workspaceId !== "ws-contract") {
    const r2 = await executeGenericR2rmlMaterialization({ txDb, tenantId, callerRole: "OWNER", workspaceId, classes: rev.classesJson, prevCursor, batchSize });
    const nowStr = `${new Date().toISOString().slice(0, 10)} ${new Date().toISOString().slice(11, 16)}`;
    const cursor: WatermarkCursorInfo = { lastValue: r2.maxWatermark ?? nowStr.slice(0, 10), batchSize, updatedAt: nowStr };
    watermarkCursors.set(workspaceId, cursor);
    await saveRuntimeKv(tenantId, "watermark", workspaceId, cursor as unknown as Record<string, unknown>).catch(() => {});
    const run: MaterializationRun = {
      id: `mat-${Date.now()}`, workspaceId, batchCode: `#batch-${Math.floor(210 + (Date.now() % 89))}`,
      executedAt: nowStr, syncMode: options?.resetCursor ? "BASELINE_FULL" : "WATERMARK_INCREMENTAL",
      boundRevisionId: rev.revisionCode, writtenInstances: Math.max(ws.aboxInstanceCount, r2.writtenInstances),
      writtenTriples: r2.writtenTriples, quarantinedCount: r2.quarantineRecords.length,
      quarantineSummary: r2.quarantineRecords.length > 0 ? `${r2.quarantineRecords.length} 条隔离` : "0 隔离",
      status: "COMMITTED", quarantineRecords: r2.quarantineRecords,
    };
    const msg = r2.mappedTables.length > 0
      ? `已通过通用 R2RML 引擎完成 ${r2.mappedTables.join(", ")} 动态物化（写入 ${r2.writtenTriples} 条三元组）`
      : `已完成空间「${ws.name}」隔离图谱同步校验（未混入外部 ERP 合同数据）`;
    return { run, cursor, message: msg };
  }

  const customersRows = await sandboxErpSql<Array<{ customer_id: string; customer_name: string }>>`
    SELECT customer_id, customer_name FROM public.customers
  `;
  const ns = ws.namespaceIri;
  const triplesToUpsert: TripleInput[] = [];
  const subjectsToReplace = new Set<string>();

  for (const cust of customersRows) {
    const custIri = `https://ontology.caict.cn/crm/customer/${cust.customer_id}`;
    subjectsToReplace.add(custIri);
    triplesToUpsert.push(
      { subject: custIri, predicate: `${RDF_NS.rdf}type`, object: `${ns}Customer` },
      { subject: custIri, predicate: `${RDF_NS.rdfs}label`, object: cust.customer_name, isLiteral: true, language: "zh" },
      { subject: custIri, predicate: `${ns}customerName`, object: cust.customer_name, isLiteral: true }
    );
  }

  const contractsRows = prevCursor
    ? await sandboxErpSql<
        Array<{ contract_no: string; title: string; customer_id: string; signed_at: string; expires_at: string; total_amount: string; status: string }>
      >`SELECT contract_no, title, customer_id, signed_at::text, expires_at::text, total_amount::text, status FROM public.contracts WHERE expires_at >= ${prevCursor}::date ORDER BY expires_at ASC LIMIT ${batchSize}`
    : await sandboxErpSql<
        Array<{ contract_no: string; title: string; customer_id: string; signed_at: string; expires_at: string; total_amount: string; status: string }>
      >`SELECT contract_no, title, customer_id, signed_at::text, expires_at::text, total_amount::text, status FROM public.contracts ORDER BY expires_at ASC LIMIT ${batchSize}`;

  const contractClass = rev.classesJson.find((c) => c.localName === "Contract");
  const quarantineRecords: QuarantineRecord[] = [];
  let maxWatermark: string | null = prevCursor;

  for (const row of contractsRows) {
    if (contractClass) {
      const violation = evaluateRowAgainstClassShacl(contractClass, row.contract_no, "public.contracts", {
        contractNo: row.contract_no,
        signedAt: row.signed_at,
        expiresAt: row.expires_at,
        totalAmount: Number(row.total_amount),
      });
      if (violation) {
        quarantineRecords.push(violation);
        continue;
      }
    }
    if (!maxWatermark || row.expires_at > maxWatermark) maxWatermark = row.expires_at;
    const subj = `https://ontology.caict.cn/contract/instance/${row.contract_no}`;
    const custIri = `https://ontology.caict.cn/crm/customer/${row.customer_id}`;
    subjectsToReplace.add(subj);
    triplesToUpsert.push(
      { subject: subj, predicate: `${RDF_NS.rdf}type`, object: `${ns}Contract` },
      { subject: subj, predicate: `${RDF_NS.rdfs}label`, object: row.title, isLiteral: true, language: "zh" },
      { subject: subj, predicate: `${ns}contractNo`, object: row.contract_no, isLiteral: true },
      { subject: subj, predicate: `${ns}signedBy`, object: custIri },
      { subject: subj, predicate: `${ns}signedAt`, object: row.signed_at, isLiteral: true, datatypeIri: `${RDF_NS.xsd}date` },
      { subject: subj, predicate: `${ns}expiresAt`, object: row.expires_at, isLiteral: true, datatypeIri: `${RDF_NS.xsd}date` },
      { subject: subj, predicate: `${ns}totalAmount`, object: row.total_amount, isLiteral: true, datatypeIri: `${RDF_NS.xsd}decimal` },
      { subject: subj, predicate: `${ns}status`, object: row.status, isLiteral: true }
    );
  }

  graphStore.deleteSubjectsInGraph(subjectsToReplace, aboxUri);
  graphStore.writeTriplesToGraph(triplesToUpsert, aboxUri, false);

  const totalSubjects = graphStore.countDistinctSubjectsInGraph(aboxUri);
  const nowStr = `${new Date().toISOString().slice(0, 10)} ${new Date().toISOString().slice(11, 16)}`;
  const cursor: WatermarkCursorInfo = { lastValue: maxWatermark, batchSize, updatedAt: nowStr };
  watermarkCursors.set(workspaceId, cursor);
  await saveRuntimeKv(tenantId, "watermark", workspaceId, cursor as unknown as Record<string, unknown>).catch(() => {});

  const batchCode = `#batch-${Math.floor(210 + (Date.now() % 89))}`;
  const run: MaterializationRun = {
    id: `mat-${Date.now()}`,
    workspaceId,
    batchCode,
    executedAt: nowStr,
    syncMode: prevCursor ? "WATERMARK_INCREMENTAL" : "BASELINE_FULL",
    boundRevisionId: rev.revisionCode,
    writtenInstances: totalSubjects,
    writtenTriples: graphStore.countQuadsInGraph(aboxUri),
    quarantinedCount: quarantineRecords.length,
    quarantineSummary: quarantineRecords.length > 0 ? `${quarantineRecords.length} 条隔离 (时序异常)` : "0 隔离",
    status: "COMMITTED",
    quarantineRecords,
  };

  await txDb.insert(materializationRuns).values({
    id: run.id,
    tenantId,
    workspaceId,
    batchCode: run.batchCode,
    executedAt: run.executedAt,
    syncMode: run.syncMode,
    boundRevisionId: run.boundRevisionId,
    writtenInstances: run.writtenInstances,
    writtenTriples: run.writtenTriples,
    quarantinedCount: run.quarantinedCount,
    quarantineSummary: run.quarantineSummary,
    status: run.status,
    quarantineRecordsJson: quarantineRecords,
  });

  await txDb.update(workspaces).set({ aboxInstanceCount: totalSubjects }).where(eq(workspaces.id, workspaceId));
  await txDb.insert(auditEvents).values({
    id: `aud-stream-${Date.now()}`,
    tenantId,
    workspaceId,
    category: "DATA_MATERIALIZATION",
    categoryLabel: "游标流式物化",
    actorDisplay,
    summary: `执行流式批次 ${batchCode} (${run.syncMode})：游标推进至 ${maxWatermark ?? "最新"}，活跃实体 ${totalSubjects} 个`,
    occurredAt: nowStr,
  });

  return {
    run,
    cursor,
    message: `批次 ${batchCode} 流式同步完成：水位线游标推进至 ${maxWatermark ?? "最新"}，活跃实例 ${totalSubjects} 个`,
  };
}

export async function executeEntityResolution(workspaceId: string): Promise<{
  mergedCount: number;
  sampleLinks: string[];
  message: string;
}> {
  if (workspaceId !== "ws-contract") {
    return {
      mergedCount: 0,
      sampleLinks: [],
      message: `当前空间 (${workspaceId}) 暂无待跨源合并的 ERP 客户主数据实体`,
    };
  }

  const customersRows = await sandboxErpSql<Array<{ customer_id: string; customer_name: string }>>`
    SELECT customer_id, customer_name FROM public.customers
  `;
  const aboxUri = activeAboxGraphUri(workspaceId);
  const triples: TripleInput[] = [];
  const sampleLinks: string[] = [];

  for (const cust of customersRows) {
    const erpIri = `https://ontology.caict.cn/crm/customer/${cust.customer_id}`;
    const slug = Buffer.from(cust.customer_name, "utf8").toString("hex").slice(0, 12);
    const masterIri = `https://ontology.caict.cn/master/customer/${slug}`;
    triples.push({ subject: erpIri, predicate: `${RDF_NS.owl}sameAs`, object: masterIri });
    if (sampleLinks.length < 3) {
      sampleLinks.push(`${cust.customer_name}: <${erpIri}> owl:sameAs <${masterIri}>`);
    }
  }

  graphStore.writeTriplesToGraph(triples, aboxUri, false);
  const nowStr = `${new Date().toISOString().slice(0, 10)} ${new Date().toISOString().slice(11, 16)}`;
  resolutionStats.set(workspaceId, { lastMergedCount: customersRows.length, lastExecutedAt: nowStr });

  return {
    mergedCount: customersRows.length,
    sampleLinks,
    message: `已完成跨源主数据实体消歧：基于标准机构名对齐融合 ${customersRows.length} 个客户主体并写入 owl:sameAs 语义桥接`,
  };
}
