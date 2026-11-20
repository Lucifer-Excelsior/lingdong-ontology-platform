import { eq } from "drizzle-orm";
import { analyzeExternalOntologyImport, renderWorkspaceJsonLd } from "@lingdong/semantic-core";
import type { AppDb } from "../db/client.js";
import { ontologyRevisions, workspaces } from "../db/schema.js";
import { getOntologyImportsAndRefs } from "./std-requirements-lifecycle-service.js";

export async function exportWorkspaceJsonLd(txDb: AppDb, tenantId: string, workspaceId: string) {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");
  const revs = await txDb.select().from(ontologyRevisions).where(eq(ontologyRevisions.workspaceId, workspaceId));
  const cur = revs.find((r) => r.revisionCode === ws.activeRevisionId) ?? revs[0];
  const refs = await getOntologyImportsAndRefs(tenantId, workspaceId);
  return renderWorkspaceJsonLd({
    workspaceName: ws.name,
    namespaceIri: ws.namespaceIri,
    version: ws.versionLabel,
    imports: refs.map((r) => r.iri),
    classes: cur?.classesJson ?? [],
    properties: cur?.propertiesJson ?? [],
  });
}

export async function analyzeExternalImportForWorkspace(
  txDb: AppDb,
  workspaceId: string,
  rdfText: string,
  fileName: string
) {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  const revs = await txDb.select().from(ontologyRevisions).where(eq(ontologyRevisions.workspaceId, workspaceId));
  const cur = revs.find((r) => r.revisionCode === ws?.activeRevisionId) ?? revs[0];
  return analyzeExternalOntologyImport(rdfText, fileName, cur?.classesJson ?? [], cur?.propertiesJson ?? []);
}
