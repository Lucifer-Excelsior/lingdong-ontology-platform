import { ExternalLink, FileDown, Send } from "lucide-react";
import type { PortalSnapshot } from "../../api/types";
import { ROLE_TIPS } from "../../utils/rbac";
import { useConfirmDialog } from "../ConfirmDialog";

interface PortalAlertsGridProps {
  workspaceId: string;
  alerts: PortalSnapshot["contractAlerts"];
  showEntity360: boolean;
  showImPush: boolean;
  canOperate: boolean;
  isAsking: boolean;
  isPushingIm: boolean;
  onOpen360: (contractNo: string) => void;
  onPushIm: (payload: { contractNo: string; title: string; summary: string }) => void;
  onTriggerRenewal: (contractNo: string) => void;
  onToast: (msg: string) => void;
}

export function PortalAlertsGrid({
  workspaceId,
  alerts,
  showEntity360,
  showImPush,
  canOperate,
  isAsking,
  isPushingIm,
  onOpen360,
  onPushIm,
  onTriggerRenewal,
  onToast,
}: PortalAlertsGridProps) {
  const { ask, confirmDialogNode } = useConfirmDialog();

  const handlePushIm = async (alert: PortalSnapshot["contractAlerts"][number]) => {
    const { confirmed } = await ask({
      title: "推送企微/钉钉审批",
      description: `确认将合同 ${alert.contractNo}（${alert.title}）推送至企微/钉钉发起独立审批卡片？`,
      confirmLabel: "确认推送",
      tone: "primary",
    });
    if (confirmed) {
      onPushIm({
        contractNo: alert.contractNo,
        title: alert.title,
        summary: alert.pendingApprovalNote ?? alert.riskNote,
      });
    }
  };

  return (
    <>
      <div className="space-y-3 text-xs">
        {alerts.map((alert, idx) => {
          const isPendingMe = !alert.pendingApprovalNote;
          const isUrgent = alert.expiresInDays <= 15;
          return (
            <div
              key={alert.contractNo}
              className={`p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-xs space-y-3 transition hover:border-[var(--foreground)]/20 ${
                isPendingMe
                  ? isUrgent
                    ? "border-l-4 border-l-rose-500"
                    : "border-l-4 border-l-indigo-500"
                  : "border-l-4 border-l-amber-400"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isPendingMe ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        待办 #{idx + 1} · 待我处置
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        独立审批流转中
                      </span>
                    )}
                    <span className={isUrgent ? "text-rose-600 font-semibold" : "text-amber-600 font-medium"}>
                      {alert.expiresInDays} 天后到期
                    </span>
                  </div>
                  <div className="font-semibold text-sm text-[var(--foreground)] leading-snug">
                    {alert.contractNo} · {alert.title}
                  </div>
                </div>
              </div>

              <p className="text-[var(--muted-foreground)] leading-relaxed">
                {alert.pendingApprovalNote ?? alert.riskNote}
              </p>

              <div className="pt-2.5 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {showEntity360 && (
                    <button
                      type="button"
                      onClick={() => onOpen360(alert.contractNo)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-[var(--foreground)]/85 bg-[var(--secondary)]/60 border border-[var(--border)] hover:bg-[var(--secondary)] cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      360° 档案
                    </button>
                  )}
                  {showImPush && (
                    <button
                      type="button"
                      disabled={isPushingIm || !canOperate}
                      title={!canOperate ? ROLE_TIPS.operate : undefined}
                      onClick={() => void handlePushIm(alert)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-[var(--foreground)]/85 bg-[var(--secondary)]/60 border border-[var(--border)] hover:bg-[var(--secondary)] disabled:opacity-50 cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      推送审批
                    </button>
                  )}
                  <a
                    href={`/api/workspaces/${workspaceId}/portal/renewal-brief/${alert.contractNo}.docx`}
                    download
                    onClick={() => onToast(`开始下载 ${alert.contractNo} 合同续签沟通函 (.docx)`)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-[var(--foreground)]/85 bg-[var(--secondary)]/60 border border-[var(--border)] hover:bg-[var(--secondary)]"
                  >
                    <FileDown className="w-3 h-3" />
                    续签函
                  </a>
                </div>

                {isPendingMe && (
                  <button
                    type="button"
                    disabled={isAsking || !canOperate}
                    title={!canOperate ? ROLE_TIPS.operate : undefined}
                    onClick={() => onTriggerRenewal(alert.contractNo)}
                    className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    确认发起续签流转
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {confirmDialogNode}
    </>
  );
}
