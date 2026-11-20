import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ShieldCheck, X } from "lucide-react";

export interface ConfirmDialogOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "warning" | "danger";
  inputLabel?: string;
  inputPlaceholder?: string;
  inputDefaultValue?: string;
}

interface ConfirmDialogProps {
  options: ConfirmDialogOptions | null;
  onResolve: (result: { confirmed: boolean; inputValue?: string }) => void;
}

export function ConfirmDialog({ options, onResolve }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (options) {
      setInputValue(options.inputDefaultValue ?? "");
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [options]);

  if (!options) return null;
  const tone = options.tone ?? "primary";
  const confirmCls =
    tone === "danger"
      ? "bg-rose-600 hover:bg-rose-700 text-white"
      : tone === "warning"
        ? "bg-amber-600 hover:bg-amber-700 text-white"
        : "bg-[var(--primary)] hover:opacity-90 text-[var(--primary-foreground)]";

  const handleConfirm = () => {
    if (options.inputLabel && !inputValue.trim()) return;
    onResolve({ confirmed: true, inputValue: inputValue.trim() });
  };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onResolve({ confirmed: false });
      }}
      onClick={(e) => {
        if (e.target === ref.current) onResolve({ confirmed: false });
      }}
      className="m-auto w-full max-w-md rounded-2xl bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] shadow-2xl p-0 backdrop:bg-slate-950/40 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              tone === "danger"
                ? "bg-rose-500/15 text-rose-600"
                : tone === "warning"
                  ? "bg-amber-500/15 text-amber-600"
                  : "bg-blue-500/15 text-blue-600"
            }`}
          >
            {tone === "primary" ? <ShieldCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">{options.title}</h3>
            <p className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed whitespace-pre-line">
              {options.description}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onResolve({ confirmed: false })}
            aria-label="关闭"
            className="p-1 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--secondary)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {options.inputLabel && (
          <label className="block space-y-1.5 text-xs">
            <span className="font-medium text-[var(--foreground)]">{options.inputLabel}</span>
            <input
              autoFocus
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirm();
              }}
              placeholder={options.inputPlaceholder ?? ""}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            />
          </label>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => onResolve({ confirmed: false })}
            className="px-3.5 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:bg-[var(--secondary)] cursor-pointer"
          >
            {options.cancelLabel ?? "取消"}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={Boolean(options.inputLabel && !inputValue.trim())}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer ${confirmCls}`}
          >
            {options.confirmLabel ?? "确认执行"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * Lightweight imperative confirm/prompt hook replacing native browser `window.confirm` & `window.prompt`.
 */
export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
  const resolverRef = useRef<((res: { confirmed: boolean; inputValue?: string }) => void) | null>(null);

  const ask = (opts: ConfirmDialogOptions): Promise<{ confirmed: boolean; inputValue?: string }> =>
    new Promise((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
    });

  const handleResolve = (res: { confirmed: boolean; inputValue?: string }) => {
    setOptions(null);
    resolverRef.current?.(res);
    resolverRef.current = null;
  };

  const confirmDialogNode = <ConfirmDialog options={options} onResolve={handleResolve} />;
  return { ask, confirmDialogNode };
}
