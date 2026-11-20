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
  domainLabel: "集团招采反围标本体",
  aboxSubtext: "招采与主体关联库 · 增量同步",
  defaultConcept: "BidPackage",
  defaultConceptsCsv: "BidPackage, BidderEntity, BidRiskRule",
  defaultCapability: "AuditProcurementCollusion",
  cqPlaceholder: "例如：哪些投标方共享了同一项目经理或呈现异常等差报价阶梯？",
  modelingInstruction: "重点识别招采标段、投标主体、股权/人员穿透关系及报价异常阶梯约束。",
  chunkFallbackHeader: "待选择招采合规规范文档证据分块：",
  sandboxSampleQ: "示例提问：核查标段 #ZB-2026-041 中所有存在共享联系人或异常报价阶梯的投标方。",
  sandboxSampleTitle: "集团招采反围标问答示例（支持实时 SSE 流式检索与证据对齐）：",
  sandboxSampleBody:
    "输入招采风控问题后，系统将基于冻结的反围标本体修订穿透主体关系与报价清单，并输出可追溯的合规拦截结论。",
  sandboxTraceTail: [
    "3. 合规检查: BidderEntity -> 人员穿透与 0.80% 报价阶梯规则校验",
    "4. 证据锚点: 招采活跃命名图 + 《集团招采合规管理规范》分块",
  ],
  turtleSampleFilename: "procurement-anti-collusion.ttl",
  turtleSampleBtn: "填入示例招采反围标规则 Turtle",
  turtleSamplePlaceholder: "@prefix proc: <https://ontology.lingdong.ai/procurement#> ...",
  turtleSampleContent: `@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix proc: <https://ontology.lingdong.ai/procurement#> .

proc:CollusionAlert a owl:Class ;
  rdfs:label "围标串标高危告警"@zh, "CollusionAlert"@en ;
  rdfs:comment "同一标段内不同投标方共享关键人员或异常等差报价时触发"@zh .`,
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
