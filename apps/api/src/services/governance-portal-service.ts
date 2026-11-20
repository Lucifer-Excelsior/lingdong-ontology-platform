import { desc, eq } from "drizzle-orm";
import type { GovernanceSnapshot, PortalSnapshot } from "@lingdong/contracts";
import { activeAboxGraphUri } from "@lingdong/semantic-core";
import { sandboxErpSql, type AppDb } from "../db/client.js";
import { auditEvents, modelRoutes, users } from "../db/schema.js";
import { graphStore } from "../graph-runtime.js";
import type { SessionActor } from "../security/guards.js";
import { getLiveOpsTelemetry } from "../security/telemetry-and-oidc.js";
import { ITU_REVIEW_ITEMS } from "../seed/itu-and-supply-seed-data.js";
import { getPublicLlmConfigView } from "./llm-config-service.js";

export async function getGovernanceSnapshot(
  txDb: AppDb,
  actor: SessionActor,
  workspaceId: string
): Promise<GovernanceSnapshot> {
  const userRows = await txDb.select().from(users);
  const routeRows = await txDb.select().from(modelRoutes);
  const auditRows = await txDb
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.workspaceId, workspaceId))
    .orderBy(desc(auditEvents.occurredAt));

  const llmView = getPublicLlmConfigView(actor.tenantId);
  const liveLlmReady = llmView.activeMode === "LIVE_LLM";

  return {
    currentUser: {
      id: actor.userId,
      name: actor.name,
      role: actor.role,
      tenantId: actor.tenantId,
    },
    availableActors: userRows.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.defaultRole,
      title: u.title,
    })),
    modelRoutes: routeRows.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      modelId: m.modelId,
      statusLabel:
        m.provider === "OPENAI_COMPATIBLE" && !liveLlmReady ? "待配置密钥" : m.statusLabel,
      statusTone:
        m.provider === "OPENAI_COMPATIBLE" && !liveLlmReady ? "neutral" : m.statusTone,
      purpose: m.purpose,
      latencyMs: m.latencyMs,
    })),
    auditEvents: auditRows.map((a) => ({
      id: a.id,
      workspaceId: a.workspaceId,
      category: a.category,
      categoryLabel: a.categoryLabel,
      actorDisplay: a.actorDisplay,
      summary: a.summary,
      actionableByMe: a.actionableByRole === actor.role,
      occurredAt: a.occurredAt,
    })),
    operationsMetrics: getLiveOpsTelemetry(
      graphStore.store.size,
      graphStore.countDistinctSubjectsInGraph(activeAboxGraphUri(workspaceId))
    ),
  };
}

export async function getPortalSnapshot(callerRole: SessionActor["role"]): Promise<PortalSnapshot> {
  const rows = await sandboxErpSql<
    Array<{
      contract_no: string;
      title: string;
      customer_name: string;
      owner_name: string;
      expires_at: string;
      total_amount: string;
      status: string;
      risk_note: string;
    }>
  >`
    SELECT c.contract_no, c.title, cu.customer_name, o.owner_name,
           c.expires_at::text, c.total_amount::text, c.status, c.risk_note
    FROM public.contracts c
    JOIN public.customers cu ON cu.customer_id = c.customer_id
    JOIN public.account_owners o ON o.owner_id = c.owner_id
    WHERE c.expires_at >= c.signed_at
      AND c.expires_at <= '2026-12-20'
    ORDER BY c.expires_at ASC
    LIMIT 4
  `;

  const baseDate = new Date("2026-11-18T00:00:00Z");
  const contractAlerts = rows.map((r) => {
    const expDate = new Date(`${r.expires_at}T00:00:00Z`);
    const days = Math.max(1, Math.round((expDate.getTime() - baseDate.getTime()) / 86_400_000));
    const amt =
      callerRole === "VIEWER"
        ? "¥ *** (脱敏)"
        : `¥ ${(Number(r.total_amount) / 10000).toFixed(1)} 万`;
    return {
      contractNo: r.contract_no,
      title: r.title,
      customerName: r.customer_name,
      expiresInDays: days,
      expiresAt: r.expires_at,
      amountDisplay: amt,
      riskNote: r.risk_note,
      status: r.status,
      pendingApprovalNote:
        r.contract_no === "HT-2026-104" && r.status !== "PENDING_RENEWAL"
          ? "当前进度：已提交状态变更申请，正在等待风控主管（张敏 · REVIEWER）独立审批。"
          : r.status === "PENDING_RENEWAL"
            ? "已完成独立审批并进入待续签商务流程。"
            : null,
      ownerName: r.owner_name,
    };
  });

  return {
    contractAlerts,
    ituReview: {
      documentTitle: "Y.31xx 算力网络语义编排架构提案草案 v0.4.docx",
      termAlignmentRate: "94.5%",
      conflictCount: ITU_REVIEW_ITEMS.filter((i) => i.severity === "CONFLICT").length,
      normativeRefValidRate: "100% 现行有效",
      items: ITU_REVIEW_ITEMS,
    },
  };
}
