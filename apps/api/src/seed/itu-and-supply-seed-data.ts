import type {
  CompetencyQuestion,
  DocumentRecord,
  WorkItem,
} from "@lingdong/contracts";

export {
  ITU_CLASSES,
  ITU_NS,
  ITU_PROPERTIES,
  ITU_REVIEW_ITEMS,
  REUSABLE_ASSETS,
} from "./itu-only-seed.js";
export {
  CONTRACT_CAPABILITIES,
  CONTRACT_MAPPINGS,
} from "./contract-mappings-caps-seed.js";

export const CONTRACT_WORK_ITEMS: WorkItem[] = [
  {
    id: "wi-1",
    workspaceId: "ws-contract",
    category: "modeling",
    title: "审阅《2026 商务续签规范》抽取的 3 条新属性与约束提案",
    subtitle: "来源：向导建模任务 #JOB-108 · 截止：今日 18:00",
    actionLabel: "立即审阅",
    targetView: "modeling",
    dialogTarget: "changeset",
    status: "OPEN",
  },
  {
    id: "wi-2",
    workspaceId: "ws-contract",
    category: "exec",
    title: "独立审批高价值合同状态变更：HT-2026-104 → PENDING_RENEWAL",
    subtitle: "发起人：林远 (OWNER) · 动作风险：HIGH · 需异人 REVIEWER 签署",
    actionLabel: "查看影响预演",
    targetView: "apps",
    dialogTarget: "none",
    status: "OPEN",
  },
  {
    id: "wi-3",
    workspaceId: "ws-contract",
    category: "modeling",
    title: "处理 ABox 物化隔离区的 2 条异常脏数据记录",
    subtitle: "违反 SHACL 规则：合同到期日早于签署日 · 源表 public.contracts",
    actionLabel: "定位隔离记录",
    targetView: "data",
    dialogTarget: "none",
    status: "OPEN",
  },
  {
    id: "wi-4",
    workspaceId: "ws-contract",
    category: "release",
    title: "签署发布候选包 v2.1.0-rc1（职责分离独立审核）",
    subtitle: "提交人：林远 · 指派审核人：张敏 (REVIEWER)",
    actionLabel: "前往发布台",
    targetView: "release",
    dialogTarget: "none",
    status: "OPEN",
  },
];

export const CONTRACT_CQS: CompetencyQuestion[] = [
  {
    id: "cq-1",
    workspaceId: "ws-contract",
    code: "CQ-01",
    question: "CQ-01：未来 30 天有哪些高金额合同即将到期且含自动顺延条款？",
    coveredConcepts: ["Contract", "Clause"],
    boundCapability: "FindExpiringContracts",
    status: "PASSED",
  },
  {
    id: "cq-2",
    workspaceId: "ws-contract",
    code: "CQ-02",
    question: "CQ-02：某客户名下所有履约中合同的违约金上限如何计算？",
    coveredConcepts: ["Customer", "Clause"],
    boundCapability: "CalcPenaltyCap",
    status: "PASSED",
  },
  {
    id: "cq-3",
    workspaceId: "ws-contract",
    code: "CQ-03",
    question: "CQ-03：进入续签窗口后，如何安全指派负责人并更新合同状态？",
    coveredConcepts: ["RenewalCase", "AccountOwner"],
    boundCapability: "MarkRenewalPending",
    status: "VERIFIED_READY",
  },
];

export const CONTRACT_DOCUMENTS: DocumentRecord[] = [
  {
    id: "doc-renewal-2026",
    workspaceId: "ws-contract",
    title: "2026 商务合同续签与风控管理规范.pdf",
    parserStatus: "PDF 解析与分块完成",
    chunkCount: 84,
    anchoredAxiomCount: 14,
    sha256Digest: "a94f8e12d84c901f2b3a03b1",
    chunks: [
      {
        id: "chunk-12",
        documentId: "doc-renewal-2026",
        chunkCode: "#chunk-12 (字符坐标 1420..1538)",
        startOffset: 1420,
        endOffset: 1538,
        content:
          "凡合同总金额超过 100 万元人民币的年度框架协议，若未在到期前 30 个自然日内发出书面不续签通知，系统应自动创建续签处置单并指派客户负责人审核。",
        highlightText: "若未在到期前 30 个自然日内发出书面不续签通知",
      },
      {
        id: "chunk-18",
        documentId: "doc-renewal-2026",
        chunkCode: "#chunk-18 (字符坐标 2210..2340)",
        startOffset: 2210,
        endOffset: 2340,
        content:
          "第 4.2 条（自动顺延与排他违约责任）：智算中心维保类主协议若逾期未书面确认终止，默认按原费率顺延 12 个月；单方提前解约违约金上限为合同总额的 15%。",
        highlightText: "违约金上限为合同总额的 15%",
      },
    ],
  },
  {
    id: "doc-penalty",
    workspaceId: "ws-contract",
    title: "政企大客户履约违约金核算细则.docx",
    parserStatus: "OOXML 解析完成",
    chunkCount: 36,
    anchoredAxiomCount: 8,
    sha256Digest: "c71d204b8821fa0412c999e4",
    chunks: [
      {
        id: "chunk-p4",
        documentId: "doc-penalty",
        chunkCode: "#chunk-04 (字符坐标 410..525)",
        startOffset: 410,
        endOffset: 525,
        content:
          "核心网络及智算基础设施维保合同累计违约赔偿总额不超过协议不含税总价款的 15%，重大安全事故除外。",
        highlightText: "不超过协议不含税总价款的 15%",
      },
    ],
  },
];
