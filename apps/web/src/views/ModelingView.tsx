import { useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { EngineeringViewId } from "../api/types";
import { ModernTabList, ModernTabPanel } from "../shell/ModernTabs";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { SemanticAssetLibrary } from "../components/modeling/SemanticAssetLibrary";
import { getRolePermissions, ROLE_TIPS } from "../utils/rbac";
import { DocumentUploadModal } from "./DocumentUploadModal";
import { ModelingWorkbenchTab } from "./ModelingWorkbenchTab";

type ModelingSubTab = "wiz" | "doc" | "ast";

interface ModelingViewProps {
  workspaceId: string;
  baseRevisionId: string;
  currentRole?: string;
  onSwitchView: (view: EngineeringViewId) => void;
  onToast: (msg: string) => void;
}

export function ModelingView({
  workspaceId,
  baseRevisionId,
  currentRole,
  onSwitchView,
  onToast,
}: ModelingViewProps) {
  const queryClient = useQueryClient();
  const { ask, confirmDialogNode } = useConfirmDialog();
  const { canModel } = getRolePermissions(currentRole);
  const [subTab, setSubTab] = useState<ModelingSubTab>("wiz");
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["modeling", workspaceId],
    queryFn: () => api.getModeling(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => api.deleteDocument(workspaceId, docId),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["modeling", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const documents = data?.documents ?? [];
  const dataSources = data?.dataSources ?? [];
  const assets = data?.semanticAssets ?? [];
  const proposals = data?.pendingProposals ?? [];

  const docTableVars = {
    "--label-2": "'格式与解析'",
    "--label-3": "'证据块数'",
    "--label-4": "'引用公理数'",
    "--label-5": "'内容指纹'",
    "--label-6": "'操作'",
  } as CSSProperties;

  return (
    <main className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 pt-3 bg-[var(--card)] border-b border-[var(--border)] flex items-center justify-between">
        <ModernTabList
          idPrefix="mod"
          ariaLabel="向导建模与资料页签"
          value={subTab}
          onChange={setSubTab}
          options={[
            { value: "wiz", label: "AI 辅助资料建模工作台" },
            { value: "doc", label: `资料与证据分块台账 (${documents.length})` },
            { value: "ast", label: `可复用标准本体资产库 (${assets.length})` },
          ]}
        />
        <div className="pb-2.5">
          <button
            type="button"
            disabled={!canModel}
            title={!canModel ? ROLE_TIPS.model : undefined}
            onClick={() => setUploadOpen(true)}
            className="px-3 py-1 rounded-md border border-[var(--border)] text-xs font-medium hover:bg-[var(--secondary)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            + 上传文档 / 多模态图件
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <ModernTabPanel idPrefix="mod" value="wiz" activeValue={subTab} onSelect={setSubTab}>
          <ModelingWorkbenchTab
            workspaceId={workspaceId}
            baseRevisionId={baseRevisionId}
            documents={documents}
            dataSources={dataSources}
            proposals={proposals}
            canModel={canModel}
            onSwitchView={onSwitchView}
            onToast={onToast}
          />
        </ModernTabPanel>

        <ModernTabPanel idPrefix="mod" value="doc" activeValue={subTab} onSelect={setSubTab}>
          <div className="p-6 max-w-6xl mx-auto">
            <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
              <div tabIndex={0} role="region" aria-label="资料与证据文档台账" className="table-wrapper">
                <table style={docTableVars}>
                  <thead>
                    <tr>
                      <th scope="col">资料名称</th>
                      <th scope="col">解析引擎状态</th>
                      <th scope="col">切分证据块</th>
                      <th scope="col">锚定本体公理</th>
                      <th scope="col">SHA-256 去重摘要</th>
                      <th scope="col">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <th scope="row">{doc.title}</th>
                        <td>
                          <span className="text-emerald-600 font-medium">{doc.parserStatus}</span>
                        </td>
                        <td>{doc.chunkCount} 块</td>
                        <td>{doc.anchoredAxiomCount} 条公理引用</td>
                        <td className="font-mono text-[var(--muted-foreground)]">{doc.sha256Digest}</td>
                        <td>
                          <button
                            type="button"
                            disabled={deleteDocMutation.isPending || !canModel}
                            title={!canModel ? ROLE_TIPS.model : undefined}
                            onClick={async () => {
                              const { confirmed } = await ask({
                                title: "删除资料与证据分块",
                                description: `确认删除资料「${doc.title}」及其分块证据吗？`,
                                confirmLabel: "确认删除",
                                tone: "danger",
                              });
                              if (confirmed) deleteDocMutation.mutate(doc.id);
                            }}
                            className="px-2 py-0.5 rounded border border-rose-500/30 text-rose-600 hover:bg-rose-500/10 font-medium disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </ModernTabPanel>

        <ModernTabPanel idPrefix="mod" value="ast" activeValue={subTab} onSelect={setSubTab}>
          <SemanticAssetLibrary workspaceId={workspaceId} assets={assets} canModel={canModel} onToast={onToast} />
        </ModernTabPanel>
      </div>

      <DocumentUploadModal
        workspaceId={workspaceId}
        open={uploadOpen}
        canModel={canModel}
        onClose={() => setUploadOpen(false)}
        onToast={onToast}
      />
      {confirmDialogNode}
    </main>
  );
}
