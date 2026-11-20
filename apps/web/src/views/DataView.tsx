import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { DialogId, EngineeringViewId } from "../api/types";
import { ModernTabList, ModernTabPanel } from "../shell/ModernTabs";
import { getRolePermissions, ROLE_TIPS } from "../utils/rbac";
import { DataMappingsTab } from "./DataMappingsTab";
import { DataMaterializationTab } from "./DataMaterializationTab";
import { DataSourcesTab } from "./DataSourcesTab";
import { DataSparqlTab } from "./DataSparqlTab";
import { DataLineageDriftPanel } from "./data/DataLineageDriftPanel";
import { DataEntityResolutionPanel } from "./data/DataEntityResolutionPanel";

type DataSubTab = "src" | "map" | "mat" | "spq" | "drift" | "er";

interface DataViewProps {
  workspaceId: string;
  activeRevisionId: string;
  currentUserRole?: string;
  onSwitchView: (view: EngineeringViewId) => void;
  onOpenDialog: (dialog: DialogId) => void;
  onToast: (msg: string) => void;
}

export function DataView({
  workspaceId,
  activeRevisionId,
  currentUserRole,
  onSwitchView,
  onOpenDialog,
  onToast,
}: DataViewProps) {
  const [subTab, setSubTab] = useState<DataSubTab>("src");

  const { data } = useQuery({
    queryKey: ["data", workspaceId],
    queryFn: () => api.getData(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const dataSources = data?.dataSources ?? [];
  const mappings = data?.mappings ?? [];
  const runs = data?.materializationRuns ?? [];
  const totalRules = mappings.reduce((sum, m) => sum + m.rules.length, 0);
  const { canModel, canOperate } = getRolePermissions(currentUserRole);

  return (
    <main className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 pt-3 bg-[var(--card)] border-b border-[var(--border)] flex items-center justify-between">
        <ModernTabList
          idPrefix="dt"
          ariaLabel="数据与物化页签"
          value={subTab}
          onChange={setSubTab}
          options={[
            { value: "src", label: `1. 数据源连接目录 (${dataSources.length})` },
            { value: "map", label: `2. 字段 → 本体语义映射 (${totalRules})` },
            { value: "mat", label: "3. ABox 持续物化与隔离区" },
            { value: "spq", label: "4. 实例浏览与 SPARQL 查询" },
            { value: "drift", label: "5. 血缘漂移预警" },
            { value: "er", label: "6. 实体消歧与黄金主数据" },
          ]}
        />
        <div className="pb-2.5 flex gap-2">
          <button
            type="button"
            disabled={!canModel}
            title={!canModel ? ROLE_TIPS.model : undefined}
            onClick={() => onOpenDialog("create")}
            className="px-3 py-1 rounded-md border border-[var(--border)] text-xs font-medium hover:bg-[var(--secondary)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            + 快速新建资产
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <ModernTabPanel idPrefix="dt" value="src" activeValue={subTab} onSelect={setSubTab}>
          <DataSourcesTab workspaceId={workspaceId} dataSources={dataSources} canModel={canModel} canOperate={canOperate} onSwitchView={onSwitchView} onToast={onToast} />
        </ModernTabPanel>

        <ModernTabPanel idPrefix="dt" value="map" activeValue={subTab} onSelect={setSubTab}>
          <DataMappingsTab
            workspaceId={workspaceId}
            mappings={mappings}
            entityResolutionRules={data?.entityResolutionRules ?? []}
            canModel={canModel}
            canOperate={canOperate}
            onToast={onToast}
          />
        </ModernTabPanel>

        <ModernTabPanel idPrefix="dt" value="mat" activeValue={subTab} onSelect={setSubTab}>
          <DataMaterializationTab
            workspaceId={workspaceId}
            activeRevisionId={activeRevisionId}
            runs={runs}
            schedule={data?.schedule}
            watermarkCursor={data?.watermarkCursor}
            canOperate={canOperate}
            onToast={onToast}
          />
        </ModernTabPanel>

        <ModernTabPanel idPrefix="dt" value="spq" activeValue={subTab} onSelect={setSubTab}>
          <DataSparqlTab
            workspaceId={workspaceId}
            defaultSparql={data?.defaultSparql ?? ""}
            currentUserRole={currentUserRole}
            onToast={onToast}
          />
        </ModernTabPanel>

        <ModernTabPanel idPrefix="dt" value="drift" activeValue={subTab} onSelect={setSubTab}>
          <DataLineageDriftPanel workspaceId={workspaceId} onToast={onToast} />
        </ModernTabPanel>

        <ModernTabPanel idPrefix="dt" value="er" activeValue={subTab} onSelect={setSubTab}>
          <DataEntityResolutionPanel workspaceId={workspaceId} canOperate={canOperate} onToast={onToast} />
        </ModernTabPanel>
      </div>
    </main>
  );
}
