import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, Database, Layers, Play, ShieldAlert, Sparkles } from "lucide-react";
import { v6Api, type DriftNodeDto, type LineageDriftScanResponse } from "../../lib/v6-api";

interface DataLineageDriftPanelProps {
  workspaceId: string;
  onToast: (msg: string) => void;
}

function statusMeta(status: DriftNodeDto["status"]) {
  if (status === "BROKEN_COLUMN_DROPPED") {
    return { label: "断链告警 · 上游删列", cls: "bg-rose-50 text-rose-700 border-rose-200", card: "border-rose-200 bg-rose-50/30" };
  }
  if (status === "TYPE_DRIFT") {
    return { label: "类型漂移 · Schema 变更", cls: "bg-amber-50 text-amber-700 border-amber-200", card: "border-amber-200 bg-amber-50/30" };
  }
  return { label: "血缘健康", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", card: "border-[var(--border)] bg-[var(--card)]" };
}

export function DataLineageDriftPanel({ workspaceId, onToast }: DataLineageDriftPanelProps) {
  const [report, setReport] = useState<LineageDriftScanResponse | null>(null);

  const scanMutation = useMutation({
    mutationFn: (payload: { droppedColumn?: string; typeChangedColumn?: string }) => v6Api.scanLineageDrift(workspaceId, payload),
    onSuccess: (res, vars) => {
      setReport(res);
      if (vars.droppedColumn) onToast(`已完成删列演练 (${vars.droppedColumn})：发现 ${res.brokenCount} 处断链告警`);
      else if (vars.typeChangedColumn) onToast(`已完成类型漂移演练 (${vars.typeChangedColumn})：发现 ${res.driftCount} 处漂移`);
    },
    onError: (e: Error) => onToast(e.message),
  });

  useEffect(() => {
    if (workspaceId) scanMutation.mutate({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const nodes = report?.nodes ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)]">四层全链路血缘与 Schema 漂移预警</h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">穿透监测「物理表列 → 本体属性 → SHACL 约束 → 受控动作与应用」四层依赖，提前阻断上游结构变更风险。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            disabled={scanMutation.isPending}
            onClick={() => scanMutation.mutate({})}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />常规血缘体检
          </button>
          <button
            type="button"
            disabled={scanMutation.isPending}
            onClick={() => scanMutation.mutate({ droppedColumn: "expires_at" })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium disabled:opacity-50 cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5" />模拟上游删列 expires_at
          </button>
          <button
            type="button"
            disabled={scanMutation.isPending}
            onClick={() => scanMutation.mutate({ typeChangedColumn: "total_amount" })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium disabled:opacity-50 cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5" />模拟类型漂移 total_amount
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
          <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-indigo-600" />总血缘链路</div>
          <div className="text-2xl font-bold text-[var(--foreground)] mt-1 font-mono">{report?.totalLinks ?? 0}</div>
          <div className="text-[11px] text-[var(--muted-foreground)] mt-1">最近扫描：{report?.scannedAt ? new Date(report.scannedAt).toLocaleTimeString() : "等待扫描"}</div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
          <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-rose-600" />断链告警</div>
          <div className={`text-2xl font-bold mt-1 font-mono ${(report?.brokenCount ?? 0) > 0 ? "text-rose-600" : "text-emerald-600"}`}>{report?.brokenCount ?? 0}</div>
          <div className="text-[11px] text-[var(--muted-foreground)] mt-1">上游物理列缺失将导致物化中断</div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
          <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-amber-600" />类型漂移</div>
          <div className={`text-2xl font-bold mt-1 font-mono ${(report?.driftCount ?? 0) > 0 ? "text-amber-600" : "text-emerald-600"}`}>{report?.driftCount ?? 0}</div>
          <div className="text-[11px] text-[var(--muted-foreground)] mt-1">XSD 数据类型不兼容或精度变化</div>
        </div>
      </div>

      {report?.simulatedChange && (
        <div className="px-4 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-800 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>当前处于故障演练模式：<strong className="font-mono">{report.simulatedChange}</strong>（未对真实物理库执行 DDL）</span>
        </div>
      )}

      <div className="space-y-3">
        {nodes.length === 0 ? (
          <div className="p-8 rounded-xl bg-[var(--card)] border border-[var(--border)] text-center text-xs text-[var(--muted-foreground)]">
            {scanMutation.isPending ? "正在执行四层血缘穿透扫描..." : "暂无血缘链路记录，请先配置字段语义映射"}
          </div>
        ) : (
          nodes.map((node, idx) => {
            const meta = statusMeta(node.status);
            return (
              <div key={`${node.sourceTable}-${node.sourceColumn}-${idx}`} className={`p-4 rounded-xl border ${meta.card} space-y-3`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
                    <Database className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="font-mono">{node.sourceTable}.{node.sourceColumn}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${meta.cls}`}>
                    {node.status === "HEALTHY" ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    {meta.label}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                    <div className="text-[11px] text-[var(--muted-foreground)]">1. 物理表列</div>
                    <div className="font-mono font-semibold text-[var(--foreground)] mt-0.5 truncate">{node.sourceTable}.{node.sourceColumn}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                    <div className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1"><ArrowRight className="w-3 h-3 text-[var(--muted-foreground)]" />2. 本体属性</div>
                    <div className="font-mono font-semibold text-indigo-700 mt-0.5 truncate">{node.targetProperty}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                    <div className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1"><ArrowRight className="w-3 h-3 text-[var(--muted-foreground)]" />3. 受影响 SHACL</div>
                    <div className="font-semibold text-[var(--foreground)] mt-0.5">{node.affectedShaclCount} 条约束规则</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                    <div className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1"><ArrowRight className="w-3 h-3 text-[var(--muted-foreground)]" />4. 受控动作 / 应用</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {[...node.affectedCapabilities, ...node.affectedApps].length === 0 ? (
                        <span className="text-[var(--muted-foreground)]">无下游阻断</span>
                      ) : (
                        [...node.affectedCapabilities, ...node.affectedApps].map((item) => (
                          <span key={item} className="px-1.5 py-0.5 rounded bg-[var(--secondary)] text-[var(--foreground)]/85 font-mono text-[10px]">{item}</span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-[var(--muted-foreground)] bg-[var(--card)]/80 px-3 py-2 rounded-lg border border-[var(--border)]/80">
                  <span className="font-medium text-[var(--foreground)]">治理建议：</span>{node.recommendation}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
