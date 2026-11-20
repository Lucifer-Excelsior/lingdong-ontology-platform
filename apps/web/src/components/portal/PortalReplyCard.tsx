import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { ConversationMessage } from "../../api/types";
import { ROLE_TIPS } from "../../utils/rbac";

interface PortalReplyCardProps {
  workspaceId: string;
  userQuestion: string;
  reply: ConversationMessage;
  canOperate: boolean;
  isConfirming: boolean;
  onConfirm: (payload: { msgId: string; planId: string; token: string }) => void;
  onToast: (msg: string) => void;
}

export function PortalReplyCard({
  workspaceId,
  userQuestion,
  reply,
  canOperate,
  isConfirming,
  onConfirm,
  onToast,
}: PortalReplyCardProps) {
  const [rated, setRated] = useState<"UP" | "DOWN" | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");

  const feedbackMutation = useMutation({
    mutationFn: (payload: { rating: "UP" | "DOWN"; correctionNote?: string }) =>
      api.submitPortalFeedback(workspaceId, {
        question: userQuestion,
        rating: payload.rating,
        correctionNote: payload.correctionNote,
      }),
    onSuccess: (res, vars) => {
      setRated(vars.rating);
      setShowNote(false);
      setNote("");
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  return (
    <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-2.5 text-xs">
      <div className="px-3 py-2 rounded-lg bg-[var(--secondary)] text-[var(--foreground)] font-medium">
        问：{userQuestion}
      </div>
      <div className="text-sm leading-relaxed whitespace-pre-wrap">{reply.content}</div>

      {reply.citations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {reply.citations.map((cite, idx) => (
            <span key={idx} className="px-2 py-0.5 rounded bg-[var(--secondary)] font-mono text-[var(--muted-foreground)]">
              原文条款依据：{cite}
            </span>
          ))}
        </div>
      )}

      {reply.pendingAction && (
        <div className="p-3 rounded-lg bg-[var(--secondary)] flex items-center justify-between gap-3">
          <span>{reply.pendingAction.previewText}</span>
          {reply.pendingAction.status === "AWAITING_CONFIRMATION" ? (
            <button
              type="button"
              disabled={isConfirming || !canOperate}
              title={!canOperate ? ROLE_TIPS.operate : undefined}
              onClick={() =>
                onConfirm({
                  msgId: reply.id,
                  planId: reply.pendingAction!.planId,
                  token: reply.pendingAction!.confirmationToken,
                })
              }
              className="shrink-0 px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              本人确认执行
            </button>
          ) : reply.pendingAction.status === "AWAITING_APPROVAL" ? (
            <span className="shrink-0 px-2.5 py-1 rounded bg-amber-500/15 text-amber-700 font-medium">
              待复核人审批
            </span>
          ) : (
            <span className="shrink-0 px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-600 font-medium">
              {reply.pendingAction.status}
            </span>
          )}
        </div>
      )}

      <div className="pt-2 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
        <span className="text-[var(--muted-foreground)]">业务口径反馈回流（自动沉淀至黄金评测池）</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={feedbackMutation.isPending || rated !== null}
            onClick={() => feedbackMutation.mutate({ rating: "UP" })}
            className={`px-2 py-1 rounded border cursor-pointer disabled:opacity-60 ${
              rated === "UP" ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 font-medium" : "border-[var(--border)] hover:bg-[var(--secondary)]"
            }`}
          >
            👍 准确
          </button>
          <button
            type="button"
            disabled={feedbackMutation.isPending || rated !== null}
            onClick={() => setShowNote((v) => !v)}
            className={`px-2 py-1 rounded border cursor-pointer disabled:opacity-60 ${
              rated === "DOWN" ? "border-amber-500 bg-amber-500/15 text-amber-700 font-medium" : "border-[var(--border)] hover:bg-[var(--secondary)]"
            }`}
          >
            👎 纠错入库
          </button>
        </div>
      </div>

      {showNote && rated === null && (
        <div className="flex gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="填写业务口径纠错说明（将回流至本体治理优化队列）"
            className="flex-1 px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)]"
          />
          <button
            type="button"
            disabled={feedbackMutation.isPending}
            onClick={() => feedbackMutation.mutate({ rating: "DOWN", correctionNote: note })}
            className="px-3 py-1.5 rounded bg-amber-600 text-white font-medium cursor-pointer"
          >
            提交纠错
          </button>
        </div>
      )}
    </div>
  );
}
