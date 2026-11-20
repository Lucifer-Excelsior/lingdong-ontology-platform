import { eq } from "drizzle-orm";
import type { Role } from "@lingdong/contracts";
import type { AppDb } from "../db/client.js";
import { loadRuntimeKv, saveRuntimeKv } from "../db/runtime-kv.js";
import { ontologyRevisions, users, workspaces } from "../db/schema.js";
import { appendAuditChainEntry } from "../security/audit-chain-service.js";
import { syncRevisionToGraphStore } from "../graph-runtime.js";

export interface OrgUnitNode {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  level: "GROUP_HQ" | "SUB_GROUP" | "SUBSIDIARY" | "DEPARTMENT";
  workspaceIds: string[];
  memberCount: number;
}

export interface FederatedBindingRecord {
  childWorkspaceId: string;
  parentWorkspaceId: string;
  parentWorkspaceName: string;
  inheritedRevisionCode: string;
  overridePolicy: "STRICT_READONLY_CORE" | "ALLOW_LOCAL_EXTENSION";
  syncedAt: string;
  syncedBy: string;
}

export interface FederationDiffItem {
  classLocalName: string;
  labelZh: string;
  status: "INHERITED_OK" | "LOCAL_EXTENSION" | "OVERRIDE_CONFLICT" | "UPSTREAM_NEW";
  detail: string;
}

const ORG_NS = "v6_org_units";
const FED_NS = "v6_federation_binding";
const nowStr = () => new Date().toISOString().slice(0, 16).replace("T", " ");

function defaultOrgTree(): OrgUnitNode[] {
  return [
    {
      id: "org-hq",
      parentId: null,
      code: "CAICT-HQ",
      name: "中国信息通信研究院 · 集团总部",
      level: "GROUP_HQ",
      workspaceIds: ["ws-itu"],
      memberCount: 24,
    },
    {
      id: "org-digital",
      parentId: "org-hq",
      code: "CAICT-DIGI",
      name: "政企数字化子集团",
      level: "SUB_GROUP",
      workspaceIds: ["ws-contract"],
      memberCount: 68,
    },
    {
      id: "org-supply",
      parentId: "org-hq",
      code: "CAICT-SCM",
      name: "供应链与智造子公司",
      level: "SUBSIDIARY",
      workspaceIds: ["ws-supply"],
      memberCount: 42,
    },
  ];
}

export async function listOrgUnits(tenantId: string): Promise<OrgUnitNode[]> {
  const saved = await loadRuntimeKv<{ units: OrgUnitNode[] }>(tenantId, ORG_NS, "tree");
  return saved?.units ?? defaultOrgTree();
}

export async function createOrgUnit(
  tenantId: string,
  input: { parentId: string | null; code: string; name: string; level: OrgUnitNode["level"]; workspaceIds?: string[] }
): Promise<{ unit: OrgUnitNode; units: OrgUnitNode[] }> {
  const existing = await listOrgUnits(tenantId);
  const unit: OrgUnitNode = {
    id: `org-${Date.now()}`,
    parentId: input.parentId,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    level: input.level,
    workspaceIds: input.workspaceIds ?? [],
    memberCount: 1,
  };
  const next = [...existing, unit];
  await saveRuntimeKv(tenantId, ORG_NS, "tree", { units: next });
  return { unit, units: next };
}

export async function syncScimUsersBatch(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  actorDisplay: string,
  scimUsers: Array<{ externalId?: string; userName: string; displayName: string; title?: string; role?: Role }>
): Promise<{ syncedCount: number; createdIds: string[]; message: string }> {
  const createdIds: string[] = [];
  for (const u of scimUsers) {
    const id = `user-scim-${u.userName.toLowerCase().replace(/[^a-z0-9_-]/g, "")}`;
    const role: Role = u.role ?? "VIEWER";
    const existing = await txDb.select().from(users).where(eq(users.id, id)).limit(1);
    if (existing.length === 0) {
      await txDb.insert(users).values({
        id,
        tenantId,
        name: u.displayName || u.userName,
        title: u.title || "SCIM 同步成员",
        defaultRole: role,
      });
      createdIds.push(id);
    } else {
      await txDb
        .update(users)
        .set({ name: u.displayName || u.userName, title: u.title || existing[0].title, defaultRole: role })
        .where(eq(users.id, id));
    }
  }
  await appendAuditChainEntry(
    txDb,
    tenantId,
    workspaceId,
    `scim-${Date.now()}`,
    actorDisplay,
    `SCIM 2.0 组织同步完成：处理 ${scimUsers.length} 名成员（新增 ${createdIds.length} 人）`
  );
  return {
    syncedCount: scimUsers.length,
    createdIds,
    message: `SCIM 2.0 组织架构同步完成：共处理 ${scimUsers.length} 名成员（新增 ${createdIds.length} 人）`,
  };
}

export async function getFederationState(
  txDb: AppDb,
  tenantId: string,
  childWorkspaceId: string
): Promise<{
  binding: FederatedBindingRecord | null;
  items: FederationDiffItem[];
  conflictCount: number;
  upstreamNewCount: number;
}> {
  const saved = await loadRuntimeKv<FederatedBindingRecord>(tenantId, FED_NS, childWorkspaceId);
  if (!saved) {
    return { binding: null, items: [], conflictCount: 0, upstreamNewCount: 0 };
  }

  const allWs = await txDb.select().from(workspaces);
  const parentWs = allWs.find((w) => w.id === saved.parentWorkspaceId);
  const childWs = allWs.find((w) => w.id === childWorkspaceId);
  if (!parentWs || !childWs) {
    return { binding: saved, items: [], conflictCount: 0, upstreamNewCount: 0 };
  }

  const allRevs = await txDb.select().from(ontologyRevisions);
  const pRev = allRevs.find((r) => r.workspaceId === parentWs.id && r.revisionCode === parentWs.activeRevisionId);
  const cRev = allRevs.find((r) => r.workspaceId === childWs.id && r.revisionCode === childWs.activeRevisionId);

  const pClasses = pRev?.classesJson ?? [];
  const cClasses = cRev?.classesJson ?? [];
  const cMap = new Map(cClasses.map((c) => [c.localName, c]));
  const pMap = new Map(pClasses.map((c) => [c.localName, c]));

  const items: FederationDiffItem[] = [];
  for (const pc of pClasses) {
    const cc = cMap.get(pc.localName);
    if (!cc) {
      items.push({
        classLocalName: pc.localName,
        labelZh: pc.labelZh,
        status: "UPSTREAM_NEW",
        detail: `集团核心基线类 ont:${pc.localName} 尚未拉入子空间`,
      });
    } else if (cc.subClassOf !== pc.subClassOf && saved.overridePolicy === "STRICT_READONLY_CORE") {
      items.push({
        classLocalName: pc.localName,
        labelZh: pc.labelZh,
        status: "OVERRIDE_CONFLICT",
        detail: `子类修改了受保护的集团核心继承关系（集团：${pc.subClassOf} vs 子公司：${cc.subClassOf}）`,
      });
    } else {
      items.push({
        classLocalName: pc.localName,
        labelZh: pc.labelZh,
        status: "INHERITED_OK",
        detail: `已严格对齐集团核心基线 (${parentWs.name})`,
      });
    }
  }
  for (const cc of cClasses) {
    if (!pMap.has(cc.localName)) {
      items.push({
        classLocalName: cc.localName,
        labelZh: cc.labelZh,
        status: "LOCAL_EXTENSION",
        detail: "子公司合法本地扩展类（不影响集团主干）",
      });
    }
  }

  return {
    binding: saved,
    items,
    conflictCount: items.filter((i) => i.status === "OVERRIDE_CONFLICT").length,
    upstreamNewCount: items.filter((i) => i.status === "UPSTREAM_NEW").length,
  };
}

export async function bindAndSyncFederatedParent(
  txDb: AppDb,
  tenantId: string,
  childWorkspaceId: string,
  parentWorkspaceId: string,
  overridePolicy: FederatedBindingRecord["overridePolicy"],
  actorDisplay: string,
  pullUpstreamClasses = false
) {
  if (childWorkspaceId === parentWorkspaceId) {
    throw new Error("联邦继承校验失败：工作空间不能将自身绑定为集团父本体");
  }
  const allWs = await txDb.select().from(workspaces);
  const parentWs = allWs.find((w) => w.id === parentWorkspaceId);
  const childWs = allWs.find((w) => w.id === childWorkspaceId);
  if (!parentWs || !childWs) throw new Error("未找到父/子工作空间");

  const binding: FederatedBindingRecord = {
    childWorkspaceId,
    parentWorkspaceId,
    parentWorkspaceName: parentWs.name,
    inheritedRevisionCode: parentWs.activeRevisionId,
    overridePolicy,
    syncedAt: nowStr(),
    syncedBy: actorDisplay,
  };
  await saveRuntimeKv(tenantId, FED_NS, childWorkspaceId, binding as unknown as Record<string, unknown>);

  let pulledCount = 0;
  if (pullUpstreamClasses) {
    const allRevs = await txDb.select().from(ontologyRevisions);
    const pRev = allRevs.find((r) => r.workspaceId === parentWs.id && r.revisionCode === parentWs.activeRevisionId);
    const cRev = allRevs.find((r) => r.workspaceId === childWs.id && r.revisionCode === childWs.activeRevisionId);
    if (pRev && cRev) {
      const existingNames = new Set(cRev.classesJson.map((c) => c.localName));
      const additions = pRev.classesJson.filter((c) => !existingNames.has(c.localName));
      if (additions.length > 0) {
        const nextClasses = [...cRev.classesJson, ...additions];
        syncRevisionToGraphStore(childWorkspaceId, cRev.revisionCode, childWs.namespaceIri, nextClasses, cRev.propertiesJson);
        await txDb
          .update(ontologyRevisions)
          .set({ classesJson: nextClasses })
          .where(eq(ontologyRevisions.id, cRev.id));
        pulledCount = additions.length;
      }
    }
  }

  await appendAuditChainEntry(
    txDb,
    tenantId,
    childWorkspaceId,
    `fed-${Date.now()}`,
    actorDisplay,
    `联邦继承绑定 ${parentWs.name} (rev:${parentWs.activeRevisionId}) → ${childWs.name}，拉取上游核心类 ${pulledCount} 个`
  );

  const state = await getFederationState(txDb, tenantId, childWorkspaceId);
  return { ...state, pulledCount, message: `已完成集团联邦绑定（上游：${parentWs.name}，同步新增核心类 ${pulledCount} 个）` };
}
