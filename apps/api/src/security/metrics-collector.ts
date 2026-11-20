import type { Context, Next } from "hono";
import { graphStoreMode } from "../graph-runtime.js";

interface RouteCounter {
  count: number;
  errorCount: number;
  durationMsSum: number;
}

const routeCounters = new Map<string, RouteCounter>();
let totalRequests = 0;
let totalErrors = 0;
const startedAtSec = Math.floor(Date.now() / 1000);

function normalizeRouteGroup(path: string): string {
  return path
    .replace(/\/workspaces\/[^/]+/g, "/workspaces/:id")
    .replace(/\/jobs\/[^/]+/g, "/jobs/:jobId")
    .replace(/\/entity-360\/[^/]+/g, "/entity-360/:id")
    .replace(/\/branches\/[^/]+/g, "/branches/:branchId")
    .replace(/\/merge-requests\/[^/]+/g, "/merge-requests/:mrId");
}

export async function prometheusMetricsMiddleware(c: Context, next: Next) {
  const t0 = performance.now();
  await next();
  const durMs = Math.max(0.1, performance.now() - t0);
  const status = c.res.status;
  const route = normalizeRouteGroup(c.req.path);
  const key = `${c.req.method}|${route}|${Math.floor(status / 100)}xx`;

  totalRequests += 1;
  if (status >= 400) totalErrors += 1;

  const existing = routeCounters.get(key) ?? { count: 0, errorCount: 0, durationMsSum: 0 };
  existing.count += 1;
  if (status >= 400) existing.errorCount += 1;
  existing.durationMsSum += durMs;
  routeCounters.set(key, existing);
}

export function renderPrometheusMetricsText(): string {
  const mem = process.memoryUsage();
  const uptimeSec = Math.max(1, Math.floor(Date.now() / 1000) - startedAtSec);
  const lines: string[] = [
    "# HELP lingdong_process_uptime_seconds Process uptime in seconds",
    "# TYPE lingdong_process_uptime_seconds gauge",
    `lingdong_process_uptime_seconds ${uptimeSec}`,
    "# HELP lingdong_process_rss_bytes Resident set size in bytes",
    "# TYPE lingdong_process_rss_bytes gauge",
    `lingdong_process_rss_bytes ${mem.rss}`,
    "# HELP lingdong_process_heap_used_bytes V8 heap used in bytes",
    "# TYPE lingdong_process_heap_used_bytes gauge",
    `lingdong_process_heap_used_bytes ${mem.heapUsed}`,
    "# HELP lingdong_graph_store_remote_mode 1 if remote_sparql stateless mode is active",
    "# TYPE lingdong_graph_store_remote_mode gauge",
    `lingdong_graph_store_remote_mode ${graphStoreMode === "remote_sparql" ? 1 : 0}`,
    "# HELP lingdong_http_requests_total Total HTTP requests handled",
    "# TYPE lingdong_http_requests_total counter",
    `lingdong_http_requests_total ${totalRequests}`,
    "# HELP lingdong_http_errors_total Total HTTP 4xx/5xx responses",
    "# TYPE lingdong_http_errors_total counter",
    `lingdong_http_errors_total ${totalErrors}`,
    "# HELP lingdong_http_route_requests_total Requests grouped by method, route, status class",
    "# TYPE lingdong_http_route_requests_total counter",
  ];

  for (const [key, stat] of routeCounters.entries()) {
    const [method, route, statusClass] = key.split("|");
    lines.push(
      `lingdong_http_route_requests_total{method="${method}",route="${route}",status="${statusClass}"} ${stat.count}`
    );
  }

  lines.push(
    "# HELP lingdong_http_route_duration_ms_sum Cumulative request duration in ms",
    "# TYPE lingdong_http_route_duration_ms_sum counter"
  );
  for (const [key, stat] of routeCounters.entries()) {
    const [method, route, statusClass] = key.split("|");
    lines.push(
      `lingdong_http_route_duration_ms_sum{method="${method}",route="${route}",status="${statusClass}"} ${stat.durationMsSum.toFixed(1)}`
    );
  }

  return `${lines.join("\n")}\n`;
}
