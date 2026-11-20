import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { EngineeringViewId, OntologyClass } from "../api/types";
import { OntologyAxiomEditor } from "../components/ontology/OntologyAxiomEditor";
import { OntologyImpactPreview } from "../components/ontology/OntologyImpactPreview";
import { ModernTabList, ModernTabPanel } from "../shell/ModernTabs";
import { ROLE_TIPS } from "../utils/rbac";

export type InspectorTabId = "sem" | "shacl" | "map";

interface OntologyInspectorProps {
  workspaceId: string;
  selectedClass?: OntologyClass;
  activeTab: InspectorTabId;
  canModel?: boolean;
  onChangeTab: (tab: InspectorTabId) => void;
  onSwitchView: (view: EngineeringViewId) => void;
  onToast: (msg: string) => void;
}

export function OntologyInspector({
  workspaceId,
  selectedClass,
  activeTab,
  canModel = true,
  onChangeTab,
  onSwitchView,
  onToast,
}: OntologyInspectorProps) {
  const queryClient = useQueryClient();
  const [propLabel, setPropLabel] = useState("");
  const [propLocal, setPropLocal] = useState("");
  const [propType, setPropType] = useState("xsd:string");

  const [shaclProp, setShaclProp] = useState("");
  const [shaclMin, setShaclMin] = useState("0");
  const [shaclDesc, setShaclDesc] = useState("");

  const inlineAuthorMutation = useMutation({
    mutationFn: (payload: { kind: "ADD_DATATYPE_PROPERTY" | "ADD_SHACL_CONSTRAINT"; labelZh: string; localName: string; targetOrDatatype: string; minInclusive?: number }) =>
      api.authorOntologyElement(workspaceId, { ...payload, sourceClassLocalName: selectedClass?.localName ?? "Contract", commitImmediately: true }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["ontology", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      void queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
      setPropLabel("");
      setPropLocal("");
      setShaclProp("");
      setShaclDesc("");
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  if (!selectedClass) {
    return (
      <aside aria-label="实体属性与影响检查器" className="w-[320px] shrink-0 border-l border-[var(--border)] bg-[var(--card)] p-4 text-xs text-[var(--muted-foreground)]">
        请在左侧实体树或拓扑画布中选择本体类以检视公理与 SHACL 形状。
      </aside>
    );
  }

  const downstreamTotal = selectedClass.downstreamMappings.length + selectedClass.downstreamCapabilities.length;

  const handleAddProperty = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!propLabel.trim() || !propLocal.trim()) return;
    inlineAuthorMutation.mutate({
      kind: "ADD_DATATYPE_PROPERTY",
      labelZh: propLabel.trim(),
      localName: propLocal.trim(),
      targetOrDatatype: propType,
    });
  };

  const handleAddShacl = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const targetName = shaclProp.trim() || selectedClass.properties[0]?.localName || "value";
    inlineAuthorMutation.mutate({
      kind: "ADD_SHACL_CONSTRAINT",
      labelZh: shaclDesc.trim() || `${targetName} 闭合数值约束`,
      localName: targetName,
      targetOrDatatype: "xsd:decimal",
      minInclusive: Number(shaclMin) || 0,
    });
  };

  return (
    <aside aria-label="实体属性与影响检查器" className="w-[320px] shrink-0 border-l border-[var(--border)] bg-[var(--card)] flex flex-col">
      <div className="p-4 border-b border-[var(--border)] space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold">{selectedClass.labelZh}</h2>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(selectedClass.iri);
                  onToast(`已复制完整 IRI：${selectedClass.iri}`);
                }}
                className="px-1.5 py-0.5 rounded bg-[var(--secondary)] text-xs font-mono text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
              >
                ont:{selectedClass.localName} ⧉
              </button>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">{selectedClass.description}</p>
          </div>
        </div>
        <OntologyImpactPreview
          workspaceId={workspaceId}
          targetLocalName={selectedClass.localName}
          onToast={onToast}
        />
      </div>

      <div className="px-4 border-b border-[var(--border)]">
        <ModernTabList
          idPrefix="insp"
          ariaLabel="检查器页签"
          value={activeTab}
          onChange={onChangeTab}
          className="flex gap-5 text-xs font-medium"
          tabClassName="py-2.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          options={[
            { value: "sem", label: "语义与公理" },
            { value: "shacl", label: "SHACL 形状" },
            { value: "map", label: `下游影响 (${downstreamTotal})` },
          ]}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <ModernTabPanel idPrefix="insp" value="sem" activeValue={activeTab} onSelect={onChangeTab}>
          <div className="p-4 space-y-3 text-xs">
            <OntologyAxiomEditor workspaceId={workspaceId} selectedClass={selectedClass} canModel={canModel} onToast={onToast} />

            <details className="rounded-lg border border-dashed border-[var(--border)] p-2.5">
              <summary className="font-medium text-[var(--primary)] cursor-pointer select-none">
                + 行内快速新增数据属性
              </summary>
              <form onSubmit={handleAddProperty} method="POST" className="mt-2.5 space-y-2">
                <div>
                  <label htmlFor="insp-prop-zh" className="block text-[var(--muted-foreground)] mb-0.5">中文名称</label>
                  <input id="insp-prop-zh" type="text" required value={propLabel} onChange={(e) => setPropLabel(e.target.value)} placeholder="如：质保月数" className="w-full px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--background)]" />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label htmlFor="insp-prop-en" className="block text-[var(--muted-foreground)] mb-0.5">标识符</label>
                    <input id="insp-prop-en" type="text" required value={propLocal} onChange={(e) => setPropLocal(e.target.value)} autoCorrect="off" autoCapitalize="none" spellCheck={false} placeholder="warrantyMonths" className="w-full px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono" />
                  </div>
                  <div>
                    <label htmlFor="insp-prop-dt" className="block text-[var(--muted-foreground)] mb-0.5">XSD 值域</label>
                    <select id="insp-prop-dt" value={propType} onChange={(e) => setPropType(e.target.value)} className="w-full px-1.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono">
                      <option value="xsd:string">xsd:string</option>
                      <option value="xsd:integer">xsd:integer</option>
                      <option value="xsd:decimal">xsd:decimal</option>
                      <option value="xsd:date">xsd:date</option>
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={inlineAuthorMutation.isPending || !canModel} title={!canModel ? ROLE_TIPS.model : undefined} className="w-full py-1.5 rounded bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                  原子合入当前类
                </button>
              </form>
            </details>
          </div>
        </ModernTabPanel>

        <ModernTabPanel idPrefix="insp" value="shacl" activeValue={activeTab} onSelect={onChangeTab}>
          <div className="p-4 space-y-2.5 text-xs">
            <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-600 font-medium">
              {selectedClass.instanceCount.toLocaleString()} 活跃实例校验通过 · 异常源记录自动拦截至隔离区
            </div>
            {selectedClass.shaclConstraints.map((sh) => (
              <div key={sh.id} className="p-3 rounded-lg border border-[var(--border)] space-y-1">
                <div><strong>{sh.propertyLocalName}</strong> · <code className="font-mono text-[var(--muted-foreground)]">sh:{sh.severity}</code></div>
                <div className="text-[var(--muted-foreground)]">{sh.description}</div>
              </div>
            ))}
            <details className="rounded-lg border border-dashed border-[var(--border)] p-2.5">
              <summary className="font-medium text-[var(--primary)] cursor-pointer select-none">
                + 行内新增 SHACL 下界约束
              </summary>
              <form onSubmit={handleAddShacl} method="POST" className="mt-2.5 space-y-2">
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label htmlFor="insp-sh-prop" className="block text-[var(--muted-foreground)] mb-0.5">目标属性名</label>
                    <input id="insp-sh-prop" type="text" required value={shaclProp} onChange={(e) => setShaclProp(e.target.value)} autoCorrect="off" autoCapitalize="none" spellCheck={false} placeholder="totalAmount" className="w-full px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono" />
                  </div>
                  <div>
                    <label htmlFor="insp-sh-min" className="block text-[var(--muted-foreground)] mb-0.5">最小允许值</label>
                    <input id="insp-sh-min" type="text" inputMode="numeric" value={shaclMin} onChange={(e) => setShaclMin(e.target.value)} className="w-full px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] font-mono" />
                  </div>
                </div>
                <div>
                  <label htmlFor="insp-sh-desc" className="block text-[var(--muted-foreground)] mb-0.5">业务规则说明</label>
                  <input id="insp-sh-desc" type="text" value={shaclDesc} onChange={(e) => setShaclDesc(e.target.value)} placeholder="防止负数或越界录入" className="w-full px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--background)]" />
                </div>
                <button type="submit" disabled={inlineAuthorMutation.isPending || !canModel} title={!canModel ? ROLE_TIPS.model : undefined} className="w-full py-1.5 rounded bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                  保存并启用 SHACL 门禁
                </button>
              </form>
            </details>
          </div>
        </ModernTabPanel>

        <ModernTabPanel idPrefix="insp" value="map" activeValue={activeTab} onSelect={onChangeTab}>
          <div className="p-4 space-y-2.5 text-xs">
            <div className="p-3 rounded-lg border border-[var(--border)] space-y-1.5">
              <div className="font-semibold">映射源表：<code className="font-mono ml-1">{selectedClass.downstreamMappings.join(", ") || selectedClass.sourceTable || "RDF 原生实例"}</code></div>
              <div className="text-[var(--muted-foreground)]">引用能力：{selectedClass.downstreamCapabilities.join("、") || "SPARQL 参数化检索"}</div>
              <button type="button" onClick={() => onSwitchView("data")} className="mt-1 text-[var(--primary)] font-medium cursor-pointer">跳转查看字段映射 →</button>
            </div>
          </div>
        </ModernTabPanel>
      </div>
    </aside>
  );
}
