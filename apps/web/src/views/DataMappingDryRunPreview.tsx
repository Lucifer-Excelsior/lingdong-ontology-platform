export interface MappingDryRunRow {
  rowKey: string;
  subjectIri: string;
  mappedFields: Record<string, string>;
  shaclStatus: "PASS" | "QUARANTINE";
  shaclMessage?: string;
}

interface DataMappingDryRunPreviewProps {
  rows: MappingDryRunRow[];
  message: string;
}

export function DataMappingDryRunPreview({ rows, message }: DataMappingDryRunPreviewProps) {
  const fieldKeys = Array.from(
    new Set(rows.flatMap((r) => Object.keys(r.mappedFields)))
  ).slice(0, 5);

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between gap-3">
        <span className="font-semibold text-sm">抽样试运行预览结果（{rows.length} 条源记录）</span>
        <span className="text-[var(--muted-foreground)] truncate">{message}</span>
      </div>
      <div tabIndex={0} role="region" aria-label="抽样试运行映射预览表" className="table-wrapper max-h-[260px]">
        <table>
          <thead>
            <tr>
              <th scope="col">源行键</th>
              <th scope="col">生成主体 IRI</th>
              {fieldKeys.map((k) => (
                <th key={k} scope="col" className="font-mono">
                  {k}
                </th>
              ))}
              <th scope="col">SHACL 校验</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rowKey}>
                <th scope="row" className="font-mono">{row.rowKey}</th>
                <td className="font-mono text-[var(--muted-foreground)] max-w-[200px] truncate" title={row.subjectIri}>
                  {row.subjectIri}
                </td>
                {fieldKeys.map((k) => (
                  <td key={k} className="font-mono">{row.mappedFields[k] ?? "—"}</td>
                ))}
                <td className="!whitespace-normal max-w-[260px]">
                  <span
                    className={`inline-block px-2 py-0.5 rounded font-medium whitespace-normal break-words ${
                      row.shaclStatus === "PASS"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-amber-500/15 text-amber-700"
                    }`}
                    title={row.shaclMessage}
                  >
                    {row.shaclStatus === "PASS" ? "PASS" : `QUARANTINE${row.shaclMessage ? ` · ${row.shaclMessage}` : ""}`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
