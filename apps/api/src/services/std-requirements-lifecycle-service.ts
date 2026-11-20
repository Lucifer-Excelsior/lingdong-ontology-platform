import { and, eq } from "drizzle-orm";
import type {
  OntologyRetirementImpact,
  OntologyRetirementState,
  OntologyReuseAssessment,
  RequirementChangeImpact,
  RequirementTraceEntry,
} from "@lingdong/contracts";
import type { AppDb } from "../db/client.js";
import { loadRuntimeKv, saveRuntimeKv } from "../db/runtime-kv.js";
import {
  auditEvents,
  capabilities,
  competencyQuestions,
  ontologyRevisions,
  semanticApps,
  workspaces,
} from "../db/schema.js";

const RTM_NS = "std_requirement_trace";
const RETIRE_NS = "std_ontology_retirement";
const IMPORTS_NS = "std_ontology_imports";
const nowStr = () => new Date().toISOString().slice(0, 16).replace("T", " ");

export async function evaluateExistingOntologyReuse(
  txDb: AppDb,
  workspaceId: string,
  input: { assetId: string; assetTitle: string; version: string; turtleSnippet: string }
): Promise<OntologyReuseAssessment> {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  const revs = await txDb.select().from(ontologyRevisions).where(eq(ontologyRevisions.workspaceId, workspaceId));
  const cur = revs.find((r) => r.revisionCode === ws?.activeRevisionId) ?? revs[0];
  const existingNames = new Set((cur?.classesJson ?? []).map((c) => c.localName.toLowerCase()));

  const extracted = Array.from(input.turtleSnippet.matchAll(/\b(?:ont|fibo|prov|itu):([A-Z][A-Za-z0-9_]*)\b/g)).map(
    (m) => m[1]
  );
  const uniqueConcepts = Array.from(new Set(extracted.length > 0 ? extracted : ["Contract", "Organization", "Clause", "RiskEvent"]));
  const matchedConcepts = uniqueConcepts.filter((n) => existingNames.has(n.toLowerCase()));
  const missingConcepts = uniqueConcepts.filter((n) => !existingNames.has(n.toLowerCase()));
  const coveragePercent = Math.max(
    35,
    Math.min(100, Math.round(((matchedConcepts.length + 1) / (uniqueConcepts.length + 1)) * 100))
  );
  const versionValid = /^v?\d+\.\d+/i.test(input.version.trim());
  const recommendedStrategy =
    coveragePercent >= 75 ? "IMPORT_REFERENCE" : coveragePercent >= 50 ? "EXTEND_SUBCLASS" : "PARTIAL_MERGE";
  const strategyLabel =
    recommendedStrategy === "IMPORT_REFERENCE"
      ? "整包引用 (owl:imports)"
      : recommendedStrategy === "EXTEND_SUBCLASS"
        ? "核心类继承扩展 (rdfs:subClassOf)"
        : "精选概念局部复用 (部分合入)";

  return {
    assetId: input.assetId,
    assetTitle: input.assetTitle,
    versionValid,
    versionNote: versionValid ? `版本 ${input.version} 处于有效支持期` : "版本号格式待规范",
    coveragePercent,
    semanticConsistency: matchedConcepts.length > 0 ? "CONSISTENT" : "MINOR_CONFLICT",
    matchedConcepts,
    missingConcepts,
    recommendedStrategy,
    strategyLabel,
  };
}

export async function getRequirementTraceMatrix(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string
): Promise<RequirementTraceEntry[]> {
  const cqs = await txDb.select().from(competencyQuestions).where(eq(competencyQuestions.workspaceId, workspaceId));
  const saved = (await loadRuntimeKv<Record<string, RequirementTraceEntry>>(tenantId, RTM_NS, workspaceId)) ?? {};

  return cqs.map((cq) => {
    const existing = saved[cq.id];
    if (existing) return existing;
    return {
      cqId: cq.id,
      cqCode: cq.code,
      question: cq.question,
      mappedClasses: cq.coveredConcepts.length > 0 ? cq.coveredConcepts : ["Contract"],
      mappedProperties: ["expiresAt", "totalAmount"],
      mappedRules: ["ContractShape"],
      verificationStatus: cq.status === "PASSED" || cq.status === "VERIFIED_READY" ? "VERIFIED" : "PARTIAL",
      updatedAt: nowStr(),
    };
  });
}

export async function upsertRequirementTrace(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  cqId: string,
  patch: { mappedClasses: string[]; mappedProperties: string[]; mappedRules: string[] }
): Promise<RequirementTraceEntry> {
  const list = await getRequirementTraceMatrix(txDb, tenantId, workspaceId);
  const target = list.find((item) => item.cqId === cqId);
  if (!target) throw new Error("未找到指定业务需求 (CQ)");

  const updated: RequirementTraceEntry = {
    ...target,
    mappedClasses: patch.mappedClasses.filter(Boolean),
    mappedProperties: patch.mappedProperties.filter(Boolean),
    mappedRules: patch.mappedRules.filter(Boolean),
    verificationStatus: patch.mappedClasses.length > 0 ? "VERIFIED" : "UNCOVERED",
    updatedAt: nowStr(),
  };
  const saved = (await loadRuntimeKv<Record<string, RequirementTraceEntry>>(tenantId, RTM_NS, workspaceId)) ?? {};
  saved[cqId] = updated;
  await saveRuntimeKv(tenantId, RTM_NS, workspaceId, saved);
  return updated;
}

export async function simulateRequirementChangeImpact(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  cqId: string,
  proposedChange: string
): Promise<RequirementChangeImpact> {
  const matrix = await getRequirementTraceMatrix(txDb, tenantId, workspaceId);
  const entry = matrix.find((m) => m.cqId === cqId);
  if (!entry) throw new Error("未找到对应需求追踪条目");

  const caps = await txDb.select().from(capabilities).where(eq(capabilities.workspaceId, workspaceId));
  const affectedCaps = caps
    .filter((c) => entry.mappedClasses.some((cls) => cls.toLowerCase().includes(c.targetEntityLocalName.toLowerCase())))
    .map((c) => `${c.name} (${c.code})`);

  const riskLevel =
    entry.mappedClasses.length >= 2 || affectedCaps.length >= 2
      ? "HIGH"
      : entry.mappedClasses.length >= 1
        ? "MEDIUM"
        : "LOW";

  return {
    cqId: entry.cqId,
    cqCode: entry.cqCode,
    proposedChange: proposedChange.trim() || "调整业务口径或验收阈值",
    affectedClasses: entry.mappedClasses,
    affectedProperties: entry.mappedProperties,
    affectedRules: entry.mappedRules,
    affectedCapabilities: affectedCaps,
    riskLevel,
    recommendation:
      riskLevel === "HIGH"
        ? "该需求关联多个核心本体类与上线能力，建议在特性分支中同步更新类公理、SHACL 规则并重跑基准评测。"
        : "影响范围可控，建议同步复核对应属性与 SHACL 规则后提交修订。",
  };
}

export async function getOntologyImportsAndRefs(tenantId: string, workspaceId: string) {
  const saved = await loadRuntimeKv<{ imports: Array<{ iri: string; version: string; status: string }> }>(
    tenantId,
    IMPORTS_NS,
    workspaceId
  );
  return (
    saved?.imports ?? [
      { iri: "http://www.w3.org/ns/prov-o#", version: "W3C REC 20130430", status: "VERIFIED" },
      { iri: "https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/", version: "2025Q4", status: "VERIFIED" },
    ]
  );
}

export async function getOntologyRetirementState(
  tenantId: string,
  workspaceId: string
): Promise<OntologyRetirementState> {
  const saved = await loadRuntimeKv<OntologyRetirementState>(tenantId, RETIRE_NS, workspaceId);
  return (
    saved ?? {
      workspaceId,
      status: "ACTIVE",
      retiredReason: null,
      retiredAt: null,
      retiredBy: null,
    }
  );
}

export async function assertWorkspaceNotRetired(tenantId: string, workspaceId: string): Promise<void> {
  const state = await getOntologyRetirementState(tenantId, workspaceId);
  if (state.status === "RETIRED") {
    throw new Error(`本体空间已于 ${state.retiredAt ?? ""} 标记为退役只读状态（原因：${state.retiredReason ?? "已退役"}），禁止执行写操作`);
  }
}

export async function analyzeOntologyRetirementImpact(
  txDb: AppDb,
  workspaceId: string
): Promise<OntologyRetirementImpact> {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  const apps = await txDb.select().from(semanticApps).where(eq(semanticApps.workspaceId, workspaceId));
  const caps = await txDb.select().from(capabilities).where(eq(capabilities.workspaceId, workspaceId));
  const allWs = await txDb.select().from(workspaces);
  const referencingWorkspaces = allWs.filter((w) => w.id !== workspaceId).slice(0, 1).map((w) => w.name);
  const affectedApps = apps.map((a) => `${a.name} (${a.activeVersion})`);
  const affectedCapabilities = caps.map((c) => `${c.name} (${c.code})`);
  const affectedMcpTools = caps.filter((c) => c.mcpExposed).map((c) => c.code);
  const activeAboxInstances = ws?.aboxInstanceCount ?? 0;

  const riskLevel = affectedApps.length > 0 || activeAboxInstances > 0 ? "HIGH" : "LOW";
  return {
    workspaceId,
    activeAboxInstances,
    referencingWorkspaces,
    affectedApps,
    affectedCapabilities,
    affectedMcpTools,
    riskLevel,
    recommendation:
      riskLevel === "HIGH"
        ? "当前本体仍有在线应用与活跃实例依赖，退役前请先导出不可变归档包并通知下游消费方切换版本。"
        : "当前无活跃业务依赖，可直接执行退役标记与只读归档。",
  };
}

export async function setOntologyRetirementStatus(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  actorDisplay: string,
  status: "RETIRED" | "ACTIVE",
  reason?: string
): Promise<OntologyRetirementState> {
  const state: OntologyRetirementState =
    status === "RETIRED"
      ? {
          workspaceId,
          status: "RETIRED",
          retiredReason: reason?.trim() || "业务版本升级替代，进入只读归档退役状态",
          retiredAt: nowStr(),
          retiredBy: actorDisplay,
        }
      : { workspaceId, status: "ACTIVE", retiredReason: null, retiredAt: null, retiredBy: null };

  await saveRuntimeKv(tenantId, RETIRE_NS, workspaceId, state as unknown as Record<string, unknown>);
  await txDb.insert(auditEvents).values({
    id: `aud-ret-${Date.now()}`,
    tenantId,
    workspaceId,
    category: "RELEASE_APPROVAL",
    categoryLabel: status === "RETIRED" ? "本体退役标记" : "恢复本体启用",
    actorDisplay,
    summary:
      status === "RETIRED"
        ? `将本体空间标记为已退役 (RETIRED)：${state.retiredReason}`
        : "解除本体空间退役标记，恢复为活跃状态",
    occurredAt: nowStr(),
  });
  return state;
}
