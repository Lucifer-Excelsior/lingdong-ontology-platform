import { ROLE_TIPS } from "../../utils/rbac";

export type CanvasFocusMode = "all" | "core" | "1hop";

interface OntologyCanvasToolbarProps {
  focusMode: CanvasFocusMode;
  showInferred: boolean;
  canModel: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onChangeFocusMode: (mode: CanvasFocusMode) => void;
  onOpenConnect: () => void;
  onAutoLayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onResetZoom: () => void;
}

export function OntologyCanvasToolbar({
  focusMode,
  showInferred,
  canModel,
  canUndo,
  canRedo,
  onChangeFocusMode,
  onOpenConnect,
  onAutoLayout,
  onUndo,
  onRedo,
  onResetZoom,
}: OntologyCanvasToolbarProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-2rem)] inline-flex items-center gap-1.5 bg-[var(--card)]/92 backdrop-blur-md shadow-lg rounded-full border border-[var(--border)] px-3 py-1.5 text-xs">
      <div className="hidden xl:inline-flex items-center gap-2 pr-1 text-[11px] text-[var(--muted-foreground)]">
        <span className="inline-flex items-center gap-1" title="主数据实体">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          主数据
        </span>
        <span className="inline-flex items-center gap-1" title="受控写对象">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          受控写
        </span>
        <span className="inline-flex items-center gap-1" title="文档知识单元">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          文档
        </span>
        {showInferred && (
          <span className="inline-flex items-center gap-1 text-purple-700 font-medium" title="OWL 2 EL 推理隐式边">
            <span className="w-3 border-t-2 border-dashed border-purple-600" />
            推理边
          </span>
        )}
      </div>

      <span className="hidden xl:inline text-[var(--border)]">|</span>

      <div
        className="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-[var(--secondary)]/80"
        role="group"
        aria-label="子图聚焦模式"
      >
        {(
          [
            ["all", "全部"],
            ["core", "核心域"],
            ["1hop", "1-跳邻域"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onChangeFocusMode(id)}
            className={`px-2.5 py-1 rounded-full transition cursor-pointer whitespace-nowrap ${
              focusMode === id
                ? "bg-[var(--primary)] text-[var(--primary-foreground)] font-medium shadow-xs"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <span className="text-[var(--border)]">|</span>

      <button
        type="button"
        disabled={!canModel}
        title={!canModel ? ROLE_TIPS.model : "连线建立对象关系"}
        onClick={onOpenConnect}
        className="px-2.5 py-1 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition"
      >
        + 连线
      </button>

      <button
        type="button"
        disabled={!canModel || !canUndo}
        title="撤销布局"
        onClick={onUndo}
        className="px-2 py-1 rounded-full hover:bg-[var(--secondary)] text-[var(--muted-foreground)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
      >
        ↩ 撤销
      </button>

      <button
        type="button"
        disabled={!canModel || !canRedo}
        title="重做布局"
        onClick={onRedo}
        className="px-2 py-1 rounded-full hover:bg-[var(--secondary)] text-[var(--muted-foreground)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
      >
        ↪ 重做
      </button>

      <span className="text-[var(--border)]">|</span>

      <button
        type="button"
        disabled={!canModel}
        title={!canModel ? ROLE_TIPS.model : "自动网格布局"}
        onClick={onAutoLayout}
        className="px-2.5 py-1 rounded-full hover:bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
      >
        自动布局
      </button>

      <button
        type="button"
        title="重置画布缩放至 100%"
        onClick={onResetZoom}
        className="px-2.5 py-1 rounded-full hover:bg-[var(--secondary)] font-mono text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer whitespace-nowrap"
      >
        100%
      </button>
    </div>
  );
}
