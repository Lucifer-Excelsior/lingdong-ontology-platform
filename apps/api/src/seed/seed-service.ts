import { eq } from "drizzle-orm";
import { activeAboxGraphUri, RDF_NS, shaclGraphUri, tboxGraphUri } from "@lingdong/semantic-core";
import { adminDb, ensureDatabaseSchemaAndRls, withTenantDb } from "../db/client.js";
import {
  changesets,
  competencyQuestions,
  credentials,
  documents,
  ontologyRevisions,
  tenants,
  users,
  workspaceMembers,
  workspaces,
} from "../db/schema.js";
import { graphStore, syncRevisionToGraphStore } from "../graph-runtime.js";
import { CONTRACT_CLASSES, CONTRACT_NS, CONTRACT_PROPERTIES, CONTRACT_PROPOSALS } from "./contract-seed-data.js";
import { CONTRACT_CQS, CONTRACT_DOCUMENTS, CONTRACT_WORK_ITEMS, ITU_CLASSES, ITU_NS, ITU_PROPERTIES } from "./itu-and-supply-seed-data.js";
import { seedSandboxErpDatabase } from "./erp-sandbox-seed.js";
import { seedDataAppsAndReleases } from "./seed-apps-and-releases.js";
import { ensureSupplyAndDedupHealed } from "./supply-workspace-heal.js";
import { materializeWorkspaceAbox } from "../services/data-service.js";

export async function ensureSeeded(): Promise<void> {
  await ensureDatabaseSchemaAndRls();
  await seedSandboxErpDatabase();

  await adminDb
    .insert(tenants)
    .values([
      { id: "tenant-caict", name: "信通院政企智能语义空间" },
      { id: "tenant-other", name: "外部隔离租户验证空间" },
    ])
    .onConflictDoNothing();

  const existing = await withTenantDb("tenant-caict", (txDb) =>
    txDb.select().from(workspaces).where(eq(workspaces.id, "ws-contract"))
  );
  if (existing.length > 0) {
    await withTenantDb("tenant-caict", async (txDb) => {
      const [rev] = await txDb
        .select()
        .from(ontologyRevisions)
        .where(eq(ontologyRevisions.workspaceId, "ws-contract"));
      if (rev) {
        syncRevisionToGraphStore("ws-contract", rev.revisionCode, CONTRACT_NS, rev.classesJson, rev.propertiesJson);
      }
      if (graphStore.countQuadsInGraph(activeAboxGraphUri("ws-contract")) === 0) {
        await materializeWorkspaceAbox(txDb, "tenant-caict", "ws-contract", "系统启动自动加载");
      }
      await ensureSupplyAndDedupHealed(txDb);
    });
    return;
  }

  await withTenantDb("tenant-other", async (txDb) => {
    await txDb.insert(credentials).values({
      id: "cred-other-secret",
      tenantId: "tenant-other",
      alias: "OTHER_TENANT_VAULT",
      envVarName: "ONTOLOGY_CONNECTOR_SECRET_OTHER_VAULT",
      allowedRoles: ["OWNER"],
      description: "其他租户私有凭据（用于验证跨租户零窃密）",
    });
  });

  await withTenantDb("tenant-caict", async (txDb) => {
    await txDb.insert(users).values([
      { id: "user-linyuan", tenantId: "tenant-caict", name: "林远", title: "OWNER / 首席本体架构师", defaultRole: "OWNER" },
      { id: "user-zhangmin", tenantId: "tenant-caict", name: "张敏", title: "REVIEWER / 独立风控审核人", defaultRole: "REVIEWER" },
      { id: "user-zhouming", tenantId: "tenant-caict", name: "周明", title: "OPERATOR / 政企续签经理", defaultRole: "OPERATOR" },
      { id: "user-chennan", tenantId: "tenant-caict", name: "陈楠", title: "VIEWER / 业务只读访客 (验证脱敏)", defaultRole: "VIEWER" },
    ]);

    await txDb.insert(credentials).values({
      id: "cred-erp-db",
      tenantId: "tenant-caict",
      alias: "ERP_CONTRACT_DB",
      envVarName: "ONTOLOGY_CONNECTOR_SECRET_ERP_CONTRACT_DB",
      allowedRoles: ["OWNER", "MODELER", "OPERATOR", "REVIEWER"],
      description: "ERP 合同主数据库受管凭据别名",
    });

    const contractRevCode = "892cd334";
    const contractRendered = syncRevisionToGraphStore("ws-contract", contractRevCode, CONTRACT_NS, CONTRACT_CLASSES, CONTRACT_PROPERTIES);
    const contractHash = graphStore.computeCanonicalGraphHash([
      tboxGraphUri("ws-contract", contractRevCode),
      shaclGraphUri("ws-contract", contractRevCode),
    ]);

    const ituRevCode = "51b0e8a1";
    const ituRendered = syncRevisionToGraphStore("ws-itu", ituRevCode, ITU_NS, ITU_CLASSES, ITU_PROPERTIES);
    const ituHash = graphStore.computeCanonicalGraphHash([
      tboxGraphUri("ws-itu", ituRevCode),
      shaclGraphUri("ws-itu", ituRevCode),
    ]);
    graphStore.writeTriplesToGraph(
      [
        { subject: `${ITU_NS}draft/Y31xx`, predicate: `${RDF_NS.rdf}type`, object: `${ITU_NS}RecommendationDraft` },
        { subject: `${ITU_NS}draft/Y31xx`, predicate: `${RDF_NS.rdfs}label`, object: "Y.31xx 算力网络语义编排架构提案草案 v0.4", isLiteral: true, language: "zh" },
      ],
      activeAboxGraphUri("ws-itu"),
      true
    );

    await txDb.insert(workspaces).values([
      {
        id: "ws-contract",
        tenantId: "tenant-caict",
        slug: "contract-renewal-flagship",
        name: "合同到期处置旗舰方案",
        versionLabel: "v2.0 · 已发布",
        status: "PUBLISHED",
        description: "面向政企高价值维保与框架合同的到期预警、条款溯源问答与受控续签编排方案。",
        namespaceIri: CONTRACT_NS,
        activeRevisionId: contractRevCode,
        publishedRevisionId: contractRevCode,
        aboxInstanceCount: 8,
        workItemsJson: CONTRACT_WORK_ITEMS,
      },
      {
        id: "ws-itu",
        tenantId: "tenant-caict",
        slug: "enterprise-procurement-audit",
        name: "集团招采合规与反围标风控",
        versionLabel: "v2.0 · 已发布",
        status: "PUBLISHED",
        description: "基于招采反围标本体与股权/人员关系图谱，自动穿透标段异常报价阶梯、共享联系人与跨系统重复主体风险。",
        namespaceIri: ITU_NS,
        activeRevisionId: ituRevCode,
        publishedRevisionId: ituRevCode,
        aboxInstanceCount: 115,
        workItemsJson: [
          {
            id: "wi-itu-1",
            workspaceId: "ws-itu",
            category: "modeling",
            title: "复核标段 #ZB-2026-041 检出的 2 处围标串标高危告警",
            subtitle: "来源：集团集采反围标本体引擎 · 共享项目经理与 0.80% 等差报价待确认",
            actionLabel: "查看招采本体",
            targetView: "ontology",
            dialogTarget: "none",
            status: "OPEN",
          },
        ],
      },
      {
        id: "ws-supply",
        tenantId: "tenant-caict",
        slug: "supply-chain-risk",
        name: "供应链韧性与断供预警旗舰方案",
        versionLabel: "v2.0 · 已发布",
        status: "PUBLISHED",
        description: "围绕关键算力与精密制造物料 BOM、多级供应商替代度及断链级联冲击路径构建的供应链风控本体。",
        namespaceIri: "https://ontology.lingdong.ai/supplychain#",
        activeRevisionId: contractRevCode,
        publishedRevisionId: contractRevCode,
        aboxInstanceCount: 98,
        workItemsJson: [],
      },
    ]);

    await txDb.insert(workspaceMembers).values([
      { id: "wm-1", tenantId: "tenant-caict", workspaceId: "ws-contract", userId: "user-linyuan", role: "OWNER" },
      { id: "wm-2", tenantId: "tenant-caict", workspaceId: "ws-contract", userId: "user-zhangmin", role: "REVIEWER" },
      { id: "wm-3", tenantId: "tenant-caict", workspaceId: "ws-contract", userId: "user-zhouming", role: "OPERATOR" },
      { id: "wm-4", tenantId: "tenant-caict", workspaceId: "ws-contract", userId: "user-chennan", role: "VIEWER" },
    ]);

    await txDb.insert(ontologyRevisions).values([
      {
        id: "rev-ws-contract-init",
        tenantId: "tenant-caict",
        workspaceId: "ws-contract",
        revisionCode: contractRevCode,
        parentRevisionCode: "710ab209",
        sha256Hash: contractHash.sha256,
        classesJson: CONTRACT_CLASSES,
        propertiesJson: CONTRACT_PROPERTIES,
        diffItemsJson: [
          { changeType: "ADDED", summary: "+ 新增属性 ont:signedAt (domain: ont:Contract, range: xsd:date)" },
          { changeType: "ADDED", summary: "+ 新增形状约束 ont:ContractShape -> sh:path ont:signedAt [lessThanOrEquals expiresAt]" },
          { changeType: "MODIFIED", summary: '~ 修改注释 ont:RenewalCase rdfs:comment "更新了高金额审批阈值说明"@zh' },
        ],
        backwardCompatible: true,
        turtleSource: contractRendered.combinedTurtle,
        tboxGraphUri: tboxGraphUri("ws-contract", contractRevCode),
        shaclGraphUri: shaclGraphUri("ws-contract", contractRevCode),
        createdBy: "林远 (OWNER)",
      },
      {
        id: "rev-ws-itu-init",
        tenantId: "tenant-caict",
        workspaceId: "ws-itu",
        revisionCode: ituRevCode,
        parentRevisionCode: null,
        sha256Hash: ituHash.sha256,
        classesJson: ITU_CLASSES,
        propertiesJson: ITU_PROPERTIES,
        diffItemsJson: [{ changeType: "ADDED", summary: "+ 初始化 ITU-T 建议书规范审查核心本体类与助动词约束" }],
        backwardCompatible: true,
        turtleSource: ituRendered.combinedTurtle,
        tboxGraphUri: tboxGraphUri("ws-itu", ituRevCode),
        shaclGraphUri: shaclGraphUri("ws-itu", ituRevCode),
        createdBy: "林远 (OWNER)",
      },
      {
        id: "rev-ws-supply-init",
        tenantId: "tenant-caict",
        workspaceId: "ws-supply",
        revisionCode: contractRevCode,
        parentRevisionCode: null,
        sha256Hash: contractHash.sha256,
        classesJson: CONTRACT_CLASSES.slice(0, 2),
        propertiesJson: CONTRACT_PROPERTIES.slice(0, 3),
        diffItemsJson: [],
        backwardCompatible: true,
        turtleSource: contractRendered.ontologyTurtle,
        tboxGraphUri: tboxGraphUri("ws-supply", contractRevCode),
        shaclGraphUri: shaclGraphUri("ws-supply", contractRevCode),
        createdBy: "林远 (OWNER)",
      },
    ]);

    await txDb.insert(changesets).values({
      id: "cs-contract-open",
      tenantId: "tenant-caict",
      workspaceId: "ws-contract",
      baseRevisionCode: contractRevCode,
      proposalsJson: CONTRACT_PROPOSALS,
      status: "OPEN",
    });

    await txDb.insert(competencyQuestions).values(CONTRACT_CQS.map((c) => ({ ...c, tenantId: "tenant-caict" })));

    await txDb.insert(documents).values([
      ...CONTRACT_DOCUMENTS.map((d) => ({
        id: d.id,
        tenantId: "tenant-caict",
        workspaceId: d.workspaceId,
        title: d.title,
        parserStatus: d.parserStatus,
        chunkCount: d.chunkCount,
        anchoredAxiomCount: d.anchoredAxiomCount,
        sha256Digest: d.sha256Digest,
        chunksJson: d.chunks ?? [],
      })),
      {
        id: "doc-itu-guide",
        tenantId: "tenant-caict",
        workspaceId: "ws-itu",
        title: "ITU-T SG13 标准提案编写导则 (Author's Guide).pdf",
        parserStatus: "PDF 解析与分块完成",
        chunkCount: 112,
        anchoredAxiomCount: 19,
        sha256Digest: "f03b71ca908211be77c14410",
        chunksJson: [
          {
            id: "chunk-itu-1",
            documentId: "doc-itu-guide",
            chunkCode: "#chunk-6.3 (字符坐标 6120..6280)",
            startOffset: 6120,
            endOffset: 6280,
            content:
              "Clause 6.3 Verbal forms for expressions of provisions: 'SHALL' indicates a mandatory requirement; 'MUST' shall not be used as an alternative for 'SHALL'.",
            highlightText: "'MUST' shall not be used as an alternative for 'SHALL'",
          },
        ],
      },
    ]);

    await seedDataAppsAndReleases(txDb, contractRevCode, contractHash.sha256, ituRevCode, ituHash.sha256);
    await materializeWorkspaceAbox(txDb, "tenant-caict", "ws-contract", "系统基线物化引擎");
  });
}
