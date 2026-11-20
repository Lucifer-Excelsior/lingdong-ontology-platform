import { useQuery } from "@tanstack/react-query";
import { Activity, Cpu, RefreshCw, ShieldCheck } from "lucide-react";

interface ParsedPrometheusMetrics {
  totalRequests: number;
  totalErrors: number;
  rssMb: number;
  heapMb: number;
  uptimeSec: number;
  remoteGraphMode: boolean;
}

function parsePromGauge(text: string, metricName: string): number {
  const re = new RegExp(`^${metricName}\\s+([0-9.eE+-]+)$`, "m");
  const m = text.match(re);
  return m ? Number(m[1]) : 0;
}

async function fetchLivePrometheusMetrics(): Promise<ParsedPrometheusMetrics> {
  const res = await fetch("/metrics", { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return {
    totalRequests: parsePromGauge(text, "lingdong_http_requests_total"),
    totalErrors: parsePromGauge(text, "lingdong_http_errors_total"),
    rssMb: Number((parsePromGauge(text, "lingdong_process_rss_bytes") / 1024 / 1024).toFixed(1)),
    heapMb: Number((parsePromGauge(text, "lingdong_process_heap_used_bytes") / 1024 / 1024).toFixed(1)),
    uptimeSec: parsePromGauge(text, "lingdong_process_uptime_seconds"),
    remoteGraphMode: parsePromGauge(text, "lingdong_graph_store_remote_mode") === 1,
  };
}

export function GovernanceLiveMetricsBar() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["live-prom-metrics"],
    queryFn: fetchLivePrometheusMetrics,
    refetchInterval: 15_000,
  });

  const errorRate =
    data && data.totalRequests > 0
      ? `${((data.totalErrors / data.totalRequests) * 100).toFixed(2)}%`
      : "0.00%";

  return (
    <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[var(--primary)]" />
          <span className="font-semibold text-sm text-[var(--foreground)]">Prometheus `/metrics` 实时遥测大盘</span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 font-medium">实时直连</span>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--secondary)] font-medium cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          刷新遥测
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-[var(--secondary)]/60 border border-[var(--border)]">
          <div className="text-[var(--muted-foreground)]">累计处理请求 (Requests)</div>
          <div className="text-xl font-bold font-mono text-[var(--foreground)] mt-0.5">
            {data?.totalRequests.toLocaleString() ?? "—"}
          </div>
          <div className="text-emerald-600 mt-0.5">错误率 {errorRate}</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--secondary)]/60 border border-[var(--border)]">
          <div className="text-[var(--muted-foreground)] inline-flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5" />进程常驻内存 (RSS)
          </div>
          <div className="text-xl font-bold font-mono text-[var(--foreground)] mt-0.5">
            {data ? `${data.rssMb} MB` : "—"}
          </div>
          <div className="text-[var(--muted-foreground)] mt-0.5">V8 堆使用 {data ? `${data.heapMb} MB` : "—"}</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--secondary)]/60 border border-[var(--border)]">
          <div className="text-[var(--muted-foreground)]">运行时长 (Uptime)</div>
          <div className="text-xl font-bold font-mono text-[var(--foreground)] mt-0.5">
            {data ? `${Math.floor(data.uptimeSec / 60)}m ${data.uptimeSec % 60}s` : "—"}
          </div>
          <div className="text-emerald-600 mt-0.5">心跳租约巡检运行中</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--secondary)]/60 border border-[var(--border)]">
          <div className="text-[var(--muted-foreground)] inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />图存储架构模式
          </div>
          <div className="text-base font-bold text-[var(--foreground)] mt-1">
            {data?.remoteGraphMode ? "Remote SPARQL HA" : "Embedded Oxigraph"}
          </div>
          <div className="text-[var(--muted-foreground)] mt-0.5">支持一键切换远端共享集群</div>
        </div>
      </div>
    </div>
  );
}
