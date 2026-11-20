import { Hono } from "hono";
import { withTenantDb } from "../db/client.js";
import { requireRoles, type SessionActor } from "../security/guards.js";
import {
  authorOntologyElementFromCanvas,
  saveCanvasNodePositions,
  type AuthorOntologyElementInput,
} from "../services/canvas-authoring-service.js";
import {
  diffArbitraryRevisions,
  importRdfWithConflictPrecheck,
  listWorkspaceRevisions,
  rollbackWorkspaceToRevision,
} from "../services/m3-revisions-and-import.js";
import { fuseMultiSourceEvidence } from "../services/multi-source-fusion-service.js";

type AppEnv = { Variables: { actor: SessionActor } };

export const m3OntologyRoutes = new Hono<AppEnv>();

const modelerGuard = requireRoles("OWNER", "MODELER");

m3OntologyRoutes.post("/workspaces/:id/modeling/fuse", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as {
    documentIds?: string[];
    dataSourceIds?: string[];
    selectedTables?: string[];
    instruction?: string;
    autoGenerateMappings?: boolean;
  };
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await fuseMultiSourceEvidence(txDb, actor.tenantId, workspaceId, `${actor.name} (${actor.role})`, body))
  );
});

m3OntologyRoutes.post("/workspaces/:id/ontology/layout", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json()) as { positions: Record<string, { x: number; y: number }> };
  return withTenantDb(actor.tenantId, (txDb) =>
    saveCanvasNodePositions(txDb, c.req.param("id"), body.positions ?? {}).then((r) => c.json(r))
  );
});

m3OntologyRoutes.post("/workspaces/:id/ontology/author", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json()) as AuthorOntologyElementInput;
  return withTenantDb(actor.tenantId, (txDb) =>
    authorOntologyElementFromCanvas(txDb, actor.tenantId, c.req.param("id"), `${actor.name} (${actor.role})`, body).then((r) => c.json(r))
  );
});

m3OntologyRoutes.post("/workspaces/:id/ontology/import-rdf", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const actorDisplay = `${actor.name} (${actor.role})`;
  const contentType = c.req.header("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await c.req.parseBody();
      const uploaded = form["file"];
      const file = uploaded instanceof File ? uploaded : null;
      const filename =
        file?.name ?? (typeof form["filename"] === "string" ? form["filename"] : "imported.ttl");
      const content = file
        ? await file.text()
        : typeof form["content"] === "string"
          ? form["content"]
          : "";
      const commitImmediately = String(form["commitImmediately"] ?? "false") === "true";

      return await withTenantDb(actor.tenantId, async (txDb) =>
        c.json(
          await importRdfWithConflictPrecheck(txDb, actor.tenantId, workspaceId, actorDisplay, {
            filename,
            content,
            commitImmediately,
          })
        )
      );
    }

    const body = (await c.req.json()) as {
      filename?: string;
      content?: string;
      commitImmediately?: boolean;
    };
    return await withTenantDb(actor.tenantId, async (txDb) =>
      c.json(
        await importRdfWithConflictPrecheck(txDb, actor.tenantId, workspaceId, actorDisplay, {
          filename: body.filename ?? "imported.ttl",
          content: body.content ?? "",
          commitImmediately: Boolean(body.commitImmediately),
        })
      )
    );
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "RDF 导入解析失败" }, 400);
  }
});

m3OntologyRoutes.get("/workspaces/:id/ontology/revisions", async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json({ revisions: await listWorkspaceRevisions(txDb, workspaceId) })
  );
});

m3OntologyRoutes.get("/workspaces/:id/ontology/diff", async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";
  return withTenantDb(actor.tenantId, async (txDb) =>
    c.json(await diffArbitraryRevisions(txDb, workspaceId, from, to))
  );
});

m3OntologyRoutes.post("/workspaces/:id/ontology/rollback", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const body = (await c.req.json()) as { targetRevisionCode?: string };
  if (!body.targetRevisionCode) {
    return c.json({ error: "缺少目标历史修订号 targetRevisionCode" }, 400);
  }
  try {
    return await withTenantDb(actor.tenantId, async (txDb) =>
      c.json(
        await rollbackWorkspaceToRevision(
          txDb,
          actor.tenantId,
          workspaceId,
          body.targetRevisionCode!,
          `${actor.name} (${actor.role})`
        )
      )
    );
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "历史修订回滚失败" }, 400);
  }
});
