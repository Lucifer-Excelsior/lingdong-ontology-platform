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
    "--label-2": "'风险标签'",
    "--label-3": "'审查结论与证据摘录'",
    "--label-4": "'锚定本体规则'",
    "--label-5": "'风控处置建议'",
  } as CSSProperties;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-1">
        <span className="text-xs font-medium px-2 py-0.5 rounded bg-[var(--secondary)] text-[var(--primary)]">
          受治理行业旗舰应用 · 集团招采反围标风控
        </span>
        <h1 className="text-xl font-semibold pt-1">集团招采合规与反围标风控审查台</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          基于招采反围标本体与股权/人员关系图谱，自动穿透标段共享联系人、异常等差报价阶梯、跨系统重复档案与投标资质有效性。
        </p>
      </div>

      <div className="p-5 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-4 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="font-semibold text-sm">
            当前审查标段：《{ituReview?.documentTitle ?? "2026 华东智算中心液冷服务器集采标段 #ZB-2026-041"}》
          </span>
          <a
            href={`/api/workspaces/${encodeURIComponent(workspaceId)}/portal/itu-review-report.docx`}
            download
            onClick={() =>
              onToast(`开始下载集团招采反围标审查意见书 (.docx，含 ${items.length || 4} 条本体规则核对结论)`)
            }
            className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 shrink-0"
          >
            导出审查意见书 (.docx)
          </a>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-[var(--secondary)]">
            <div className="text-[var(--muted-foreground)]">主数据主体对齐率</div>
            <div className="text-lg font-bold mt-0.5">{ituReview?.termAlignmentRate ?? "94.5%"}</div>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10">
            <div className="text-amber-600">检出高危围标串标冲突</div>
            <div className="text-lg font-bold mt-0.5 text-amber-600">
              {ituReview?.conflictCount ?? 2} 处待拦截
            </div>
          </div>
          <div className="p-3 rounded-lg bg-emerald-500/10">
            <div className="text-emerald-600">投标主体资质有效性</div>
            <div className="text-lg font-bold mt-0.5 text-emerald-600">
              {ituReview?.normativeRefValidRate ?? "100% 现行有效"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
        <div tabIndex={0} role="region" aria-label="集团招采反围标逐项核查表" className="table-wrapper">
          <table style={ituTableVars}>
            <thead>
              <tr>
                <th scope="col">审查维度</th>
                <th scope="col">风险标签</th>
                <th scope="col">审查结论与证据摘录</th>
                <th scope="col">本体规则锚点</th>
                <th scope="col">风控处置建议</th>
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
