import type { Edge, Node } from "@xyflow/react";
import type { OntologyClass } from "../../api/types";
import type { ClassNodeData } from "../../views/OntologyClassNode";
import type { CanvasFocusMode } from "./OntologyCanvasToolbar";

export type PosMap = Record<string, { x: number; y: number }>;
export type DomainRoleFilter = "all" | "master" | "controlled_write" | "knowledge" | "actor";

export function capturePositions(list: Node<ClassNodeData>[]): PosMap {
  const map: PosMap = {};
  for (const n of list) map[n.id] = { x: n.position.x, y: n.position.y };
  return map;
}

export function computeVisibleNodeIds(
  focusMode: CanvasFocusMode,
  classes: OntologyClass[],
  selectedLocalName: string,
  edges: Edge[],
  searchQuery = "",
  roleFilter: DomainRoleFilter = "all"
): Set<string> | null {
  const q = searchQuery.trim().toLowerCase();
  if (focusMode === "all" && roleFilter === "all" && !q) return null;

  let candidates: Set<string>;
  if (focusMode === "core") {
    const core = classes
      .filter((c) => c.roleKind === "master" || c.roleKind === "controlled_write")
      .map((c) => c.localName);
    candidates = new Set(core.length > 0 ? core : classes.map((c) => c.localName));
  } else if (focusMode === "1hop") {
    candidates = new Set<string>(selectedLocalName ? [selectedLocalName] : []);
    for (const e of edges) {
      if (e.source === selectedLocalName) candidates.add(e.target);
      if (e.target === selectedLocalName) candidates.add(e.source);
    }
  } else {
    candidates = new Set(classes.map((c) => c.localName));
  }

  if (roleFilter === "all" && !q) return candidates;
  const filtered = new Set<string>();
  for (const c of classes) {
    if (!candidates.has(c.localName)) continue;
    if (roleFilter !== "all" && c.roleKind !== roleFilter) continue;
    if (q && !c.labelZh.toLowerCase().includes(q) && !c.localName.toLowerCase().includes(q)) continue;
    filtered.add(c.localName);
  }
  return filtered;
}
