import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api/client";
import type { SparqlQueryResult } from "../api/types";

interface DataSparqlTabProps {
  workspaceId: string;
  defaultSparql: string;
  currentUserRole?: string;
  onToast: (msg: string) => void;
}

const BUSINESS_QUERY_TEMPLATES = [
  {
    id: "expiring-contracts",
    label: "查即将到期合同",
    query: `SELECT ?contract ?contractNo ?expiresAt ?totalAmount ?status WHERE {\n  ?contract a ont:Contract ;\n    ont:contractNo ?contractNo ;\n    ont:expiresAt ?expiresAt ;\n    ont:totalAmount ?totalAmount ;\n    ont:status ?status .\n  FILTER(?expiresAt <= "2026-12-31"^^xsd:date)\n} ORDER BY ?expiresAt LIMIT 50`,
  },
  {
    id: "contract-customers",
    label: "查合同与客户关联",
    query: `SELECT ?contract ?contractNo ?customer ?customerName WHERE {\n  ?contract a ont:Contract ;\n    ont:contractNo ?contractNo ;\n    ont:belongsToCustomer ?customer .\n  OPTIONAL { ?customer rdfs:label ?customerName }\n} LIMIT 50`,
  },
  {
    id: "entity-counts",
    label: "统计各类实体数量",
    query: `SELECT ?type (COUNT(?entity) AS ?count) WHERE {\n  ?entity a ?type .\n} GROUP BY ?type ORDER BY DESC(?count) LIMIT 50`,
  },
] as const;

export function DataSparqlTab({
  workspaceId,
  defaultSparql,
  currentUserRole,
  onToast,
}: DataSparqlTabProps) {
  const [queryText, setQueryText] = useState(defaultSparql);
  const [result, setResult] = useState<SparqlQueryResult | null>(null);

  useEffect(() => {
    if (defaultSparql) {
      setQueryText(defaultSparql);
    }
  }, [defaultSparql]);

  const sparqlMutation = useMutation({
    mutationFn: (q: string) => api.runSparql(workspaceId, q, 50),
    onSuccess: (res) => {
      setResult(res);
      const maskHint =
        res.maskedColumnsApplied.length > 0
          ? `（已对敏感列 ${res.maskedColumnsApplied.join(", ")} 执行服务端脱敏）`
          : "";
      onToast(`查询完成：耗时 ${res.elapsedMs}ms，返回 ${res.rows.length} 条实例${maskHint}`);
    },
    onError: (err: Error) => onToast(err.message),
  });

  useEffect(() => {
    if (workspaceId && defaultSparql) {
      sparqlMutation.mutate(defaultSparql);
    }
    // re-run automatically when workspace or actor role changes so VIEWER masking is immediately visible
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, defaultSparql, currentUserRole]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!queryText.trim()) return;
    sparqlMutation.mutate(queryText);
  };

  const colVars = (result?.columns ?? []).reduce<Record<string, string>>((acc, col, idx) => {
    if (idx > 0) acc[`--label-${idx + 1}`] = `'${col}'`;
    return acc;
  }, {}) as CSSProperties;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4 text-xs">
      <form
        onSubmit={handleSubmit}
        method="POST"
        className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="sparql-query-editor" className="font-semibold text-sm">
            受控只读 SPARQL 查询台（自动注入超时与最大行数保护）
          </label>
          <button
            type="submit"
            disabled={sparqlMutation.isPending}
            className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 cursor-pointer"
          >
            {sparqlMutation.isPending ? "查询中..." : "运行查询"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-[var(--muted-foreground)]">一键业务查询模板：</span>
          {BUSINESS_QUERY_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              disabled={sparqlMutation.isPending}
              onClick={() => {
                setQueryText(tpl.query);
                sparqlMutation.mutate(tpl.query);
              }}
              className="px-2.5 py-1 rounded-full border border-[var(--border)] bg-[var(--secondary)]/80 hover:border-[var(--primary)] hover:text-[var(--primary)] text-[11px] font-medium transition disabled:opacity-50 cursor-pointer"
            >
              ⚡ {tpl.label}
            </button>
          ))}
        </div>

        <textarea
          id="sparql-query-editor"
          name="sparqlQuery"
          rows={8}
          required
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          className="w-full min-h-[168px] p-3 rounded-lg bg-[var(--secondary)] border border-[var(--border)] font-mono text-xs leading-relaxed"
        />
      </form>

      {result && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between gap-3">
            <span className="text-[var(--muted-foreground)]">
              命中 <strong>{result.rows.length}</strong> 行 · 耗时{" "}
              <code className="font-mono">{result.elapsedMs}ms</code> · 命名图：
              <code className="font-mono ml-1">{result.namedGraphsQueried.join(", ")}</code>
            </span>
            {result.maskedColumnsApplied.length > 0 && (
              <span className="px-2.5 py-0.5 rounded bg-amber-500/15 text-amber-600 font-medium">
                当前 VIEWER 角色生效：敏感列 {result.maskedColumnsApplied.join(", ")} 已服务端掩码脱敏
              </span>
            )}
          </div>

          <div tabIndex={0} role="region" aria-label="SPARQL 查询实例结果表" className="table-wrapper">
            <table style={colVars}>
              <thead>
                <tr>
                  {result.columns.map((col) => (
                    <th key={col} scope="col" className="font-mono">
                      ?{col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, idx) => (
                  <tr key={idx}>
                    {result.columns.map((col, cIdx) => {
                      const val = row[col] ?? "—";
                      return cIdx === 0 ? (
                        <th key={col} scope="row" className="font-mono">
                          {val}
                        </th>
                      ) : (
                        <td key={col} className="font-mono">
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
