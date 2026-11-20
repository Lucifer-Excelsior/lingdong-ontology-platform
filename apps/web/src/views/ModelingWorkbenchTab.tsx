import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ChangeSetProposal, DocumentRecord, EngineeringViewId, EvidenceSourceRef, FusionSummary, ModelingDataSource } from "../api/types";
import { ROLE_TIPS } from "../utils/rbac";
import { getWorkspaceCopy } from "../utils/workspaceCopy";
import { EvidencePoolPanel, isMultimodalDocument } from "./EvidencePoolPanel";

interface ModelingWorkbenchTabProps {
  workspaceId: string;
  baseRevisionId: string;
  documents: DocumentRecord[];
  dataSources: ModelingDataSource[];
  proposals: ChangeSetProposal[];
  canModel?: boolean;
  onSwitchView: (view: EngineeringViewId) => void;
  onToast: (msg: string) => void;
}

function renderFusionBadge(status?: ChangeSetProposal["fusionStatus"]) {
  if (status === "CORROBORATED") {
    return <span className="px-2 py-0.5 rounded font-medium bg-emerald-500/15 text-emerald-700 border border-emerald-500/25">✓ 多源交叉印证</span>;
  }
  if (status === "CONFLICT_DETECTED") {
    return <span className="px-2 py-0.5 rounded font-medium bg-amber-500/15 text-amber-700 border border-amber-500/30">⚠ 跨源口径冲突 · 需裁决</span>;
  }
  if (status === "SINGLE_SOURCE") {
    return <span className="px-2 py-0.5 rounded font-medium bg-blue-500/10 text-blue-600 border border-blue-500/20">ℹ 单源补充</span>;
  }
  return null;
}

function evidenceChipStyle(kind: EvidenceSourceRef["kind"]) {
  if (kind === "DOCUMENT") return { icon: "📄 文档", cls: "bg-blue-500/10 text-blue-700 border-blue-500/20" };
  if (kind === "MULTIMODAL") return { icon: "🖼️ 多模态", cls: "bg-purple-500/10 text-purple-700 border-purple-500/20" };
  return { icon: "🗄️ 数据库", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" };
}

export function ModelingWorkbenchTab({
  workspaceId,
  baseRevisionId,
  documents,
  dataSources,
  proposals,
  canModel = true,
  onSwitchView,
  onToast,
}: ModelingWorkbenchTabProps) {
  const queryClient = useQueryClient();
  const copy = getWorkspaceCopy(workspaceId);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [selectedDsIds, setSelectedDsIds] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [autoGenerateMappings, setAutoGenerateMappings] = useState(true);
  const [instruction, setInstruction] = useState(copy.modelingInstruction);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [fusionTelemetry, setFusionTelemetry] = useState<{ summary: FusionSummary; engineUsed: string } | null>(null);
  const initKeyRef = useRef("");

  useEffect(() => {
    setInstruction(copy.modelingInstruction);
    setFusionTelemetry(null);
    initKeyRef.current = "";
  }, [workspaceId, copy.modelingInstruction]);

  useEffect(() => {
    if (documents.length === 0 && dataSources.length === 0) return;
    const key = `${workspaceId}:${documents.length > 0 ? 1 : 0}:${dataSources.length > 0 ? 1 : 0}`;
    if (initKeyRef.current === key) return;
    initKeyRef.current = key;

    const firstRegular = documents.find((d) => !isMultimodalDocument(d));
    const multimodalIds = documents.filter(isMultimodalDocument).map((d) => d.id);
    const defaultDocs = Array.from(new Set([...(firstRegular ? [firstRegular.id] : []), ...multimodalIds]));
    if (defaultDocs.length === 0 && documents[0]) defaultDocs.push(documents[0].id);
    setSelectedDocIds(defaultDocs);

    const firstDs = dataSources[0];
    setSelectedDsIds(firstDs ? [firstDs.id] : []);
    setSelectedTables(firstDs ? firstDs.tables.map((t) => `${t.schemaName}.${t.tableName}`) : []);
  }, [workspaceId, documents, dataSources]);

  useEffect(() => {
    setCheckedIds(proposals.filter((p) => p.selectedByDefault || p.confidence === "STRONG").map((p) => p.id));
  }, [proposals]);

  const fuseMutation = useMutation({
    mutationFn: () =>
      api.fuseModelingEvidence(workspaceId, {
        documentIds: selectedDocIds,
        dataSourceIds: selectedDsIds,
        selectedTables: selectedDsIds.length > 0 ? selectedTables : undefined,
        instruction: instruction.trim() || undefined,
        autoGenerateMappings: selectedDsIds.length > 0 ? autoGenerateMappings : false,
      }),
    onSuccess: (res) => {
      setFusionTelemetry({ summary: res.fusionSummary, engineUsed: res.engineUsed });
      for (const key of [["modeling", workspaceId], ["ontology", workspaceId], ["data", workspaceId], ["bootstrap"]]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      onToast(res.message || `多源融合分析完成，生成 ${res.proposals.length} 项候选提案`);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const commitMutation = useMutation({
    mutationFn: () => api.commitChangeSet(workspaceId, { baseRevisionId, proposalIds: checkedIds }),
    onSuccess: (res) => {
      for (const key of [["bootstrap"], ["overview", workspaceId], ["modeling", workspaceId], ["ontology", workspaceId]]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      onToast(`已通过 ChangeSet 门禁原子合入 ${checkedIds.length} 项提案，生成新修订 ${res.revisionId}`);
      onSwitchView("ontology");
    },
    onError: (err: Error) => onToast(err.message),
  });

  const toggleDoc = (docId: string) =>
    setSelectedDocIds((prev) => (prev.includes(docId) ? prev.filter((x) => x !== docId) : [...prev, docId]));

  const toggleDs = (dsId: string) => {
    const dsTableKeys = dataSources.find((d) => d.id === dsId)?.tables.map((t) => `${t.schemaName}.${t.tableName}`) ?? [];
    setSelectedDsIds((prev) => {
      const removing = prev.includes(dsId);
      setSelectedTables((tPrev) =>
        removing ? tPrev.filter((k) => !dsTableKeys.includes(k)) : Array.from(new Set([...tPrev, ...dsTableKeys]))
      );
      return removing ? prev.filter((x) => x !== dsId) : [...prev, dsId];
    });
  };

  const toggleTable = (tableKey: string) =>
    setSelectedTables((prev) => (prev.includes(tableKey) ? prev.filter((x) => x !== tableKey) : [...prev, tableKey]));

  const toggleProposalId = (id: string) =>
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="p-6 max-w-6xl mx-auto grid grid-cols-12 gap-5">
      <EvidencePoolPanel
        documents={documents}
        dataSources={dataSources}
        selectedDocIds={selectedDocIds}
        selectedDsIds={selectedDsIds}
        selectedTables={selectedTables}
        autoGenerateMappings={autoGenerateMappings}
        instruction={instruction}
        canModel={canModel}
        isFusing={fuseMutation.isPending}
        onToggleDoc={toggleDoc}
        onToggleDs={toggleDs}
        onToggleTable={toggleTable}
        onToggleAutoMap={setAutoGenerateMappings}
        onInstructionChange={setInstruction}
        onRunFusion={() => fuseMutation.mutate()}
      />

      <div className="col-span-7 rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 flex flex-col justify-between space-y-4 text-xs">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="font-semibold text-sm">2. 审阅候选语义提案并合入画布</span>
              <p className="text-[var(--muted-foreground)] mt-0.5">
                按多源印证与口径冲突分级标出差异；仅勾选确认后才会写入正式本体画布，不污染线上模型。
              </p>
            </div>
            <button
              type="button"
              disabled={checkedIds.length === 0 || commitMutation.isPending || !canModel}
              title={!canModel ? ROLE_TIPS.model : undefined}
              onClick={() => commitMutation.mutate()}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {commitMutation.isPending ? "合入中..." : "采纳已选并进入画布 →"}
            </button>
          </div>

          {fusionTelemetry && (
            <div role="status" className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="font-medium">
                  已融合 {fusionTelemetry.summary.modalitiesUsed.length} 类来源：交叉印证 {fusionTelemetry.summary.corroboratedCount} 项 · 口径冲突 {fusionTelemetry.summary.conflictCount} 项 · 单源补充 {fusionTelemetry.summary.singleSourceCount} 项
                  {fusionTelemetry.summary.autoMappedTables.length > 0 && ` · 已生成 ${fusionTelemetry.summary.autoMappedTables.length} 表映射草稿`}
                </div>
                <div className="font-mono text-[11px] opacity-80">分析引擎：{fusionTelemetry.engineUsed}</div>
              </div>
              {onSwitchView && (
                <button
                  type="button"
                  onClick={() => onSwitchView("data")}
                  className="shrink-0 px-2.5 py-1 rounded-md bg-emerald-600 text-white font-medium hover:bg-emerald-700 cursor-pointer"
                >
                  前往数据映射查看草稿 →
                </button>
              )}
            </div>
          )}

          <div className="space-y-2.5">
            {proposals.length === 0 ? (
              <div className="p-4 rounded-xl border border-[var(--border)] text-[var(--muted-foreground)] text-center">
                当前提案队列已全部处理，可在左侧勾选文档、多模态图件与数据源后运行「多源融合分析与交叉论证」。
              </div>
            ) : (
              proposals.map((prop) => {
                const checked = checkedIds.includes(prop.id);
                const checkboxId = `mod-prop-${prop.id}`;
                return (
                  <div key={prop.id} className={`p-3.5 rounded-xl border space-y-2 ${prop.fusionStatus === "CONFLICT_DETECTED" ? "border-amber-500/50 bg-amber-500/[0.03]" : "border-[var(--border)]"} ${checked ? "" : "opacity-80"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input id={checkboxId} type="checkbox" checked={checked} onChange={() => toggleProposalId(prop.id)} className="accent-[var(--primary)] cursor-pointer" />
                        <label htmlFor={checkboxId} className="font-semibold text-sm cursor-pointer">
                          {prop.title.includes(prop.localName) ? prop.title : <>{prop.title} (<code className="font-mono">{prop.localName}</code>)</>}
                        </label>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {renderFusionBadge(prop.fusionStatus)}
                        <span className={`px-2 py-0.5 rounded font-medium ${checked ? "bg-emerald-500/10 text-emerald-600" : "bg-[var(--secondary)] text-[var(--muted-foreground)]"}`}>
                          {checked ? "已勾选采纳" : "暂缓采纳"}
                        </span>
                      </div>
                    </div>

                    <div className="text-[var(--muted-foreground)] pl-5">
                      所属类：<code className="font-mono">ont:{prop.targetClassLocalName}</code> · 值域：<code className="font-mono">{prop.rangeOrDatatype}</code> · 证据锚点：<code className="font-mono">{prop.evidenceAnchor}</code>
                    </div>

                    {prop.fusionStatus === "CONFLICT_DETECTED" && prop.conflictNote && (
                      <div className="ml-5 p-2 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-800 leading-relaxed">
                        <span className="font-semibold">跨源冲突说明：</span>{prop.conflictNote}
                      </div>
                    )}

                    <div className="text-[var(--muted-foreground)] pl-5">{prop.rationale}</div>

                    {prop.evidenceSources && prop.evidenceSources.length > 0 && (
                      <div className="pl-5 flex flex-wrap gap-1.5 pt-0.5">
                        {prop.evidenceSources.map((src, idx) => {
                          const style = evidenceChipStyle(src.kind);
                          return (
                            <span key={`${src.kind}-${idx}`} className={`inline-flex items-start gap-1.5 px-2 py-1 rounded border text-[11px] leading-snug ${style.cls}`}>
                              <span className="font-medium shrink-0 whitespace-nowrap">{style.icon}</span>
                              <span><strong className="font-semibold">{src.label}</strong> <span className="opacity-80">· {src.detail}</span></span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
