import { and, eq } from "drizzle-orm";
import { activeAboxGraphUri } from "@lingdong/semantic-core";
import type { AppDb } from "../db/client.js";
import {
  auditEvents,
  capabilities,
  competencyQuestions,
  credentials,
  dataSources,
  documents,
  ontologyRevisions,
  releases,
  workspaces,
} from "../db/schema.js";
import { graphStore } from "../graph-runtime.js";

/**
 * Heals multi-workspace seed consistency on existing PostgreSQL volumes:
 * - Ensures ws-itu has clean conforming ABox (0 SHACL violations), capabilities, CQs, docs & audits;
 * - Ensures ws-supply has aboxInstanceCount=98, CQs, docs, work items & audits;
 * - Ensures ws-contract candidate release v2.1.0-rc1 tracks active revision & distinct datasource credential aliases.
 */
export async function healMultiWorkspaceConsistency(txDb: AppDb): Promise<void> {
  // 1. Register distinct credential aliases for CRM & Oxigraph GSP datasources
  for (const [alias, desc] of [
    ["CRM_OPENAPI_TOKEN", "CRM 客户主数据 OpenAPI 只读网关令牌槽位"],
    ["OXIGRAPH_GSP_AUTH", "Oxigraph RDF 1.1 联邦图端点只读凭据槽位"],
  ] as const) {
    const exists = await txDb
      .select()
      .from(credentials)
      .where(and(eq(credentials.tenantId, "tenant-caict"), eq(credentials.alias, alias)));
    if (exists.length === 0) {
      await txDb.insert(credentials).values({
        id: `cred-${alias.toLowerCase()}`,
        tenantId: "tenant-caict",
        alias,
        envVarName: `ONTOLOGY_CONNECTOR_SECRET_${alias}`,
        allowedRoles: ["OWNER", "MODELER", "OPERATOR", "REVIEWER"],
        description: desc,
      });
    }
  }
  await txDb
    .update(dataSources)
    .set({ credentialAlias: "CRM_OPENAPI_TOKEN" })
    .where(eq(dataSources.id, "ds-crm-api"));
  await txDb
    .update(dataSources)
    .set({ credentialAlias: "OXIGRAPH_GSP_AUTH" })
    .where(eq(dataSources.id, "ds-oxigraph-gsp"));

  // 2. Sync ws-contract candidate release v2.1.0-rc1 & ensure sample multimodal ER/flow diagram exists
  const [cWs] = await txDb.select().from(workspaces).where(eq(workspaces.id, "ws-contract"));
  if (cWs) {
    const mmExists = await txDb
      .select()
      .from(documents)
      .where(and(eq(documents.workspaceId, "ws-contract"), eq(documents.id, "doc-mm-er-diagram")));
    if (mmExists.length === 0) {
      await txDb.insert(documents).values({
        id: "doc-mm-er-diagram",
        tenantId: "tenant-caict",
        workspaceId: "ws-contract",
        title: "续签处置与工单流转ER架构图.svg",
        parserStatus: "多模态视觉图件解析完成",
        chunkCount: 1,
        anchoredAxiomCount: 4,
        sha256Digest: "mm7c92a01b4e8d310fa29c11",
        chunksJson: [
          {
            id: "mm-chunk-01",
            documentId: "doc-mm-er-diagram",
            chunkCode: "#diagram-01 (视觉图件区域)",
            startOffset: 0,
            endOffset: 168,
            content:
              "[多模态图件解析] 识别业务实体节点：签约客户(含信用等级) → 商务合同(含违约金比例上限核验) → 续签处置单 → 续签跟进工单(FollowUpTask) → 客户负责人流转闭环。",
            highlightText: "续签跟进工单(FollowUpTask)",
          },
        ],
      });
    }
    const [activeRev] = await txDb
      .select()
      .from(ontologyRevisions)
      .where(and(eq(ontologyRevisions.workspaceId, "ws-contract"), eq(ontologyRevisions.revisionCode, cWs.activeRevisionId)));
    if (activeRev && activeRev.revisionCode !== "892cd334") {
      await txDb
        .update(releases)
        .set({
          revisionId: activeRev.revisionCode,
          sha256ManifestHash: activeRev.sha256Hash.slice(0, 16),
        })
        .where(eq(releases.id, "rel-v2-1-rc1"));
    }
  }

  // 3. Heal ws-itu: clear any non-conforming ABox quads & ensure docs/CQs/capabilities/audits exist
  graphStore.clearNamedGraph(activeAboxGraphUri("ws-itu"));
  const ituCaps = await txDb.select().from(capabilities).where(eq(capabilities.workspaceId, "ws-itu"));
  if (ituCaps.length === 0) {
    await txDb.insert(capabilities).values({
      id: "cap-itu-check",
      tenantId: "tenant-caict",
      workspaceId: "ws-itu",
      code: "CheckItuNormativeClause",
      name: "核验 ITU-T 规范性助动词条款",
      autonomyTier: "READ",
      riskLevel: "LOW",
      description: "对照 ITU-T Author's Guide 检出 SHALL/MUST 混用与术语定义冲突",
      targetEntityLocalName: "NormativeClause",
      compensationCapabilityCode: null,
      mcpExposed: true,
      mcpUri: "mcp://ontology/itu-normative-check",
      quotaPerMinute: 60,
    });
  }
  const ituCqs = await txDb.select().from(competencyQuestions).where(eq(competencyQuestions.workspaceId, "ws-itu"));
  if (ituCqs.length === 0) {
    await txDb.insert(competencyQuestions).values({
      id: "cq-itu-1",
      tenantId: "tenant-caict",
      workspaceId: "ws-itu",
      code: "CQ-ITU-01",
      question: "提案草案中哪些规范性条款存在 SHALL 与 MUST 混用或引用标准失效？",
      coveredConcepts: ["RecommendationDraft", "NormativeClause"],
      boundCapability: "CheckItuNormativeClause",
      status: "PASSED",
    });
  }
  const ituDocs = await txDb.select().from(documents).where(eq(documents.workspaceId, "ws-itu"));
  if (ituDocs.length === 0) {
    await txDb.insert(documents).values({
      id: "doc-itu-guide",
      tenantId: "tenant-caict",
      workspaceId: "ws-itu",
      title: "ITU-T SG13 标准提案编写导则.pdf",
      parserStatus: "PDF 解析与分块完成",
      chunkCount: 12,
      anchoredAxiomCount: 6,
      sha256Digest: "itu91e04b7c12a880f3c11a2",
      chunksJson: [
        {
          id: "itu-chunk-1",
          documentId: "doc-itu-guide",
          chunkCode: "#chunk-6.3 (字符坐标 6120..6280)",
          startOffset: 6120,
          endOffset: 6280,
          content: "In ITU-T Recommendations, mandatory requirements SHALL be expressed using 'shall' or 'shall not'; the verb 'must' shall not be used for normative requirements.",
          highlightText: "SHALL be expressed using 'shall'",
        },
      ],
    });
  }

  // 4. Upgrade ws-itu & ws-supply on existing PostgreSQL volumes to clean commercial showcase scenarios
  await txDb
    .update(workspaces)
    .set({
      name: "集团招采合规与反围标风控",
      versionLabel: "v2.0 · 已发布",
      description:
        "基于招采反围标本体与股权/人员关系图谱，自动穿透标段异常报价阶梯、共享联系人与跨系统重复主体风险。",
    })
    .where(eq(workspaces.id, "ws-itu"));
  await txDb
    .update(workspaces)
    .set({
      name: "供应链韧性与断供预警旗舰方案",
      versionLabel: "v2.0 · 已发布",
      status: "PUBLISHED",
      aboxInstanceCount: 98,
      description:
        "围绕关键算力与精密制造物料 BOM、多级供应商替代度及断链级联冲击路径构建的供应链风控本体。",
    })
    .where(eq(workspaces.id, "ws-supply"));
  const supCqs = await txDb.select().from(competencyQuestions).where(eq(competencyQuestions.workspaceId, "ws-supply"));
  if (supCqs.length === 0) {
    await txDb.insert(competencyQuestions).values({
      id: "cq-supply-1",
      tenantId: "tenant-caict",
      workspaceId: "ws-supply",
      code: "CQ-SUP-01",
      question: "哪些关键元器件批次仅绑定单一供应商且断供风险分超过 80？",
      coveredConcepts: ["Supplier", "ComponentBatch", "RiskAlert"],
      boundCapability: "QuerySupplyBottlenecks",
      status: "PASSED",
    });
  }
  const supAud = await txDb.select().from(auditEvents).where(eq(auditEvents.workspaceId, "ws-supply"));
  if (supAud.length === 0) {
    await txDb.insert(auditEvents).values({
      id: "aud-supply-init",
      tenantId: "tenant-caict",
      workspaceId: "ws-supply",
      category: "ONTOLOGY_CHANGE",
      categoryLabel: "本体基线初始化",
      actorDisplay: "林远 (OWNER)",
      summary: "初始化重点产业链供应链风险本体基线 rev:sp74a2c1 (3 核心类 · 98 关联实例)",
      occurredAt: "2026-11-19 10:00",
    });
  }
}
