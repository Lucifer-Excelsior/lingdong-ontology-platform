import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, GitMerge, RotateCcw, ShieldCheck, Sparkles, Users } from "lucide-react";
import { v7Api, type SourceSystemType, type V7EntityResolutionItemDto, type V7SourceEntityRecordDto } from "../../lib/v7-api";
import { ROLE_TIPS } from "../../utils/rbac";

interface DataEntityResolutionPanelProps {
  workspaceId: string;
  canOperate: boolean;
  onToast: (msg: string) => void;
}

const SYS_BADGE: Record<SourceSystemType, string> = {
  CRM: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30",
  ERP: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  FINANCE: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
};

function RecordCard({ rec, isAuthoritative }: { rec: V7SourceEntityRecordDto; isAuthoritative: boolean }) {
  return (
    <div className={`p-3.5 rounded-xl border transition-colors space-y-2 ${isAuthoritative ? "border-[var(--primary)]/50 bg-[var(--primary)]/[0.04]" : "border-[var(--border)] bg-[var(--secondary)]/35"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${SYS_BADGE[rec.sourceSystem]}`}>{rec.sourceSystem}</span>
          <span className="text-[11px] font-mono text-[var(--muted-foreground)] truncate">{rec.sourceId}</span>
        </div>
        {isAuthoritative && <span className="px-2 py-0.5 rounded-full bg-[var(--primary)]/15 text-[var(--primary)] text-[10px] font-semibold shrink-0">权威主源</span>}
      </div>
      <div className="text-sm font-semibold text-[var(--foreground)]">{rec.displayName}</div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div><dt className="text-[var(--muted-foreground)]">统一社会信用代码</dt><dd className="font-mono text-[var(--foreground)] truncate">{rec.taxCode}</dd></div>
        <div><dt className="text-[var(--muted-foreground)]">所属区域</dt><dd className="text-[var(--foreground)] truncate">{rec.region}</dd></div>
        <div><dt className="text-[var(--muted-foreground)]">资信评级</dt><dd className="font-semibold text-emerald-600">{rec.creditRating}</dd></div>
        <div><dt className="text-[var(--muted-foreground)]">源系统更新时间</dt><dd className="font-mono text-[var(--muted-foreground)]">{rec.updatedAt}</dd></div>
      </dl>
    </div>
  );
}

export function DataEntityResolutionPanel({ workspaceId, canOperate, onToast }: DataEntityResolutionPanelProps) {
  const queryClient = useQueryClient();
  const [authChoice, setAuthChoice] = useState<Record<string, SourceSystemType>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["v7-entity-resolution", workspaceId],
    queryFn: () => v7Api.listEntityResolution(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["v7-entity-resolution", workspaceId] });

  const mergeMutation = useMutation({
    mutationFn: ({ pairId, authoritativeSystem }: { pairId: string; authoritativeSystem: SourceSystemType }) =>
      v7Api.mergeEntityPair(workspaceId, pairId, authoritativeSystem),
    onSuccess: (res) => { onToast(res.message || "已合并为统一黄金主数据并写入审计链"); refresh(); },
    onError: (e: Error) => onToast(e.message),
  });

  const splitMutation = useMutation({
    mutationFn: (pairId: string) => v7Api.splitEntityPair(workspaceId, pairId),
    onSuccess: (res) => { onToast(res.message || "已拆分回滚黄金主数据，恢复待仲裁状态"); refresh(); },
    onError: (e: Error) => onToast(e.message),
  });

  const items: V7EntityResolutionItemDto[] = data?.items ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)]">跨系统实体消歧与黄金主数据仲裁台（MDM）</h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            自动识别 CRM、ERP 与财务系统中的跨源重复主体，指定权威源一键合并为单一黄金记录（Golden Record），支持随时无损拆分回滚。
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/35 bg-amber-500/10 text-amber-700 font-medium">
            <Users className="w-3.5 h-3.5" />待仲裁 {data?.pendingCount ?? 0} 对
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 text-emerald-700 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />黄金主数据 {data?.mergedCount ?? 0} 条
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 rounded-xl bg-[var(--card)] border border-[var(--border)] text-center text-xs text-[var(--muted-foreground)]">正在加载跨系统实体消歧候选对...</div>
      ) : items.length === 0 ? (
        <div className="p-8 rounded-xl bg-[var(--card)] border border-[var(--border)] text-center text-xs text-[var(--muted-foreground)]">当前工作区暂无跨系统重复实体候选记录。</div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const selectedAuth = authChoice[item.id] ?? item.authoritativeSystem;
            const busy = mergeMutation.isPending || splitMutation.isPending;
            return (
              <section key={item.id} className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-[var(--secondary)] text-[var(--foreground)] font-mono text-xs font-semibold">{item.entityType}</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 text-[11px] font-semibold">
                      <Sparkles className="w-3 h-3" />相似度 {Math.round(item.similarityScore * 100)}%
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)]">{item.matchReason}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${item.status === "MERGED" ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700" : "border-amber-500/35 bg-amber-500/10 text-amber-700"}`}>
                    {item.status === "MERGED" ? <CheckCircle2 className="w-3 h-3" /> : <GitMerge className="w-3 h-3" />}
                    {item.status === "MERGED" ? "已合并黄金主数据" : "待仲裁"}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <RecordCard rec={item.left} isAuthoritative={selectedAuth === item.left.sourceSystem} />
                  <RecordCard rec={item.right} isAuthoritative={selectedAuth === item.right.sourceSystem} />
                </div>

                <div className="pt-2 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
                  {item.status === "PENDING" ? (
                    <>
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="text-[var(--muted-foreground)]">选择权威主数据源：</span>
                        {([item.left.sourceSystem, item.right.sourceSystem] as SourceSystemType[]).map((sys) => (
                          <button
                            key={sys}
                            type="button"
                            onClick={() => setAuthChoice((prev) => ({ ...prev, [item.id]: sys }))}
                            className={`px-2.5 py-1 rounded-md border text-xs font-medium transition cursor-pointer ${selectedAuth === sys ? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]" : "border-[var(--border)] bg-[var(--secondary)]/50 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
                          >
                            以 {sys} 为准
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={!canOperate || busy}
                        title={!canOperate ? ROLE_TIPS.operate : undefined}
                        onClick={() => mergeMutation.mutate({ pairId: item.id, authoritativeSystem: selectedAuth })}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <GitMerge className="w-3.5 h-3.5" />合并为黄金主数据
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-2 flex-wrap">
                        <span className="font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 font-semibold">{item.goldenRecordId}</span>
                        <span className="font-medium text-[var(--foreground)]">{item.goldenDisplayName}</span>
                        <span>· 权威源：{item.authoritativeSystem}</span>
                        {item.resolvedBy && <span>· 仲裁人：{item.resolvedBy}</span>}
                        {item.resolvedAt && <span className="font-mono">({item.resolvedAt})</span>}
                      </div>
                      <button
                        type="button"
                        disabled={!canOperate || busy}
                        title={!canOperate ? ROLE_TIPS.operate : undefined}
                        onClick={() => splitMutation.mutate(item.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />一键拆分回滚
                      </button>
                    </>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
