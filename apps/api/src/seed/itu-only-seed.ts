import type {
  ItuReviewItem,
  OntologyClass,
  OntologyProperty,
  SemanticAsset,
} from "@lingdong/contracts";
import { RDF_NS } from "@lingdong/semantic-core";

export const REUSABLE_ASSETS: SemanticAsset[] = [
  {
    id: "asset-prov-o",
    categoryBadge: "W3C 标准底座",
    categoryTone: "blue",
    version: "v2013.04",
    title: "PROV-O 溯源核心本体",
    description: "提供 Entity、Activity、Agent 标准血缘词汇，所有发布包默认内置。",
    enabledInWorkspace: true,
    turtleSnippet:
      "@prefix prov: <http://www.w3.org/ns/prov#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\nprov:ProvenanceRecord a owl:Class ;\n  rdfs:label \"溯源证据记录\"@zh .",
  },
  {
    id: "asset-contract-pack",
    categoryBadge: "行业领域包",
    categoryTone: "emerald",
    version: "v1.4.0",
    title: "商业协议与法务履约模板 (OWL+SHACL)",
    description: "预置合同主体、付款里程碑、违约责任与不可抗力条款标准类层次。",
    enabledInWorkspace: true,
    turtleSnippet:
      "@prefix ont: <https://ontology.caict.cn/contract#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\nont:PaymentMilestone a owl:Class ;\n  rdfs:label \"付款里程碑\"@zh ;\n  rdfs:subClassOf ont:Contract .",
  },
  {
    id: "asset-supply-chain",
    categoryBadge: "FDE 方案模板",
    categoryTone: "purple",
    version: "v2.0",
    title: "重点产业链断链风险研判包",
    description: "含上下游供应关系、关键物料替代度及多跳影响分析查询模板。",
    enabledInWorkspace: false,
    turtleSnippet:
      "@prefix sc: <https://ontology.caict.cn/supply#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\nsc:SupplyNode a owl:Class ;\n  rdfs:label \"供应链关键节点\"@zh .\nsc:suppliesCriticalPart a owl:ObjectProperty ;\n  rdfs:label \"供应关键物料\"@zh ;\n  rdfs:domain sc:SupplyNode ;\n  rdfs:range sc:SupplyNode .",
  },
];

export const ITU_NS = "https://ontology.caict.cn/itu-standard#";

export const ITU_CLASSES: OntologyClass[] = [
  {
    iri: `${ITU_NS}RecommendationDraft`,
    localName: "RecommendationDraft",
    labelZh: "ITU-T 标准草案",
    labelEn: "ITU-T Recommendation Draft",
    description: "提交 SG13 等研究组审议的国际标准文稿主实体。",
    roleKind: "master",
    subClassOf: `${ITU_NS}StandardDocument`,
    positionX: 280,
    positionY: 140,
    instanceCount: 5,
    controlledActionCount: 1,
    properties: [],
    shaclConstraints: [
      {
        id: "sh-itu-ref",
        propertyIri: `${ITU_NS}normativeRefStatus`,
        propertyLocalName: "normativeRefStatus",
        datatype: "xsd:string",
        minCount: 1,
        severity: "Violation",
        description: "规范性引用文件必须处于 IN_FORCE 现行有效状态",
      },
    ],
    downstreamMappings: ["itu.draft_clauses"],
    downstreamCapabilities: ["AuditItuNormativeTerms"],
  },
  {
    iri: `${ITU_NS}NormativeRequirement`,
    localName: "NormativeRequirement",
    labelZh: "规范性条款要求",
    labelEn: "Normative Requirement",
    description: "含 SHALL / SHALL NOT / SHOULD 助动词的可验证技术条款。",
    roleKind: "knowledge",
    subClassOf: `${ITU_NS}ClauseElement`,
    positionX: 560,
    positionY: 140,
    instanceCount: 42,
    controlledActionCount: 0,
    properties: [],
    shaclConstraints: [],
    downstreamMappings: ["itu.normative_clauses"],
    downstreamCapabilities: ["AuditItuNormativeTerms"],
  },
  {
    iri: `${ITU_NS}DefinedTerm`,
    localName: "DefinedTerm",
    labelZh: "标准术语定义",
    labelEn: "Defined Term",
    description: "第 3 章定义的受控术语及跨建议书同义/冲突关系。",
    roleKind: "master",
    subClassOf: `${ITU_NS}LexicalConcept`,
    positionX: 410,
    positionY: 320,
    instanceCount: 68,
    controlledActionCount: 0,
    properties: [],
    shaclConstraints: [],
    downstreamMappings: ["itu.terms_db"],
    downstreamCapabilities: ["AuditItuNormativeTerms"],
  },
];

export const ITU_PROPERTIES: OntologyProperty[] = [
  {
    iri: `${ITU_NS}citesNormatively`,
    localName: "citesNormatively",
    labelZh: "规范性引用",
    kind: "ObjectProperty",
    domainIri: `${ITU_NS}RecommendationDraft`,
    domainLocalName: "RecommendationDraft",
    rangeIri: `${ITU_NS}RecommendationDraft`,
    rangeLocalName: "ont:RecommendationDraft",
    characteristics: "禁止引用已废止 Superseded 建议书",
    sensitiveMask: false,
  },
  {
    iri: `${ITU_NS}modalVerb`,
    localName: "modalVerb",
    labelZh: "规范助动词",
    kind: "DatatypeProperty",
    domainIri: `${ITU_NS}NormativeRequirement`,
    domainLocalName: "NormativeRequirement",
    rangeIri: `${RDF_NS.xsd}string`,
    rangeLocalName: "xsd:string",
    characteristics: "SHALL / SHOULD / MAY 严格区分",
    sensitiveMask: false,
  },
];

export const ITU_REVIEW_ITEMS: ItuReviewItem[] = [
  {
    id: "itu-1",
    clauseRef: "Clause 3.2.4 · 术语定义",
    severity: "CONFLICT",
    normativeVerb: "DEFINITION",
    findingTitle: "“Computing-Aware Orchestrator”定义与现行 ITU-T Y.2501 存在外延冲突",
    sourceExcerpt: "3.2.4 computing-aware orchestrator: A centralized controller that exclusively schedules L3 routing paths.",
    ontologyRuleAnchor: "itu:DefinedTerm owl:disjointWith y2501:PureRoutingElement",
    recommendation: "建议改为引用 Y.2501 第 3.1.2 条基础定义，并补充语义编排扩展限定语，避免重定义既有标准术语。",
  },
  {
    id: "itu-2",
    clauseRef: "Clause 7.1 · 安全要求",
    severity: "CONFLICT",
    normativeVerb: "MUST -> SHALL",
    findingTitle: "正文中混用非 ITU-T 规范助动词“MUST”，违反《ITU-T 建议书编写导则》第 6.3 条",
    sourceExcerpt: "The semantic gateway MUST reject unauthenticated cross-domain state updates.",
    ontologyRuleAnchor: "itu:NormativeVerbShape [sh:in ('SHALL' 'SHALL NOT' 'SHOULD' 'MAY')]",
    recommendation: "按 ITU-T Author's Guide 规范将强制要求统一替换为“SHALL”。",
  },
  {
    id: "itu-3",
    clauseRef: "Clause 2 · 规范性引用",
    severity: "PASS",
    normativeVerb: "NORMATIVE_REF",
    findingTitle: "引用的 ITU-T Y.3100、Y.3172 及 W3C SHACL 建议书均为现行有效版本",
    sourceExcerpt: "[ITU-T Y.3172] Recommendation ITU-T Y.3172 (2019), Architectural framework for ML in future networks.",
    ontologyRuleAnchor: "itu:citesNormatively -> status = IN_FORCE",
    recommendation: "符合出版门禁要求，无需修改。",
  },
];
