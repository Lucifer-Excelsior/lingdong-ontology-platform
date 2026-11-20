import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { OntologyClass, OntologyProperty } from "@lingdong/contracts";
import { renderWorkspaceTurtle, shaclGraphUri, tboxGraphUri } from "@lingdong/semantic-core";
import type { AppDb } from "../db/client.js";
import { loadRuntimeKv, saveRuntimeKv } from "../db/runtime-kv.js";
import { auditEvents, ontologyRevisions, workspaces } from "../db/schema.js";
import { graphStore, syncRevisionToGraphStore } from "../graph-runtime.js";
import { appendAuditChainEntry } from "../security/audit-chain-service.js";
import { assertWorkspaceNotRetired } from "./std-requirements-lifecycle-service.js";

export interface IndustryTemplatePack {
  id: string;
  industry: string;
  name: string;
  standardRef: string;
  summary: string;
  classCount: number;
  shaclRuleCount: number;
  sampleClasses: Array<{ localName: string; labelZh: string; description: string; roleKind: OntologyClass["roleKind"] }>;
  installed?: boolean;
}

const INSTALLED_NS = "v7_installed_templates";
const nowStr = () => new Date().toISOString().slice(0, 16).replace("T", " ");

export const INDUSTRY_TEMPLATES: IndustryTemplatePack[] = [
  {
    id: "tpl-procurement",
    industry: "央国企招采",
    name: "招采合规与围串标风控本体包",
    standardRef: "GB/T 39477 / 国资委合规指引",
    summary: "内置招标项目、投标人股权穿透、围串标异常告警与履约黑名单 SHACL 规则。",
    classCount: 3,
    shaclRuleCount: 4,
    sampleClasses: [
      { localName: "BidProject", labelZh: "招标采购项目", description: "集团集中采购立项与评标全周期主数据", roleKind: "master" },
      { localName: "CollusionAlert", labelZh: "围串标风险告警", description: "基于股权关联与报价离散度推理生成的高危风控对象", roleKind: "controlled_write" },
      { localName: "SupplierBlacklist", labelZh: "供应商禁入清单", description: "触发合规红线后的受控禁入实体", roleKind: "knowledge" },
    ],
  },
  {
    id: "tpl-energy",
    industry: "能源制造",
    name: "核心设备预测性维护本体包",
    standardRef: "ISO 55000 / OPC-UA 语义标准",
    summary: "覆盖风电/电网主变设备台账、传感器遥测异常与自动派单检修闭环。",
    classCount: 3,
    shaclRuleCount: 3,
    sampleClasses: [
      { localName: "IndustrialAsset", labelZh: "核心生产设备", description: "挂载拓扑层级与生命周期台账的物理资产", roleKind: "master" },
      { localName: "TelemetryAnomaly", labelZh: "遥测异常事件", description: "温度/振动越限触发的语义诊断节点", roleKind: "knowledge" },
      { localName: "MaintenanceOrder", labelZh: "预测性检修工单", description: "受控下发至 EAM/MES 的检修作业指令", roleKind: "controlled_write" },
    ],
  },
  {
    id: "tpl-finance",
    industry: "金融风控",
    name: "集团授信与担保圈反欺诈本体包",
    standardRef: "FIBO 2.4 / 银保监大额风险暴露规范",
    summary: "面向对公授信额度、实控人穿透与循环担保环路检测的金融本体模型。",
    classCount: 3,
    shaclRuleCount: 4,
    sampleClasses: [
      { localName: "CreditFacility", labelZh: "综合授信额度", description: "集团客户本外币授信敞口与到期控制", roleKind: "master" },
      { localName: "BeneficialOwner", labelZh: "最终受益人", description: "穿透多层股权识别的实际控制自然人/法人", roleKind: "actor" },
      { localName: "GuaranteeRing", labelZh: "循环担保环路", description: "多跳图推理识别的互保/联保风险传导簇", roleKind: "knowledge" },
    ],
  },
  {
    id: "tpl-gov",
    industry: "政务数据",
    name: "政务数据目录与一网通办本体包",
    standardRef: "国家政务信息资源目录标准 GB/T 21063",
    summary: "统一政务事项、权责清单、跨部门数据共享授权与密级开放口径。",
    classCount: 3,
    shaclRuleCount: 3,
    sampleClasses: [
      { localName: "GovServiceItem", labelZh: "政务服务事项", description: "标准化办事指南与审批要件本体类", roleKind: "master" },
      { localName: "DataCatalogItem", labelZh: "公共数据目录", description: "带共享属性与开放密级的政务数据资产", roleKind: "knowledge" },
      { localName: "DataShareOrder", labelZh: "跨部门共享工单", description: "受控审批的政务数据接口授权工单", roleKind: "controlled_write" },
    ],
  },
];

export async function listIndustryTemplates(tenantId: string, workspaceId: string): Promise<IndustryTemplatePack[]> {
  const saved = await loadRuntimeKv<{ installedIds: string[] }>(tenantId, INSTALLED_NS, workspaceId);
  const installedSet = new Set(saved?.installedIds ?? []);
  return INDUSTRY_TEMPLATES.map((tpl) => ({ ...tpl, installed: installedSet.has(tpl.id) }));
}

export async function installIndustryTemplate(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  templateId: string,
  actorDisplay: string
): Promise<{ ok: boolean; revisionCode: string; addedCount: number; message: string }> {
  await assertWorkspaceNotRetired(tenantId, workspaceId);
  const pack = INDUSTRY_TEMPLATES.find((t) => t.id === templateId);
  if (!pack) throw new Error(`未找到行业本体模板包: ${templateId}`);

  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");
  const [cur] = await txDb
    .select()
    .from(ontologyRevisions)
    .where(and(eq(ontologyRevisions.workspaceId, workspaceId), eq(ontologyRevisions.revisionCode, ws.activeRevisionId)))
    .limit(1);
  if (!cur) throw new Error("未找到活跃修订");

  const existingNames = new Set(cur.classesJson.map((c) => c.localName));
  const additions: OntologyClass[] = pack.sampleClasses
    .filter((sc) => !existingNames.has(sc.localName))
    .map((sc, idx) => ({
      iri: `${ws.namespaceIri}${sc.localName}`,
      localName: sc.localName,
      labelZh: sc.labelZh,
      labelEn: sc.localName,
      description: sc.description,
      roleKind: sc.roleKind,
      subClassOf: "owl:Thing",
      positionX: 520 + idx * 190,
      positionY: 360,
      instanceCount: 0,
      controlledActionCount: sc.roleKind === "controlled_write" ? 1 : 0,
      downstreamMappings: [],
      downstreamCapabilities: [],
      properties: [],
      shaclConstraints: [
        {
          id: `sh-tpl-${sc.localName}`,
          description: `${sc.labelZh}唯一编码必填`,
          propertyIri: `${ws.namespaceIri}code`,
          propertyLocalName: "code",
          minCount: 1,
          severity: "Violation",
        },
      ],
    }));

  const nextClasses = [...cur.classesJson, ...additions];
  const nextProps: OntologyProperty[] = cur.propertiesJson;
  const rendered = renderWorkspaceTurtle(ws.namespaceIri, nextClasses, nextProps);
  const tempRev = `tpl-${Date.now()}`;
  syncRevisionToGraphStore(workspaceId, tempRev, ws.namespaceIri, nextClasses, nextProps);
  const { shortRev, sha256 } = graphStore.computeCanonicalGraphHash([
    tboxGraphUri(workspaceId, tempRev),
    shaclGraphUri(workspaceId, tempRev),
  ]);
  graphStore.clearNamedGraph(tboxGraphUri(workspaceId, tempRev));
  graphStore.clearNamedGraph(shaclGraphUri(workspaceId, tempRev));
  syncRevisionToGraphStore(workspaceId, shortRev, ws.namespaceIri, nextClasses, nextProps);

  const eventId = `aud-tpl-${Date.now()}-${randomUUID().slice(0, 6)}`;
  await txDb.insert(ontologyRevisions).values({
    id: `rev-${workspaceId}-${shortRev}-${Date.now()}`,
    tenantId,
    workspaceId,
    revisionCode: shortRev,
    parentRevisionCode: cur.revisionCode,
    sha256Hash: sha256,
    classesJson: nextClasses,
    propertiesJson: nextProps,
    diffItemsJson: [{ changeType: "ADDED", summary: `安装行业模板包「${pack.name}」（+${additions.length} 类）` }],
    backwardCompatible: true,
    turtleSource: rendered.combinedTurtle,
    tboxGraphUri: tboxGraphUri(workspaceId, shortRev),
    shaclGraphUri: shaclGraphUri(workspaceId, shortRev),
    createdBy: actorDisplay,
  });
  await txDb.update(workspaces).set({ activeRevisionId: shortRev, updatedAt: new Date() }).where(eq(workspaces.id, workspaceId));
  await txDb.insert(auditEvents).values({
    id: eventId,
    tenantId,
    workspaceId,
    category: "ONTOLOGY_CHANGE",
    categoryLabel: "安装行业本体包",
    actorDisplay,
    summary: `一键安装「${pack.name}」(${pack.standardRef}) → 新增 ${additions.length} 个标准类 (rev:${shortRev})`,
    occurredAt: nowStr(),
  });
  await appendAuditChainEntry(txDb, tenantId, workspaceId, eventId, actorDisplay, `安装行业本体包 ${pack.name} → rev:${shortRev}`);

  const saved = await loadRuntimeKv<{ installedIds: string[] }>(tenantId, INSTALLED_NS, workspaceId);
  const installedIds = [...new Set([...(saved?.installedIds ?? []), pack.id])];
  await saveRuntimeKv(tenantId, INSTALLED_NS, workspaceId, { installedIds });

  return {
    ok: true,
    revisionCode: shortRev,
    addedCount: additions.length,
    message: `已成功安装「${pack.name}」并合入当前本体（新增 ${additions.length} 个标准类，修订 rev:${shortRev}）`,
  };
}
