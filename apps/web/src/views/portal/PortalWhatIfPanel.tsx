import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Play, ShieldAlert, ShieldCheck } from "lucide-react";
import { v5Api, type WhatIfScenario, type WhatIfSimulateResponse } from "../../lib/v5-api";

interface PortalWhatIfPanelProps {
  workspaceId: string;
  onToast: (msg: string) => void;
}

const SCENARIO_OPTIONS: { value: WhatIfScenario; label: string; desc: string }[] = [
  { value: "SUPPLIER_DEFAULT", label: "供应商违约停供", desc: "模拟核心供应商履约中断对下游合同的级联冲击" },
  { value: "CONTRACT_TERMINATION", label: "核心合同提前解约", desc: "评估单一重点合同提前终止引发的违约敞口与关联影响" },
  { value: "RISK_THRESHOLD_TIGHTEN", label: "风控金额阈值收紧", desc: "收紧高危合同审批阈值并重跑 SHACL 规则告警" },
];

function riskTone(level: string): string {
  const upper = level.toUpperCase();
  if (upper.includes("HIGH") || upper.includes("CRITICAL") || upper.includes("高")) return "bg-rose-50 text-rose-700 border-rose-200";
  if (upper.includes("MED") || upper.includes("WARN") || upper.includes("中")) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

export function PortalWhatIfPanel({ workspaceId, onToast }: PortalWhatIfPanelProps) {
  const [scenario, setScenario] = useState<WhatIfScenario>("SUPPLIER_DEFAULT");
  const [targetEntityId, setTargetEntityId] = useState("HT-2026-089");
  const [thresholdWan, setThresholdWan] = useState(500);
  const [result, setResult] = useState<WhatIfSimulateResponse | null>(null);

  const simMutation = useMutation({
    mutationFn: () => v5Api.runWhatIfSimulate(workspaceId, { scenario, targetEntityId: targetEntityId.trim() || undefined, thresholdWan }),
    onSuccess: (res) => {
      setResult(res);
      onToast(`影子图推演完成：波及 ${res.affectedCount} 个实体，敞口 ${res.totalExposureWan} 万元`);
    },
    onError: (err: Error) => onToast(err.message),
  });

  return (
    <div className="space-y-5">
      <div className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">影子图 What-If 级联推演沙盒</h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              在独立 Named Graph 影子图中执行假设冲击分析与 SHACL 校验，推演完成后自动销毁，确保生产 ABox 零污染。
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            Shadow Graph Isolation
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SCENARIO_OPTIONS.map((opt) => {
            const active = scenario === opt.value;
            return (
              <button key={opt.value} type="button" onClick={() => setScenario(opt.value)} className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${active ? "border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500/30" : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--foreground)]/20 hover:bg-[var(--secondary)]"}`}>
                <div className={`text-sm font-semibold ${active ? "text-indigo-700" : "text-[var(--foreground)]"}`}>{opt.label}</div>
                <div className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">{opt.desc}</div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-1">
          <div className="space-y-1">
            <label htmlFor="whatif-target-entity" className="block text-xs font-medium text-[var(--foreground)]/85">目标冲击实体编号</label>
            <input id="whatif-target-entity" type="text" value={targetEntityId} onChange={(e) => setTargetEntityId(e.target.value)} placeholder="例如：HT-2026-089" className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm text-[var(--foreground)] focus:outline-none focus:border-indigo-500" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="whatif-threshold" className="font-medium text-[var(--foreground)]/85">风控金额阈值（万元）</label>
              <span className="font-mono font-semibold text-indigo-600">{thresholdWan} 万元</span>
            </div>
            <div className="flex items-center gap-2">
              <input id="whatif-threshold" type="range" min={100} max={3000} step={50} value={thresholdWan} onChange={(e) => setThresholdWan(Number(e.target.value))} className="flex-1 accent-indigo-600" />
              <input type="number" aria-label="风控金额阈值输入" min={50} max={10000} step={50} value={thresholdWan} onChange={(e) => setThresholdWan(Math.max(50, Number(e.target.value) || 50))} className="w-20 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs font-mono text-[var(--foreground)]" />
            </div>
          </div>

          <div className="flex justify-end">
            <button type="button" disabled={simMutation.isPending} onClick={() => simMutation.mutate()} className="w-full md:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition disabled:opacity-50 cursor-pointer">
              <Play className="w-4 h-4" />
              {simMutation.isPending ? "影子图推演中..." : "启动影子图推演"}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {result.shadowGraphCleaned && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5" />影子图已隔离清理（生产 ABox 零污染）
                </span>
              )}
              <span className="text-xs font-mono text-[var(--muted-foreground)] truncate">{result.shadowGraphUri}</span>
            </div>
            <p className="text-sm text-[var(--foreground)]/85">{result.summary}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
              <div className="text-xs text-[var(--muted-foreground)]">受影响实体数</div>
              <div className="text-2xl font-bold text-[var(--foreground)] mt-1">{result.affectedCount}</div>
              <div className="text-xs text-indigo-600 mt-1">多跳级联波及节点</div>
            </div>
            <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
              <div className="text-xs text-[var(--muted-foreground)]">预计风险敞口（万元）</div>
              <div className="text-2xl font-bold text-amber-600 mt-1">{result.totalExposureWan.toLocaleString()}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-1">按影子图聚合测算</div>
            </div>
            <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
              <div className="text-xs text-[var(--muted-foreground)]">高危规则告警数</div>
              <div className="text-2xl font-bold text-rose-600 mt-1">{result.violatedShaclCount}</div>
              <div className="text-xs text-rose-600 mt-1">SHACL 约束实时触发</div>
            </div>
          </div>

          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              多跳级联冲击明细 ({result.affectedNodes.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-[var(--secondary)]/60 text-[var(--muted-foreground)] border-b border-[var(--border)]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">级联跳数</th>
                    <th className="px-3 py-2 font-semibold">实体编号</th>
                    <th className="px-3 py-2 font-semibold">实体类型</th>
                    <th className="px-3 py-2 font-semibold">风险等级</th>
                    <th className="px-3 py-2 font-semibold">敞口（万元）</th>
                    <th className="px-3 py-2 font-semibold">传导原因</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-[var(--foreground)]">
                  {result.affectedNodes.map((node) => (
                    <tr key={`${node.hopDistance}-${node.entityId}`} className="hover:bg-[var(--secondary)]/60">
                      <td className="px-3 py-2 whitespace-nowrap"><span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono font-semibold">Hop {node.hopDistance}</span></td>
                      <td className="px-3 py-2 font-mono font-medium text-[var(--foreground)]">{node.entityId}</td>
                      <td className="px-3 py-2 text-[var(--muted-foreground)]">{node.entityType}</td>
                      <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded border font-medium ${riskTone(node.riskLevel)}`}>{node.riskLevel}</span></td>
                      <td className="px-3 py-2 font-mono">{node.exposureAmountWan}</td>
                      <td className="px-3 py-2 text-[var(--muted-foreground)]">{node.impactReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {result.recommendedActions.length > 0 && (
            <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]">
                <ShieldAlert className="w-4 h-4 text-indigo-600" />建议受控处置动作（需人工审批确认）
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result.recommendedActions.map((act) => (
                  <div key={act.capabilityCode} className="p-3 rounded-lg bg-[var(--secondary)]/60 border border-[var(--border)] flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--foreground)] truncate">{act.label}</div>
                      <div className="text-[11px] font-mono text-[var(--muted-foreground)] mt-0.5">{act.capabilityCode} · 紧急度：{act.urgency}</div>
                    </div>
                    <button type="button" onClick={() => onToast(`已将受控动作「${act.label}」(${act.capabilityCode}) 加入待审批队列`)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:border-indigo-400 hover:text-indigo-700 text-xs font-medium text-[var(--foreground)]/85 shrink-0 cursor-pointer">
                      <CheckCircle2 className="w-3.5 h-3.5" />发起预案
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
