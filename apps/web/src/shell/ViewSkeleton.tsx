export function ViewSkeleton() {
  return (
    <div className="flex-1 min-h-0 p-6 space-y-3 bg-[var(--background)] animate-pulse" aria-busy="true">
      <div className="h-5 w-48 rounded-md bg-[var(--secondary)] border border-[var(--border)]" />
      <div className="h-3 w-72 rounded bg-[var(--secondary)]" />
      <div className="h-28 rounded-xl bg-[var(--card)] border border-[var(--border)]" />
      <div className="h-20 rounded-xl bg-[var(--card)] border border-[var(--border)]" />
    </div>
  );
}
