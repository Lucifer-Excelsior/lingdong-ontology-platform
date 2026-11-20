import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { BenchmarkCaseResult } from "../api/types";
import { ModernTabList, ModernTabPanel } from "../shell/ModernTabs";
import { getRolePermissions } from "../utils/rbac";
import { AppsDagTab } from "./AppsDagTab";
import { AppsEvalTab } from "./AppsEvalTab";
import { AppsMcpTab } from "./AppsMcpTab";
import { AppsSandboxTab } from "./AppsSandboxTab";
import { AppsEcaAndEmbedPanel } from "./apps/AppsEcaAndEmbedPanel";

type AppsSubTab = "dag" | "try" | "eval" | "mcp" | "eca";

interface AppsViewProps {
  workspaceId: string;
  currentRole?: string;
  onToast: (msg: string) => void;
}

export function AppsView({ workspaceId, currentRole, onToast }: AppsViewProps) {
  const { isOwner, canModel, canOperate, canApprove } = getRolePermissions(currentRole);
  const [subTab, setSubTab] = useState<AppsSubTab>("dag");
  const [localEvalCases, setLocalEvalCases] = useState<BenchmarkCaseResult[]>([]);

  useEffect(() => {
    setLocalEvalCases([]);
  }, [workspaceId]);

  const { data } = useQuery({
    queryKey: ["apps", workspaceId],
    queryFn: () => api.getApps(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const app = data?.app;
  const conversation = data?.conversation ?? [];
  const benchmarkCases =
    localEvalCases.length > 0
      ? localEvalCases
      : data?.benchmarkCases ?? data?.caseResults ?? [];
  const mcpTools = (app?.capabilities ?? []).filter((c) => c.mcpExposed);
  const activeVerLabel = app?.activeVersion
    ? app.activeVersion.includes("已发布")
      ? app.activeVersion
      : `${app.activeVersion} · 已发布线上`
    : "v2.0 · 已发布线上";

  return (
    <main className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 pt-3 bg-[var(--card)] border-b border-[var(--border)] flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 min-w-0">
          <div className="pb-3 flex items-center gap-2 shrink-0">
            <span className="font-semibold text-sm">
              {app?.name ?? "合同到期处置智能助手"}
            </span>
            <span className="px-2 py-0.5 rounded-full border border-[var(--border)] bg-[var(--secondary)] text-xs font-mono text-[var(--muted-foreground)]">
              {activeVerLabel}
            </span>
          </div>

          <ModernTabList
            idPrefix="app"
            ariaLabel="语义应用页签"
            value={subTab}
            onChange={setSubTab}
            options={[
              { value: "dag", label: "受控能力与 DAG 编排" },
              { value: "try", label: "问答与动作沙盒" },
              { value: "eval", label: `基准评测集 (${app?.totalBenchmarkCases ?? 58})` },
              { value: "mcp", label: "API 与 MCP 集成暴露" },
              { value: "eca", label: "事件自动化与嵌入 SDK" },
            ]}
          />
        </div>

        <div className="pb-2.5 text-xs shrink-0">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 font-medium">
            语义控制面已锁定 {app?.boundRevisionId ?? "rev:892cd3"}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <ModernTabPanel idPrefix="app" value="dag" activeValue={subTab} onSelect={setSubTab}>
          <AppsDagTab
            workspaceId={workspaceId}
            capabilities={app?.capabilities ?? []}
            executionPlans={app?.executionPlans ?? []}
            canModel={canModel}
            canOperate={canOperate}
            canApprove={canApprove}
            onToast={onToast}
          />
        </ModernTabPanel>

        <ModernTabPanel idPrefix="app" value="try" activeValue={subTab} onSelect={setSubTab}>
          <AppsSandboxTab
            workspaceId={workspaceId}
            conversation={conversation}
            executionPlans={app?.executionPlans ?? []}
            boundRevisionId={app?.boundRevisionId ?? "rev:892cd334"}
            canOperate={canOperate}
            canApprove={canApprove}
            onToast={onToast}
          />
        </ModernTabPanel>

        <ModernTabPanel idPrefix="app" value="eval" activeValue={subTab} onSelect={setSubTab}>
          <AppsEvalTab
            workspaceId={workspaceId}
            app={app}
            benchmarkCases={benchmarkCases}
            canOperate={canOperate}
            onCasesUpdated={setLocalEvalCases}
            onToast={onToast}
          />
        </ModernTabPanel>

        <ModernTabPanel idPrefix="app" value="mcp" activeValue={subTab} onSelect={setSubTab}>
          <AppsMcpTab workspaceId={workspaceId} mcpTools={mcpTools} isOwner={isOwner} onToast={onToast} />
        </ModernTabPanel>

        <ModernTabPanel idPrefix="app" value="eca" activeValue={subTab} onSelect={setSubTab}>
          <AppsEcaAndEmbedPanel workspaceId={workspaceId} canOperate={canOperate} onToast={onToast} />
        </ModernTabPanel>
      </div>
    </main>
  );
}
