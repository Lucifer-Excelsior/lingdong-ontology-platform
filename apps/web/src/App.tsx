import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api/client";
import type { HttpStatusError } from "./api/ga-client";
import type { ActiveViewId, DialogId, EngineeringViewId, OntologyMode, PersonaMode, PortalAppId } from "./api/types";
import { readInitialUrlState, syncUrlState } from "./lib/url-state";
import { GlobalDialogs } from "./shell/GlobalDialogs";
import { Sidebar } from "./shell/Sidebar";
import { Topbar } from "./shell/Topbar";
import { ViewSkeleton } from "./shell/ViewSkeleton";
import { LoginView } from "./views/LoginView";

const OverviewView = lazy(() => import("./views/OverviewView").then((m) => ({ default: m.OverviewView })));
const ModelingView = lazy(() => import("./views/ModelingView").then((m) => ({ default: m.ModelingView })));
const OntologyView = lazy(() => import("./views/OntologyView").then((m) => ({ default: m.OntologyView })));
const DataView = lazy(() => import("./views/DataView").then((m) => ({ default: m.DataView })));
const AppsView = lazy(() => import("./views/AppsView").then((m) => ({ default: m.AppsView })));
const ReleaseView = lazy(() => import("./views/ReleaseView").then((m) => ({ default: m.ReleaseView })));
const GovernanceView = lazy(() => import("./views/GovernanceView").then((m) => ({ default: m.GovernanceView })));
const PortalView = lazy(() => import("./views/PortalView").then((m) => ({ default: m.PortalView })));

export function App() {
  const queryClient = useQueryClient();
  const [initUrl] = useState(readInitialUrlState);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | undefined>(initUrl.workspaceId);
  const [persona, setPersona] = useState<PersonaMode>(initUrl.persona);
  const [engineeringView, setEngineeringView] = useState<EngineeringViewId>(initUrl.view);
  const [portalApp, setPortalApp] = useState<PortalAppId>(initUrl.portalApp);
  const [ontologyMode, setOntologyMode] = useState<OntologyMode>("graph");
  const [selectedClassKey, setSelectedClassKey] = useState("Contract");
  const [openDialog, setOpenDialog] = useState<DialogId>(null);
  const [completedOnboardingIds, setCompletedOnboardingIds] = useState<string[]>(["step-doc", "step-canvas"]);
  const [showLoginView, setShowLoginView] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const toastTimerRef = useRef<number | null>(null);

  const toggleOnboardingStep = (stepId: string) => setCompletedOnboardingIds((p) => (p.includes(stepId) ? p.filter((id) => id !== stepId) : [...p, stepId]));
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(""), 4500);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpenDialog("command"); } };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const { data: authMode } = useQuery({ queryKey: ["auth-mode"], queryFn: () => api.getAuthMode(), retry: false });

  const bootstrapQuery = useQuery({
    queryKey: ["bootstrap", selectedWorkspaceId ?? "default"],
    queryFn: () => api.getBootstrap(selectedWorkspaceId),
    retry: (count, err) => (err as HttpStatusError)?.status !== 401 && count < 1,
  });

  const bootstrap = bootstrapQuery.data;
  const bootstrapError = bootstrapQuery.error as HttpStatusError | null;
  const bootstrapAuthFailed = bootstrapError?.status === 401;
  const activeWorkspace = bootstrap?.activeWorkspace;
  const activeWorkspaceId = activeWorkspace?.id ?? "";
  const governance = bootstrap?.governance;

  useEffect(() => {
    syncUrlState({ workspaceId: activeWorkspaceId || selectedWorkspaceId, persona, view: engineeringView, portalApp });
  }, [activeWorkspaceId, selectedWorkspaceId, persona, engineeringView, portalApp]);

  const { data: overviewData } = useQuery({ queryKey: ["overview", activeWorkspaceId], queryFn: () => api.getOverview(activeWorkspaceId), enabled: Boolean(activeWorkspaceId) });
  const { data: ontologyData } = useQuery({ queryKey: ["ontology", activeWorkspaceId], queryFn: () => api.getOntology(activeWorkspaceId), enabled: Boolean(activeWorkspaceId) });
  const { data: appsData } = useQuery({ queryKey: ["apps", activeWorkspaceId], queryFn: () => api.getApps(activeWorkspaceId), enabled: Boolean(activeWorkspaceId) });
  const { data: releaseData } = useQuery({ queryKey: ["release", activeWorkspaceId], queryFn: () => api.getRelease(activeWorkspaceId), enabled: Boolean(activeWorkspaceId) });
  const { data: portalData } = useQuery({ queryKey: ["portal", activeWorkspaceId], queryFn: () => api.getPortal(activeWorkspaceId), enabled: Boolean(activeWorkspaceId) });

  const switchActorMutation = useMutation({
    mutationFn: (userId: string) => api.switchActor(userId, activeWorkspaceId || undefined),
    onSuccess: (res) => {
      for (const key of ["bootstrap", "governance", "overview", "modeling", "ontology", "data", "apps", "release", "portal"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      showToast(`已切换当前操作身份：${res.actor.name} (${res.actor.role})`);
    },
    onError: (err: Error) => showToast(err.message),
  });

  const handleSwitchPersona = (next: PersonaMode) => {
    setPersona(next);
    showToast(next === "portal" ? "已切换至业务应用门户（工程菜单完全隔离隐藏）" : "已返回本体工程工作台");
  };

  const handleSelectWorkspace = (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    setSelectedClassKey("");
    const targetName = bootstrap?.workspaces.find((w) => w.id === workspaceId)?.name ?? workspaceId;
    showToast(`已切换工作空间上下文：${targetName}`);
  };

  const logoutMutation = useMutation({
    mutationFn: () => api.enterpriseLogout(),
    onSuccess: (res) => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth-mode" });
      setShowLoginView(true);
      showToast(res.message);
    },
    onError: (err: Error) => showToast(err.message),
  });

  if (showLoginView || bootstrapAuthFailed) {
    return (
      <LoginView
        authMode={authMode}
        onAuthenticated={(msg) => {
          setShowLoginView(false);
          void queryClient.invalidateQueries();
          if (msg) showToast(msg);
        }}
        onBackToDevWorkspace={
          authMode?.demoSwitcherEnabled && !bootstrapAuthFailed ? () => setShowLoginView(false) : undefined
        }
      />
    );
  }

  if (bootstrapQuery.isError && !bootstrapAuthFailed) {
    const statusBadge = bootstrapError?.status ? `HTTP ${bootstrapError.status}` : "连接异常";
    const errDetail = bootstrapError?.message || "无法连接工作站后端服务，请稍后重试。";
    return (
      <div className="min-h-screen w-full bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center p-6">
        <div role="alert" className="w-full max-w-md rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-lg overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-[var(--border)] bg-[var(--secondary)]/40 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-sm font-semibold text-[var(--foreground)]">服务暂时不可达</h1>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">未能加载工作空间引导数据，请检查网络或服务状态</p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-amber-500/10 text-amber-700 border border-amber-500/20 shrink-0">{statusBadge}</span>
          </div>
          <div className="p-6 space-y-4">
            <div className="p-3 rounded-xl bg-[var(--secondary)]/70 border border-[var(--border)] text-xs font-mono text-[var(--muted-foreground)] break-words">{errDetail}</div>
            <button type="button" disabled={bootstrapQuery.isFetching} onClick={() => void bootstrapQuery.refetch()} className="w-full py-2.5 px-4 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium shadow-sm hover:opacity-95 disabled:opacity-50 cursor-pointer transition">
              {bootstrapQuery.isFetching ? "正在重新连接..." : "重新连接"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeView: ActiveViewId = persona === "portal" ? "portal" : engineeringView;
  const currentRole = governance?.currentUser.role;
  const pendingProposals = ontologyData?.pendingProposals ?? [];
  const pendingProposalCount = ontologyData?.pendingProposals.length ?? activeWorkspace?.pendingProposalCount ?? 0;
  const releaseAwaitingReview = Boolean(releaseData?.releases.some((r) => r.status === "AWAITING_REVIEW"));
  const baseRevisionId = ontologyData?.revisionId ?? activeWorkspace?.activeRevisionId ?? "rev:892cd334";

  return (
    <div className="app-shell flex h-screen w-full overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <Sidebar
        persona={persona}
        activeView={activeView}
        portalApp={portalApp}
        workspace={activeWorkspace}
        governance={governance}
        openWorkItemCount={overviewData?.workItems.length ?? 0}
        appVersionBadge={appsData?.app.activeVersion ?? "v2"}
        releaseAwaitingReview={releaseAwaitingReview}
        portalTodoCount={(portalData?.contractAlerts ?? []).filter((a) => !a.pendingApprovalNote).length}
        onboardingProgress={`${completedOnboardingIds.length}/5`}
        onSwitchPersona={handleSwitchPersona}
        onSwitchView={(view) => {
          setPersona("engineering");
          setEngineeringView(view);
        }}
        onSwitchPortalApp={(app) => {
          setPersona("portal");
          setPortalApp(app);
        }}
        onOpenDialog={setOpenDialog}
        onSwitchActor={(userId) => switchActorMutation.mutate(userId)}
        demoSwitcherEnabled={authMode?.demoSwitcherEnabled ?? true}
        onOpenLogin={() => setShowLoginView(true)}
        onLogout={() => logoutMutation.mutate()}
      />

      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-[var(--background)]">
        <Topbar
          workspaces={bootstrap?.workspaces ?? []}
          activeWorkspace={activeWorkspace}
          persona={persona}
          activeView={activeView}
          pendingProposalCount={pendingProposalCount}
          currentRole={currentRole}
          onSelectWorkspace={handleSelectWorkspace}
          onOpenDialog={setOpenDialog}
        />

        <Suspense fallback={<ViewSkeleton />}>
          {activeView === "overview" && (
            <OverviewView workspaceId={activeWorkspaceId} currentRole={currentRole} appsData={appsData} releaseData={releaseData} onSwitchView={setEngineeringView} onOpenDialog={setOpenDialog} />
          )}
          {activeView === "modeling" && (
            <ModelingView workspaceId={activeWorkspaceId} baseRevisionId={baseRevisionId} currentRole={currentRole} onSwitchView={setEngineeringView} onToast={showToast} />
          )}
          {activeView === "ontology" && (
            <OntologyView workspaceId={activeWorkspaceId} mode={ontologyMode} selectedClassKey={selectedClassKey} currentRole={currentRole} onChangeMode={setOntologyMode} onSelectClassKey={setSelectedClassKey} onSwitchView={setEngineeringView} onOpenDialog={setOpenDialog} onToast={showToast} />
          )}
          {activeView === "data" && (
            <DataView workspaceId={activeWorkspaceId} activeRevisionId={baseRevisionId} currentUserRole={currentRole} onSwitchView={setEngineeringView} onOpenDialog={setOpenDialog} onToast={showToast} />
          )}
          {activeView === "apps" && <AppsView workspaceId={activeWorkspaceId} currentRole={currentRole} onToast={showToast} />}
          {activeView === "release" && <ReleaseView workspaceId={activeWorkspaceId} currentUser={governance?.currentUser} onToast={showToast} />}
          {activeView === "governance" && (
            <GovernanceView workspaceId={activeWorkspaceId} currentRole={currentRole} onOpenDialog={setOpenDialog} onSwitchActor={(userId) => switchActorMutation.mutate(userId)} onToast={showToast} />
          )}
          {activeView === "portal" && (
            <PortalView workspaceId={activeWorkspaceId} portalApp={portalApp} currentActorId={governance?.currentUser.id} currentRole={currentRole} onToast={showToast} />
          )}
        </Suspense>
      </div>

      <GlobalDialogs
        openDialog={openDialog}
        onClose={() => setOpenDialog(null)}
        workspace={activeWorkspace}
        workspaceId={activeWorkspaceId}
        baseRevisionId={baseRevisionId}
        proposals={pendingProposals}
        ontologyClasses={ontologyData?.classes ?? []}
        currentRole={currentRole}
        completedOnboardingIds={completedOnboardingIds}
        onToggleOnboardingStep={toggleOnboardingStep}
        onNavigateEngineering={(view, mode, entityKey) => {
          setPersona("engineering");
          setEngineeringView(view);
          if (mode) setOntologyMode(mode);
          if (entityKey) setSelectedClassKey(entityKey);
        }}
        onNavigatePortal={(app) => {
          setPersona("portal");
          setPortalApp(app);
        }}
        onSwitchPersona={setPersona}
        onToast={showToast}
      />

      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg transition-opacity duration-200 flex items-center gap-2.5 ${
          /(失败|错误|拒绝|拦截)/.test(toastMsg) ? "bg-rose-600 text-white" : "bg-[var(--foreground)] text-[var(--background)]"
        } ${toastMsg ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      >
        <span>{toastMsg}</span>
        {toastMsg && (
          <button type="button" aria-label="关闭提示" onClick={() => setToastMsg("")} className="opacity-80 hover:opacity-100 cursor-pointer leading-none text-sm">×</button>
        )}
      </div>
    </div>
  );
}
