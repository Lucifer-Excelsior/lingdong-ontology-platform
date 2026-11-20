import { Crosshair, Search, X } from "lucide-react";
import type { DomainRoleFilter } from "./canvasFocusUtils";

interface OntologyCanvasSearchBarProps {
  query: string;
  roleFilter: DomainRoleFilter;
  visibleCount: number;
  totalCount: number;
  onChangeQuery: (q: string) => void;
  onChangeRoleFilter: (role: DomainRoleFilter) => void;
  onFocusFirstMatch: () => void;
}

const ROLE_PILLS: { id: DomainRoleFilter; label: string; dot?: string }[] = [
  { id: "all", label: "全部" },
  { id: "master", label: "主数据", dot: "bg-blue-500" },
  { id: "controlled_write", label: "受控写入", dot: "bg-amber-500" },
  { id: "knowledge", label: "知识概念", dot: "bg-emerald-500" },
  { id: "actor", label: "参与方", dot: "bg-purple-500" },
];

export function OntologyCanvasSearchBar({
  query,
  roleFilter,
  visibleCount,
  totalCount,
  onChangeQuery,
  onChangeRoleFilter,
  onFocusFirstMatch,
}: OntologyCanvasSearchBarProps) {
  const hasFilter = Boolean(query.trim()) || roleFilter !== "all";

  return (
    <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
      <div className="pointer-events-auto flex flex-wrap items-center gap-2 bg-[var(--card)]/95 backdrop-blur-md border border-[var(--border)] shadow-sm rounded-xl px-2.5 py-1.5 text-xs">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)] absolute left-2 pointer-events-none" />
          <input
            type="search"
            aria-label="千级大图快速检索类"
            value={query}
            onChange={(e) => onChangeQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onFocusFirstMatch();
            }}
            placeholder="快速检索类 (中文 / 英文)..."
            className="w-48 pl-7 pr-6 py-1 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:bg-[var(--card)] focus:border-indigo-500"
          />
          {query && (
            <button
              type="button"
              aria-label="清空搜索"
              onClick={() => onChangeQuery("")}
              className="absolute right-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)]" role="group" aria-label="领域角色分组筛选">
          {ROLE_PILLS.map((pill) => {
            const active = roleFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => onChangeRoleFilter(pill.id)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md transition cursor-pointer whitespace-nowrap ${
                  active
                    ? "bg-[var(--card)] text-indigo-700 font-medium shadow-xs"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                {pill.dot && <span className={`w-1.5 h-1.5 rounded-full ${pill.dot}`} />}
                {pill.label}
              </button>
            );
          })}
        </div>

        <span className="text-[11px] font-mono text-[var(--muted-foreground)] px-1">
          {visibleCount} / {totalCount} 类
        </span>

        {hasFilter && visibleCount > 0 && (
          <button
            type="button"
            onClick={onFocusFirstMatch}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-medium cursor-pointer"
          >
            <Crosshair className="w-3 h-3" />聚焦命中
          </button>
        )}
      </div>
    </div>
  );
}
