import { and, eq } from "drizzle-orm";
import type { OntologyClass, OntologyProperty } from "@lingdong/contracts";
import { RDF_NS, shaclGraphUri, tboxGraphUri } from "@lingdong/semantic-core";
import type { AppDb } from "../db/client.js";
import {
  capabilities,
  documents,
  ontologyRevisions,
  releases,
  semanticApps,
  workspaces,
} from "../db/schema.js";
import { graphStore, syncRevisionToGraphStore } from "../graph-runtime.js";
import { healMultiWorkspaceConsistency } from "./multi-workspace-heal.js";

export const SUPPLY_NS = "https://ontology.caict.cn/supply#";

export const SUPPLY_PROPERTIES: OntologyProperty[] = [
  {
    iri: `${SUPPLY_NS}suppliedBy`,
    localName: "suppliedBy",
    labelZh: "由供应商交付",
    kind: "ObjectProperty",
    domainIri: `${SUPPLY_NS}ComponentBatch`,
    domainLocalName: "ComponentBatch",
    rangeIri: `${SUPPLY_NS}Supplier`,
    rangeLocalName: "Supplier",
    characteristics: "FunctionalProperty",
    sensitiveMask: false,
  },
  {
    iri: `${SUPPLY_NS}triggersRiskAlert`,
    localName: "triggersRiskAlert",
    labelZh: "触发断供预警",
    kind: "ObjectProperty",
    domainIri: `${SUPPLY_NS}ComponentBatch`,
    domainLocalName: "ComponentBatch",
    rangeIri: `${SUPPLY_NS}RiskAlert`,
    rangeLocalName: "RiskAlert",
    characteristics: "ObjectProperty",
    sensitiveMask: false,
  },
  {
    iri: `${SUPPLY_NS}riskScore`,
    localName: "riskScore",
    labelZh: "断供风险分",
    kind: "DatatypeProperty",
    domainIri: `${SUPPLY_NS}RiskAlert`,
    domainLocalName: "RiskAlert",
    rangeIri: `${RDF_NS.xsd}integer`,
    rangeLocalName: "xsd:integer",
    characteristics: "SHACL [0..100]",
    sensitiveMask: false,
  },
];

export const SUPPLY_CLASSES: OntologyClass[] = [
  {
    iri: `${SUPPLY_NS}Supplier`,
    localName: "Supplier",
    labelZh: "核心供应商",
    labelEn: "Supplier",
    description: "重点产业链上游芯片与关键器件一级/二级供应商主体。",
    roleKind: "master",
    subClassOf: `${SUPPLY_NS}SupplyEntity`,
    positionX: 48,
    positionY: 88,
    instanceCount: 24,
    controlledActionCount: 0,
    properties: [],
    shaclConstraints: [],
    downstreamMappings: [],
    downstreamCapabilities: ["QuerySupplyBottlenecks"],
  },
  {
    iri: `${SUPPLY_NS}ComponentBatch`,
    localName: "ComponentBatch",
    labelZh: "关键器件批次",
    labelEn: "ComponentBatch",
    description: "受交付周期与替代产能约束的关键元器件批次实例。",
    roleKind: "master",
    subClassOf: `${SUPPLY_NS}SupplyEntity`,
    positionX: 310,
    positionY: 88,
    instanceCount: 68,
    controlledActionCount: 1,
    properties: SUPPLY_PROPERTIES.filter((p) => p.domainLocalName === "ComponentBatch"),
    shaclConstraints: [],
    downstreamMappings: [],
    downstreamCapabilities: ["QuerySupplyBottlenecks"],
  },
  {
    iri: `${SUPPLY_NS}RiskAlert`,
    localName: "RiskAlert",
    labelZh: "供应链断供预警",
    labelEn: "RiskAlert",
    description: "基于多跳依赖图谱检出的交期延误或单一来源断供风险单。",
    roleKind: "controlled_write",
    subClassOf: `${SUPPLY_NS}SupplyEntity`,
    positionX: 572,
    positionY: 88,
    instanceCount: 6,
    controlledActionCount: 1,
    properties: SUPPLY_PROPERTIES.filter((p) => p.domainLocalName === "RiskAlert"),
    shaclConstraints: [
      {
        id: "sh-supply-risk",
        propertyIri: `${SUPPLY_NS}riskScore`,
        propertyLocalName: "riskScore",
        datatype: "xsd:integer",
        minInclusive: 0,
        severity: "Violation",
        description: "断供风险分必须为非负整数",
      },
    ],
    downstreamMappings: [],
    downstreamCapabilities: ["QuerySupplyBottlenecks"],
  },
];

export async function ensureSupplyAndDedupHealed(txDb: AppDb): Promise<void> {
  // 1. Heal ws-supply ontology if still using Contract classes
  const [supplyWs] = await txDb.select().from(workspaces).where(eq(workspaces.id, "ws-supply"));
  if (supplyWs) {
    const [rev] = await txDb
      .select()
      .from(ontologyRevisions)
      .where(and(eq(ontologyRevisions.workspaceId, "ws-supply"), eq(ontologyRevisions.revisionCode, supplyWs.activeRevisionId)));

    if (!rev || rev.classesJson.some((c) => c.localName === "Contract")) {
      const supplyRevCode = "sp74a2c1";
      const rendered = syncRevisionToGraphStore("ws-supply", supplyRevCode, SUPPLY_NS, SUPPLY_CLASSES, SUPPLY_PROPERTIES);
      const hash = graphStore.computeCanonicalGraphHash([
        tboxGraphUri("ws-supply", supplyRevCode),
        shaclGraphUri("ws-supply", supplyRevCode),
      ]);
      await txDb.delete(ontologyRevisions).where(eq(ontologyRevisions.workspaceId, "ws-supply"));
      await txDb.insert(ontologyRevisions).values({
        id: `rev-supply-${supplyRevCode}`,
        tenantId: "tenant-caict",
        workspaceId: "ws-supply",
        revisionCode: supplyRevCode,
        parentRevisionCode: null,
        sha256Hash: hash.sha256,
        classesJson: SUPPLY_CLASSES,
        propertiesJson: SUPPLY_PROPERTIES,
        diffItemsJson: [{ changeType: "ADDED", summary: "+ 初始化重点产业链供应链风险本体基线 (3 核心类 · 3 属性)" }],
        backwardCompatible: true,
        turtleSource: rendered.combinedTurtle,
        tboxGraphUri: tboxGraphUri("ws-supply", supplyRevCode),
        shaclGraphUri: shaclGraphUri("ws-supply", supplyRevCode),
        createdBy: "林远 (OWNER)",
      });
      await txDb
        .update(workspaces)
        .set({ namespaceIri: SUPPLY_NS, activeRevisionId: supplyRevCode })
        .where(eq(workspaces.id, "ws-supply"));
    }

    const existingApp = await txDb.select().from(semanticApps).where(eq(semanticApps.workspaceId, "ws-supply"));
    if (existingApp.length === 0) {
      await txDb.insert(semanticApps).values({
        id: "app-supply-v1",
        tenantId: "tenant-caict",
        workspaceId: "ws-supply",
        slug: "supply-risk-radar",
        name: "供应链断供风险研判助手",
        activeVersion: "v0.9-beta",
        draftVersion: "v1.0-draft",
        boundRevisionId: "sp74a2c1",
        status: "DRAFT",
        benchmarkPassRate: 9500,
        benchmarkDelta: "供应链基线集验证就绪",
        outOfScopeRefusalRate: 10000,
        outOfScopeSummary: "8/8 越界问题精准拒答",
        regressionFailures: 0,
        totalBenchmarkCases: 32,
      });
    }

    const existingCaps = await txDb.select().from(capabilities).where(eq(capabilities.workspaceId, "ws-supply"));
    if (existingCaps.length === 0) {
      await txDb.insert(capabilities).values({
        id: "cap-supply-read",
        tenantId: "tenant-caict",
        workspaceId: "ws-supply",
        code: "QuerySupplyBottlenecks",
        name: "检索单一来源断供瓶颈",
        autonomyTier: "READ",
        riskLevel: "LOW",
        description: "基于供应链多跳依赖图谱查询高风险关键器件与备选供应商",
        targetEntityLocalName: "RiskAlert",
        compensationCapabilityCode: null,
        mcpExposed: true,
        mcpUri: "mcp://ontology/supply-bottlenecks",
        quotaPerMinute: 60,
      });
    }

    const existingRel = await txDb.select().from(releases).where(eq(releases.workspaceId, "ws-supply"));
    if (existingRel.length === 0) {
      await txDb.insert(releases).values({
        id: "rel-supply-v09",
        tenantId: "tenant-caict",
        workspaceId: "ws-supply",
        version: "v0.9.0-rc1",
        revisionId: "sp74a2c1",
        status: "AWAITING_REVIEW",
        submittedBy: "林远 (OWNER)",
        submittedById: "user-linyuan",
        reviewedBy: null,
        sha256ManifestHash: "9f3b1e8c44a120d7",
        publishedAt: null,
      });
    }
  }

  // 2. Clean duplicate SHA-256 documents in ws-contract from prior repeated uploads
  const docs = await txDb.select().from(documents).where(eq(documents.workspaceId, "ws-contract"));
  const seenSha = new Set<string>();
  for (const d of docs) {
    if (seenSha.has(d.sha256Digest)) {
      await txDb.delete(documents).where(eq(documents.id, d.id));
    } else {
      seenSha.add(d.sha256Digest);
    }
  }
  await healMultiWorkspaceConsistency(txDb);
}
