import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { DialogId, EngineeringViewId, OntologyMode } from "../api/types";
import { getRolePermissions, ROLE_TIPS } from "../utils/rbac";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { InferenceRulesDrawer } from "../components/ontology/InferenceRulesDrawer";
import { OntologyBranchBar } from "../components/ontology/OntologyBranchBar";
import { OntologyCanvasPane } from "./OntologyCanvasPane";
import { OntologyEntityTree } from "./OntologyEntityTree";
import { OntologyInspector, type InspectorTabId } from "./OntologyInspector";
import { OntologyModesPanel } from "./OntologyModesPanel";
import { OntologyBranchPrPanel } from "./ontology/OntologyBranchPrPanel";
import { RdfImportModal } from "./RdfImportModal";

interface OntologyViewProps {
  workspaceId: string;
  mode: OntologyMode;
  selectedClassKey: string;
  currentRole?: string;
  onChangeMode: (mode: OntologyMode) => void;
  onSelectClassKey: (localName: string) => void;
  onSwitchView: (view: EngineeringViewId) => void;
  onOpenDialog: (dialog: DialogId) => void;
  onToast: (msg: string) => void;
}

export function OntologyView({
  workspaceId,
  mode,
  selectedClassKey,
  currentRole,
  onChangeMode,
  onSelectClassKey,
  onSwitchView,
  onOpenDialog,
  onToast,
}: OntologyViewProps) {
  const queryClient = useQueryClient();
  const { ask, confirmDialogNode } = useConfirmDialog();
  const { canModel } = getRolePermissions(currentRole);
  const [treeFilter, setTreeFilter] = useState("");
  const [inspectorTab, setInspectorTab] = useState<InspectorTabId>("sem");
  const [showInferred, setShowInferred] = useState(false);
  const [rdfModalOpen, setRdfModalOpen] = useState(false);
  const [rulesDrawerOpen, setRulesDrawerOpen] = useState(false);
  const [branchPrOpen, setBranchPrOpen] = useState(false);

  const { data: snapshot } = useQuery({
    queryKey: ["ontology", workspaceId],
    queryFn: () => api.getOntology(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const proposeReleaseMutation = useMutation({
    mutationFn: (version: string) => api.proposeRelease(workspaceId, { version }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["release", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      onToast(res.message || `已提交候选版本 ${res.version}，等待独立审核`);
      onSwitchView("release");
    },
    onError: (err: Error) => onToast(err.message),
  });

  const classes = snapshot?.classes ?? [];
  const properties = snapshot?.properties ?? [];
  const inferredRelations = snapshot?.inferredRelations ?? [];
  const inferredCount = inferredRelations.length;

  useEffect(() => {
    if (classes.length > 0 && !classes.some((c) => c.localName === selectedClassKey)) {
      onSelectClassKey(classes[0].localName);
    }
  }, [classes, selectedClassKey, onSelectClassKey]);

  const selectedClass = classes.find((c) => c.localName === selectedClassKey) ?? classes[0];

  return (
    <main className="flex-1 min-h-0 flex flex-col">
      <OntologyBranchBar
        workspaceId={workspaceId}
        revisionId={snapshot?.revisionId}
        canModel={canModel}
        onToast={onToast}
      />
      <div className="h-10 px-4 border-b border-[var(--border)] bg-[var(--card)] flex items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2.5">
          <div
            className="p-0.5 rounded-md bg-[var(--secondary)] border border-[var(--border)] flex gap-0.5"
            role="group"
            aria-label="本体视图切换"
          >
            {(
              [
                ["graph", "拓扑画布"],
                ["axioms", "公理与属性表"],
                ["turtle", "Turtle 源码"],
                ["diff", "版本语义 Diff"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => onChangeMode(m)}
                className={`px-2.5 py-1 rounded transition cursor-pointer ${
                  mode === m
                    ? "bg-[var(--card)] font-medium text-[var(--foreground)] shadow-sm"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-pressed={showInferred}
            onClick={() => {
              const next = !showInferred;
              setShowInferred(next);
              if (next && mode !== "graph") onChangeMode("graph");
            }}
            className={`px-2 py-0.5 rounded border transition cursor-pointer ${
              showInferred
                ? "bg-purple-500/15 border-purple-400 text-purple-700 font-medium"
                : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {`显示推理隐式边 (${inferredCount})`}
          </button>

          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
              snapshot?.consistent !== false
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-amber-500/15 text-amber-600"
            }`}
          >
            {snapshot?.consistent !== false ? "✓ OWL 2 EL / SHACL 一致" : "⚠ 存在待核查约束"}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
          <span>
            当前修订{" "}
            <code className="font-mono text-[var(--foreground)]">
              {snapshot?.revisionId ?? "rev:892cd334"}
            </code>
          </span>
          <span>·</span>
          <button type="button" onClick={() => setBranchPrOpen(true)} className="px-2 py-1 rounded bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-medium cursor-pointer">
            分支与 PR 审批
          </button>
          <button type="button" onClick={() => setRulesDrawerOpen(true)} className="px-2 py-1 rounded hover:bg-[var(--secondary)] text-[var(--foreground)] font-medium cursor-pointer">
            推理规则与标准导出
          </button>
          <button
            type="button"
            disabled={!canModel}
            title={!canModel ? ROLE_TIPS.model : undefined}
            onClick={() => setRdfModalOpen(true)}
            className="px-2 py-1 rounded hover:bg-[var(--secondary)] text-[var(--foreground)] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            导入 RDF
          </button>
          <button
            type="button"
            disabled={!canModel || proposeReleaseMutation.isPending}
            title={!canModel ? ROLE_TIPS.model : undefined}
            onClick={async () => {
              const { confirmed, inputValue } = await ask({
                title: "提交候选发布版本审核",
                description: "将为当前活跃本体修订创建候选发布包，并提交至独立审核人签署。",
                confirmLabel: "提交审核",
                tone: "primary",
                inputLabel: "候选发布版本号",
                inputPlaceholder: "例如 v2.1.0",
                inputDefaultValue: "v2.1.0",
              });
              if (confirmed && inputValue) proposeReleaseMutation.mutate(inputValue);
            }}
            className="px-2 py-1 rounded hover:bg-[var(--secondary)] text-[var(--primary)] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {proposeReleaseMutation.isPending ? "提交中..." : "提交版本审核 →"}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <OntologyEntityTree
          classes={classes}
          properties={properties}
          selectedLocalName={selectedClass?.localName}
          treeFilter={treeFilter}
          canModel={canModel}
          onChangeFilter={setTreeFilter}
          onChangeInspectorTab={setInspectorTab}
          onSelectClassKey={onSelectClassKey}
          onOpenDialog={onOpenDialog}
        />

        <section className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {mode === "graph" ? (
            <OntologyCanvasPane
              workspaceId={workspaceId}
              revisionId={snapshot?.revisionId}
              classes={classes}
              properties={properties}
              inferredRelations={inferredRelations}
              showInferred={showInferred}
              selectedLocalName={selectedClass?.localName ?? ""}
              currentRole={currentRole}
              onSelectClass={onSelectClassKey}
              onOpenDialog={onOpenDialog}
              onToast={onToast}
            />
          ) : (
            <OntologyModesPanel
              workspaceId={workspaceId}
              mode={mode}
              snapshot={snapshot}
              properties={properties}
              currentRole={currentRole}
              onToast={onToast}
            />
          )}
        </section>

        <OntologyInspector
          workspaceId={workspaceId}
          selectedClass={selectedClass}
          activeTab={inspectorTab}
          canModel={canModel}
          onChangeTab={setInspectorTab}
          onSwitchView={onSwitchView}
          onToast={onToast}
        />
      </div>

      <RdfImportModal workspaceId={workspaceId} open={rdfModalOpen} canModel={canModel} onClose={() => setRdfModalOpen(false)} onToast={onToast} />
      <InferenceRulesDrawer workspaceId={workspaceId} open={rulesDrawerOpen} canModel={canModel} onClose={() => setRulesDrawerOpen(false)} onToast={onToast} />
      <OntologyBranchPrPanel workspaceId={workspaceId} open={branchPrOpen} canModel={canModel} onClose={() => setBranchPrOpen(false)} onToast={onToast} />
      {confirmDialogNode}
    </main>
  );
}
