import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Database, Layers, PlayCircle, RefreshCw, Server, ShieldCheck } from "lucide-react";
import { v5Api, type AsyncJobDto, type AsyncJobType } from "../../lib/v5-api";

interface GovernanceClusterJobsPanelProps {
  workspaceId: string;
  onToast: (msg: string) => void;
}

const JOB_ACTIONS: { type: AsyncJobType; label: string; desc: string }[] = [
  { type: "MATERIALIZE_BATCH", label: "大规模物化入图", desc: "异步批量物化业务实体至图谱" },
  { type: "SHACL_FULL_AUDIT", label: "全量 SHACL 体检", desc: "对工作空间全量实例执行约束核验" },
  { type: "MULTI_SOURCE_FUSION", label: "多源融合扫描", desc: "跨源实体对齐与冲突检测任务" },
];

const JOB_LABELS: Record<AsyncJobType, string> = {
  MATERIALIZE_BATCH: "大规模物化入图",
  SHACL_FULL_AUDIT: "全量 SHACL 体检",
  MULTI_SOURCE_FUSION: "多源融合扫描",
};

function statusBadge(status: AsyncJobDto["status"]) {
  if (status === "COMPLETED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "FAILED") return "bg-rose-50 text-rose-700 border-rose-200";
  if (status === "RUNNING") return "bg-indigo-50 text-indigo-700 border-indigo-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export function GovernanceClusterJobsPanel({ workspaceId, onToast }: GovernanceClusterJobsPanelProps) {
  const queryClient = useQueryClient();
  const [liveJob, setLiveJob] = useState<AsyncJobDto | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const { data: health, isFetching: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ["v5-cluster-health"],
    queryFn: () => v5Api.getClusterHealth(),
  });
  const { data: jobsData, isFetching: jobsLoading, refetch: refetchJobs } = useQuery({
    queryKey: ["v5-jobs", workspaceId],
    queryFn: () => v5Api.listJobs(workspaceId),
    enabled: Boolean(workspaceId),
  });

  useEffect(() => () => { esRef.current?.close(); esRef.current = null; }, []);

  const subscribeJobStream = (job: AsyncJobDto) => {
    esRef.current?.close();
    setLiveJob(job);
    const es = new EventSource(v5Api.getJobStreamUrl(workspaceId, job.id), { withCredentials: true });
    esRef.current = es;
    const handleProgress = (event: MessageEvent<string>) => {
      try {
        const updated = JSON.parse(event.data) as AsyncJobDto;
        setLiveJob(updated);
        if (updated.status === "COMPLETED" || updated.status === "FAILED") {
          es.close();
          esRef.current = null;
          void queryClient.invalidateQueries({ queryKey: ["v5-jobs", workspaceId] });
          onToast(updated.status === "COMPLETED" ? `异步作业「${JOB_LABELS[updated.jobType]}」已完成 (100%)` : `异步作业失败：${updated.errorMessage ?? "未知错误"}`);
        }
      } catch {
        // ignore malformed SSE chunk
      }
    };
    es.addEventListener("progress", handleProgress as EventListener);
    es.onerror = () => { es.close(); esRef.current = null; void queryClient.invalidateQueries({ queryKey: ["v5-jobs", workspaceId] }); };
  };

  const dispatchMutation = useMutation({
    mutationFn: (jobType: AsyncJobType) => v5Api.dispatchJob(workspaceId, jobType),
    onSuccess: (res) => {
      onToast(res.message || `已提交异步作业 ${res.job.id}`);
      void queryClient.invalidateQueries({ queryKey: ["v5-jobs", workspaceId] });
      subscribeJobStream(res.job);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const jobs = jobsData?.jobs ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)]">高可用集群拓扑与异步作业队列</h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">实时监测无状态 API 节点、PostgreSQL、Redis 队列与图存储 HA 状态，并支持 SSE 实时进度流式追踪。</p>
        </div>
        <button type="button" onClick={() => { void refetchHealth(); void refetchJobs(); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--secondary)] text-xs font-medium text-[var(--foreground)]/85 cursor-pointer">
          <RefreshCw className={`w-3.5 h-3.5 ${healthLoading || jobsLoading ? "animate-spin" : ""}`} />刷新拓扑与作业
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-1.5">
          <div className="flex items-center justify-between text-[var(--muted-foreground)]">
            <span className="inline-flex items-center gap-1"><Server className="w-3.5 h-3.5 text-indigo-600" />API 实例节点</span>
            <span className={`px-1.5 py-0.5 rounded font-medium ${health?.statelessReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{health?.statelessReady ? "无状态就绪" : "单机模式"}</span>
          </div>
          <div className="text-sm font-bold font-mono text-[var(--foreground)] truncate">{health?.instanceId ?? "-"}</div>
          <div className="text-[var(--muted-foreground)]">检查时间：{health?.checkedAt ? new Date(health.checkedAt).toLocaleTimeString() : "-"}</div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-1.5">
          <div className="flex items-center justify-between text-[var(--muted-foreground)]">
            <span className="inline-flex items-center gap-1"><Database className="w-3.5 h-3.5 text-emerald-600" />PostgreSQL</span>
            <span className={`px-1.5 py-0.5 rounded font-medium ${health?.postgres.healthy ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{health?.postgres.healthy ? "健康" : "异常"}</span>
          </div>
          <div className="text-sm font-bold text-[var(--foreground)]">事务元数据主库</div>
          <div className="text-[var(--muted-foreground)]">租户隔离与不可变审计持久化</div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-1.5">
          <div className="flex items-center justify-between text-[var(--muted-foreground)]">
            <span className="inline-flex items-center gap-1"><Activity className="w-3.5 h-3.5 text-amber-600" />Redis 协调层</span>
            <span className={`px-1.5 py-0.5 rounded font-medium ${health?.redis.healthy ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{health?.redis.mode === "redis" ? "Redis HA" : "内存回退"}</span>
          </div>
          <div className="text-sm font-bold font-mono text-[var(--foreground)]">{health?.redis.latencyMs ?? 0} ms</div>
          <div className="text-[var(--muted-foreground)]">分布式作业锁与事件通道</div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-1.5">
          <div className="flex items-center justify-between text-[var(--muted-foreground)]">
            <span className="inline-flex items-center gap-1"><Layers className="w-3.5 h-3.5 text-indigo-600" />GraphStore HA</span>
            <span className={`px-1.5 py-0.5 rounded font-medium ${health?.graphStore.healthy ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{health?.graphStore.mode === "remote_sparql" ? "远端集群" : "内嵌模式"}</span>
          </div>
          <div className="text-sm font-bold font-mono text-[var(--foreground)]">{health?.graphStore.latencyMs ?? 0} ms</div>
          <div className="text-[var(--muted-foreground)] truncate" title={health?.graphStore.endpoint}>{health?.graphStore.statelessClusterReady ? "支持多副本水平扩展" : health?.graphStore.endpoint ?? "-"}</div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <PlayCircle className="w-4 h-4 text-indigo-600" />一键派发后台异步作业（SSE 实时进度流）
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {JOB_ACTIONS.map((item) => (
            <button key={item.type} type="button" disabled={dispatchMutation.isPending} onClick={() => dispatchMutation.mutate(item.type)} className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60 hover:border-indigo-400 hover:bg-indigo-50/60 text-left transition disabled:opacity-50 cursor-pointer">
              <div className="text-sm font-semibold text-[var(--foreground)]">{item.label}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{item.desc}</div>
            </button>
          ))}
        </div>

        {liveJob && (
          <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-200 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[var(--foreground)]">实时追踪：{JOB_LABELS[liveJob.jobType]} <code className="font-mono text-[var(--muted-foreground)]">({liveJob.id})</code></span>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded border font-medium ${statusBadge(liveJob.status)}`}>{liveJob.status}</span>
                <span className="font-mono font-bold text-indigo-700">{liveJob.progressPct}%</span>
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-[var(--secondary)] overflow-hidden">
              <div className={`h-full transition-all duration-300 ${liveJob.status === "FAILED" ? "bg-rose-600" : liveJob.status === "COMPLETED" ? "bg-emerald-600" : "bg-indigo-600"}`} style={{ width: `${Math.min(100, Math.max(0, liveJob.progressPct))}%` }} />
            </div>
            <div className="text-[var(--muted-foreground)]">{liveJob.stageLabel || "等待 Worker 节点调度执行..."}</div>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between text-sm font-semibold text-[var(--foreground)]">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-600" />异步作业历史记录 ({jobs.length})</span>
          <span className="text-xs font-mono text-[var(--muted-foreground)]">实例：{jobsData?.instanceId ?? health?.instanceId ?? "-"}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-[var(--secondary)]/60 text-[var(--muted-foreground)] border-b border-[var(--border)]">
              <tr>
                <th className="px-3 py-2 font-semibold">作业类型</th>
                <th className="px-3 py-2 font-semibold">状态</th>
                <th className="px-3 py-2 font-semibold">进度</th>
                <th className="px-3 py-2 font-semibold">当前阶段 / 说明</th>
                <th className="px-3 py-2 font-semibold">触发人</th>
                <th className="px-3 py-2 font-semibold">更新时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-[var(--foreground)]">
              {jobs.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-[var(--muted-foreground)]">暂无后台异步作业记录</td></tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-[var(--secondary)]/60">
                    <td className="px-3 py-2 font-medium text-[var(--foreground)]">{JOB_LABELS[job.jobType] ?? job.jobType}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded border font-medium ${statusBadge(job.status)}`}>{job.status}</span></td>
                    <td className="px-3 py-2 font-mono">{job.progressPct}%</td>
                    <td className="px-3 py-2 text-[var(--muted-foreground)]">{job.errorMessage ?? job.stageLabel}</td>
                    <td className="px-3 py-2 text-[var(--muted-foreground)]">{job.createdBy}</td>
                    <td className="px-3 py-2 font-mono text-[var(--muted-foreground)]">{new Date(job.updatedAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
