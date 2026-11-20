import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import { adminSql } from "./db/client.js";
import { ALLOWED_ORIGIN_LIST, zeroTrustAuthMiddleware, type SessionActor } from "./security/guards.js";
import { recordRequestLatency } from "./security/telemetry-and-oidc.js";
import { authenticateMcpBearerToken } from "./services/m5-mcp-protocol-service.js";
import { studioRoutes } from "./routes/studio-routes.js";
import { agentReleaseRoutes, mcpRoutes } from "./routes/agent-release-routes.js";
import { commercialRoutes } from "./routes/commercial-routes.js";
import { gaProtectedRoutes, gaPublicRoutes } from "./routes/ga-routes.js";
import { uxCrudRoutes } from "./routes/ux-crud-routes.js";
import { stdComplianceRoutes } from "./routes/std-compliance-routes.js";
import { v5ClusterAiRoutes } from "./routes/v5-cluster-ai-routes.js";
import { v5PhaseCRoutes, v5PublicDocsRoutes } from "./routes/v5-phase-c-routes.js";
import { v6FlagshipRoutes } from "./routes/v6-flagship-routes.js";
import { v7BusinessOsRoutes } from "./routes/v7-business-os-routes.js";
import { prometheusMetricsMiddleware, renderPrometheusMetricsText } from "./security/metrics-collector.js";
import { getRedisClusterStatus } from "./security/redis-store.js";
import { getGraphClusterStatus } from "./graph-runtime.js";
import { hostname } from "node:os";
import { LlmQuotaExceededError } from "./services/ga-license-and-quota.js";

export type AppEnv = { Variables: { actor: SessionActor } };

async function mcpAuthMiddleware(c: Context, next: Next) {
  const bearerActor = authenticateMcpBearerToken(c.req.header("authorization"));
  if (bearerActor) {
    c.set("actor", bearerActor);
    return next();
  }
  return zeroTrustAuthMiddleware(c, next);
}

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use(
    "*",
    cors({
      origin: ALLOWED_ORIGIN_LIST,
      credentials: true,
    })
  );

  app.use("*", async (c, next) => {
    const reqId = c.req.header("x-request-id") ?? randomUUID().slice(0, 12);
    c.header("x-request-id", reqId);
    const t0 = performance.now();
    await next();
    recordRequestLatency(performance.now() - t0);
  });
  app.use("*", prometheusMetricsMiddleware);

  app.get("/metrics", (c) =>
    c.text(renderPrometheusMetricsText(), 200, {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    })
  );

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: "lingdong-ontology-v4-api",
      semanticEngine: "Oxigraph-RDF1.1-SPARQL1.1-SHACL",
      mcpProtocol: "2025-03-26",
    })
  );

  app.get("/readyz", async (c) => {
    try {
      await adminSql`SELECT 1`;
      const [redis, graphStore] = await Promise.all([
        getRedisClusterStatus(),
        getGraphClusterStatus(),
      ]);
      const ready = redis.healthy && graphStore.healthy;
      return c.json(
        {
          ready,
          instanceId: process.env.HOSTNAME || `${hostname()}-${process.pid}`,
          postgres: "ok",
          redis: redis.mode === "redis" ? (redis.healthy ? "ok" : "degraded") : "memory_fallback",
          oxigraph: graphStore.mode === "remote_sparql" ? "remote_sparql" : "ok",
        },
        ready ? 200 : 503
      );
    } catch (err) {
      return c.json(
        { ready: false, postgres: err instanceof Error ? err.message : "unreachable" },
        503
      );
    }
  });

  app.route("/api", gaPublicRoutes);
  app.route("/api", v5PublicDocsRoutes);
  app.use("/api/*", zeroTrustAuthMiddleware);
  app.use("/mcp", mcpAuthMiddleware);
  app.use("/mcp/*", mcpAuthMiddleware);

  app.route("/api", studioRoutes);
  app.route("/api", agentReleaseRoutes);
  app.route("/api", commercialRoutes);
  app.route("/api", gaProtectedRoutes);
  app.route("/api", uxCrudRoutes);
  app.route("/api", stdComplianceRoutes);
  app.route("/api", v5ClusterAiRoutes);
  app.route("/api", v5PhaseCRoutes);
  app.route("/api", v6FlagshipRoutes);
  app.route("/api", v7BusinessOsRoutes);
  app.route("/mcp", mcpRoutes);

  // Serve bundled React SPA when WEB_DIST_DIR is configured (e.g. Railway single-service demo)
  const webDistDir = process.env.WEB_DIST_DIR ? resolve(process.env.WEB_DIST_DIR) : "";
  if (webDistDir && existsSync(join(webDistDir, "index.html"))) {
    const MIME: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".ico": "image/x-icon",
      ".json": "application/json; charset=utf-8",
      ".woff2": "font/woff2",
    };
    app.get("*", (c) => {
      const reqPath = c.req.path === "/" ? "/index.html" : c.req.path;
      const safePath = resolve(webDistDir, `.${reqPath}`);
      const target =
        safePath.startsWith(webDistDir) && existsSync(safePath) && statSync(safePath).isFile()
          ? safePath
          : join(webDistDir, "index.html");
      const mime = MIME[extname(target)] ?? "application/octet-stream";
      return c.body(readFileSync(target), 200, { "Content-Type": mime });
    });
  }

  app.onError((err, c) => {
    console.error("[API Error]", err);
    if (err instanceof LlmQuotaExceededError) {
      return c.json({ error: err.message, code: "LLM_QUOTA_EXCEEDED" }, 429);
    }
    return c.json(
      { error: err instanceof Error ? err.message : "服务器内部异常" },
      400
    );
  });

  return app;
}
