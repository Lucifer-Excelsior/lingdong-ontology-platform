import { useState } from "react";
import type { DialogId, OntologyClass, OntologyProperty } from "../api/types";
import { ROLE_TIPS } from "../utils/rbac";
import type { InspectorTabId } from "./OntologyInspector";

type TreeTab = "tbox" | "rbox" | "shacl";

interface OntologyEntityTreeProps {
  classes: OntologyClass[];
  properties: OntologyProperty[];
  selectedLocalName?: string;
  treeFilter: string;
  canModel?: boolean;
  onChangeFilter: (q: string) => void;
  onChangeInspectorTab: (tab: InspectorTabId) => void;
  onSelectClassKey: (localName: string) => void;
  onOpenDialog: (dialog: DialogId) => void;
}

function formatCompactCount(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function treeIconColor(roleKind: OntologyClass["roleKind"]) {
  if (roleKind === "controlled_write") return "bg-amber-500/15 text-amber-600";
  if (roleKind === "knowledge") return "bg-emerald-500/15 text-emerald-600";
  if (roleKind === "actor") return "bg-purple-500/15 text-purple-600";
  return "bg-blue-500/15 text-blue-600";
}

export function OntologyEntityTree({
  classes,
  properties,
  selectedLocalName,
  treeFilter,
  canModel = true,
  onChangeFilter,
  onChangeInspectorTab,
  onSelectClassKey,
  onOpenDialog,
}: OntologyEntityTreeProps) {
  const [treeTab, setTreeTab] = useState<TreeTab>("tbox");
  const q = treeFilter.trim().toLowerCase();

  const filteredClasses = classes.filter(
    (cls) =>
      !q ||
      cls.labelZh.toLowerCase().includes(q) ||
      cls.localName.toLowerCase().includes(q) ||
      cls.properties.some((p) => p.localName.toLowerCase().includes(q) || p.labelZh.toLowerCase().includes(q))
  );

  const filteredProps = properties.filter(
    (p) =>
      !q ||
      p.labelZh.toLowerCase().includes(q) ||
      p.localName.toLowerCase().includes(q) ||
      p.domainLocalName.toLowerCase().includes(q) ||
      p.rangeLocalName.toLowerCase().includes(q)
  );

  const filteredShacl = classes.flatMap((cls) =>
    cls.shaclConstraints
      .filter(
        (sh) =>
          !q ||
          sh.propertyLocalName.toLowerCase().includes(q) ||
          sh.description.toLowerCase().includes(q) ||
          cls.labelZh.toLowerCase().includes(q) ||
          cls.localName.toLowerCase().includes(q)
      )
      .map((sh) => ({ cls, sh }))
  );

  return (
    <section
      aria-label="本体实体树"
      className="w-[228px] shrink-0 border-r border-[var(--border)] bg-[var(--card)] flex flex-col"
    >
      <div className="p-2.5 border-b border-[var(--border)] space-y-2">
        <search>
          <label htmlFor="ontology-tree-search" className="sr-only">
            筛选本体类、属性与形状
          </label>
          <input
            id="ontology-tree-search"
            name="treeFilter"
            type="search"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={treeFilter}
            onChange={(e) => onChangeFilter(e.target.value)}
            placeholder="筛选类、属性、形状..."
            className="w-full px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] text-xs focus:outline-none focus:border-[var(--primary)]"
          />
        </search>
        <div className="grid grid-cols-3 gap-1 p-0.5 rounded-md bg-[var(--secondary)] text-xs" role="tablist" aria-label="本体树维度">
          {(
            [
              ["tbox", "TBox 类"],
              ["rbox", "RBox"],
              ["shacl", "SHACL"],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={treeTab === tab}
              onClick={() => setTreeTab(tab)}
              className={`py-1 rounded cursor-pointer ${
                treeTab === tab
                  ? "bg-[var(--card)] font-medium text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
        {treeTab === "tbox" &&
          filteredClasses.map((cls) => {
            const active = cls.localName === selectedLocalName;
            return (
              <button
                key={cls.localName}
                type="button"
                onClick={() => onSelectClassKey(cls.localName)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md transition cursor-pointer ${
                  active
                    ? "bg-[var(--secondary)] text-[var(--foreground)] font-medium"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <span className={`w-4 h-4 rounded shrink-0 flex items-center justify-center font-mono font-bold text-xs ${treeIconColor(cls.roleKind)}`}>
                    C
                  </span>
                  <span className="truncate">{cls.labelZh}</span>
                </span>
                <span className="font-mono text-[var(--muted-foreground)] shrink-0 ml-1">
                  {formatCompactCount(cls.instanceCount)}
                </span>
              </button>
            );
          })}

        {treeTab === "rbox" &&
          (filteredProps.length === 0 ? (
            <div className="px-2 py-4 text-center text-[var(--muted-foreground)]">无匹配属性定义</div>
          ) : (
            filteredProps.map((prop) => {
              const domainClean = prop.domainLocalName.replace(/^ont:/, "");
              return (
                <button
                  key={`${prop.iri}-${domainClean}`}
                  type="button"
                  onClick={() => {
                    onSelectClassKey(domainClean);
                    onChangeInspectorTab("sem");
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-md hover:bg-[var(--secondary)] transition cursor-pointer space-y-0.5"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-4 h-4 rounded shrink-0 flex items-center justify-center font-mono font-bold text-[10px] ${prop.kind === "ObjectProperty" ? "bg-purple-500/15 text-purple-600" : "bg-blue-500/15 text-blue-600"}`}>
                      {prop.kind === "ObjectProperty" ? "R" : "D"}
                    </span>
                    <span className="font-medium text-[var(--foreground)] truncate">{prop.labelZh}</span>
                  </div>
                  <div className="font-mono text-[11px] text-[var(--muted-foreground)] truncate pl-5">
                    {domainClean} → {prop.rangeLocalName}
                  </div>
                </button>
              );
            })
          ))}

        {treeTab === "shacl" &&
          (filteredShacl.length === 0 ? (
            <div className="px-2 py-4 text-center text-[var(--muted-foreground)]">无匹配 SHACL 规则</div>
          ) : (
            filteredShacl.map(({ cls, sh }) => (
              <button
                key={`${cls.localName}-${sh.id}`}
                type="button"
                onClick={() => {
                  onSelectClassKey(cls.localName);
                  onChangeInspectorTab("shacl");
                }}
                className="w-full text-left px-2.5 py-2 rounded-md hover:bg-[var(--secondary)] transition cursor-pointer space-y-0.5"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono font-medium text-[var(--foreground)] truncate">
                    {cls.localName}.{sh.propertyLocalName}
                  </span>
                  <span className={`text-[10px] px-1 rounded shrink-0 ${sh.severity === "Violation" ? "bg-amber-500/15 text-amber-700" : "bg-[var(--secondary)] text-[var(--muted-foreground)]"}`}>
                    {sh.severity}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)] truncate">{sh.description}</div>
              </button>
            ))
          ))}
      </div>

      <div className="p-2.5 border-t border-[var(--border)]">
        <button
          type="button"
          disabled={!canModel}
          title={!canModel ? ROLE_TIPS.model : undefined}
          onClick={() => onOpenDialog("create")}
          className="w-full py-1.5 px-3 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--secondary)] text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          + 新建类 / 对象关系
        </button>
      </div>
    </section>
  );
}
