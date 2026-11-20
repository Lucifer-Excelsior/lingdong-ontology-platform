import { and, eq } from "drizzle-orm";
import type {
  OntologyClass,
  OntologyProperty,
  OntologyWorkspaceSnapshot,
} from "@lingdong/contracts";
import {
  computeSemanticDiff,
  inferImplicitSemanticRelations,
  RDF_NS,
  shaclGraphUri,
  tboxGraphUri,
} from "@lingdong/semantic-core";
import type { AppDb } from "../db/client.js";
import {
  auditEvents,
  changesets,
  documents,
  ontologyRevisions,
  workspaces,
} from "../db/schema.js";
import { graphStore, syncRevisionToGraphStore } from "../graph-runtime.js";
import { REUSABLE_ASSETS } from "../seed/itu-and-supply-seed-data.js";
import { listModelingDataSources } from "./modeling-metadata-loader.js";

export { quickCreateAsset, uploadAndChunkDocument } from "./asset-creation-service.js";

const workspaceLocks = new Map<string, Promise<unknown>>();

async function withWorkspaceLock<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
  const prev = workspaceLocks.get(workspaceId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((res) => {
    release = res;
  });
  workspaceLocks.set(workspaceId, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

export class OptimisticLockConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptimisticLockConflictError";
  }
}

export async function getOntologySnapshot(
  txDb: AppDb,
  workspaceId: string
): Promise<OntologyWorkspaceSnapshot> {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到指定方案空间");

  const [rev] = await txDb
    .select()
    .from(ontologyRevisions)
    .where(
      and(
        eq(ontologyRevisions.workspaceId, workspaceId),
        eq(ontologyRevisions.revisionCode, ws.activeRevisionId)
      )
    );
  if (!rev) throw new Error("未找到当前活跃本体修订");

  syncRevisionToGraphStore(workspaceId, rev.revisionCode, ws.namespaceIri, rev.classesJson, rev.propertiesJson);

  const [openCs] = await txDb
    .select()
    .from(changesets)
    .where(and(eq(changesets.workspaceId, workspaceId), eq(changesets.status, "OPEN")));

  return {
    workspaceId,
    revisionId: rev.revisionCode,
    previousRevisionId: rev.parentRevisionCode,
    backwardCompatible: rev.backwardCompatible,
    consistent: true,
    classes: rev.classesJson,
    properties: rev.propertiesJson,
    inferredRelations: inferImplicitSemanticRelations(rev.classesJson, rev.propertiesJson),
    turtleSource: rev.turtleSource,
    diffItems: rev.diffItemsJson,
    pendingProposals: (openCs?.proposalsJson ?? []).filter((p) => p.status === "PENDING"),
  };
}

export async function getModelingWorkspace(txDb: AppDb, workspaceId: string) {
  const docRows = await txDb
    .select()
    .from(documents)
    .where(eq(documents.workspaceId, workspaceId));

  const [openCs] = await txDb
    .select()
    .from(changesets)
    .where(and(eq(changesets.workspaceId, workspaceId), eq(changesets.status, "OPEN")));

  const modelingSources = await listModelingDataSources(txDb, workspaceId);

  return {
    documents: docRows.map((d) => ({
      id: d.id,
      workspaceId: d.workspaceId,
      title: d.title,
      parserStatus: d.parserStatus,
      chunkCount: d.chunkCount,
      anchoredAxiomCount: d.anchoredAxiomCount,
      sha256Digest: d.sha256Digest,
      chunks: d.chunksJson,
    })),
    dataSources: modelingSources,
    semanticAssets: REUSABLE_ASSETS,
    pendingProposals: (openCs?.proposalsJson ?? []).filter((p) => p.status === "PENDING"),
  };
}

export async function commitChangeSet(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  baseRevisionId: string,
  proposalIds: string[],
  actorDisplay: string
): Promise<{ revisionId: string; snapshot: OntologyWorkspaceSnapshot }> {
  return withWorkspaceLock(workspaceId, async () => {
    const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (!ws) throw new Error("未找到方案空间");

    if (ws.activeRevisionId !== baseRevisionId) {
      throw new OptimisticLockConflictError(
        `ChangeSet 乐观锁冲突：期望基线修订 ${baseRevisionId}，但当前最新修订已变更为 ${ws.activeRevisionId}`
      );
    }

    const [currentRev] = await txDb
      .select()
      .from(ontologyRevisions)
      .where(
        and(
          eq(ontologyRevisions.workspaceId, workspaceId),
          eq(ontologyRevisions.revisionCode, ws.activeRevisionId)
        )
      );
    if (!currentRev) throw new Error("基线本体修订不存在");

    const [openCs] = await txDb
      .select()
      .from(changesets)
      .where(and(eq(changesets.workspaceId, workspaceId), eq(changesets.status, "OPEN")));
    if (!openCs) throw new Error("当前没有待提交的开放变更集");

    const selectedSet = new Set(proposalIds);
    const toApply = openCs.proposalsJson.filter((p) => selectedSet.has(p.id) && p.status === "PENDING");
    if (toApply.length === 0) throw new Error("请至少勾选一项待审提案进行提交");

    const nextClasses: OntologyClass[] = structuredClone(currentRev.classesJson);
    const nextProps: OntologyProperty[] = structuredClone(currentRev.propertiesJson);
    const ns = ws.namespaceIri;

    for (const prop of toApply) {
      if (prop.kind === "ADD_CLASS" && !nextClasses.some((c) => c.localName === prop.localName)) {
        nextClasses.push({
          iri: `${ns}${prop.localName}`,
          localName: prop.localName,
          labelZh: prop.title.replace(/^.*：/, ""),
          labelEn: prop.localName,
          description: prop.rationale,
          roleKind: "master",
          subClassOf: `${ns}${prop.targetClassLocalName || "BusinessEntity"}`,
          positionX: (nextClasses.length % 3) * 268 + 48,
          positionY: Math.floor(nextClasses.length / 3) * 196 + 72,
          instanceCount: 0,
          controlledActionCount: 0,
          properties: [],
          shaclConstraints: [],
          downstreamMappings: [],
          downstreamCapabilities: [],
        });
      } else if (
        (prop.kind === "ADD_DATATYPE_PROPERTY" || prop.kind === "ADD_OBJECT_PROPERTY") &&
        !nextProps.some((p) => p.localName === prop.localName)
      ) {
        const newProp: OntologyProperty = {
          iri: `${ns}${prop.localName}`,
          localName: prop.localName,
          labelZh: prop.title.replace(/^.*：/, "").replace(/\s*\(.*\)$/, ""),
          kind: prop.kind === "ADD_OBJECT_PROPERTY" ? "ObjectProperty" : "DatatypeProperty",
          domainIri: `${ns}${prop.targetClassLocalName}`,
          domainLocalName: prop.targetClassLocalName,
          rangeIri:
            prop.kind === "ADD_OBJECT_PROPERTY"
              ? `${ns}${prop.rangeOrDatatype.replace(/^ont:/, "")}`
              : `${RDF_NS.xsd}${prop.rangeOrDatatype.replace(/^xsd:/, "")}`,
          rangeLocalName: prop.rangeOrDatatype,
          characteristics: `PROV-O ${prop.evidenceAnchor}`,
          sensitiveMask: false,
        };
        nextProps.push(newProp);
        const cls = nextClasses.find((c) => c.localName === prop.targetClassLocalName);
        if (cls) cls.properties.push(newProp);
      } else if (prop.kind === "ADD_SHACL_CONSTRAINT") {
        const cls = nextClasses.find((c) => c.localName === prop.targetClassLocalName) ?? nextClasses[0];
        if (cls) {
          cls.shaclConstraints.push({
            id: `sh-${prop.localName}-${Date.now()}`,
            propertyIri: `${ns}${prop.localName}`,
            propertyLocalName: prop.localName,
            datatype: prop.rangeOrDatatype,
            minInclusive: prop.minInclusive,
            minCount: prop.minInclusive !== undefined ? undefined : 1,
            severity: "Violation",
            description: prop.rationale,
          });
        }
      }
    }

    const tempRev = `tmp-${Date.now()}`;
    const rendered = syncRevisionToGraphStore(workspaceId, tempRev, ns, nextClasses, nextProps);
    const { shortRev, sha256 } = graphStore.computeCanonicalGraphHash([
      tboxGraphUri(workspaceId, tempRev),
      shaclGraphUri(workspaceId, tempRev),
    ]);
    graphStore.clearNamedGraph(tboxGraphUri(workspaceId, tempRev));
    graphStore.clearNamedGraph(shaclGraphUri(workspaceId, tempRev));
    syncRevisionToGraphStore(workspaceId, shortRev, ns, nextClasses, nextProps);

    const diff = computeSemanticDiff(currentRev.classesJson, currentRev.propertiesJson, nextClasses, nextProps);

    await txDb.insert(ontologyRevisions).values({
      id: `rev-${workspaceId}-${shortRev}-${Date.now()}`,
      tenantId,
      workspaceId,
      revisionCode: shortRev,
      parentRevisionCode: currentRev.revisionCode,
      sha256Hash: sha256,
      classesJson: nextClasses,
      propertiesJson: nextProps,
      diffItemsJson: diff.items,
      backwardCompatible: diff.backwardCompatible,
      turtleSource: rendered.combinedTurtle,
      tboxGraphUri: tboxGraphUri(workspaceId, shortRev),
      shaclGraphUri: shaclGraphUri(workspaceId, shortRev),
      createdBy: actorDisplay,
    });

    const updatedProposals = openCs.proposalsJson.map((p) =>
      selectedSet.has(p.id) ? { ...p, status: "COMMITTED" as const } : p
    );
    await txDb
      .update(changesets)
      .set({ baseRevisionCode: shortRev, proposalsJson: updatedProposals, updatedAt: new Date() })
      .where(eq(changesets.id, openCs.id));

    await txDb
      .update(workspaces)
      .set({ activeRevisionId: shortRev, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    await txDb.insert(auditEvents).values({
      id: `aud-cs-${Date.now()}`,
      tenantId,
      workspaceId,
      category: "ONTOLOGY_CHANGE",
      categoryLabel: "语义变更提交",
      actorDisplay,
      summary: `原子提交 ${toApply.length} 项提案 → 生成不可变修订 rev:${shortRev}`,
      occurredAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    });

    const snapshot = await getOntologySnapshot(txDb, workspaceId);
    return { revisionId: shortRev, snapshot };
  });
}
