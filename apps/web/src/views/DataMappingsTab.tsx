import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { EntityResolutionRule, SemanticMapping } from "../api/types";
import { ROLE_TIPS } from "../utils/rbac";
import { DataMappingDryRunPreview, type MappingDryRunRow } from "./DataMappingDryRunPreview";

interface DataMappingsTabProps {
  workspaceId: string;
  mappings: SemanticMapping[];
  entityResolutionRules?: EntityResolutionRule[];
  canModel?: boolean;
  canOperate?: boolean;
  onToast: (msg: string) => void;
}

export function DataMappingsTab({
  workspaceId,
  mappings,
  entityResolutionRules = [],
  canModel = true,
  canOperate = true,
  onToast,
}: DataMappingsTabProps) {
  const queryClient = useQueryClient();
  const [selectedMappingIdx, setSelectedMappingIdx] = useState(0);
  const safeIdx = selectedMappingIdx < mappings.length ? selectedMappingIdx : 0;
  const primaryMapping = mappings[safeIdx];

  const [sourceColumn, setSourceColumn] = useState("");
  const [sqlType, setSqlType] = useState("VARCHAR(64)");
  const [targetProp, setTargetProp] = useState("");
  const [targetType, setTargetType] = useState("xsd:string");
  const [maskViewer, setMaskViewer] = useState(false);
  const [erOutput, setErOutput] = useState<{ mergedCount: number; sampleLinks: string[] } | null>(null);
  const [dryRunResult, setDryRunResult] = useState<{ rows: MappingDryRunRow[]; message: string } | null>(null);

  useEffect(() => {
    setSelectedMappingIdx(0);
    setDryRunResult(null);
    setErOutput(null);
  }, [workspaceId]);

  const ruleMutation = useMutation({
    mutationFn: (
      payload:
        | { mappingId: string; type: "TOGGLE_MASK"; ruleId: string; maskForViewer: boolean }
        | { mappingId: string; type: "ADD_RULE"; sourceColumn: string; sqlType: string; targetPropertyLocalName: string; targetXsdOrClass: string; maskForViewer: boolean }
    ) => {
      const { mappingId, ...body } = payload;
      return api.updateMappingRule(workspaceId, mappingId, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["data", workspaceId] });
      setSourceColumn("");
      setTargetProp("");
      onToast("已保存字段语义对齐与列级角色脱敏规则");
    },
    onError: (err: Error) => onToast(err.message),
  });

  const dryRunMutation = useMutation({
    mutationFn: (mappingId: string) => api.dryRunMapping(workspaceId, mappingId),
    onSuccess: (res) => { setDryRunResult(res); onToast(res.message); },
    onError: (err: Error) => onToast(err.message),
  });

  const erMutation = useMutation({
    mutationFn: () => api.runEntityResolution(workspaceId),
    onSuccess: (res) => {
      setErOutput({ mergedCount: res.mergedCount, sampleLinks: res.sampleLinks });
      for (const key of [["data", workspaceId], ["overview", workspaceId], ["bootstrap"]]) void queryClient.invalidateQueries({ queryKey: key });
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const handleAddRule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!primaryMapping || !sourceColumn.trim() || !targetProp.trim()) return;
    ruleMutation.mutate({ mappingId: primaryMapping.id, type: "ADD_RULE", sourceColumn: sourceColumn.trim(), sqlType: sqlType.trim(), targetPropertyLocalName: targetProp.trim(), targetXsdOrClass: targetType, maskForViewer: maskViewer });
  };

  const mapTableVars = { "--label-2": "'源类型'", "--label-3": "'目标本体属性'", "--label-4": "'XSD 类型转换'", "--label-5": "'安全与脱敏策略'" } as CSSProperties;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4 text-xs">
      {mappings.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="切换源表映射">
          {mappings.map((m, idx) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={idx === safeIdx}
              onClick={() => { setSelectedMappingIdx(idx); setDryRunResult(null); }}
              className={`px-3 py-1.5 rounded-lg border font-mono transition cursor-pointer ${
                idx === safeIdx
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] font-medium"
                  : "bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {m.sourceTable} → {m.targetClassDisplay}
            </button>
          ))}
        </div>
      )}

      {primaryMapping && (
        <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-between">
          <div>
            <span className="font-semibold text-sm">
              表映射规则：<code className="font-mono">{primaryMapping.sourceTable}</code> →{" "}
              <code className="font-mono text-[var(--primary)]">{primaryMapping.targetClassDisplay}</code>
            </span>
            <div className="text-[var(--muted-foreground)] mt-0.5">
              实例 IRI 生成模板：<code className="font-mono">{primaryMapping.subjectIriTemplate}</code>
            </div>
          </div>
          <button type="button" disabled={dryRunMutation.isPending} onClick={() => dryRunMutation.mutate(primaryMapping.id)} className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-50 cursor-pointer">
            {dryRunMutation.isPending ? "抽样试运行中..." : "抽样试运行映射"}
          </button>
        </div>
      )}

      {primaryMapping && primaryMapping.rules.length > 0 && (
        <div className="p-3.5 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-2">
          <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
            <span className="font-semibold text-[var(--foreground)]">源字段 ↔ 本体属性语义映射流向</span>
            <span>{primaryMapping.rules.length} 条生效规则</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {primaryMapping.rules.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--secondary)]/85 border border-[var(--border)] font-mono text-[11px]">
                <span className="text-[var(--foreground)]">{primaryMapping.sourceTable}.{r.sourceColumn}</span>
                <span className="text-[var(--muted-foreground)]">──▶</span>
                <span className="text-[var(--primary)] font-semibold">{r.targetPropertyDisplay}</span>
                {r.maskForViewer && <span title="VIEWER 角色掩码脱敏">🔒</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
        <div tabIndex={0} role="region" aria-label="字段语义映射配置表" className="table-wrapper">
          <table style={mapTableVars}>
            <thead>
              <tr>
                <th scope="col">源表列名</th>
                <th scope="col">SQL 类型</th>
                <th scope="col">映射本体属性</th>
                <th scope="col">目标 XSD / 桥接类</th>
                <th scope="col">治理与角色脱敏（点击可切换）</th>
              </tr>
            </thead>
            <tbody>
              {(primaryMapping ? [primaryMapping] : []).flatMap((m) =>
                m.rules.map((rule) => (
                  <tr key={rule.id}>
                    <th scope="row" className="font-mono">{rule.sourceColumn}</th>
                    <td>{rule.sqlType}</td>
                    <td><code className="font-mono text-[var(--primary)]">{rule.targetPropertyDisplay}</code></td>
                    <td><code className="font-mono">{rule.targetXsdOrClass}</code></td>
                    <td>
                      <button
                        type="button"
                        aria-pressed={rule.maskForViewer}
                        disabled={ruleMutation.isPending || !canModel}
                        title={!canModel ? ROLE_TIPS.model : undefined}
                        onClick={() => ruleMutation.mutate({ mappingId: m.id, type: "TOGGLE_MASK", ruleId: rule.id, maskForViewer: !rule.maskForViewer })}
                        className={`px-2 py-0.5 rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition ${
                          rule.maskForViewer
                            ? "bg-amber-500/15 text-amber-600 hover:bg-amber-500/25"
                            : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        {rule.maskForViewer ? "🔒 VIEWER 角色掩码脱敏" : rule.governanceNote}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {dryRunResult && (
        <DataMappingDryRunPreview rows={dryRunResult.rows} message={dryRunResult.message} />
      )}

      {primaryMapping && (
        <details className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <summary className="font-semibold text-sm text-[var(--primary)] cursor-pointer select-none">+ 可视化新增字段 → 本体属性映射规则</summary>
          <form onSubmit={handleAddRule} method="POST" className="mt-3.5 grid grid-cols-12 gap-3 items-end">
            <div className="col-span-3 space-y-1">
              <label htmlFor="map-col-input" className="block font-medium">源表物理列名</label>
              <input id="map-col-input" name="sourceColumn" type="text" required value={sourceColumn} onChange={(e) => setSourceColumn(e.target.value)} autoCorrect="off" autoCapitalize="none" spellCheck={false} placeholder="risk_note" className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono" />
            </div>
            <div className="col-span-2 space-y-1">
              <label htmlFor="map-sql-input" className="block font-medium">SQL 类型</label>
              <input id="map-sql-input" name="sqlType" type="text" value={sqlType} onChange={(e) => setSqlType(e.target.value)} autoCorrect="off" autoCapitalize="none" spellCheck={false} className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono" />
            </div>
            <div className="col-span-3 space-y-1">
              <label htmlFor="map-prop-input" className="block font-medium">目标本体属性名</label>
              <input id="map-prop-input" name="targetProp" type="text" required value={targetProp} onChange={(e) => setTargetProp(e.target.value)} autoCorrect="off" autoCapitalize="none" spellCheck={false} placeholder="riskSummary" className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono" />
            </div>
            <div className="col-span-2 space-y-1">
              <label htmlFor="map-xsd-select" className="block font-medium">转换类型</label>
              <select id="map-xsd-select" name="targetType" value={targetType} onChange={(e) => setTargetType(e.target.value)} className="w-full px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono">
                <option value="xsd:string">xsd:string</option><option value="xsd:integer">xsd:integer</option><option value="xsd:decimal">xsd:decimal</option><option value="xsd:date">xsd:date</option><option value="对象引用 ont:AccountOwner">对象桥接 ont:Owner</option>
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <input id="map-mask-chk" name="maskViewer" type="checkbox" checked={maskViewer} onChange={(e) => setMaskViewer(e.target.checked)} className="accent-[var(--primary)]" />
                <label htmlFor="map-mask-chk">VIEWER 脱敏</label>
              </div>
              <button type="submit" disabled={ruleMutation.isPending || !canModel} title={!canModel ? ROLE_TIPS.model : undefined} className="w-full py-1.5 rounded bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">添加规则</button>
            </div>
          </form>
        </details>
      )}

      <details className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
        <summary className="font-semibold text-sm text-[var(--primary)] cursor-pointer select-none">跨源主数据实体消歧对齐 (Entity Resolution · owl:sameAs)</summary>
        <div className="mt-3.5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--muted-foreground)]">基于组织名称标准化与信用代码哈希对齐多源异构实体，在活跃 ABox 图谱生成 <code className="font-mono">owl:sameAs</code> 权威主数据桥接。</span>
            <button type="button" disabled={erMutation.isPending || !canOperate} title={!canOperate ? ROLE_TIPS.operate : undefined} onClick={() => erMutation.mutate()} className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
              {erMutation.isPending ? "对齐融合中..." : "运行跨源实体对齐"}
            </button>
          </div>
          <div className="space-y-2">
            {entityResolutionRules.map((er) => (
              <div key={er.id} className="p-3 rounded-lg bg-[var(--secondary)] flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{er.name} → <code className="font-mono text-[var(--primary)]">ont:{er.targetClassLocalName}</code></div>
                  <div className="text-[var(--muted-foreground)] font-mono mt-0.5">对齐键：{er.matchKeyExpression} · 主数据前缀：{er.canonicalPrefix}</div>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 font-medium shrink-0">已融合 {er.lastMergedCount} 主体 {er.lastExecutedAt ? `· ${er.lastExecutedAt}` : ""}</span>
              </div>
            ))}
          </div>
          {erOutput && erOutput.sampleLinks.length > 0 && (
            <pre tabIndex={0} role="region" aria-label="owl:sameAs 实体对齐样本三元组" className="p-3 rounded-lg bg-[var(--secondary)] font-mono overflow-x-auto leading-relaxed">
              <code>{erOutput.sampleLinks.join("\n")}</code>
            </pre>
          )}
        </div>
      </details>
    </div>
  );
}
