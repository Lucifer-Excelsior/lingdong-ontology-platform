import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { adminSql, appSql, sandboxErpSql } from "./db/client.js";
import { graphStore } from "./graph-runtime.js";
import { assertProductionSecretsConfigured } from "./security/guards.js";
import { ensureSeeded } from "./seed/seed-service.js";
import { startAsyncJobLeaseSweeper } from "./services/async-job-recovery.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 8280);

async function bootstrap() {
  assertProductionSecretsConfigured();
  await ensureSeeded();
  const stopSweeper = startAsyncJobLeaseSweeper(15_000);
  const app = createApp();
  const server = serve({ fetch: app.fetch, hostname: host, port }, (info) => {
    console.log(`✓ Lingdong Ontology Studio V7.0 Enterprise Decision OS API listening on http://${host}:${info.port}`);
  });

  let shuttingDown = false;
  const shutdown = async (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Shutdown] Received ${sig}, stopping sweeper, flushing Oxigraph and closing PG pools...`);
    stopSweeper();
    server.close();
    try {
      graphStore.persistToDisk();
      await Promise.allSettled([adminSql.end({ timeout: 3 }), appSql.end({ timeout: 3 }), sandboxErpSql.end({ timeout: 3 })]);
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  console.error("Failed to bootstrap V4.6 API:", err);
  process.exit(1);
});
