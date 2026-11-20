import { and, eq } from "drizzle-orm";
import type { ChangeSetProposal, RdfImportPrecheckResult } from "@lingdong/contracts";
import { parseRdfIntoOntologyEntities } from "@lingdong/semantic-core";
import type { AppDb } from "../db/client.js";
import { changesets, ontologyRevisions, workspaces } from "../db/schema.js";
import { commitChangeSet } from "./ontology-service.js";

export async function importRdfWithConflictPrecheck(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  actorDisplay: string,
  params: { filename: string; content: string; commitImmediately?: boolean }
): Promise<RdfImportPrecheckResult> {
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

  const parsed = parseRdfIntoOntologyEntities(
    params.content,
    params.filename,
    ws.namespaceIri,
    rev.classesJson,
    rev.propertiesJson
  );

  const existingClassSet = new Set(rev.classesJson.map((c) => c.localName));
  const existingPropSet = new Set(rev.propertiesJson.map((p) => p.localName));

  const newProposals: ChangeSetProposal[] = [];
  for (const cls of parsed.classes) {
    if (!existingClassSet.has(cls.localName)) {
      newProposals.push({
        id: `prop-rdf-cls-${cls.localName}-${Date.now()}`,
        workspaceId,
        kind: "ADD_CLASS",
        title: `导入本体类：${cls.labelZh} (${cls.localName})`,
        localName: cls.localName,
        targetClassLocalName: cls.subClassOf.split("#").pop() ?? "BusinessEntity",
        rangeOrDatatype: "owl:Class",
        evidenceAnchor: `RDF导入:${params.filename}`,
        rationale: cls.description,
        confidence: "STRONG",
        selectedByDefault: true,
        status: "PENDING",
      });
    }
    const existingCls = rev.classesJson.find((c) => c.localName === cls.localName);
    const existingShaclProps = new Set(existingCls?.shaclConstraints.map((s) => s.propertyLocalName) ?? []);
    for (const sc of cls.shaclConstraints) {
      if (existingShaclProps.has(sc.propertyLocalName)) continue;
      newProposals.push({
        id: `prop-rdf-sh-${cls.localName}-${sc.propertyLocalName}-${Date.now()}`,
        workspaceId,
        kind: "ADD_SHACL_CONSTRAINT",
        title: `导入 SHACL 约束：${cls.localName}.${sc.propertyLocalName}`,
        localName: sc.propertyLocalName,
        targetClassLocalName: cls.localName,
        rangeOrDatatype: sc.datatype ?? "xsd:decimal",
        minInclusive: sc.minInclusive,
        evidenceAnchor: `RDF导入:${params.filename}`,
        rationale: sc.description,
        confidence: "STRONG",
        selectedByDefault: true,
        status: "PENDING",
      });
    }
  }

  for (const prop of parsed.properties) {
    if (existingPropSet.has(prop.localName)) continue;
    newProposals.push({
      id: `prop-rdf-prop-${prop.localName}-${Date.now()}`,
      workspaceId,
      kind: prop.kind === "ObjectProperty" ? "ADD_OBJECT_PROPERTY" : "ADD_DATATYPE_PROPERTY",
      title: `导入${prop.kind === "ObjectProperty" ? "对象关系" : "数据属性"}：${prop.labelZh} (${prop.localName})`,
      localName: prop.localName,
      targetClassLocalName: prop.domainLocalName,
      rangeOrDatatype: prop.rangeLocalName,
      evidenceAnchor: `RDF导入:${params.filename}`,
      rationale: `自 ${parsed.formatLabel} 文件 ${params.filename} 解析导入`,
      confidence: "STRONG",
      selectedByDefault: true,
      status: "PENDING",
    });
  }

  let committed = false;
  let finalRevId = ws.activeRevisionId;

  if (newProposals.length > 0) {
    const [openCs] = await txDb
      .select()
      .from(changesets)
      .where(and(eq(changesets.workspaceId, workspaceId), eq(changesets.status, "OPEN")));

    if (openCs) {
      await txDb
        .update(changesets)
        .set({
          baseRevisionCode: ws.activeRevisionId,
          proposalsJson: [...newProposals, ...openCs.proposalsJson],
          updatedAt: new Date(),
        })
        .where(eq(changesets.id, openCs.id));
    } else {
      await txDb.insert(changesets).values({
        id: `cs-rdf-${Date.now()}`,
        tenantId,
        workspaceId,
        baseRevisionCode: ws.activeRevisionId,
        proposalsJson: newProposals,
        status: "OPEN",
      });
    }

    if (params.commitImmediately) {
      const commitRes = await commitChangeSet(
        txDb,
        tenantId,
        workspaceId,
        ws.activeRevisionId,
        newProposals.map((p) => p.id),
        `${actorDisplay} [RDF导入]`
      );
      committed = true;
      finalRevId = commitRes.revisionId;
    }
  }

  return {
    formatDetected: parsed.formatLabel,
    parsedTriples: parsed.parsedTriples,
    discoveredClasses: parsed.classes.map((c) => ({
      localName: c.localName,
      labelZh: c.labelZh,
      iri: c.iri,
      subClassOf: c.subClassOf,
    })),
    discoveredProperties: parsed.properties.map((p) => ({
      localName: p.localName,
      labelZh: p.labelZh,
      kind: p.kind,
      domainLocalName: p.domainLocalName,
      rangeLocalName: p.rangeLocalName,
    })),
    conflicts: parsed.conflicts,
    proposalsQueuedCount: newProposals.length,
    committed,
    revisionId: finalRevId,
    message: committed
      ? `已完成 ${parsed.formatLabel} 解析 (${parsed.parsedTriples} 三元组) 并原子合入画布，新修订 rev:${finalRevId}`
      : `已完成 ${parsed.formatLabel} 导入预检：识别 ${parsed.classes.length} 个类、${parsed.properties.length} 个属性，已生成 ${newProposals.length} 项待审 ChangeSet 提案`,
  };
}
