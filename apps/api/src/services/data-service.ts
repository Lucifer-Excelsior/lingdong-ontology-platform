import { and, eq } from "drizzle-orm";
import type {
  MaterializationRun,
  QuarantineRecord,
  Role,
  SparqlQueryResult,
} from "@lingdong/contracts";
import {
  activeAboxGraphUri,
  evaluateRowAgainstClassShacl,
  executeGovernedSparql,
  RDF_NS,
  type TripleInput,
} from "@lingdong/semantic-core";
import { sandboxErpSql, type AppDb } from "../db/client.js";
import {
  auditEvents,
  materializationRuns,
  ontologyRevisions,
  semanticMappings,
  workspaces,
} from "../db/schema.js";
import { executeWorkspaceSparqlUnified, graphStore, syncRevisionToGraphStore } from "../graph-runtime.js";

export {
  captureSchemaSnapshot,
  getDataWorkspace,
  testDataSourceConnection,
} from "./data-source-service.js";

export async function materializeWorkspaceAbox(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  actorDisplay: string
): Promise<{ run: MaterializationRun; message: string }> {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");

  const [rev] = await txDb
    .select()
    .from(ontologyRevisions)
    .where(
      and(
        eq(ontologyRevisions.workspaceId, workspaceId),
        eq(ontologyRevisions.revisionCode, ws.activeRevisionId)
      )
    );
  if (!rev) throw new Error("未找到当前活跃本体修订");

  syncRevisionToGraphStore(workspaceId, rev.revisionCode, ws.namespaceIri, rev.classesJson, rev.propertiesJson);

  const contractClass = rev.classesJson.find((c) => c.localName === "Contract");
  const contractsRows = await sandboxErpSql<
    Array<{
      contract_no: string;
      title: string;
      customer_id: string;
      owner_id: string;
      signed_at: string;
      expires_at: string;
      total_amount: string;
      status: string;
    }>
  >`SELECT contract_no, title, customer_id, owner_id, signed_at::text, expires_at::text, total_amount::text, status FROM public.contracts ORDER BY contract_no`;

  const customersRows = await sandboxErpSql<Array<{ customer_id: string; customer_name: string }>>`
    SELECT customer_id, customer_name FROM public.customers
  `;

  const triples: TripleInput[] = [];
  const quarantineRecords: QuarantineRecord[] = [];
  const ns = ws.namespaceIri;
  let validContracts = 0;

  for (const cust of customersRows) {
    const custIri = `https://ontology.caict.cn/crm/customer/${cust.customer_id}`;
    triples.push(
      { subject: custIri, predicate: `${RDF_NS.rdf}type`, object: `${ns}Customer` },
      { subject: custIri, predicate: `${RDF_NS.rdfs}label`, object: cust.customer_name, isLiteral: true, language: "zh" },
      { subject: custIri, predicate: `${ns}customerName`, object: cust.customer_name, isLiteral: true }
    );
  }

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
    validContracts += 1;
    const subj = `https://ontology.caict.cn/contract/instance/${row.contract_no}`;
    const custIri = `https://ontology.caict.cn/crm/customer/${row.customer_id}`;
    triples.push(
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

  graphStore.writeTriplesToGraph(triples, activeAboxGraphUri(workspaceId), true);
  const instanceCount = validContracts + customersRows.length;
  const batchCode = `#batch-${Math.floor(205 + (Date.now() % 90))}`;
  const nowStr = `${new Date().toISOString().slice(0, 10)} ${new Date().toISOString().slice(11, 16)}`;

  const run: MaterializationRun = {
    id: `mat-${Date.now()}`,
    workspaceId,
    batchCode,
    executedAt: nowStr,
    syncMode: "WATERMARK_INCREMENTAL",
    boundRevisionId: rev.revisionCode,
    writtenInstances: instanceCount,
    writtenTriples: triples.length,
    quarantinedCount: quarantineRecords.length,
    quarantineSummary:
      quarantineRecords.length > 0
        ? `${quarantineRecords.length} 条隔离 (到期日早于签署日)`
        : "0 隔离",
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

  await txDb
    .update(workspaces)
    .set({ aboxInstanceCount: Math.max(ws.aboxInstanceCount, instanceCount) })
    .where(eq(workspaces.id, workspaceId));

  await txDb.insert(auditEvents).values({
    id: `aud-mat-${Date.now()}`,
    tenantId,
    workspaceId,
    category: "DATA_MATERIALIZATION",
    categoryLabel: "ABox 增量物化",
    actorDisplay,
    summary: `执行物化批次 ${batchCode}：原子写入 ${instanceCount} 个实体 (${triples.length} 条三元组)，SHACL 隔离 ${quarantineRecords.length} 条脏记录`,
    occurredAt: run.executedAt,
  });

  return {
    run,
    message: `批次 ${batchCode} 执行成功：写入 ${triples.length} 条三元组至 Oxigraph 活跃图，SHACL 自动拦截 ${quarantineRecords.length} 条异常记录`,
  };
}

export async function runWorkspaceSparql(
  txDb: AppDb,
  workspaceId: string,
  callerRole: Role,
  query: string,
  limit = 50
): Promise<SparqlQueryResult> {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");

  const [rev] = await txDb
    .select()
    .from(ontologyRevisions)
    .where(
      and(
        eq(ontologyRevisions.workspaceId, workspaceId),
        eq(ontologyRevisions.revisionCode, ws.activeRevisionId)
      )
    );
  if (rev) {
    syncRevisionToGraphStore(workspaceId, rev.revisionCode, ws.namespaceIri, rev.classesJson, rev.propertiesJson);
  }

  const mapRows = await txDb.select().from(semanticMappings).where(eq(semanticMappings.workspaceId, workspaceId));
  const sensitiveSet = new Set<string>();
  for (const p of rev?.propertiesJson ?? []) {
    if (p.sensitiveMask) sensitiveSet.add(p.localName);
  }
  for (const m of mapRows) {
    for (const rule of m.rulesJson ?? []) {
      const local = rule.targetPropertyIri.slice(
        Math.max(rule.targetPropertyIri.lastIndexOf("#"), rule.targetPropertyIri.lastIndexOf("/")) + 1
      );
      if (rule.maskForViewer) sensitiveSet.add(local);
      else sensitiveSet.delete(local);
    }
  }

  return executeWorkspaceSparqlUnified({
    workspaceId,
    revisionId: ws.activeRevisionId,
    namespaceIri: ws.namespaceIri,
    query,
    callerRole,
    sensitiveLocalNames: Array.from(sensitiveSet),
    limit,
  });
}
