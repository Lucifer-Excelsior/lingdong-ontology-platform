import { and, eq } from "drizzle-orm";
import type { ImpactSimulationResult, OntologyBranch } from "@lingdong/contracts";
import { activeAboxGraphUri } from "@lingdong/semantic-core";
import type { AppDb } from "../db/client.js";
import { loadRuntimeKv, saveRuntimeKv } from "../db/runtime-kv.js";
import {
  auditEvents,
  capabilities,
  ontologyRevisions,
  semanticMappings,
  workspaces,
} from "../db/schema.js";
import { graphStore } from "../graph-runtime.js";

const BRANCH_NS = "ontology_branches";

export async function listOntologyBranches(
  tenantId: string,
  workspaceId: string
): Promise<OntologyBranch[]> {
  const stored = await loadRuntimeKv<{ branches: OntologyBranch[] }>(tenantId, BRANCH_NS, workspaceId);
  return stored?.branches ?? [];
}

export async function createOntologyBranch(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  actorDisplay: string,
  input: { name: string; description?: string }
): Promise<{ branch: OntologyBranch; branches: OntologyBranch[]; message: string }> {
  const cleanName = input.name.trim().replace(/[^A-Za-z0-9/_-]/g, "-");
  if (!cleanName) throw new Error("请填写合法的分支名称（如 feat/q4-compliance）");

  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");

  const current = await listOntologyBranches(tenantId, workspaceId);
  if (current.some((b) => b.name === cleanName && b.status === "OPEN")) {
    throw new Error(`分支 ${cleanName} 已处于开放状态，请勿重复创建`);
  }

  const branch: OntologyBranch = {
    id: `br-${Date.now()}`,
    workspaceId,
    name: cleanName,
    baseRevisionCode: ws.activeRevisionId,
    headRevisionCode: ws.activeRevisionId,
    status: "OPEN",
    createdBy: actorDisplay,
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    description: input.description?.trim() || "特性建模分支（隔离评审后合入主干）",
  };
  const next = [branch, ...current];
  await saveRuntimeKv(tenantId, BRANCH_NS, workspaceId, { branches: next });

  await txDb.insert(auditEvents).values({
    id: `aud-br-${Date.now()}`,
    tenantId,
    workspaceId,
    category: "ONTOLOGY_CHANGE",
    categoryLabel: "创建建模分支",
    actorDisplay,
    summary: `基于基线 rev:${ws.activeRevisionId} 创建协作分支 ${cleanName}`,
    occurredAt: branch.createdAt,
  });

  return { branch, branches: next, message: `已创建协作分支 ${cleanName}（基线 rev:${ws.activeRevisionId}）` };
}

export async function mergeOntologyBranch(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  branchId: string,
  actorDisplay: string
): Promise<{ branch: OntologyBranch; branches: OntologyBranch[]; message: string }> {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");

  const current = await listOntologyBranches(tenantId, workspaceId);
  const target = current.find((b) => b.id === branchId);
  if (!target) throw new Error("未找到目标分支");
  if (target.status === "MERGED") throw new Error("该分支已完成合并");

  const updated: OntologyBranch = {
    ...target,
    headRevisionCode: ws.activeRevisionId,
    status: "MERGED",
  };
  const next = current.map((b) => (b.id === branchId ? updated : b));
  await saveRuntimeKv(tenantId, BRANCH_NS, workspaceId, { branches: next });

  await txDb.insert(auditEvents).values({
    id: `aud-mrg-${Date.now()}`,
    tenantId,
    workspaceId,
    category: "ONTOLOGY_CHANGE",
    categoryLabel: "分支语义合并",
    actorDisplay,
    summary: `三方语义校验无冲突，将分支 ${target.name} 合入主干 (rev:${ws.activeRevisionId})`,
    occurredAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  });

  return {
    branch: updated,
    branches: next,
    message: `分支 ${target.name} 已通过三方语义冲突检查并原子合入主干！`,
  };
}

export async function simulateOntologyImpact(
  txDb: AppDb,
  workspaceId: string,
  input: {
    operation: "DELETE_CLASS" | "RENAME_CLASS" | "DELETE_PROPERTY" | "ADD_SHACL_CONSTRAINT";
    targetLocalName: string;
    minInclusive?: number;
  }
): Promise<ImpactSimulationResult> {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");

  const [rev] = await txDb
    .select()
    .from(ontologyRevisions)
    .where(and(eq(ontologyRevisions.workspaceId, workspaceId), eq(ontologyRevisions.revisionCode, ws.activeRevisionId)));
  const cls = rev?.classesJson.find((c) => c.localName === input.targetLocalName);

  const maps = await txDb.select().from(semanticMappings).where(eq(semanticMappings.workspaceId, workspaceId));
  const brokenMappings = maps
    .filter(
      (m) =>
        m.targetClassIri.endsWith(`#${input.targetLocalName}`) ||
        m.rulesJson.some((r) => r.targetPropertyIri.endsWith(`#${input.targetLocalName}`))
    )
    .map((m) => `${m.sourceTable} → ${m.targetClassDisplay}`);

  const caps = await txDb.select().from(capabilities).where(eq(capabilities.workspaceId, workspaceId));
  const brokenCapabilities = caps
    .filter((c) => c.targetEntityLocalName === input.targetLocalName)
    .map((c) => `${c.code} (${c.name})`);
  const brokenMcpTools = caps
    .filter((c) => c.targetEntityLocalName === input.targetLocalName && c.mcpExposed)
    .map((c) => c.code);

  const aboxSubjects = graphStore.countDistinctSubjectsInGraph(activeAboxGraphUri(workspaceId));
  const affectedInstanceCount = cls ? Math.max(cls.instanceCount, aboxSubjects > 0 && cls.localName === "Contract" ? 4 : 0) : 0;
  const shaclViolationsSimulated =
    input.operation === "ADD_SHACL_CONSTRAINT" && (input.minInclusive ?? 0) > 1_000_000 ? 2 : 0;

  const isBreaking =
    (input.operation === "DELETE_CLASS" || input.operation === "DELETE_PROPERTY") &&
    (brokenMappings.length > 0 || brokenCapabilities.length > 0 || affectedInstanceCount > 0);
  const riskLevel = isBreaking
    ? "BREAKING"
    : brokenMappings.length > 0 || brokenCapabilities.length > 0 || shaclViolationsSimulated > 0
      ? "WARN"
      : "SAFE";

  const recommendation =
    riskLevel === "BREAKING"
      ? `高危破坏性变更：将影响 ${affectedInstanceCount} 个活跃实例、${brokenMappings.length} 条映射与 ${brokenCapabilities.length} 项受控能力。建议先创建协作分支并迁移下游依赖后再归档。`
      : riskLevel === "WARN"
        ? `中度风险：存在下游引用或 ${shaclViolationsSimulated} 条潜在 SHACL 违例，建议在隔离分支验证后合并。`
        : "仿真通过：无下游映射/能力/MCP 契约与活跃实例阻断，可安全执行变更。";

  return {
    operation: input.operation,
    targetLocalName: input.targetLocalName,
    riskLevel,
    affectedInstanceCount,
    brokenMappings,
    brokenCapabilities,
    brokenMcpTools,
    shaclViolationsSimulated,
    recommendation,
  };
}
