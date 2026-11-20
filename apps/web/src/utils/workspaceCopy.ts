export interface WorkspaceCopyPack {
  domainLabel: string;
  aboxSubtext: string;
  defaultConcept: string;
  defaultConceptsCsv: string;
  defaultCapability: string;
  cqPlaceholder: string;
  modelingInstruction: string;
  chunkFallbackHeader: string;
  sandboxSampleQ: string;
  sandboxSampleTitle: string;
  sandboxSampleBody: string;
  sandboxTraceTail: string[];
  turtleSampleFilename: string;
  turtleSampleBtn: string;
  turtleSamplePlaceholder: string;
  turtleSampleContent: string;
}

const CONTRACT_COPY: WorkspaceCopyPack = {
  domainLabel: "商务合同本体",
  aboxSubtext: "ERP 增量水位线 · 实时同步",
  defaultConcept: "Contract",
  defaultConceptsCsv: "Contract, RenewalCase",
  defaultCapability: "FindExpiringContracts",
  cqPlaceholder: "例如：哪些跨境合同未绑定排他性争议解决条款？",
  modelingInstruction: "重点识别续签通知期属性、金额阈值约束及续签处置单触发关系。",
  chunkFallbackHeader: "待选择制度文档证据分块：",
  sandboxSampleQ: "示例提问：列出 30 天内到期的智算维保类合同，并起草续签跟进工单。",
  sandboxSampleTitle: "合同到期处置受控问答示例（支持实时 SSE 流式检索与动作预演）：",
  sandboxSampleBody:
    "输入自然语言问题后，系统将自动编译参数化 SPARQL 查询、检索 PROV-O 条款证据并按四级自治门禁生成受控动作计划。",
  sandboxTraceTail: [
    "3. 脱敏策略: totalAmount -> MASKED_TIER",
    "4. 证据锚点: 活跃命名图 + 制度条款分块",
  ],
  turtleSampleFilename: "performance-bond.ttl",
  turtleSampleBtn: "填入示例履约保函 Turtle",
  turtleSamplePlaceholder: "@prefix ont: <https://ontology.caict.cn/contract#> ...",
  turtleSampleContent: `@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix ont:  <https://ontology.caict.cn/contract#> .

ont:PerformanceBond a owl:Class ;
  rdfs:label "履约保函"@zh, "PerformanceBond"@en ;
  rdfs:subClassOf ont:BusinessEntity ;
  rdfs:comment "金融机构出具的合同履约担保凭证"@zh .

ont:guaranteesContract a owl:ObjectProperty ;
  rdfs:label "担保关联合同"@zh ;
  rdfs:domain ont:PerformanceBond ;
  rdfs:range ont:Contract .`,
};

const ITU_COPY: WorkspaceCopyPack = {
  domainLabel: "ITU 国际标准提案本体",
  aboxSubtext: "标准规范库 · 增量同步",
  defaultConcept: "StandardProposal",
  defaultConceptsCsv: "StandardProposal, NormativeClause",
  defaultCapability: "CheckNormativeCompliance",
  cqPlaceholder: "例如：哪些提案章节混用了 shall 与 should 规范性动词？",
  modelingInstruction: "重点识别提案章节、规范性条款 (shall/should) 及审查意见关联关系。",
  chunkFallbackHeader: "待选择标准规范文档证据分块：",
  sandboxSampleQ: "示例提问：核查当前 ITU-T 草案中所有强制性 shall 条款及其引用标准。",
  sandboxSampleTitle: "国际标准提案合规问答示例（支持实时 SSE 流式检索与证据对齐）：",
  sandboxSampleBody:
    "输入标准审查问题后，系统将基于冻结的 ITU 本体修订检索规范条款与引用依赖，并输出可追溯的合规定位结论。",
  sandboxTraceTail: [
    "3. 合规检查: NormativeClause -> SHALL/SHOULD 规则校验",
    "4. 证据锚点: ITU 活跃命名图 + 规范条款分块",
  ],
  turtleSampleFilename: "itu-amendment.ttl",
  turtleSampleBtn: "填入示例标准修正案 Turtle",
  turtleSamplePlaceholder: "@prefix ont: <https://ontology.caict.cn/itu#> ...",
  turtleSampleContent: `@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix ont:  <https://ontology.caict.cn/itu#> .

ont:TechnicalCorrigendum a owl:Class ;
  rdfs:label "技术勘误表"@zh, "TechnicalCorrigendum"@en ;
  rdfs:comment "针对已发布 ITU-T 建议书的勘误修订文档"@zh .`,
};

const SUPPLY_COPY: WorkspaceCopyPack = {
  domainLabel: "供应链协同本体",
  aboxSubtext: "供应链主数据 · 实时同步",
  defaultConcept: "Supplier",
  defaultConceptsCsv: "Supplier, PurchaseOrder",
  defaultCapability: "QuerySupplierRisk",
  cqPlaceholder: "例如：哪些核心供应商存在交期延期或备选产能缺口？",
  modelingInstruction: "重点识别供应商资质、采购订单交期约束及断供预警处置关系。",
  chunkFallbackHeader: "待选择供应链制度证据分块：",
  sandboxSampleQ: "示例提问：排查近 30 天交付延迟风险较高的核心物料供应商与关联订单。",
  sandboxSampleTitle: "供应链协同受控问答示例（支持实时 SSE 流式检索与动作预演）：",
  sandboxSampleBody:
    "输入供应链分析问题后，系统将基于当前工作空间本体编译受控查询并定位关联的供应商与采购单证据。",
  sandboxTraceTail: [
    "3. 脱敏策略: 按当前角色自动执行敏感字段保护",
    "4. 证据锚点: 供应链活跃命名图 + 制度文档分块",
  ],
  turtleSampleFilename: "supply-audit.ttl",
  turtleSampleBtn: "填入示例供应商稽核 Turtle",
  turtleSamplePlaceholder: "@prefix ont: <https://ontology.caict.cn/supply#> ...",
  turtleSampleContent: `@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix ont:  <https://ontology.caict.cn/supply#> .

ont:QualityAudit a owl:Class ;
  rdfs:label "供应商质量稽核"@zh, "QualityAudit"@en ;
  rdfs:comment "针对关键物料供应商的现场与批次质量稽核记录"@zh .`,
};

export function getWorkspaceCopy(workspaceId: string): WorkspaceCopyPack {
  if (workspaceId === "ws-itu") return ITU_COPY;
  if (workspaceId === "ws-supply") return SUPPLY_COPY;
  return CONTRACT_COPY;
}
