import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { ExternalImportAnalysis } from "@lingdong/contracts";
import { api } from "../../api/client";

interface JsonLdImportTabProps {
  workspaceId: string;
  onToast: (msg: string) => void;
}

type ResolutionChoice = "KEEP_EXISTING" | "OVERWRITE" | "RENAME";

const SAMPLE_TTL = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix ext: <http://example.org/ext#> .

<http://example.org/ext> a owl:Ontology ;
  owl:versionInfo "1.2.0" ;
  owl:imports <http://www.w3.org/ns/prov-o#> .

ext:Contract a owl:Class ; rdfs:label "外部合同"@zh .`;

export function JsonLdImportTab({ workspaceId, onToast }: JsonLdImportTabProps) {
  const [rdfText, setRdfText] = useState(SAMPLE_TTL);
  const [exporting, setExporting] = useState(false);
  const [analysis, setAnalysis] = useState<ExternalImportAnalysis | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, ResolutionChoice>>({});

  const analyzeMutation = useMutation({
    mutationFn: () => api.analyzeExternalImport(workspaceId, rdfText, "external.ttl"),
    onSuccess: (res) => {
      setAnalysis(res);
      const initial: Record<string, ResolutionChoice> = {};
      for (const c of res.conflicts) initial[c.localName] = c.defaultResolution;
      setResolutions(initial);
      onToast(`解析完成：${res.parsedClasses} 类 · ${res.parsedProperties} 属性 · ${res.conflicts.length} 项冲突`);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const handleExportJsonLd = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/ontology/export.jsonld`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`导出失败 (${res.status})`);
      const text = await res.text();
      const blob = new Blob([text], { type: "application/ld+json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ontology-${workspaceId}.jsonld`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onToast("已导出 W3C 标准 JSON-LD 本体文档");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "JSON-LD 导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)] flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-sm">标准 JSON-LD 互操作导出</div>
          <div className="text-[var(--muted-foreground)] mt-0.5">
            导出含 `@context`、`owl:Class`、属性与公理声明的 W3C JSON-LD 1.1 文件。
          </div>
        </div>
        <button
          type="button"
          disabled={exporting}
          onClick={() => void handleExportJsonLd()}
          className="shrink-0 px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {exporting ? "导出中..." : "导出标准 JSON-LD"}
        </button>
      </div>

      <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)] space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm">外部本体引用解析与冲突预检</div>
          <button
            type="button"
            disabled={analyzeMutation.isPending || !rdfText.trim()}
            onClick={() => analyzeMutation.mutate()}
            className="px-3 py-1.5 rounded-md bg-[var(--secondary)] hover:bg-[var(--border)]/60 font-medium disabled:opacity-50 cursor-pointer"
          >
            {analyzeMutation.isPending ? "解析中..." : "解析引用与冲突预检"}
          </button>
        </div>
        <textarea
          rows={6}
          value={rdfText}
          onChange={(e) => setRdfText(e.target.value)}
          placeholder="粘贴 Turtle / RDF 片段以解析 owl:imports 与命名冲突..."
          className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] font-mono text-[11px] leading-relaxed"
        />
      </div>

      {analysis && (
        <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-[var(--muted-foreground)]">Ontology IRI：</span><code className="font-mono break-all">{analysis.ontologyIri}</code></div>
            <div><span className="text-[var(--muted-foreground)]">Namespace：</span><code className="font-mono break-all">{analysis.namespaceIri}</code></div>
            <div><span className="text-[var(--muted-foreground)]">Version Info：</span><code className="font-mono">{analysis.versionInfo}</code></div>
            <div><span className="text-[var(--muted-foreground)]">解析规模：</span>{analysis.parsedClasses} 类 · {analysis.parsedProperties} 属性</div>
          </div>

          <div className="space-y-1">
            <div className="font-medium text-[var(--muted-foreground)]">owl:imports 引用列表 ({analysis.imports.length})</div>
            {analysis.imports.length === 0 ? (
              <div className="text-[var(--muted-foreground)]">未声明外部 owl:imports 引用</div>
            ) : (
              <ul className="space-y-1">
                {analysis.imports.map((imp) => (
                  <li key={imp} className="px-2 py-1 rounded bg-[var(--secondary)] font-mono break-all">{imp}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="font-medium text-[var(--muted-foreground)]">命名冲突与处置策略 ({analysis.conflicts.length})</div>
            {analysis.conflicts.length === 0 ? (
              <div className="px-2.5 py-2 rounded bg-emerald-500/10 text-emerald-600 font-medium">
                ✓ 未检出同名类或属性冲突，可直接安全导入
              </div>
            ) : (
              analysis.conflicts.map((c) => (
                <div key={c.localName} className="p-2.5 rounded-lg border border-[var(--border)] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono font-semibold">{c.localName} <span className="text-[var(--muted-foreground)] font-sans">({c.kind})</span></div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">已有：{c.existingLabel} → 导入：{c.incomingLabel}</div>
                  </div>
                  <select
                    aria-label={`${c.localName} 冲突处置策略`}
                    value={resolutions[c.localName] ?? c.defaultResolution}
                    onChange={(e) => setResolutions((prev) => ({ ...prev, [c.localName]: e.target.value as ResolutionChoice }))}
                    className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] font-mono"
                  >
                    <option value="KEEP_EXISTING">KEEP_EXISTING</option>
                    <option value="OVERWRITE">OVERWRITE</option>
                    <option value="RENAME">RENAME</option>
                  </select>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
