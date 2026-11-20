import type {
  ActiveViewId,
  DialogId,
  EngineeringViewId,
  GovernanceSnapshot,
  PersonaMode,
  PortalAppId,
  Workspace,
} from "../api/types";
import { SidebarNav } from "./SidebarNav";

interface SidebarProps {
  persona: PersonaMode;
  activeView: ActiveViewId;
  portalApp: PortalAppId;
  workspace?: Workspace;
  governance?: GovernanceSnapshot;
  openWorkItemCount: number;
  appVersionBadge: string;
  releaseAwaitingReview: boolean;
  portalTodoCount: number;
  onboardingProgress: string;
  onSwitchPersona: (persona: PersonaMode) => void;
  onSwitchView: (view: EngineeringViewId) => void;
  onSwitchPortalApp: (app: PortalAppId) => void;
  onOpenDialog: (dialog: DialogId) => void;
  onSwitchActor: (userId: string) => void;
  demoSwitcherEnabled?: boolean;
  onOpenLogin: () => void;
  onLogout: () => void;
}

export function Sidebar(props: SidebarProps) {
  const {
    persona,
    workspace,
    governance,
    onSwitchPersona,
    onOpenDialog,
    onSwitchActor,
    demoSwitcherEnabled = true,
    onOpenLogin,
    onLogout,
  } = props;

  const shortRev = workspace?.activeRevisionId?.replace(/^rev:/, "").slice(0, 6) ?? "892cd3";
  const currentUser = governance?.currentUser;
  const availableActors = governance?.availableActors ?? [];

  return (
    <aside className="w-[236px] h-dvh shrink-0 bg-[var(--sidebar)] border-r border-[var(--border)] flex flex-col justify-between select-none overflow-hidden">
      <div className="p-3.5 space-y-4 overflow-y-auto min-h-0">
        <div className="flex items-center gap-2.5 px-1.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
            灵
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-[var(--foreground)] truncate">灵·洞本体工作站</div>
            <div className="text-[11px] font-medium text-[var(--muted-foreground)] truncate">V7.0 Enterprise OS</div>
          </div>
        </div>

        <div
          className="p-1 rounded-lg bg-[var(--secondary)] border border-[var(--border)] grid grid-cols-2 gap-1"
          role="group"
          aria-label="角色视图模式"
        >
          <button
            type="button"
            onClick={() => onSwitchPersona("engineering")}
            className={`px-2 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              persona === "engineering"
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            本体工程台
          </button>
          <button
            type="button"
            onClick={() => onSwitchPersona("portal")}
            className={`px-2 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              persona === "portal"
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            业务应用门户
          </button>
        </div>

        <SidebarNav {...props} />
      </div>

      <div className="p-3 border-t border-[var(--border)] space-y-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onOpenDialog("tutorial")}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition cursor-pointer"
        >
          <span>◎ 角色快速上手指南</span>
          <span>{props.onboardingProgress}</span>
        </button>
        {persona === "engineering" && (
          <button
            type="button"
            onClick={() => onOpenDialog("contract")}
            className="w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded-md text-xs text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition cursor-pointer"
          >
            <span className="whitespace-nowrap">&lt;/&gt; 底层契约与溯源</span>
            <span className="font-mono text-[11px] shrink-0">rev:{shortRev}</span>
          </button>
        )}
        <div className="pt-1 flex items-center gap-2 px-1.5 py-1">
          <div className="w-6 h-6 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center text-xs font-semibold shrink-0">
            {currentUser?.name?.slice(0, 1) ?? "林"}
          </div>
          {demoSwitcherEnabled ? (
            <>
              <label htmlFor="sidebar-actor-select" className="sr-only">
                切换当前操作身份以验证职责分离与脱敏
              </label>
              <select
                id="sidebar-actor-select"
                name="actorId"
                value={currentUser?.id ?? ""}
                onChange={(e) => onSwitchActor(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs font-medium text-[var(--foreground)] truncate cursor-pointer focus:outline-none"
                title="点击切换登录角色以验证职责分离 (SoD) 与 VIEWER 敏感列脱敏"
              >
                {availableActors.length > 0 ? (
                  availableActors.map((actor) => (
                    <option key={actor.id} value={actor.id}>
                      {actor.name} · {actor.role}
                    </option>
                  ))
                ) : (
                  <option value={currentUser?.id ?? "owner"}>
                    {currentUser ? `${currentUser.name} · ${currentUser.role}` : "林远 · OWNER"}
                  </option>
                )}
              </select>
            </>
          ) : (
            <div className="min-w-0 flex-1 text-xs font-medium text-[var(--foreground)] truncate">
              {currentUser ? `${currentUser.name} · ${currentUser.role}` : "企业认证用户"}
            </div>
          )}
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Oxigraph & PostgreSQL 在线" />
        </div>
        <div className="flex items-center gap-1.5 px-1">
          {demoSwitcherEnabled && (
            <button
              type="button"
              onClick={onOpenLogin}
              className="flex-1 px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--card)] text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition cursor-pointer"
            >
              企业登录页
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            className={`${demoSwitcherEnabled ? "px-2" : "w-full px-2.5"} py-1 rounded-md border border-[var(--border)] text-[11px] text-[var(--muted-foreground)] hover:text-red-600 hover:border-red-500/30 hover:bg-red-500/5 transition cursor-pointer`}
          >
            {demoSwitcherEnabled ? "退出" : "退出登录"}
          </button>
        </div>
      </div>
    </aside>
  );
}
