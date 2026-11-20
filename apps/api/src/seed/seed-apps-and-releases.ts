import type { AppDb } from "../db/client.js";
import {
  capabilities,
  dataSources,
  modelRoutes,
  schemaSnapshots,
  semanticApps,
  semanticMappings,
} from "../db/schema.js";
import { CONTRACT_CAPABILITIES, CONTRACT_MAPPINGS } from "./itu-and-supply-seed-data.js";
import { seedExecutionsReleasesAndAudits } from "./seed-executions-and-releases.js";

export async function seedDataAppsAndReleases(
  txDb: AppDb,
  contractRevCode: string,
  contractHashHex: string,
  ituRevCode: string,
  ituHashHex: string
): Promise<void> {
  await txDb.insert(dataSources).values([
    {
      id: "ds-erp-pg",
      tenantId: "tenant-caict",
      workspaceId: "ws-contract",
      name: "ERP 合同主数据库",
      kind: "POSTGRESQL",
      accessMode: "READ_WRITE",
      status: "LIVE",
      connectionDisplayUrl: "jdbc:postgresql://127.0.0.1:5433/sandbox_erp",
      credentialAlias: "ERP_CONTRACT_DB",
      summaryText: "PostgreSQL 17 · 受控读写 (READ_WRITE) · 5 张表",
      lastLatencyMs: 9,
    },
    {
      id: "ds-crm-api",
      tenantId: "tenant-caict",
      workspaceId: "ws-contract",
      name: "CRM 客户主数据 API",
      kind: "HTTP_OPENAPI",
      accessMode: "READ_ONLY",
      status: "LIVE",
      connectionDisplayUrl: "https://crm-gateway.caict.example/openapi/v3",
      credentialAlias: "ERP_CONTRACT_DB",
      summaryText: "HTTP / OpenAPI 3.1 · 只读同步 + 工单动作回调",
      lastLatencyMs: 18,
    },
    {
      id: "ds-oxigraph-gsp",
      tenantId: "tenant-caict",
      workspaceId: "ws-contract",
      name: "Oxigraph RDF 1.1 命名图联邦端点",
      kind: "RDF_SPARQL",
      accessMode: "RDF_GSP",
      status: "LIVE",
      connectionDisplayUrl: "https://sparql.caict.example/rdf-gsp",
      credentialAlias: "ERP_CONTRACT_DB",
      summaryText: "W3C RDF 1.1 Graph Store Protocol · 跨部门联合图查询",
      lastLatencyMs: 6,
    },
  ]);

  await txDb.insert(schemaSnapshots).values({
    id: "snap-init-v3",
    tenantId: "tenant-caict",
    dataSourceId: "ds-erp-pg",
    isActiveBinding: true,
    snapshotJson: {
      id: "snap-init-v3",
      dataSourceId: "ds-erp-pg",
      versionTag: "2026-11-18 15:00 · v3 快照 (5 张表 · 26 字段 · 当前绑定) [d61b5e37]",
      capturedAt: "2026-11-18 15:00",
      tableCount: 5,
      columnCount: 26,
      fingerprint: "d61b5e37",
      isActiveBinding: true,
      tables: [],
    },
  });

  await txDb.insert(semanticMappings).values(
    CONTRACT_MAPPINGS.map((m) => ({
      id: m.id,
      tenantId: "tenant-caict",
      workspaceId: m.workspaceId,
      dataSourceId: m.dataSourceId,
      sourceTable: m.sourceTable,
      targetClassIri: m.targetClassIri,
      targetClassDisplay: m.targetClassDisplay,
      subjectIriTemplate: m.subjectIriTemplate,
      watermarkColumn: m.watermarkColumn,
      rulesJson: m.rules,
    }))
  );

  await txDb.insert(modelRoutes).values([
    {
      id: "mdl-qwen",
      tenantId: "tenant-caict",
      name: "Qwen-Max 企业专线",
      provider: "OPENAI_COMPATIBLE",
      modelId: "qwen-max-2026",
      statusLabel: "生产可用",
      statusTone: "emerald",
      purpose: "用途：向导建模提案、续签简报起草 · 原生 Tool-Calling",
      latencyMs: 142,
    },
    {
      id: "mdl-deepseek",
      tenantId: "tenant-caict",
      name: "DeepSeek-V3 私有化集群",
      provider: "OPENAI_COMPATIBLE",
      modelId: "deepseek-v3-ent",
      statusLabel: "生产可用",
      statusTone: "emerald",
      purpose: "用途：受控能力编排路由与 ITU 条款核对 · 内网零外发",
      latencyMs: 118,
    },
    {
      id: "mdl-local",
      tenantId: "tenant-caict",
      name: "Oxigraph 确定性语义规划器",
      provider: "LOCAL_DETERMINISTIC",
      modelId: "lingdong-deterministic-v3",
      statusLabel: "离线常驻兜底",
      statusTone: "neutral",
      purpose: "无外部大模型 API Key 时自动启用，执行受控 SPARQL 与动作门禁",
      latencyMs: 8,
    },
  ]);

  await txDb.insert(capabilities).values(
    CONTRACT_CAPABILITIES.map((c) => ({ ...c, tenantId: "tenant-caict" }))
  );

  await txDb.insert(semanticApps).values([
    {
      id: "app-contract-v2",
      tenantId: "tenant-caict",
      workspaceId: "ws-contract",
      slug: "contract-renewal-copilot",
      name: "合同到期处置智能助手",
      activeVersion: "v2.0 · 已发布线上",
      draftVersion: "v2.1-draft · 编排中",
      boundRevisionId: contractRevCode,
      status: "PUBLISHED",
      benchmarkPassRate: 9820,
      benchmarkDelta: "较 v1 提升 +3.4%",
      outOfScopeRefusalRate: 10000,
      outOfScopeSummary: "12/12 越界问题精准拒答",
      regressionFailures: 0,
      totalBenchmarkCases: 58,
    },
    {
      id: "app-itu-v1",
      tenantId: "tenant-caict",
      workspaceId: "ws-itu",
      slug: "itu-proposal-reviewer",
      name: "ITU 标准提案合规审查助手",
      activeVersion: "v1.0 · 已发布线上",
      draftVersion: "v1.1-draft",
      boundRevisionId: ituRevCode,
      status: "PUBLISHED",
      benchmarkPassRate: 9650,
      benchmarkDelta: "SG13 历史提案集验证通过",
      outOfScopeRefusalRate: 10000,
      outOfScopeSummary: "8/8 越界问题精准拒答",
      regressionFailures: 0,
      totalBenchmarkCases: 40,
    },
  ]);

  await seedExecutionsReleasesAndAudits(txDb, contractRevCode, contractHashHex, ituRevCode, ituHashHex);
}
