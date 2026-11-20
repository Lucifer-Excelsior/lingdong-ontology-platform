import type { CSSProperties } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { MaterializationRun, WatermarkCursorState, WatermarkScheduleState } from "../api/types";
import { QuarantineCsvTools } from "../components/fde/QuarantineCsvTools";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { ROLE_TIPS } from "../utils/rbac";

interface DataMaterializationTabProps {
  workspaceId: string;
  activeRevisionId: string;
  runs: MaterializationRun[];
  schedule?: WatermarkScheduleState;
  watermarkCursor?: WatermarkCursorState;
  canOperate?: boolean;
  onToast: (msg: string) => void;
}

export function DataMaterializationTab({
  workspaceId,
  activeRevisionId,
  runs,
  schedule,
  watermarkCursor,
  canOperate = true,
  onToast,
}: DataMaterializationTabProps) {
  const queryClient = useQueryClient();
  const { ask, confirmDialogNode } = useConfirmDialog();
  const latestQuarantined = (runs[0]?.quarantineRecords ?? []).map((q, idx) => ({
    ...q,
    uniqueKey: `${runs[0]?.id ?? "latest"}-${q.id}-${idx}`,
  }));

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["data", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
  };

  const runMatMutation = useMutation({
    mutationFn: (resetCursor: boolean) => api.runMaterialization(workspaceId, resetCursor),
    onSuccess: (res) => {
      refreshAll();
      onToast(res.message || `已触发物化批次 ${res.run.batchCode}`);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const scheduleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.setMaterializationSchedule(workspaceId, { enabled, intervalSeconds: 60 }),
    onSuccess: (res) => {
      refreshAll();
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const replayMutation = useMutation({
    mutationFn: (rowKey: string) => api.replayQuarantineRow(workspaceId, rowKey),
    onSuccess: (res) => {
      refreshAll();
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const matTableVars = {
    "--label-2": "'模式'",
    "--label-3": "'写入实例'",
    "--label-4": "'SHACL 隔离'",
    "--label-5": "'PROV-O 状态'",
  } as CSSProperties;

  const autoEnabled = Boolean(schedule?.enabled);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4 text-xs">
      <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">
              持续物化计划：水位线增量同步（绑定本体 <code className="font-mono">{activeRevisionId}</code>）
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 font-mono font-medium">
              {`水位线游标: ${watermarkCursor?.lastValue ?? "初始起点"} · 分批流式 ${watermarkCursor?.batchSize ?? 1000} 行/批`}
            </span>
            <span
              className={`px-2 py-0.5 rounded font-medium ${
                autoEnabled
                  ? "bg-emerald-500/15 text-emerald-600"
                  : "bg-[var(--secondary)] text-[var(--muted-foreground)]"
              }`}
            >
              {autoEnabled
                ? `定时调度 (${schedule?.intervalSeconds ?? 60}s · 已执行 ${schedule?.autoRunsCount ?? 0} 次)`
                : "手动按需触发"}
            </span>
          </div>
          <div className="text-[var(--muted-foreground)]">
            按主体 IRI 流式增量 Upsert 活跃命名图；违反 SHACL 约束的脏数据自动进入隔离区，支持修复后一键重放。
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            aria-pressed={autoEnabled}
            disabled={scheduleMutation.isPending || !canOperate}
            title={!canOperate ? ROLE_TIPS.operate : undefined}
            onClick={() => scheduleMutation.mutate(!autoEnabled)}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {autoEnabled ? "暂停定时同步" : "开启定时增量同步"}
          </button>
          <button
            type="button"
            disabled={runMatMutation.isPending || !canOperate}
            title={!canOperate ? ROLE_TIPS.operate : undefined}
            onClick={async () => {
              const { confirmed } = await ask({
                title: "重置水位线游标并全量重刷",
                description: "确认重置水位线游标并执行全量重刷吗？系统将重新扫描源表历史数据。",
                confirmLabel: "确认全量重刷",
                tone: "warning",
              });
              if (confirmed) runMatMutation.mutate(true);
            }}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            重置游标全量重刷
          </button>
          <button
            type="button"
            disabled={runMatMutation.isPending || !canOperate}
            title={!canOperate ? ROLE_TIPS.operate : undefined}
            onClick={() => runMatMutation.mutate(false)}
            className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {runMatMutation.isPending ? "执行中..." : "立即增量执行"}
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
        <div tabIndex={0} role="region" aria-label="物化批次与隔离记录表" className="table-wrapper max-h-[340px] overflow-y-auto">
          <table style={matTableVars}>
            <thead>
              <tr>
                <th scope="col">批次编号 / 时间</th>
                <th scope="col">同步模式</th>
                <th scope="col">原子写入实例数</th>
                <th scope="col">SHACL 隔离拦截</th>
                <th scope="col">血缘与状态</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <th scope="row" className="font-mono">
                    {run.batchCode} · {run.executedAt}
                  </th>
                  <td>{run.syncMode === "BASELINE_FULL" ? "基线全量" : "水位线增量"}</td>
                  <td>
                    {run.writtenInstances.toLocaleString()} 实例 ({run.writtenTriples.toLocaleString()} 三元组)
                  </td>
                  <td>
                    <span className={`font-medium ${run.quarantinedCount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                      {run.quarantineSummary}
                    </span>
                  </td>
                  <td>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">
                      {run.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {latestQuarantined.length > 0 && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-2.5">
          <div className="font-semibold text-sm text-amber-600">
            最新批次 SHACL 脏数据隔离区明细 ({latestQuarantined.length} 条待修复重放)
          </div>
          {latestQuarantined.map((q) => (
            <div
              key={q.uniqueKey}
              className="p-3 rounded-lg bg-amber-500/10 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div>
                  <code className="font-mono font-semibold">{q.sourceRowKey}</code> ({q.sourceTable}) ·{" "}
                  <span>{q.reason}</span>
                </div>
                <code className="font-mono text-[var(--muted-foreground)] block mt-0.5 truncate">
                  {q.rawPayloadSummary}
                </code>
              </div>
              <button
                type="button"
                disabled={replayMutation.isPending || !canOperate}
                title={!canOperate ? ROLE_TIPS.operate : undefined}
                onClick={() => replayMutation.mutate(q.sourceRowKey)}
                className="shrink-0 px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                修复源时序并一键重放
              </button>
            </div>
          ))}
        </div>
      )}

      <QuarantineCsvTools
        workspaceId={workspaceId}
        canOperate={canOperate}
        onReplayed={refreshAll}
        onToast={onToast}
      />
      {confirmDialogNode}
    </div>
  );
}
