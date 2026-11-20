import { and, eq } from "drizzle-orm";
import type { ChangeSetProposal, OntologyWorkspaceSnapshot } from "@lingdong/contracts";
import type { AppDb } from "../db/client.js";
import { changesets, ontologyRevisions, workspaces } from "../db/schema.js";
import { commitChangeSet, getOntologySnapshot } from "./ontology-service.js";

export async function saveCanvasNodePositions(
  txDb: AppDb,
  workspaceId: string,
  positions: Record<string, { x: number; y: number }>
): Promise<{ updatedCount: number }> {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");

  const [rev] = await txDb
    .select()
    .from(ontologyRevisions)
    .where(
      and(
        eq(ontologyRevisions.workspaceId, workspaceId),
        eq(ontologyRevisions.revisionCode, ws.activeRevisionId)
      )
    );
  if (!rev) throw new Error("未找到活跃本体修订");

  let updatedCount = 0;
  const nextClasses = rev.classesJson.map((cls) => {
    const pos = positions[cls.localName];
    if (!pos) return cls;
    updatedCount += 1;
    return {
      ...cls,
      positionX: Math.round(pos.x),
      positionY: Math.round(pos.y),
    };
  });

  if (updatedCount > 0) {
    await txDb
      .update(ontologyRevisions)
      .set({ classesJson: nextClasses })
      .where(eq(ontologyRevisions.id, rev.id));
  }

  return { updatedCount };
}

export interface AuthorOntologyElementInput {
  kind: "ADD_OBJECT_PROPERTY" | "ADD_DATATYPE_PROPERTY" | "ADD_SHACL_CONSTRAINT";
  labelZh: string;
  localName: string;
  sourceClassLocalName: string;
  targetOrDatatype: string;
  minInclusive?: number;
  commitImmediately?: boolean;
}

export async function authorOntologyElementFromCanvas(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  actorDisplay: string,
  input: AuthorOntologyElementInput
): Promise<{
  committed: boolean;
  revisionId: string;
  snapshot: OntologyWorkspaceSnapshot;
  message: string;
}> {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");

  const cleanLocal = input.localName.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(cleanLocal)) {
    throw new Error("标识符需以英文字母开头，仅含字母、数字或下划线");
  }

  const proposalId = `prop-canvas-${Date.now()}`;
  const titlePrefix =
    input.kind === "ADD_OBJECT_PROPERTY"
      ? "对象关系"
      : input.kind === "ADD_DATATYPE_PROPERTY"
        ? "数据属性"
        : "SHACL 形状约束";

  const newProposal: ChangeSetProposal = {
    id: proposalId,
    workspaceId,
    kind: input.kind,
    title: `${titlePrefix}：${input.labelZh.trim()} (${cleanLocal})`,
    localName: cleanLocal,
    targetClassLocalName: input.sourceClassLocalName,
    rangeOrDatatype:
      input.kind === "ADD_OBJECT_PROPERTY"
        ? `ont:${input.targetOrDatatype.replace(/^ont:/, "")}`
        : input.targetOrDatatype,
    minInclusive: input.minInclusive,
    evidenceAnchor: "专家画布直觉交互建模",
    rationale:
      input.kind === "ADD_OBJECT_PROPERTY"
        ? `画布连线 ont:${input.sourceClassLocalName} → ont:${input.targetOrDatatype.replace(/^ont:/, "")}`
        : `${input.labelZh.trim()}（所属类 ont:${input.sourceClassLocalName}）`,
    confidence: "STRONG",
    selectedByDefault: true,
    status: "PENDING",
  };

  const [openCs] = await txDb
    .select()
    .from(changesets)
    .where(and(eq(changesets.workspaceId, workspaceId), eq(changesets.status, "OPEN")));

  if (openCs) {
    await txDb
      .update(changesets)
      .set({
        baseRevisionCode: ws.activeRevisionId,
        proposalsJson: [newProposal, ...openCs.proposalsJson],
        updatedAt: new Date(),
      })
      .where(eq(changesets.id, openCs.id));
  } else {
    await txDb.insert(changesets).values({
      id: `cs-${Date.now()}`,
      tenantId,
      workspaceId,
      baseRevisionCode: ws.activeRevisionId,
      proposalsJson: [newProposal],
      status: "OPEN",
    });
  }

  if (input.commitImmediately) {
    const committed = await commitChangeSet(
      txDb,
      tenantId,
      workspaceId,
      ws.activeRevisionId,
      [proposalId],
      actorDisplay
    );
    return {
      committed: true,
      revisionId: committed.revisionId,
      snapshot: committed.snapshot,
      message: `已原子合入画布并生成新修订 rev:${committed.revisionId}`,
    };
  }

  const snapshot = await getOntologySnapshot(txDb, workspaceId);
  return {
    committed: false,
    revisionId: ws.activeRevisionId,
    snapshot,
    message: `已将「${input.labelZh} (${cleanLocal})」加入顶栏待审 ChangeSet 队列`,
  };
}
