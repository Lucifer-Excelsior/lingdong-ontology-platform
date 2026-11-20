import type { EngineeringViewId, PersonaMode, PortalAppId } from "../api/types";

const VALID_VIEWS = new Set<EngineeringViewId>([
  "overview",
  "modeling",
  "ontology",
  "data",
  "apps",
  "release",
  "governance",
]);

export interface UrlNavState {
  workspaceId?: string;
  persona: PersonaMode;
  view: EngineeringViewId;
  portalApp: PortalAppId;
}

export function readInitialUrlState(): UrlNavState {
  if (typeof window === "undefined") {
    return { persona: "engineering", view: "overview", portalApp: "contract" };
  }
  const sp = new URLSearchParams(window.location.search);
  const ws = sp.get("ws")?.trim() || undefined;
  const persona: PersonaMode = sp.get("persona") === "portal" ? "portal" : "engineering";
  const rawView = sp.get("view") as EngineeringViewId | null;
  const view: EngineeringViewId = rawView && VALID_VIEWS.has(rawView) ? rawView : "overview";
  const portalApp: PortalAppId = sp.get("app") === "itu" ? "itu" : "contract";
  return { workspaceId: ws, persona, view, portalApp };
}

export function syncUrlState(state: UrlNavState): void {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams(window.location.search);
  if (state.workspaceId) sp.set("ws", state.workspaceId);
  sp.set("persona", state.persona);
  if (state.persona === "portal") {
    sp.set("app", state.portalApp);
    sp.delete("view");
  } else {
    sp.set("view", state.view);
    sp.delete("app");
  }
  const next = `${window.location.pathname}?${sp.toString()}${window.location.hash}`;
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
    window.history.replaceState(null, "", next);
  }
}
