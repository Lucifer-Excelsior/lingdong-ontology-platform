#!/usr/bin/env node
/**
 * 灵·洞本体工作站 V4.0 Enterprise GA — 自动化并发性能压测与 P95/P99 基线脚本
 * 用法: node infra/perf/ga-load-test.mjs [baseUrl] [concurrency] [iterations]
 */
const BASE_URL = process.argv[2] ?? "http://127.0.0.1:8280";
const CONCURRENCY = Number(process.argv[3] ?? 10);
const ITERATIONS = Number(process.argv[4] ?? 40);

const ENDPOINTS = [
  { name: "GET /health", path: "/health" },
  { name: "GET /api/bootstrap", path: "/api/bootstrap" },
  { name: "GET /api/workspaces/ws-contract/ga/status", path: "/api/workspaces/ws-contract/ga/status" },
  { name: "GET /api/workspaces/ws-contract/portal/entity-360/HT-2026-089", path: "/api/workspaces/ws-contract/portal/entity-360/HT-2026-089" },
  { name: "GET /api/workspaces/ws-contract/governance/license", path: "/api/workspaces/ws-contract/governance/license" },
];

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(1));
}

async function benchEndpoint(ep) {
  const latencies = [];
  let errors = 0;
  const started = performance.now();

  let cursor = 0;
  async function worker() {
    while (cursor < ITERATIONS) {
      cursor += 1;
      const t0 = performance.now();
      try {
        const res = await fetch(`${BASE_URL}${ep.path}`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) errors += 1;
        await res.arrayBuffer();
      } catch {
        errors += 1;
      } finally {
        latencies.push(performance.now() - t0);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const totalSec = (performance.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  return {
    name: ep.name,
    requests: latencies.length,
    errors,
    qps: Number((latencies.length / Math.max(totalSec, 0.001)).toFixed(1)),
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
  };
}

console.log(`灵·洞本体工作站 V4.0 GA 并发压测 (Target=${BASE_URL}, Concurrency=${CONCURRENCY}, Requests/EP=${ITERATIONS})\n`);
const results = [];
for (const ep of ENDPOINTS) {
  results.push(await benchEndpoint(ep));
}
console.table(results);

const totalErrors = results.reduce((s, r) => s + r.errors, 0);
const maxP95 = Math.max(...results.map((r) => r.p95));
console.log(`\n汇总: TotalErrors=${totalErrors}, MaxP95=${maxP95}ms -> ${totalErrors === 0 && maxP95 < 250 ? "GA PASS" : "CHECK REQUIRED"}`);
process.exit(totalErrors === 0 ? 0 : 1);
