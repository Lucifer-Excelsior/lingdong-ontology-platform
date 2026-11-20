import {
  BookOpen,
  Database,
  FileText,
  LayoutGrid,
  MessageSquare,
  Network,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  ActiveViewId,
  EngineeringViewId,
  PersonaMode,
  PortalAppId,
  Workspace,
} from "../api/types";

interface SidebarNavProps {
  persona: PersonaMode;
  activeView: ActiveViewId;
  portalApp: PortalAppId;
  workspace?: Workspace;
  openWorkItemCount: number;
  appVersionBadge: string;
  releaseAwaitingReview: boolean;
  portalTodoCount: number;
  onSwitchView: (view: EngineeringViewId) => void;
  onSwitchPortalApp: (app: PortalAppId) => void;
}

export function SidebarNav({
  persona,
  activeView,
  portalApp,
  workspace,
  openWorkItemCount,
  appVersionBadge,
  releaseAwaitingReview,
  portalTodoCount,
  onSwitchView,
  onSwitchPortalApp,
}: SidebarNavProps) {
  const shortAppBadge = appVersionBadge.split("·")[0]?.trim() || "v2.0";
  const navBtnClass = (view: EngineeringViewId) => {
    const active = activeView === view;
    return `w-full flex items-center justify-between gap-1.5 px-2 py-2 rounded-lg text-[13px] transition cursor-pointer ${
      active
        ? "font-medium bg-[var(--secondary)] text-[var(--foreground)]"
        : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
    }`;
  };

  if (persona === "portal") {
    return (
      <nav aria-label="业务门户应用列表" className="space-y-1">
        <div className="px-2 pb-1 text-xs font-medium text-[var(--muted-foreground)]">已发布业务智能应用</div>
        <button
          type="button"
          onClick={() => onSwitchPortalApp("contract")}
          className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[13px] transition cursor-pointer ${
            portalApp === "contract"
              ? "font-medium bg-[var(--secondary)] text-[var(--foreground)]"
              : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
          }`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <MessageSquare
              className={`w-4 h-4 shrink-0 ${portalApp === "contract" ? "text-[var(--primary)]" : ""}`}
            />
            <span className="truncate">合同到期处置台</span>
          </span>
          <span
            className={`shrink-0 whitespace-nowrap text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
              portalTodoCount > 0
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "bg-emerald-500/15 text-emerald-700"
            }`}
          >
            {portalTodoCount > 0 ? `${portalTodoCount} 待办` : "已清零"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onSwitchPortalApp("itu")}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition cursor-pointer ${
            portalApp === "itu"
              ? "font-medium bg-[var(--secondary)] text-[var(--foreground)]"
              : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
          }`}
        >
          <BookOpen className={`w-4 h-4 shrink-0 ${portalApp === "itu" ? "text-[var(--primary)]" : ""}`} />
          <span className="truncate">集团招采反围标审查</span>
        </button>
      </nav>
    );
  }

  return (
    <nav aria-label="本体工程主导航" className="space-y-4">
      <div className="space-y-1">
        <div className="px-2 pb-1 text-xs font-medium text-[var(--muted-foreground)]">语义工程流水线</div>

        <button
          type="button"
          aria-current={activeView === "overview" ? "page" : undefined}
          onClick={() => onSwitchView("overview")}
          className={navBtnClass("overview")}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <LayoutGrid className="w-4 h-4 shrink-0" />
            <span className="truncate">总览与任务</span>
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)]">
            {openWorkItemCount}
          </span>
        </button>

        <button
          type="button"
          aria-current={activeView === "modeling" ? "page" : undefined}
          onClick={() => onSwitchView("modeling")}
          className={navBtnClass("modeling")}
        >
          <span className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">向导建模与资料</span>
          </span>
          <span className="shrink-0 whitespace-nowrap text-xs px-1.5 py-0.5 rounded bg-[var(--primary)] text-[var(--primary-foreground)]">
            {workspace?.pendingProposalCount ?? 0}
          </span>
        </button>

        <button
          type="button"
          aria-current={activeView === "ontology" ? "page" : undefined}
          onClick={() => onSwitchView("ontology")}
          className={navBtnClass("ontology")}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Network
              className={`w-4 h-4 shrink-0 ${activeView === "ontology" ? "text-[var(--primary)]" : ""}`}
            />
            <span className="whitespace-nowrap">本体专家画布</span>
          </span>
          <span className="shrink-0 whitespace-nowrap text-xs px-1.5 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)]">
            {workspace?.classCount ?? 0} 类
          </span>
        </button>

        <button
          type="button"
          aria-current={activeView === "data" ? "page" : undefined}
          onClick={() => onSwitchView("data")}
          className={navBtnClass("data")}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Database className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">数据接入与物化</span>
          </span>
          <span className="w-2 h-2 shrink-0 rounded-full bg-emerald-500" title="增量同步正常" />
        </button>

        <button
          type="button"
          aria-current={activeView === "apps" ? "page" : undefined}
          onClick={() => onSwitchView("apps")}
          className={navBtnClass("apps")}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">语义应用与编排</span>
          </span>
          <span className="shrink-0 whitespace-nowrap text-xs px-1.5 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)]">
            {shortAppBadge}
          </span>
        </button>

        <button
          type="button"
          aria-current={activeView === "release" ? "page" : undefined}
          onClick={() => onSwitchView("release")}
          className={navBtnClass("release")}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span className="truncate">质量门禁与发布</span>
          </span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded font-medium ${
              releaseAwaitingReview
                ? "bg-amber-500/15 text-amber-600"
                : "bg-emerald-500/15 text-emerald-600"
            }`}
          >
            {releaseAwaitingReview ? "待审" : "已就绪"}
          </span>
        </button>
      </div>

      <div className="space-y-1 pt-2 border-t border-[var(--border)]">
        <div className="px-2 pb-1 text-xs font-medium text-[var(--muted-foreground)]">底座治理与运维</div>
        <button
          type="button"
          aria-current={activeView === "governance" ? "page" : undefined}
          onClick={() => onSwitchView("governance")}
          className={navBtnClass("governance")}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <Settings className="w-4 h-4 shrink-0" />
            <span className="truncate">模型、权限与运行</span>
          </span>
        </button>
      </div>
    </nav>
  );
}
