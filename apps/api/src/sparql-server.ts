import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { SemanticGraphStore } from "@lingdong/semantic-core";

const port = Number(process.env.SPARQL_SERVER_PORT ?? 7878);
const storePath = process.env.SPARQL_SERVER_STORE_PATH ?? resolve(process.cwd(), ".data/shared-oxigraph-ha.nq");
const sharedStore = new SemanticGraphStore(storePath);

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, mode: "standalone_sparql_1_1_gsp", port }));

app.post("/query", async (c) => {
  const sparql = (await c.req.text()).trim();
  if (!sparql) return c.json({ error: "Empty SPARQL query" }, 400);
  try {
    const raw = sharedStore.store.query(sparql);
    if (typeof raw === "boolean") {
      return c.json({ head: {}, boolean: raw });
    }
    const vars = new Set<string>();
    const bindings: Array<Record<string, { type: string; value: string }>> = [];
    for (const row of raw as Iterable<Map<string, { termType: string; value: string }>>) {
      const item: Record<string, { type: string; value: string }> = {};
      for (const [k, term] of row.entries()) {
        vars.add(k);
        item[k] = { type: term.termType === "NamedNode" ? "uri" : "literal", value: term.value };
      }
      bindings.push(item);
    }
    return c.json({ head: { vars: [...vars] }, results: { bindings } });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "SPARQL query failed" }, 400);
  }
});

app.put("/store", async (c) => {
  const graphUri = c.req.query("graph");
  if (!graphUri) return c.json({ error: "Missing ?graph= parameter" }, 400);
  const turtle = await c.req.text();
  const count = sharedStore.loadTurtleIntoGraph(turtle, graphUri, true, true);
  return c.json({ ok: true, graphUri, quadsLoaded: count });
});

serve({ fetch: app.fetch, hostname: "0.0.0.0", port }, (info) => {
  console.log(`✓ Standalone Shared Oxigraph SPARQL 1.1 GSP Server listening on http://0.0.0.0:${info.port}`);
});
