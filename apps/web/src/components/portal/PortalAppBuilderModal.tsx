import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PortalAppConfig } from "@lingdong/contracts";
import { api } from "../../api/client";
import { ModalDialog } from "../../shell/ModalDialog";
import { ROLE_TIPS } from "../../utils/rbac";

type WidgetId = PortalAppConfig["enabledWidgets"][number];

const WIDGET_OPTIONS: ReadonlyArray<{ id: WidgetId; label: string }> = [
  { id: "kpi_alerts", label: "到期风险合同预警卡片" },
  { id: "entity_360", label: "360° 实体全景档案抽屉" },
  { id: "ai_copilot", label: "自然语言受治理问答助手" },
  { id: "im_push", label: "企微/钉钉/飞书审批推送" },
  { id: "csv_export", label: "风险台账 CSV 脱敏导出" },
  { id: "itu_review", label: "ITU-T 标准提案合规审查" },
];

interface PortalAppBuilderModalProps {
  workspaceId: string;
  open: boolean;
  config?: PortalAppConfig;
  canModel: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function PortalAppBuilderModal({
  workspaceId,
  open,
  config,
  canModel,
  onClose,
  onToast,
}: PortalAppBuilderModalProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PortalAppConfig | null>(null);

  useEffect(() => {
    if (open && config) {
      setDraft({ ...config, enabledWidgets: [...config.enabledWidgets] });
    }
  }, [open, config]);

  const saveMutation = useMutation({
    mutationFn: (payload: PortalAppConfig) => api.savePortalConfig(workspaceId, payload),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["portal-config", workspaceId] });
      onToast(res.message);
      onClose();
    },
    onError: (err: Error) => onToast(err.message),
  });

  const toggleWidget = (id: WidgetId) => {
    if (!draft) return;
    const exists = draft.enabledWidgets.includes(id);
    setDraft({
      ...draft,
      enabledWidgets: exists
        ? draft.enabledWidgets.filter((w) => w !== id)
        : [...draft.enabledWidgets, id],
    });
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!draft) return;
    saveMutation.mutate(draft);
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      titleId="portal-builder-title"
      maxWidthClass="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <h2 id="portal-builder-title" className="text-base font-semibold">
              低代码业务门户装配台 (Portal App Builder)
            </h2>
            <p className="text-[var(--muted-foreground)] mt-0.5">
              自定义门户标题、组件显隐、预警窗口天数与办公 IM 审批通道，保存后立即生效。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 rounded border border-[var(--border)] hover:bg-[var(--secondary)] cursor-pointer"
          >
            关闭
          </button>
        </div>

        {draft && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="pb-title" className="block font-medium">门户主标题</label>
              <input
                id="pb-title"
                type="text"
                required
                value={draft.portalTitle}
                onChange={(e) => setDraft({ ...draft, portalTitle: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)]"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="pb-subtitle" className="block font-medium">业务角色横幅说明</label>
              <input
                id="pb-subtitle"
                type="text"
                value={draft.subtitle}
                onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="pb-days" className="block font-medium">到期预警窗口 (7~180 天)</label>
                <input
                  id="pb-days"
                  type="number"
                  min={7}
                  max={180}
                  value={draft.alertWindowDays}
                  onChange={(e) =>
                    setDraft({ ...draft, alertWindowDays: Math.max(7, Math.min(180, Number(e.target.value) || 30)) })
                  }
                  className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="pb-im" className="block font-medium">默认 IM 审批通道</label>
                <select
                  id="pb-im"
                  value={draft.imChannel}
                  onChange={(e) => setDraft({ ...draft, imChannel: e.target.value as PortalAppConfig["imChannel"] })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)]"
                >
                  <option value="WECOM">企业微信 (WeCom)</option>
                  <option value="DINGTALK">钉钉 (DingTalk)</option>
                  <option value="FEISHU">飞书 (Feishu)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="pb-webhook" className="block font-medium">IM Webhook 回调地址</label>
              <input
                id="pb-webhook"
                type="text"
                value={draft.imWebhookUrl}
                onChange={(e) => setDraft({ ...draft, imWebhookUrl: e.target.value })}
                spellCheck={false}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <span className="block font-medium">启用门户功能组件</span>
              <div className="grid grid-cols-2 gap-2">
                {WIDGET_OPTIONS.map((w) => (
                  <label key={w.id} className="flex items-center gap-2 p-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)]/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.enabledWidgets.includes(w.id)}
                      onChange={() => toggleWidget(w.id)}
                    />
                    <span>{w.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-[var(--border)] cursor-pointer">
                取消
              </button>
              <button
                type="submit"
                disabled={!canModel || saveMutation.isPending}
                title={!canModel ? ROLE_TIPS.model : undefined}
                className="px-4 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {saveMutation.isPending ? "保存中..." : "保存门户装配配置"}
              </button>
            </div>
          </div>
        )}
      </form>
    </ModalDialog>
  );
}
