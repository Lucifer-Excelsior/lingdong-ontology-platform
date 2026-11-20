import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface SlideOverDrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  widthClass?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Native top-layer `<dialog>` Slide-Over Drawer (Palantir / Linear / Figma style).
 * Inherits Esc-to-close, focus trapping, and smooth backdrop blur automatically.
 */
export function SlideOverDrawer({
  open,
  title,
  subtitle,
  badge,
  widthClass = "max-w-xl",
  onClose,
  footer,
  children,
}: SlideOverDrawerProps) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`slide-over-drawer fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full ${widthClass} bg-[var(--card)] text-[var(--foreground)] border-l border-[var(--border)] shadow-2xl p-0 backdrop:bg-slate-950/35 backdrop:backdrop-blur-[2px]`}
    >
      <div className="h-full flex flex-col">
        <header className="px-6 py-4 border-b border-[var(--border)] flex items-start justify-between gap-4 shrink-0 bg-[var(--card)]">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold tracking-tight truncate">{title}</h2>
              {badge}
            </div>
            {subtitle && <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭抽屉"
            className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <footer className="px-6 py-3.5 border-t border-[var(--border)] bg-[var(--secondary)]/30 flex items-center justify-end gap-2 shrink-0">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}
