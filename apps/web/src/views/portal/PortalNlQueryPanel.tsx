import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Code2, FileText, Network, Search, Sparkles } from "lucide-react";
import { v5Api, type NlQueryResponse } from "../../lib/v5-api";

interface PortalNlQueryPanelProps {
  workspaceId: string;
  onToast: (msg: string) => void;
}

const QUICK_CHIPS = [
  "列出高金额合同并按金额排序",
  "排查临期与高风险合同",
  "追踪合同与供应商关联关系",
  "统计当前图谱实体类型分布",
];

function renderHighlightedExcerpt(excerpt: string, matchedTerm: string) {
  const term = matchedTerm.trim();
  if (!term) return excerpt;
  const idx = excerpt.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return excerpt;
  return (
    <>
      {excerpt.slice(0, idx)}
      <mark className="px-1 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold">
        {excerpt.slice(idx, idx + term.length)}
      </mark>
      {excerpt.slice(idx + term.length)}
    </>
  );
}

export function PortalNlQueryPanel({ workspaceId, onToast }: PortalNlQueryPanelProps) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<NlQueryResponse | null>(null);
  const [showSparql, setShowSparql] = useState(false);

  const queryMutation = useMutation({
    mutationFn: (q: string) => v5Api.runNlQuery(workspaceId, q),
    onSuccess: (res) => {
      setResult(res);
      onToast(`语义检索完成，返回 ${res.rows.length} 条记录（${res.durationMs}ms）`);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const submitQuestion = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || queryMutation.isPending) return;
    setQuestion(trimmed);
    queryMutation.mutate(trimmed);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submitQuestion(question);
  };

  return (
    <div className="space-y-5">
      <div className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">自然语言语义检索 (NL-to-SPARQL)</h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              自动将业务问题编译为受治理 SPARQL 查询，返回图谱子图关联与制度文档原位证据锚点。
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
            V5.0 Semantic Query
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 text-[var(--muted-foreground)] font-medium">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />快捷问句：
          </span>
          {QUICK_CHIPS.map((chip) => (
            <button key={chip} type="button" disabled={queryMutation.isPending} onClick={() => submitQuestion(chip)} className="px-3 py-1.5 rounded-full border border-[var(--border)] bg-[var(--secondary)]/60 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 text-[var(--foreground)]/85 font-medium transition disabled:opacity-50 cursor-pointer">
              {chip}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="输入业务检索问题，例如：列出高金额合同并按金额排序..." className="flex-1 px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm text-[var(--foreground)] focus:outline-none focus:border-indigo-500" />
          <button type="submit" disabled={queryMutation.isPending || !question.trim()} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition disabled:opacity-50 cursor-pointer">
            <Search className="w-4 h-4" />
            {queryMutation.isPending ? "编译检索中..." : "执行语义检索"}
          </button>
        </form>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 font-medium border border-indigo-200">
                  意图：{result.intentSummary}
                </span>
                <span className={`px-2.5 py-1 rounded-md font-medium border ${result.engine === "LLM_TEXT_TO_SPARQL" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                  引擎：{result.engine === "LLM_TEXT_TO_SPARQL" ? "LLM Text-to-SPARQL" : "语义意图编译器"}
                </span>
                <span className="text-[var(--muted-foreground)] font-mono">{result.durationMs} ms</span>
              </div>
              <button type="button" onClick={() => setShowSparql((prev) => !prev)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)] font-medium cursor-pointer">
                <Code2 className="w-3.5 h-3.5" />
                {showSparql ? "收起 SPARQL" : "查看生成的 SPARQL"}
                {showSparql ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>

            {showSparql && (
              <pre className="p-3 rounded-lg bg-[var(--secondary)]/60 border border-[var(--border)] text-xs font-mono text-[var(--foreground)] overflow-x-auto whitespace-pre-wrap">
                {result.generatedSparql}
              </pre>
            )}

            <div className="overflow-x-auto border border-[var(--border)] rounded-lg">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-[var(--secondary)]/60 text-[var(--muted-foreground)] border-b border-[var(--border)]">
                  <tr>
                    {result.columns.map((col) => (<th key={col} className="px-3 py-2 font-semibold whitespace-nowrap">{col}</th>))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-[var(--foreground)]">
                  {result.rows.length === 0 ? (
                    <tr><td colSpan={Math.max(1, result.columns.length)} className="px-3 py-6 text-center text-[var(--muted-foreground)]">当前图谱未匹配到符合条件的结果记录</td></tr>
                  ) : (
                    result.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[var(--secondary)]/60">
                        {result.columns.map((col) => (<td key={col} className="px-3 py-2 whitespace-nowrap">{row[col] ?? "-"}</td>))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {(result.subgraphEdges.length > 0 || result.subgraphNodes.length > 0) && (
            <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
                <Network className="w-4 h-4 text-indigo-600" />
                图谱子图关联路径 ({result.subgraphNodes.length} 节点 · {result.subgraphEdges.length} 条关系)
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {result.subgraphEdges.length > 0
                  ? result.subgraphEdges.map((edge, idx) => (
                      <span key={`${edge.source}-${edge.target}-${idx}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--secondary)]/60 border border-[var(--border)] text-[var(--foreground)]/85">
                        <strong className="text-[var(--foreground)]">{edge.source}</strong>
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[11px]">{edge.label}</span>
                        <strong className="text-[var(--foreground)]">{edge.target}</strong>
                      </span>
                    ))
                  : result.subgraphNodes.map((node) => (
                      <span key={node.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--secondary)]/60 border border-[var(--border)] text-[var(--foreground)]/85">
                        <span className="text-indigo-600 font-mono text-[11px]">{node.kind}</span>
                        <span>{node.label}</span>
                      </span>
                    ))}
              </div>
            </div>
          )}

          {result.evidenceAnchors.length > 0 && (
            <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
                <FileText className="w-4 h-4 text-emerald-600" />
                制度文档原位证据锚点 ({result.evidenceAnchors.length})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result.evidenceAnchors.map((ev, idx) => (
                  <div key={`${ev.documentTitle}-${ev.chunkIndex}-${idx}`} className="p-3 rounded-lg bg-[var(--secondary)]/60 border border-[var(--border)] space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--foreground)] truncate">{ev.documentTitle}</span>
                      <span className="px-1.5 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] font-mono text-[var(--muted-foreground)] shrink-0">Chunk #{ev.chunkIndex}</span>
                    </div>
                    <p className="text-[var(--muted-foreground)] leading-relaxed">{renderHighlightedExcerpt(ev.excerpt, ev.matchedTerm)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
