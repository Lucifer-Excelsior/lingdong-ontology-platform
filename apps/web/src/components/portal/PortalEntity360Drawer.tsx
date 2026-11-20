import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { SlideOverDrawer } from "../SlideOverDrawer";

interface PortalEntity360DrawerProps {
  workspaceId: string;
  entityKey: string | null;
  currentRole?: string;
  onClose: () => void;
}

export function PortalEntity360Drawer({
  workspaceId,
  entityKey,
  currentRole,
  onClose,
}: PortalEntity360DrawerProps) {
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["entity-360", workspaceId, entityKey, currentRole],
    queryFn: () => api.getEntity360(workspaceId, entityKey!),
    enabled: Boolean(workspaceId && entityKey),
  });

  const isMasked =
    currentRole === "VIEWER" ||
    Boolean(profile?.summaryMetrics.some((m) => m.value.includes("脱敏") || m.value.includes("***")));

  const headerBadges = (
    <div className="flex items-center gap-1.5 flex-wrap">
      {profile?.statusBadge && (
        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 text-xs font-medium">
          {profile.statusBadge}
        </span>
      )}
      <span
        className={`px-2 py-0.5 rounded text-xs font-medium ${
          isMasked ? "bg-amber-500/15 text-amber-700" : "bg-blue-500/10 text-blue-700"
        }`}
      >
        {isMasked ? "已按权限隐藏敏感金额" : "完整业务视图"}
      </span>
    </div>
  );

  return (
    <SlideOverDrawer
      open={Boolean(entityKey)}
      title={profile?.title ?? `合同 360° 全景档案 · ${entityKey ?? ""}`}
      subtitle={`${profile?.entityTypeLabel ?? "商务主合同全景档案"} · 编号 ${entityKey ?? ""}`}
      badge={headerBadges}
      widthClass="max-w-2xl"
      onClose={onClose}
    >
      <div className="space-y-5 text-xs">
        {isLoading && (
          <div className="py-12 text-center text-[var(--muted-foreground)]">
            正在聚合合同核心指标、关联业务方与法务原文条款...
          </div>
        )}
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 text-red-600">{(error as Error).message}</div>
        )}

        {profile && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {profile.summaryMetrics.map((m) => (
                <div key={m.label} className="p-3 rounded-xl bg-[var(--secondary)] border border-[var(--border)]">
                  <div className="text-[var(--muted-foreground)]">{m.label}</div>
                  <div className="font-semibold text-sm mt-1 truncate" title={m.value}>
                    {m.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-sm">关联业务方与合同档案 ({profile.relations.length})</h3>
              <div className="space-y-1.5">
                {profile.relations.map((rel, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg border border-[var(--border)] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-[var(--secondary)] font-medium mr-2">
                        {rel.relationLabel}
                      </span>
                      <span className="font-medium">{rel.targetTitle}</span>
                    </div>
                    <span className="text-[var(--muted-foreground)] shrink-0">{rel.targetType}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-sm">关键履约时间轴</h3>
              <ol className="space-y-2 border-l-2 border-[var(--border)] pl-3.5">
                {profile.timeline.map((t, idx) => (
                  <li key={idx} className="space-y-0.5">
                    <span className="font-mono text-[var(--primary)] font-medium">{t.date}</span>
                    <div className="text-[var(--foreground)]">{t.event}</div>
                  </li>
                ))}
              </ol>
            </div>

            {profile.documentEvidences.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">法务原文条款依据</h3>
                <div className="space-y-2">
                  {profile.documentEvidences.map((ev, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-[var(--secondary)]/60 border border-[var(--border)] space-y-1"
                    >
                      <div className="font-medium">
                        {ev.docTitle} · <span className="text-[var(--primary)]">{ev.chunkCode}</span>
                      </div>
                      <p className="text-[var(--muted-foreground)] leading-relaxed">{ev.excerpt}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </SlideOverDrawer>
  );
}
