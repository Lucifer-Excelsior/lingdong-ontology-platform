import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabOption<T extends string> {
  value: T;
  label: string;
}

interface ModernTabListProps<T extends string> {
  idPrefix: string;
  ariaLabel: string;
  options: TabOption<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
  tabClassName?: string;
}

export function ModernTabList<T extends string>({
  idPrefix,
  ariaLabel,
  options,
  value,
  onChange,
  className = "flex flex-nowrap overflow-x-auto gap-5 text-sm font-medium",
  tabClassName = "whitespace-nowrap shrink-0 pb-3 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer",
}: ModernTabListProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const selectedEl = listEl.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    selectedEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (typeof HTMLElement !== "undefined" && Object.hasOwn(HTMLElement.prototype, "focusGroup")) {
      return;
    }
    if (
      event.key !== "ArrowRight" &&
      event.key !== "ArrowLeft" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    const listEl = listRef.current;
    if (!listEl) return;
    const tabs = Array.from(listEl.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex === -1 || tabs.length === 0) return;

    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;

    const targetTab = tabs[nextIndex];
    const targetOption = options[nextIndex];
    if (targetTab && targetOption) {
      targetTab.focus();
      onChange(targetOption.value);
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={className}
      {...({ focusgroup: "tablist nomemory" } as Record<string, string>)}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${opt.value}`}
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={tabClassName}
            {...(selected ? ({ focusgroupstart: "" } as Record<string, string>) : {})}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

interface ModernTabPanelProps<T extends string> {
  idPrefix: string;
  value: T;
  activeValue: T;
  onSelect: (value: T) => void;
  children: ReactNode;
}

export function ModernTabPanel<T extends string>({
  idPrefix,
  value,
  activeValue,
  onSelect,
  children,
}: ModernTabPanelProps<T>) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isActive = value === activeValue;

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (isActive) {
      el.removeAttribute("hidden");
    } else {
      el.setAttribute("hidden", "until-found");
    }
  }, [isActive]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const handleBeforeMatch = () => {
      onSelect(value);
    };
    el.addEventListener("beforematch", handleBeforeMatch);
    return () => {
      el.removeEventListener("beforematch", handleBeforeMatch);
    };
  }, [onSelect, value]);

  return (
    <div
      ref={panelRef}
      role="tabpanel"
      id={`${idPrefix}-panel-${value}`}
      aria-labelledby={`${idPrefix}-tab-${value}`}
      {...(isActive ? {} : ({ hidden: "until-found" } as Record<string, string>))}
    >
      {children}
    </div>
  );
}
