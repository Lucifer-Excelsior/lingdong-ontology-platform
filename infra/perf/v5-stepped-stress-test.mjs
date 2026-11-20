/**
 * Lingdong Ontology Studio V5.0 Sustained Stepped Mixed-Traffic Stress Test
 * Stages: Concurrency 20 -> 50 -> 100 -> 150 (each sustained for 8s, 32s continuous load)
 * Measures: Mixed QPS, P50/P95/P99 latency, error rate, throughput knee, and server RSS/Heap memory drift.
 */
const baseUrl = process.argv[2] ?? "http://127.0.0.1:8280";
const stageSeconds = Number(process.argv[3] ?? 8);
const stages = [20, 50, 100, 150];

const trafficMix = [
  { weight: 25, name: "bootstrap", method: "GET", path: "/api/bootstrap" },
  { weight: 20, name: "entity-360", method: "GET", path: "/api/workspaces/ws-contract/portal/entity-360/HT-2026-089" },
  { weight: 15, name: "abac-policy", method: "GET", path: "/api/workspaces/ws-contract/governance/abac-policy" },
  {
    weight: 15,
    name: "nl-query",
    method: "POST",
    path: "/api/workspaces/ws-contract/portal/nl-query",
    body: JSON.stringify({ question: "排查高风险和临期合同金额明细" }),
  },
  {
    weight: 15,
    name: "whatif-sim",
    method: "POST",
    path: "/api/workspaces/ws-contract/portal/whatif-simulate",
    body: JSON.stringify({ scenario: "SUPPLIER_DEFAULT", targetEntityId: "SUP-CORE-001", thresholdWan: 150 }),
  },
  { weight: 10, name: "readyz", method: "GET", path: "/readyz" },
];

const weightedPool = [];
for (const ep of trafficMix) {
  for (let i = 0; i < ep.weight; i++) weightedPool.push(ep);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[idx].toFixed(1));
}

async function sampleServerMemory() {
  try {
    const res = await fetch(`${baseUrl}/api/cluster/health`);
    const json = await res.json();
    return { rssMb: json.memory?.rssMb ?? 0, heapUsedMb: json.memory?.heapUsedMb ?? 0 };
  } catch {
    return { rssMb: 0, heapUsedMb: 0 };
  }
}

async function runStage(concurrency, durationSec) {
  const latencies = [];
  let total = 0;
  let errors = 0;
  const deadline = performance.now() + durationSec * 1000;
  const startedAt = performance.now();

  async function worker(workerId) {
    let idx = workerId * 7;
    while (performance.now() < deadline) {
      const ep = weightedPool[idx++ % weightedPool.length];
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
        total++;
        latencies.push(performance.now() - t0);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
  const elapsedSec = (performance.now() - startedAt) / 1000;
  latencies.sort((a, b) => a - b);
  const mem = await sampleServerMemory();
  return {
    concurrency,
    durationSec: Number(elapsedSec.toFixed(1)),
    requests: total,
    errors,
    errPct: Number(((errors / Math.max(1, total)) * 100).toFixed(2)),
    qps: Number((total / elapsedSec).toFixed(1)),
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    p99Ms: percentile(latencies, 99),
    rssMb: mem.rssMb,
    heapMb: mem.heapUsedMb,
  };
}

console.log(`灵·洞本体工作站 V5.0 持续阶梯混合压力测试 (Target=${baseUrl}, Stages=${stages.join("->")}并发, 每阶持续=${stageSeconds}s)`);
const baseMem = await sampleServerMemory();
console.log(`压测前基线内存: RSS=${baseMem.rssMb} MB, HeapUsed=${baseMem.heapUsedMb} MB\n`);

const results = [];
for (const c of stages) {
  results.push(await runStage(c, stageSeconds));
}
console.table(results);

const sumReq = results.reduce((s, r) => s + r.requests, 0);
const sumErr = results.reduce((s, r) => s + r.errors, 0);
const peakQps = Math.max(...results.map((r) => r.qps));
const endMem = results[results.length - 1];
const memDriftMb = Number((endMem.rssMb - baseMem.rssMb).toFixed(1));
console.log(`\n阶梯压测汇总: TotalRequests=${sumReq}, TotalErrors=${sumErr} (${((sumErr / Math.max(1, sumReq)) * 100).toFixed(2)}%), PeakMixedQPS=${peakQps}, RSS内存漂移=${memDriftMb >= 0 ? "+" : ""}${memDriftMb} MB`);
process.exit(sumErr === 0 ? 0 : 1);
