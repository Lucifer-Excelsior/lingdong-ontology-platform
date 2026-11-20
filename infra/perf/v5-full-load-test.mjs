/**
 * Lingdong Ontology Studio V5.0 Full-Platform High-Concurrency Load & Stress Test
 * Usage: node infra/perf/v5-full-load-test.mjs [baseUrl=http://127.0.0.1:8280] [concurrency=20] [requestsPerEndpoint=40]
 */
const baseUrl = process.argv[2] ?? "http://127.0.0.1:8280";
const concurrency = Number(process.argv[3] ?? 20);
const requestsPerEndpoint = Number(process.argv[4] ?? 40);

const endpoints = [
  { name: "GET /health", method: "GET", path: "/health" },
  { name: "GET /readyz (PG+Redis+Graph)", method: "GET", path: "/readyz" },
  { name: "GET /api/cluster/health", method: "GET", path: "/api/cluster/health" },
  { name: "GET /api/openapi.json", method: "GET", path: "/api/openapi.json" },
  { name: "GET /api/workspaces/ws-contract/governance/abac-policy", method: "GET", path: "/api/workspaces/ws-contract/governance/abac-policy" },
  { name: "GET /api/workspaces/ws-contract/portal/entity-360/HT-2026-089", method: "GET", path: "/api/workspaces/ws-contract/portal/entity-360/HT-2026-089" },
  {
    name: "POST /api/workspaces/ws-contract/portal/nl-query",
    method: "POST",
    path: "/api/workspaces/ws-contract/portal/nl-query",
    body: JSON.stringify({ question: "排查高风险和临期合同金额明细" }),
  },
  {
    name: "POST /api/workspaces/ws-contract/portal/whatif-simulate",
    method: "POST",
    path: "/api/workspaces/ws-contract/portal/whatif-simulate",
    body: JSON.stringify({ scenario: "SUPPLIER_DEFAULT", targetEntityId: "SUP-CORE-001", thresholdWan: 150 }),
  },
];

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[idx].toFixed(1));
}

async function runEndpoint(ep) {
  const latencies = [];
  let errors = 0;
  let cursor = 0;
  const startedAll = performance.now();

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= requestsPerEndpoint) break;
      const t0 = performance.now();
      try {
        const res = await fetch(`${baseUrl}${ep.path}`, {
          method: ep.method,
          headers: ep.body ? { "content-type": "application/json" } : undefined,
          body: ep.body,
        });
        await res.arrayBuffer();
        if (!res.ok) errors++;
      } catch {
        errors++;
      } finally {
        latencies.push(performance.now() - t0);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const totalSec = (performance.now() - startedAll) / 1000;
  latencies.sort((a, b) => a - b);
  return {
    endpoint: ep.name,
    requests: requestsPerEndpoint,
    errors,
    qps: Number((requestsPerEndpoint / totalSec).toFixed(1)),
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    p99Ms: percentile(latencies, 99),
  };
}

console.log(`灵·洞本体工作站 V5.0 全栈并发压力测试 (Target=${baseUrl}, Concurrency=${concurrency}, Requests/EP=${requestsPerEndpoint}, Total=${endpoints.length * requestsPerEndpoint})`);
const tStart = performance.now();
const rows = [];
for (const ep of endpoints) {
  rows.push(await runEndpoint(ep));
}
const elapsedSec = ((performance.now() - tStart) / 1000).toFixed(2);
console.table(rows);

const totalRequests = rows.reduce((s, r) => s + r.requests, 0);
const totalErrors = rows.reduce((s, r) => s + r.errors, 0);
const maxP95 = Math.max(...rows.map((r) => r.p95Ms));
const avgQps = Number((rows.reduce((s, r) => s + r.qps, 0) / rows.length).toFixed(1));
console.log(`\n压测汇总: TotalRequests=${totalRequests}, TotalErrors=${totalErrors}, ErrorRate=${((totalErrors / totalRequests) * 100).toFixed(2)}%, AvgEndpointQPS=${avgQps}, MaxP95=${maxP95}ms, Elapsed=${elapsedSec}s`);
console.log(`结论: ${totalErrors === 0 && maxP95 < 500 ? "V5.0 PRODUCTION STRESS PASS" : "CHECK REQUIRED"}`);
process.exit(totalErrors === 0 ? 0 : 1);
