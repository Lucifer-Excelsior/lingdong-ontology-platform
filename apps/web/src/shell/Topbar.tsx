import { Search } from "lucide-react";
import { VIEW_TITLES, type ActiveViewId, type DialogId, type PersonaMode, type Workspace } from "../api/types";
import { getRolePermissions, ROLE_TIPS } from "../utils/rbac";

interface TopbarProps {
  workspaces: Workspace[];
  activeWorkspace?: Workspace;
  persona: PersonaMode;
  activeView: ActiveViewId;
  pendingProposalCount: number;
  currentRole?: string;
  onSelectWorkspace: (workspaceId: string) => void;
  onOpenDialog: (dialog: DialogId) => void;
}

function formatWorkspaceStatus(status: Workspace["status"]) {
  if (status === "PUBLISHED") return "已发布";
  if (status === "ACTIVE") return "活跃";
  return "草稿";
}

export function Topbar({
  workspaces,
  activeWorkspace,
  persona,
  activeView,
  pendingProposalCount,
  currentRole,
  onSelectWorkspace,
  onOpenDialog,
}: TopbarProps) {
  const { canModel } = getRolePermissions(currentRole);
  return (
    <header className="h-12 shrink-0 px-4 border-b border-[var(--border)] bg-[var(--card)] flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-xs font-medium px-2 py-0.5 rounded bg-[var(--secondary)] text-[var(--muted-foreground)] shrink-0">
          方案空间
        </span>
        <select
          id="global-workspace-select"
          name="workspaceId"
          aria-label="切换当前方案工作空间"
          value={activeWorkspace?.id ?? ""}
          onChange={(e) => onSelectWorkspace(e.target.value)}
          className="bg-transparent text-sm font-semibold text-[var(--foreground)] focus:outline-none cursor-pointer pr-1 truncate"
        >
          {workspaces.map((ws) => {
            const statusText = formatWorkspaceStatus(ws.status);
            const label = ws.versionLabel.includes(statusText)
              ? `${ws.name} (${ws.versionLabel})`
              : `${ws.name} (${ws.versionLabel} · ${statusText})`;
            return (
              <option key={ws.id} value={ws.id}>
                {label}
              </option>
            );
          })}
        </select>
        <span className="text-[var(--border)]">/</span>
        <span className="text-sm text-[var(--muted-foreground)] truncate">{VIEW_TITLES[activeView]}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onOpenDialog("command")}
          className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--secondary)] text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition cursor-pointer"
        >
          <Search className="w-3.5 h-3.5" />
          <span>全局搜索与跳转...</span>
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] font-mono text-xs">
            ⌘K
          </kbd>
        </button>

        {persona === "engineering" && (
          <>
            <button
              type="button"
              onClick={() => onOpenDialog("changeset")}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)] text-xs font-medium text-[var(--foreground)] transition cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-[var(--primary)]" />
              <span>待审 ChangeSet</span>
              <span className="px-1.5 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-xs">
                {pendingProposalCount}
              </span>
            </button>

            <button
              type="button"
              disabled={!canModel}
              title={!canModel ? ROLE_TIPS.model : undefined}
              onClick={() => onOpenDialog("create")}
              className="px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
            >
              + 快速新建
            </button>
          </>
        )}
      </div>
    </header>
  );
}
