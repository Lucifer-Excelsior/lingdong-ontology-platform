import { useState } from "react";
import type { DocumentRecord, FusionModality, ModelingDataSource } from "../api/types";
import { ROLE_TIPS } from "../utils/rbac";

export type EvidenceFilter = "ALL" | FusionModality;

export function isMultimodalDocument(doc: DocumentRecord): boolean {
  const s = `${doc.title} ${doc.parserStatus}`.toLowerCase();
  return (
    /\.(png|jpe?g|webp|svg|gif|bmp)\b/.test(s) ||
    /多模态|multimodal|vision|vlm|er\s?图|流程图|架构图|图表|diagram/.test(s)
  );
}

interface EvidencePoolPanelProps {
  documents: DocumentRecord[];
  dataSources: ModelingDataSource[];
  selectedDocIds: string[];
  selectedDsIds: string[];
  selectedTables: string[];
  autoGenerateMappings: boolean;
  instruction: string;
  canModel: boolean;
  isFusing: boolean;
  onToggleDoc: (docId: string) => void;
  onToggleDs: (dsId: string) => void;
  onToggleTable: (tableKey: string) => void;
  onToggleAutoMap: (checked: boolean) => void;
  onInstructionChange: (value: string) => void;
  onRunFusion: () => void;
}

const FILTER_OPTIONS: Array<{ value: EvidenceFilter; label: string }> = [
  { value: "ALL", label: "全部来源" },
  { value: "DOCUMENT", label: "📄 制度文档" },
  { value: "MULTIMODAL", label: "🖼️ 多模态图表" },
  { value: "DATABASE_SCHEMA", label: "🗄️ 数据库/系统元数据" },
];

export function EvidencePoolPanel({
  documents,
  dataSources,
  selectedDocIds,
  selectedDsIds,
  selectedTables,
  autoGenerateMappings,
  instruction,
  canModel,
  isFusing,
  onToggleDoc,
  onToggleDs,
  onToggleTable,
  onToggleAutoMap,
  onInstructionChange,
  onRunFusion,
}: EvidencePoolPanelProps) {
  const [filter, setFilter] = useState<EvidenceFilter>("ALL");

  const visibleDocs = documents.filter((doc) => {
    const multimodal = isMultimodalDocument(doc);
    if (filter === "ALL") return true;
    return filter === "MULTIMODAL" ? multimodal : filter === "DOCUMENT" && !multimodal;
  });
  const visibleDataSources = filter === "ALL" || filter === "DATABASE_SCHEMA" ? dataSources : [];

  const selectedModalities = new Set<FusionModality>();
  for (const doc of documents) {
    if (selectedDocIds.includes(doc.id)) {
      selectedModalities.add(isMultimodalDocument(doc) ? "MULTIMODAL" : "DOCUMENT");
    }
  }
  if (selectedDsIds.length > 0) selectedModalities.add("DATABASE_SCHEMA");
  const totalSelected = selectedDocIds.length + selectedDsIds.length;

  return (
    <div className="col-span-5 rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 flex flex-col justify-between space-y-3.5 text-xs">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-sm">1. 多源建模证据池</span>
          <span className="px-2 py-0.5 rounded bg-[var(--secondary)] font-mono text-[11px]">
            已选 {totalSelected} 项 · {selectedModalities.size} 类模态
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="证据模态筛选">
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(opt.value)}
                className={`px-2 py-1 rounded-md border text-[11px] font-medium transition cursor-pointer ${
                  active
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                    : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-0.5">
          {visibleDocs.map((doc) => {
            const multimodal = isMultimodalDocument(doc);
            const checked = selectedDocIds.includes(doc.id);
            const checkboxId = `ev-doc-${doc.id}`;
            const firstChunk = doc.chunks?.[0];
            return (
              <div
                key={doc.id}
                className={`p-2.5 rounded-lg border transition space-y-1.5 ${
                  checked ? "border-[var(--primary)]/50 bg-[var(--primary)]/[0.03]" : "border-[var(--border)] bg-[var(--background)]"
                }`}
              >
                <div className="flex items-start gap-2">
                  <input id={checkboxId} type="checkbox" checked={checked} onChange={() => onToggleDoc(doc.id)} className="mt-0.5 accent-[var(--primary)] cursor-pointer shrink-0" />
                  <label htmlFor={checkboxId} className="flex-1 min-w-0 cursor-pointer space-y-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-semibold text-[var(--foreground)] truncate">{doc.title}</span>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${multimodal ? "bg-purple-500/15 text-purple-600" : "bg-blue-500/15 text-blue-600"}`}>
                        {multimodal ? "🖼️ 多模态" : "📄 文档"}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      {doc.parserStatus} · {doc.chunkCount} 证据块
                    </div>
                  </label>
                </div>
                {checked && firstChunk && (
                  <p className="pl-5 text-[11px] text-[var(--muted-foreground)] line-clamp-2 leading-relaxed">
                    {firstChunk.content}
                  </p>
                )}
              </div>
            );
          })}

          {visibleDataSources.map((ds) => {
            const checked = selectedDsIds.includes(ds.id);
            const checkboxId = `ev-ds-${ds.id}`;
            return (
              <div
                key={ds.id}
                className={`p-2.5 rounded-lg border transition space-y-2 ${
                  checked ? "border-emerald-500/50 bg-emerald-500/[0.03]" : "border-[var(--border)] bg-[var(--background)]"
                }`}
              >
                <div className="flex items-start gap-2">
                  <input id={checkboxId} type="checkbox" checked={checked} onChange={() => onToggleDs(ds.id)} className="mt-0.5 accent-[var(--primary)] cursor-pointer shrink-0" />
                  <label htmlFor={checkboxId} className="flex-1 min-w-0 cursor-pointer space-y-0.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-semibold text-[var(--foreground)] truncate">{ds.name}</span>
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-600">
                        🗄️ {ds.kind}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[var(--muted-foreground)] truncate">
                      {ds.connectionDisplayUrl} ({ds.tables.length} 表)
                    </div>
                  </label>
                </div>
                {checked && ds.tables.length > 0 && (
                  <div className="pl-5 flex flex-wrap gap-1.5" role="group" aria-label={`${ds.name} 参与融合的数据表`}>
                    {ds.tables.map((tbl) => {
                      const tableKey = `${tbl.schemaName}.${tbl.tableName}`;
                      const active = selectedTables.includes(tableKey);
                      return (
                        <button
                          key={tableKey}
                          type="button"
                          aria-pressed={active}
                          onClick={() => onToggleTable(tableKey)}
                          className={`px-2 py-0.5 rounded border font-mono text-[11px] transition cursor-pointer ${
                            active
                              ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 font-medium"
                              : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
                          }`}
                        >
                          {active ? "✓ " : ""}{tableKey}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {visibleDocs.length === 0 && visibleDataSources.length === 0 && (
            <div className="p-4 rounded-lg border border-dashed border-[var(--border)] text-center text-[var(--muted-foreground)]">
              当前筛选下暂无证据源，可切换筛选或点击右上角上传文档/多模态图件。
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t border-[var(--border)]">
        {selectedDsIds.length > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--secondary)]">
            <input id="mod-auto-map-checkbox" type="checkbox" checked={autoGenerateMappings} onChange={(e) => onToggleAutoMap(e.target.checked)} className="accent-[var(--primary)] cursor-pointer shrink-0" />
            <label htmlFor="mod-auto-map-checkbox" className="cursor-pointer font-medium text-[var(--foreground)]">
              同步自动生成模块 4 字段语义映射草稿
            </label>
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="mod-instruction-input" className="block text-[var(--muted-foreground)]">
            融合论证指令与关注口径（可选）
          </label>
          <textarea
            id="mod-instruction-input"
            name="instruction"
            rows={2}
            value={instruction}
            onChange={(e) => onInstructionChange(e.target.value)}
            placeholder="例如：交叉比对制度条款、ER 图与数据库表字段，识别口径冲突并生成候选本体提案..."
            className="w-full p-2 rounded-md border border-[var(--border)] bg-[var(--background)]"
          />
        </div>

        <button
          type="button"
          disabled={totalSelected === 0 || isFusing || !canModel}
          title={!canModel ? ROLE_TIPS.model : undefined}
          onClick={onRunFusion}
          className="w-full py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isFusing ? "正在执行多源融合分析与交叉论证..." : "多源融合分析与交叉论证"}
        </button>
      </div>
    </div>
  );
}
