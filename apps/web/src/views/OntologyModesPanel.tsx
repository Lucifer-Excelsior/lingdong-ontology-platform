import type { CSSProperties } from "react";
import type { OntologyMode, OntologyProperty, OntologySnapshotView } from "../api/types";
import { OntologyDiffPanel } from "./OntologyDiffPanel";

interface OntologyModesPanelProps {
  workspaceId: string;
  mode: Exclude<OntologyMode, "graph">;
  snapshot?: OntologySnapshotView;
  properties: OntologyProperty[];
  currentRole?: string;
  onToast: (msg: string) => void;
}

export function OntologyModesPanel({
  workspaceId,
  mode,
  snapshot,
  properties,
  currentRole,
  onToast,
}: OntologyModesPanelProps) {
  const axiomTableVars = {
    "--label-2": "'类型'",
    "--label-3": "'定义域 Domain'",
    "--label-4": "'值域 Range'",
    "--label-5": "'逆属性/特性'",
  } as CSSProperties;

  if (mode === "axioms") {
    return (
      <div className="flex-1 p-5 overflow-y-auto">
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          <div tabIndex={0} role="region" aria-label="对象关系与数据属性定义表" className="table-wrapper">
            <table style={axiomTableVars}>
              <thead>
                <tr>
                  <th scope="col">属性名称 / IRI</th>
                  <th scope="col">属性类别</th>
                  <th scope="col">定义域 (Domain)</th>
                  <th scope="col">值域 (Range)</th>
                  <th scope="col">OWL 特性与逆关系</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((prop) => (
                  <tr key={prop.iri}>
                    <th scope="row">
                      {prop.labelZh} (<code className="font-mono">{prop.localName}</code>)
                    </th>
                    <td>{prop.kind}</td>
                    <td>
                      <code className="font-mono">ont:{prop.domainLocalName}</code>
                    </td>
                    <td>
                      <code className="font-mono">
                        {prop.kind === "ObjectProperty" && !prop.rangeLocalName.startsWith("ont:")
                          ? `ont:${prop.rangeLocalName}`
                          : prop.rangeLocalName}
                      </code>
                    </td>
                    <td>
                      {prop.sensitiveMask ? "敏感列脱敏保护 · " : ""}
                      {prop.characteristics}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "turtle") {
    return (
      <div className="flex-1 p-5 overflow-y-auto">
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">只读标准序列化预览（RDF 1.1 Turtle · 可直接导入 Protégé）</span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(snapshot?.turtleSource ?? "");
                onToast("已复制 RDF 1.1 Turtle 源码");
              }}
              className="px-2.5 py-1 rounded bg-[var(--secondary)] font-medium cursor-pointer"
            >
              复制 Turtle
            </button>
          </div>
          <pre
            tabIndex={0}
            role="region"
            aria-label="RDF 1.1 Turtle 本体源码"
            className="p-4 rounded-lg bg-[var(--secondary)] text-xs font-mono overflow-x-auto leading-relaxed"
          >
            <code>{snapshot?.turtleSource ?? "# 正在加载 RDF 1.1 Turtle 源码..."}</code>
          </pre>
        </div>
      </div>
    );
  }

  return <OntologyDiffPanel workspaceId={workspaceId} snapshot={snapshot} currentRole={currentRole} onToast={onToast} />;
}
