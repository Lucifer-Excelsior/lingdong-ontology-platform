import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { InferredRelation, OntologyClass, OntologyProperty } from "../api/types";
import type { ClassNodeData } from "./OntologyClassNode";

export const COL_W = 290;
export const ROW_H = 205;

function formatShortInferredLabel(label: string) {
  if (/subClass|子类/i.test(label)) return "推理: subClassOf";
  if (/inverse|逆/i.test(label)) return "推理: 逆关系";
  if (/chain|链|传递/i.test(label)) return "推理链";
  const clean = label.replace(/^推理[:：]\s*/, "");
  return clean.length > 10 ? `推理: ${clean.slice(0, 9)}…` : `推理: ${clean}`;
}

export function buildInitialNodes(
  classes: OntologyClass[],
  selectedLocalName: string
): Node<ClassNodeData>[] {
  const placed: Array<{ x: number; y: number }> = [];
  return classes.map((cls, idx) => {
    let x = cls.positionX || (idx % 3) * COL_W + 48;
    let y = cls.positionY || Math.floor(idx / 3) * ROW_H + 64;
    if (placed.some((p) => Math.abs(p.x - x) < 205 && Math.abs(p.y - y) < 125)) {
      x = (idx % 3) * COL_W + 48;
      y = Math.floor(idx / 3) * ROW_H + 64;
    }
    placed.push({ x, y });
    return {
      id: cls.localName,
      type: "ontologyClass",
      position: { x, y },
      data: { cls, isSelected: cls.localName === selectedLocalName },
    };
  });
}

export function buildGraphEdges(
  classes: OntologyClass[],
  properties: OntologyProperty[],
  inferredRelations: InferredRelation[],
  showInferred: boolean,
  selectedLocalName: string
): Edge[] {
  const classSet = new Set(classes.map((c) => c.localName));
  const explicitEdges: Edge[] = properties
    .map((p) => ({
      ...p,
      cleanDomain: p.domainLocalName.replace(/^ont:/, ""),
      cleanRange: p.rangeLocalName.replace(/^ont:/, ""),
    }))
    .filter((p) => p.kind === "ObjectProperty" && classSet.has(p.cleanDomain) && classSet.has(p.cleanRange))
    .map((prop) => {
      const hi = prop.cleanDomain === selectedLocalName || prop.cleanRange === selectedLocalName;
      return {
        id: `edge-${prop.localName}-${prop.cleanDomain}-${prop.cleanRange}`,
        source: prop.cleanDomain,
        target: prop.cleanRange,
        label: prop.labelZh,
        animated: hi,
        style: { stroke: hi ? "#2563eb" : "#94a3b8", strokeWidth: hi ? 2 : 1.5 },
        labelStyle: { fill: hi ? "#2563eb" : "#64748b", fontWeight: hi ? 600 : 500, fontSize: 12 },
        labelBgStyle: { fill: "#ffffff", stroke: hi ? "#2563eb" : "#e2e8f0", strokeWidth: 1 },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 5,
        markerEnd: { type: MarkerType.ArrowClosed, color: hi ? "#2563eb" : "#94a3b8" },
      };
    });

  if (!showInferred) return explicitEdges;

  const inferredEdges: Edge[] = inferredRelations
    .map((r) => ({ ...r, s: r.sourceLocalName.replace(/^ont:/, ""), t: r.targetLocalName.replace(/^ont:/, "") }))
    .filter((r) => classSet.has(r.s) && classSet.has(r.t))
    .map((r) => ({
      id: `inferred-${r.id}`,
      source: r.s,
      target: r.t,
      label: formatShortInferredLabel(r.label),
      data: { fullLabel: r.label },
      style: { stroke: "#7c3aed", strokeWidth: 1.5, strokeDasharray: "5 4" },
      labelStyle: { fill: "#6d28d9", fontWeight: 600, fontSize: 9 },
      labelBgStyle: { fill: "rgba(250, 245, 255, 0.85)", stroke: "#c4b5fd", strokeWidth: 0.75 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed" },
    }));

  return [...explicitEdges, ...inferredEdges];
}
