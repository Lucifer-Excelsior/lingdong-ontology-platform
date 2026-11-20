import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { OntologyClass } from "../api/types";

export interface ClassNodeData extends Record<string, unknown> {
  cls: OntologyClass;
  isSelected: boolean;
}

function roleStyles(roleKind: OntologyClass["roleKind"]) {
  if (roleKind === "controlled_write") {
    return { badge: "bg-amber-500/15 text-amber-600", tag: "受控写", tagColor: "text-amber-600" };
  }
  if (roleKind === "knowledge") {
    return { badge: "bg-emerald-500/15 text-emerald-600", tag: "PROV-O", tagColor: "text-[var(--muted-foreground)]" };
  }
  if (roleKind === "actor") {
    return { badge: "bg-purple-500/15 text-purple-600", tag: "✓", tagColor: "text-emerald-600" };
  }
  return { badge: "bg-blue-500/15 text-blue-600", tag: "SHACL ✓", tagColor: "text-emerald-600 font-medium" };
}

export function OntologyClassNode({ data }: NodeProps<Node<ClassNodeData>>) {
  const { cls, isSelected } = data;
  const style = roleStyles(cls.roleKind);
  const subtitle =
    cls.sourceTable || cls.controlledActionCount > 0
      ? `${cls.sourceTable ?? "RDF 命名图"}${cls.controlledActionCount > 0 ? ` · ${cls.controlledActionCount} 受控动作` : ""}`
      : null;

  return (
    <div
      data-selected={isSelected ? "true" : "false"}
      className={`graph-node w-[196px] text-left p-3 rounded-xl bg-[var(--card)] border border-[var(--border)] ${
        isSelected ? "shadow-md" : "shadow-sm"
      }`}
    >
      <Handle id="target-left" type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-slate-400 !border-0" />
      <Handle id="target-top" type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-slate-400 !border-0" />
      <div className="flex items-center justify-between gap-1.5 text-xs mb-1">
        <span className={`px-1.5 py-0.5 rounded font-mono font-semibold truncate min-w-0 ${style.badge}`} title={`ont:${cls.localName}`}>
          ont:{cls.localName}
        </span>
        <span className={`shrink-0 whitespace-nowrap text-[11px] ${style.tagColor}`}>{style.tag}</span>
      </div>
      <div className={`font-semibold truncate ${isSelected ? "text-base" : "text-sm"} text-[var(--foreground)]`} title={cls.labelZh}>
        {cls.labelZh}
      </div>
      {subtitle && <div className="text-xs text-[var(--muted-foreground)] mt-0.5 truncate">{subtitle}</div>}
      <div className="mt-2 pt-2 border-t border-[var(--border)] flex justify-between text-xs text-[var(--muted-foreground)]">
        <span>{cls.properties.length} 属性</span>
        <span className={`font-mono ${isSelected ? "font-medium text-[var(--foreground)]" : ""}`}>
          {cls.instanceCount.toLocaleString()} 实例
        </span>
      </div>
      <Handle id="source-right" type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-blue-500 !border-0" />
      <Handle id="source-bottom" type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-blue-500 !border-0" />
    </div>
  );
}
