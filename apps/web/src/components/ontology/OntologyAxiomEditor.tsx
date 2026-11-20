import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { OntologyClass, OntologyProperty } from "../../api/types";
import { ROLE_TIPS } from "../../utils/rbac";

interface OntologyAxiomEditorProps {
  workspaceId: string;
  selectedClass: OntologyClass;
  canModel: boolean;
  onToast: (msg: string) => void;
}

const CHAR_PRESETS = ["FunctionalProperty", "SymmetricProperty", "TransitiveProperty"] as const;

const shortIri = (val?: string) =>
  !val ? "—" : val.includes("#") ? `ont:${val.split("#").pop()}` : val;

export function OntologyAxiomEditor({
  workspaceId,
  selectedClass,
  canModel,
  onToast,
}: OntologyAxiomEditorProps) {
  const queryClient = useQueryClient();
  const [editingClass, setEditingClass] = useState(false);
  const [eqClassDraft, setEqClassDraft] = useState("");
  const [editingProp, setEditingProp] = useState<string | null>(null);
  const [subPropDraft, setSubPropDraft] = useState("");
  const [charDraft, setCharDraft] = useState("");

  const classAxiomMutation = useMutation({
    mutationFn: (equivalentClass: string) =>
      api.updateClassAxioms(workspaceId, selectedClass.localName, { equivalentClass }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["ontology", workspaceId] });
      setEditingClass(false);
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const propAxiomMutation = useMutation({
    mutationFn: (payload: { localName: string; subPropertyOf: string; characteristics: string }) =>
      api.updatePropertyAxioms(workspaceId, payload.localName, {
        subPropertyOf: payload.subPropertyOf,
        characteristics: payload.characteristics,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["ontology", workspaceId] });
      setEditingProp(null);
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const openPropEditor = (prop: OntologyProperty) => {
    setEditingProp(prop.localName);
    setSubPropDraft(prop.subPropertyOf ?? "");
    setCharDraft(prop.characteristics ?? "");
  };

  const toggleCharToken = (token: string) => {
    const tokens = charDraft
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const next = tokens.includes(token) ? tokens.filter((t) => t !== token) : [...tokens, token];
    setCharDraft(next.join(", "));
  };

  return (
    <div className="space-y-3">
      <div className="p-2.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] space-y-1.5">
        <div className="flex justify-between gap-2">
          <span className="text-[var(--muted-foreground)] shrink-0">rdfs:subClassOf</span>
          <span className="font-mono font-medium truncate">{shortIri(selectedClass.subClassOf)}</span>
        </div>
        <div className="flex justify-between items-center gap-2">
          <span className="text-[var(--muted-foreground)] shrink-0">owl:equivalentClass</span>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono font-medium truncate">{shortIri(selectedClass.equivalentClass)}</span>
            <button
              type="button"
              disabled={!canModel}
              title={!canModel ? ROLE_TIPS.model : undefined}
              onClick={() => {
                setEqClassDraft(selectedClass.equivalentClass ?? "");
                setEditingClass((v) => !v);
              }}
              className="text-[11px] text-[var(--primary)] hover:underline disabled:opacity-45 cursor-pointer shrink-0"
            >
              {editingClass ? "取消" : "编辑"}
            </button>
          </div>
        </div>
        {editingClass && (
          <div className="pt-1.5 flex gap-1.5">
            <input
              type="text"
              value={eqClassDraft}
              onChange={(e) => setEqClassDraft(e.target.value)}
              placeholder="如 ont:LegalAgreement"
              className="flex-1 min-w-0 px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] font-mono"
            />
            <button
              type="button"
              disabled={classAxiomMutation.isPending}
              onClick={() => classAxiomMutation.mutate(eqClassDraft.trim())}
              className="px-2.5 py-1 rounded bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-50 cursor-pointer shrink-0"
            >
              保存
            </button>
          </div>
        )}
        {selectedClass.disjointWith && (
          <div className="flex justify-between gap-2">
            <span className="text-[var(--muted-foreground)] shrink-0">owl:disjointWith</span>
            <span className="font-mono font-medium truncate">{shortIri(selectedClass.disjointWith)}</span>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        {selectedClass.properties.map((prop) => {
          const isEdit = editingProp === prop.localName;
          return (
            <div key={prop.iri} className="p-2.5 rounded-lg border border-[var(--border)] space-y-1.5">
              <div className="flex justify-between items-center gap-2">
                <span className="truncate">
                  {prop.labelZh} <code className="font-mono text-[var(--muted-foreground)]">{prop.localName}</code>
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono">{prop.rangeLocalName}</span>
                  <button
                    type="button"
                    disabled={!canModel}
                    title={!canModel ? ROLE_TIPS.model : undefined}
                    onClick={() => (isEdit ? setEditingProp(null) : openPropEditor(prop))}
                    className="text-[11px] text-[var(--primary)] hover:underline disabled:opacity-45 cursor-pointer"
                  >
                    {isEdit ? "收起" : "公理"}
                  </button>
                </div>
              </div>
              {(prop.subPropertyOf || prop.characteristics) && !isEdit && (
                <div className="flex flex-wrap gap-1 text-[10px]">
                  {prop.subPropertyOf && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--secondary)] font-mono">
                      subPropertyOf: {shortIri(prop.subPropertyOf)}
                    </span>
                  )}
                  {prop.characteristics && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 font-mono">
                      {prop.characteristics}
                    </span>
                  )}
                </div>
              )}
              {isEdit && (
                <div className="pt-1.5 border-t border-[var(--border)] space-y-1.5">
                  <input
                    type="text"
                    value={subPropDraft}
                    onChange={(e) => setSubPropDraft(e.target.value)}
                    placeholder="rdfs:subPropertyOf，如 ont:relatedTo"
                    className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] font-mono"
                  />
                  <div className="flex flex-wrap gap-1">
                    {CHAR_PRESETS.map((preset) => {
                      const active = charDraft.includes(preset);
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => toggleCharToken(preset)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono border cursor-pointer ${
                            active
                              ? "bg-[var(--primary)]/15 border-[var(--primary)] text-[var(--primary)]"
                              : "border-[var(--border)] text-[var(--muted-foreground)]"
                          }`}
                        >
                          {preset.replace("Property", "")}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={charDraft}
                    onChange={(e) => setCharDraft(e.target.value)}
                    placeholder="OWL 特征（对称/传递/函数性）"
                    className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] font-mono"
                  />
                  <button
                    type="button"
                    disabled={propAxiomMutation.isPending}
                    onClick={() =>
                      propAxiomMutation.mutate({
                        localName: prop.localName,
                        subPropertyOf: subPropDraft.trim(),
                        characteristics: charDraft.trim(),
                      })
                    }
                    className="w-full py-1 rounded bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-50 cursor-pointer"
                  >
                    {propAxiomMutation.isPending ? "保存中..." : "保存属性公理"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
