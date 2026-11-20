import { randomUUID } from "node:crypto";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Role } from "@lingdong/contracts";
import { executeGovernedSparql } from "@lingdong/semantic-core";
import type { AppDb } from "../db/client.js";
import { auditEvents, documents, ontologyRevisions, workspaces } from "../db/schema.js";
import { executeWorkspaceSparqlUnified } from "../graph-runtime.js";
import { applyAbacToQueryRows, getAbacPolicy, type DataClassification } from "../security/abac-policy.js";
import { consumeAndCheckLlmTokens } from "./ga-license-and-quota.js";
import { getEffectiveLlmConfig } from "./llm-config-service.js";

export interface NlSparqlEvidenceAnchor {
  documentTitle: string;
  chunkIndex: number;
  excerpt: string;
  matchedTerm: string;
}

export interface NlSparqlResult {
  question: string;
  engine: "LLM_TEXT_TO_SPARQL" | "SEMANTIC_INTENT_COMPILER";
  intentSummary: string;
  generatedSparql: string;
  columns: string[];
  rows: Array<Record<string, string>>;
  durationMs: number;
  subgraphNodes: Array<{ id: string; label: string; kind: string }>;
  subgraphEdges: Array<{ source: string; target: string; label: string }>;
  evidenceAnchors: NlSparqlEvidenceAnchor[];
  abacClearance?: DataClassification;
  abacRedactedCells?: number;
}

const LlmSparqlSchema = z.object({
  sparql: z.string().min(10),
  intentSummary: z.string(),
});

function compileDeterministicSparql(question: string): { sparql: string; intentSummary: string; keyword: string } {
  const q = question.trim();
  if (/高风险|临期|到期|违约|预警|超期/.test(q)) {
    return {
      sparql: `SELECT ?subject ?title ?amount ?expiresAt WHERE {\n  ?subject a ont:Contract .\n  OPTIONAL { ?subject ont:title ?title }\n  OPTIONAL { ?subject ont:totalAmount ?amount }\n  OPTIONAL { ?subject ont:expiresAt ?expiresAt }\n} LIMIT 25`,
      intentSummary: "检索合同本体实例及其金额与到期日，定位高风险/临期合同对象",
      keyword: "合同",
    };
  }
  if (/金额|总额|预算|万元|百万/.test(q)) {
    return {
      sparql: `SELECT ?subject ?title ?amount WHERE {\n  ?subject a ont:Contract ;\n           ont:totalAmount ?amount .\n  OPTIONAL { ?subject ont:title ?title }\n} ORDER BY DESC(?amount) LIMIT 20`,
      intentSummary: "按合同金额降序统计本体图谱中的高价值合同实体",
      keyword: "金额",
    };
  }
  if (/供应商|主体|签署|相对方|关联/.test(q)) {
    return {
      sparql: `SELECT ?contract ?party ?predicate WHERE {\n  ?contract ?predicate ?party .\n  FILTER(CONTAINS(STR(?predicate), "Party") || CONTAINS(STR(?predicate), "party") || CONTAINS(STR(?predicate), "Supplier"))\n} LIMIT 25`,
      intentSummary: "多跳追踪合同实体与签署方/供应商之间的语义关系链路",
      keyword: "供应商",
    };
  }
  if (/统计|多少|数量|分布|类型/.test(q)) {
    return {
      sparql: `SELECT ?type (COUNT(?s) AS ?instanceCount) WHERE {\n  ?s a ?type .\n} GROUP BY ?type LIMIT 20`,
      intentSummary: "按本体类聚合统计当前活跃知识图谱中的实体分布规模",
      keyword: "本体",
    };
  }
  return {
    sparql: `SELECT ?subject ?predicate ?object WHERE {\n  ?subject ?predicate ?object .\n} LIMIT 25`,
    intentSummary: "执行受控语义图谱全维探索查询，返回核心三元组与实体关系",
    keyword: q.slice(0, 8) || "合同",
  };
}

function buildSubgraphFromRows(rows: Array<Record<string, string>>) {
  const nodeMap = new Map<string, { id: string; label: string; kind: string }>();
  const edges: Array<{ source: string; target: string; label: string }> = [];

  for (const row of rows.slice(0, 12)) {
    const vals = Object.entries(row).filter(([, v]) => Boolean(v));
    if (vals.length === 0) continue;
    const [k0, v0] = vals[0];
    const sId = v0.split(/[/#]/).pop() || v0;
    if (!nodeMap.has(sId)) nodeMap.set(sId, { id: sId, label: sId, kind: k0 });
    for (const [k, v] of vals.slice(1, 3)) {
      const tId = v.split(/[/#]/).pop() || v;
      if (!nodeMap.has(tId)) nodeMap.set(tId, { id: tId, label: tId.slice(0, 28), kind: k });
      if (sId !== tId) edges.push({ source: sId, target: tId, label: k });
    }
  }
  return { subgraphNodes: [...nodeMap.values()].slice(0, 14), subgraphEdges: edges.slice(0, 16) };
}

export async function executeNaturalLanguageSparql(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  question: string,
  callerRole: Role,
  actorDisplay: string
): Promise<NlSparqlResult> {
  const cleanQ = question.trim();
  if (!cleanQ) throw new Error("请输入自然语言查询问题");

  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");
  const [cur] = await txDb
    .select({
      classesJson: ontologyRevisions.classesJson,
      propertiesJson: ontologyRevisions.propertiesJson,
    })
    .from(ontologyRevisions)
    .where(and(eq(ontologyRevisions.workspaceId, workspaceId), eq(ontologyRevisions.revisionCode, ws.activeRevisionId)))
    .limit(1);
  const sensitiveProps = (cur?.propertiesJson ?? []).filter((p) => p.sensitiveMask).map((p) => p.localName);

  let generatedSparql = "";
  let intentSummary = "";
  let engine: NlSparqlResult["engine"] = "SEMANTIC_INTENT_COMPILER";
  let keyword = cleanQ.slice(0, 8);

  const cfg = getEffectiveLlmConfig(tenantId);
  if (cfg.enabled && cfg.apiKey.trim()) {
    await consumeAndCheckLlmTokens(tenantId, 600);
    try {
      const tboxSummary = (cur?.classesJson ?? [])
        .map((c) => `ont:${c.localName}(${c.labelZh})`)
        .join(", ");
      const propSummary = (cur?.propertiesJson ?? [])
        .map((p) => `ont:${p.localName}(${p.labelZh})`)
        .join(", ");
      const openai = createOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl || undefined });
      const res = await generateObject({
        model: openai(cfg.modelId || "qwen-max"),
        schema: LlmSparqlSchema,
        prompt: `你是企业 SPARQL 1.1 编译器。命名空间 ont: <${ws.namespaceIri}>。\n本体类：${tboxSummary}\n本体属性：${propSummary}\n用户问题：${cleanQ}\n请仅生成只读 SELECT 查询（带 LIMIT 25）和一句中文意图说明。`,
      });
      generatedSparql = res.object.sparql;
      intentSummary = res.object.intentSummary;
      engine = "LLM_TEXT_TO_SPARQL";
    } catch {
      const compiled = compileDeterministicSparql(cleanQ);
      generatedSparql = compiled.sparql;
      intentSummary = compiled.intentSummary;
      keyword = compiled.keyword;
    }
  } else {
    const compiled = compileDeterministicSparql(cleanQ);
    generatedSparql = compiled.sparql;
    intentSummary = compiled.intentSummary;
    keyword = compiled.keyword;
  }

  const execRes = await executeWorkspaceSparqlUnified({
    workspaceId,
    revisionId: ws.activeRevisionId,
    namespaceIri: ws.namespaceIri,
    query: generatedSparql,
    callerRole,
    sensitiveLocalNames: sensitiveProps,
    limit: 25,
  });

  const abacPolicy = await getAbacPolicy(tenantId, workspaceId);
  const abacApplied = applyAbacToQueryRows(execRes.rows, callerRole, abacPolicy);

  // Retrieve in-situ document evidence anchors matching question / keyword
  const docs = await txDb.select().from(documents).where(eq(documents.workspaceId, workspaceId));
  const evidenceAnchors: NlSparqlEvidenceAnchor[] = [];
  for (const doc of docs) {
    const chunks = doc.chunksJson ?? [];
    for (let i = 0; i < chunks.length; i++) {
      const txt = typeof chunks[i] === "string" ? String(chunks[i]) : JSON.stringify(chunks[i]);
      if (txt.includes(keyword) || evidenceAnchors.length < 2) {
        evidenceAnchors.push({
          documentTitle: doc.title,
          chunkIndex: i + 1,
          excerpt: txt.slice(0, 180),
          matchedTerm: keyword,
        });
        if (evidenceAnchors.length >= 3) break;
      }
    }
    if (evidenceAnchors.length >= 3) break;
  }

  const { subgraphNodes, subgraphEdges } = buildSubgraphFromRows(abacApplied.rows);

  await txDb.insert(auditEvents).values({
    id: `aud-nlq-${Date.now()}-${randomUUID().slice(0, 8)}`,
    tenantId,
    workspaceId,
    category: "CONTROLLED_ACTION",
    categoryLabel: "NL-SPARQL 问图",
    actorDisplay,
    summary: `自然语言问图「${cleanQ.slice(0, 32)}」→ 命中 ${abacApplied.rows.length} 条记录 (${engine}, ABAC:${abacApplied.callerClearance})`,
    occurredAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  });

  return {
    question: cleanQ,
    engine,
    intentSummary,
    generatedSparql,
    columns: execRes.columns,
    rows: abacApplied.rows,
    durationMs: execRes.elapsedMs,
    subgraphNodes,
    subgraphEdges,
    evidenceAnchors,
    abacClearance: abacApplied.callerClearance,
    abacRedactedCells: abacApplied.redactedCellCount,
  };
}
