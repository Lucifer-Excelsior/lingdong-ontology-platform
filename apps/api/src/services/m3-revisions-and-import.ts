import { and, desc, eq } from "drizzle-orm";
import type {
  OntologyWorkspaceSnapshot,
  RevisionSummary,
  SemanticDiffItem,
} from "@lingdong/contracts";
import {
  computeSemanticDiff,
  shaclGraphUri,
  tboxGraphUri,
} from "@lingdong/semantic-core";
import type { AppDb } from "../db/client.js";
import { auditEvents, changesets, ontologyRevisions, workspaces } from "../db/schema.js";
import { syncRevisionToGraphStore } from "../graph-runtime.js";
import { getOntologySnapshot } from "./ontology-service.js";

export { importRdfWithConflictPrecheck } from "./m3-rdf-import-service.js";

export async function listWorkspaceRevisions(
  txDb: AppDb,
  workspaceId: string
): Promise<RevisionSummary[]> {
  const rows = await txDb
    .select()
    .from(ontologyRevisions)
    .where(eq(ontologyRevisions.workspaceId, workspaceId))
    .orderBy(desc(ontologyRevisions.createdAt));

  return rows.map((r) => ({
    revisionCode: r.revisionCode,
    parentRevisionCode: r.parentRevisionCode,
    sha256Hash: r.sha256Hash,
    classCount: r.classesJson.length,
    propertyCount: r.propertiesJson.length,
    backwardCompatible: r.backwardCompatible,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString().slice(0, 16).replace("T", " "),
  }));
}

export async function diffArbitraryRevisions(
  txDb: AppDb,
  workspaceId: string,
  fromRevCode: string,
  toRevCode: string
): Promise<{
  fromRevisionId: string;
  toRevisionId: string;
  backwardCompatible: boolean;
  items: SemanticDiffItem[];
}> {
  const rows = await txDb
    .select()
    .from(ontologyRevisions)
    .where(eq(ontologyRevisions.workspaceId, workspaceId));

  const fromRev = rows.find((r) => r.revisionCode === fromRevCode) ?? rows[rows.length - 1];
  const toRev = rows.find((r) => r.revisionCode === toRevCode) ?? rows[0];
  if (!fromRev || !toRev) {
    return { fromRevisionId: fromRevCode, toRevisionId: toRevCode, backwardCompatible: true, items: [] };
  }

  const diff = computeSemanticDiff(
    fromRev.classesJson,
    fromRev.propertiesJson,
    toRev.classesJson,
    toRev.propertiesJson
  );

  return {
    fromRevisionId: fromRev.revisionCode,
    toRevisionId: toRev.revisionCode,
    backwardCompatible: diff.backwardCompatible,
    items: diff.items,
  };
}

export async function rollbackWorkspaceToRevision(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  targetRevisionCode: string,
  actorDisplay: string
): Promise<{ revisionId: string; snapshot: OntologyWorkspaceSnapshot; message: string }> {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");

  const [targetRev] = await txDb
    .select()
    .from(ontologyRevisions)
    .where(
      and(
        eq(ontologyRevisions.workspaceId, workspaceId),
        eq(ontologyRevisions.revisionCode, targetRevisionCode)
      )
    );
  if (!targetRev) throw new Error(`未找到目标历史修订 ${targetRevisionCode}`);

  const [currentRev] = await txDb
    .select()
    .from(ontologyRevisions)
    .where(
      and(
        eq(ontologyRevisions.workspaceId, workspaceId),
        eq(ontologyRevisions.revisionCode, ws.activeRevisionId)
      )
    );

  const rollbackRevCode = `rb${targetRev.sha256Hash.slice(0, 4)}${Date.now().toString(36).slice(-2)}`;
  const rendered = syncRevisionToGraphStore(
    workspaceId,
    rollbackRevCode,
    ws.namespaceIri,
    targetRev.classesJson,
    targetRev.propertiesJson
  );

  const diff = currentRev
    ? computeSemanticDiff(
        currentRev.classesJson,
        currentRev.propertiesJson,
        targetRev.classesJson,
        targetRev.propertiesJson
      )
    : { backwardCompatible: true, items: [] };

  await txDb.insert(ontologyRevisions).values({
    id: `rev-rb-${workspaceId}-${Date.now()}`,
    tenantId,
    workspaceId,
    revisionCode: rollbackRevCode,
    parentRevisionCode: ws.activeRevisionId,
    sha256Hash: targetRev.sha256Hash,
    classesJson: targetRev.classesJson,
    propertiesJson: targetRev.propertiesJson,
    diffItemsJson: [
      { changeType: "MODIFIED", summary: `~ 前滚恢复至历史修订基线 rev:${targetRevisionCode}` },
      ...diff.items,
    ],
    backwardCompatible: diff.backwardCompatible,
    turtleSource: rendered.combinedTurtle,
    tboxGraphUri: tboxGraphUri(workspaceId, rollbackRevCode),
    shaclGraphUri: shaclGraphUri(workspaceId, rollbackRevCode),
    createdBy: `${actorDisplay} [时光机回滚]`,
  });

  await txDb
    .update(workspaces)
    .set({ activeRevisionId: rollbackRevCode, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  await txDb
    .update(changesets)
    .set({ baseRevisionCode: rollbackRevCode, updatedAt: new Date() })
    .where(and(eq(changesets.workspaceId, workspaceId), eq(changesets.status, "OPEN")));

  await txDb.insert(auditEvents).values({
    id: `aud-rb-${Date.now()}`,
    tenantId,
    workspaceId,
    category: "ONTOLOGY_CHANGE",
    categoryLabel: "历史修订恢复",
    actorDisplay,
    summary: `将空间本体恢复至历史修订 rev:${targetRevisionCode} → 生成前滚修订 rev:${rollbackRevCode}`,
    occurredAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  });

  const snapshot = await getOntologySnapshot(txDb, workspaceId);
  return {
    revisionId: rollbackRevCode,
    snapshot,
    message: `已无损恢复至历史修订 ${targetRevisionCode}，生成新审计修订 rev:${rollbackRevCode}`,
  };
}
