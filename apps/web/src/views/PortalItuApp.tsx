import type { CSSProperties } from "react";
import type { PortalSnapshot } from "../api/types";

interface PortalItuAppProps {
  workspaceId: string;
  ituReview?: PortalSnapshot["ituReview"];
  onToast: (msg: string) => void;
}

export function PortalItuApp({ workspaceId, ituReview, onToast }: PortalItuAppProps) {
  const items = ituReview?.items ?? [];

  const ituTableVars = {
    "--label-2": "'规范助动词'",
    "--label-3": "'冲突与审查结论'",
    "--label-4": "'锚定本体规则'",
    "--label-5": "'修订建议'",
  } as CSSProperties;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-1">
        <span className="text-xs font-medium px-2 py-0.5 rounded bg-[var(--secondary)] text-[var(--primary)]">
          受治理行业旗舰应用 · 国际标准审查
        </span>
        <h1 className="text-xl font-semibold pt-1">ITU-T 国际标准文稿合规性与术语冲突审查台</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          基于标准规范本体自动核对提案文稿中的规范性引用、必选/可选助动词（SHALL / SHOULD）及既有建议书术语冲突。
        </p>
      </div>

      <div className="p-5 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-4 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="font-semibold text-sm">
            当前审查文稿：《{ituReview?.documentTitle ?? "Y.31xx 算力网络语义编排架构提案草案 v0.4.docx"}》
          </span>
          <a
            href={`/api/workspaces/${encodeURIComponent(workspaceId)}/portal/itu-review-report.docx`}
            download
            onClick={() =>
              onToast(`开始下载 ITU-T 标准合规审查意见书 (.docx，含 ${items.length || 3} 条本体规则核对结论)`)
            }
            className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 shrink-0"
          >
            导出审查意见书 (.docx)
          </a>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-[var(--secondary)]">
            <div className="text-[var(--muted-foreground)]">术语定义对齐率</div>
            <div className="text-lg font-bold mt-0.5">{ituReview?.termAlignmentRate ?? "94.5%"}</div>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10">
            <div className="text-amber-600">发现既有标准定义冲突</div>
            <div className="text-lg font-bold mt-0.5 text-amber-600">
              {ituReview?.conflictCount ?? 2} 处待修订
            </div>
          </div>
          <div className="p-3 rounded-lg bg-emerald-500/10">
            <div className="text-emerald-600">规范性引用有效性</div>
            <div className="text-lg font-bold mt-0.5 text-emerald-600">
              {ituReview?.normativeRefValidRate ?? "100% 现行有效"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
        <div tabIndex={0} role="region" aria-label="ITU 标准提案逐条规范性审查表" className="table-wrapper">
          <table style={ituTableVars}>
            <thead>
              <tr>
                <th scope="col">章节条款</th>
                <th scope="col">规范助动词</th>
                <th scope="col">审查结论与原文摘录</th>
                <th scope="col">本体对齐锚点</th>
                <th scope="col">合规修订建议</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <th scope="row" className="font-mono">
                    {item.clauseRef}
                  </th>
                  <td>
                    <span
                      className={`px-2 py-0.5 rounded font-mono font-semibold ${
                        item.severity === "CONFLICT"
                          ? "bg-red-500/15 text-red-600"
                          : item.severity === "WARNING"
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-emerald-500/10 text-emerald-600"
                      }`}
                    >
                      {item.normativeVerb}
                    </span>
                  </td>
                  <td className="!whitespace-normal max-w-[260px]">
                    <div className="font-medium">{item.findingTitle}</div>
                    <div className="text-[var(--muted-foreground)] mt-0.5">{item.sourceExcerpt}</div>
                  </td>
                  <td className="font-mono text-[var(--muted-foreground)] !whitespace-normal max-w-[180px]">
                    {item.ontologyRuleAnchor}
                  </td>
                  <td className="!whitespace-normal max-w-[240px]">{item.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
