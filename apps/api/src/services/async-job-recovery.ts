import { hostname } from "node:os";
import { and, eq } from "drizzle-orm";
import { adminSql, type AppDb } from "../db/client.js";
import { asyncJobs } from "../db/schema-jobs.js";
import { scheduleAsyncJobWorker } from "./async-job-service.js";

export const WORKER_LEASE_OWNER = process.env.HOSTNAME || `${hostname()}-${process.pid}`;

/**
 * V6.0 M2: Reclaims zombie RUNNING jobs whose worker Pod crashed or timed out (lease_expires_at < NOW()).
 * - If attempts < max_attempts: resets to QUEUED for healthy replicas to claim via SKIP LOCKED.
 * - If attempts >= max_attempts: transitions to FAILED + dead_lettered = TRUE (DLQ).
 */
export async function reclaimExpiredLeasedJobs(): Promise<{
  reclaimedCount: number;
  deadLetteredCount: number;
  reclaimedIds: string[];
  deadLetteredIds: string[];
}> {
  const expired = await adminSql<
    Array<{ id: string; tenant_id: string; workspace_id: string; attempts: number; max_attempts: number; created_by: string }>
  >`
    SELECT id, tenant_id, workspace_id, attempts, max_attempts, created_by
    FROM async_jobs
    WHERE status = 'RUNNING' AND lease_expires_at IS NOT NULL AND lease_expires_at < NOW()
    LIMIT 50
  `;

  const reclaimedIds: string[] = [];
  const deadLetteredIds: string[] = [];

  for (const row of expired) {
    if (row.attempts < row.max_attempts) {
      await adminSql`
        UPDATE async_jobs
        SET status = 'QUEUED',
            lease_owner = NULL,
            lease_expires_at = NULL,
            stage_label = '检测到执行节点租约超时，已自动重入队列等待接管…',
            updated_at = NOW()
        WHERE id = ${row.id} AND status = 'RUNNING'
      `;
      reclaimedIds.push(row.id);
      scheduleAsyncJobWorker(row.id, row.tenant_id, row.workspace_id, row.created_by);
    } else {
      await adminSql`
        UPDATE async_jobs
        SET status = 'FAILED',
            dead_lettered = TRUE,
            lease_owner = NULL,
            lease_expires_at = NULL,
            stage_label = '超过最大重试次数，已转入死信队列 (DLQ)',
            error_message = COALESCE(error_message, '节点租约连续超时，等待人工重放'),
            updated_at = NOW()
        WHERE id = ${row.id} AND status = 'RUNNING'
      `;
      deadLetteredIds.push(row.id);
    }
  }

  return {
    reclaimedCount: reclaimedIds.length,
    deadLetteredCount: deadLetteredIds.length,
    reclaimedIds,
    deadLetteredIds,
  };
}

export async function retryDeadLetterJob(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  jobId: string,
  actorDisplay: string
): Promise<{ ok: boolean; jobId: string; message: string }> {
  const [job] = await txDb
    .select()
    .from(asyncJobs)
    .where(and(eq(asyncJobs.workspaceId, workspaceId), eq(asyncJobs.id, jobId)))
    .limit(1);
  if (!job) throw new Error("未找到指定异步作业");

  await adminSql`
    UPDATE async_jobs
    SET status = 'QUEUED',
        dead_lettered = FALSE,
        progress_pct = 5,
        attempts = 0,
        lease_owner = NULL,
        lease_expires_at = NULL,
        error_message = NULL,
        stage_label = ${`已由 ${actorDisplay} 从死信队列重放，重新排队中…`},
        updated_at = NOW()
    WHERE id = ${jobId}
  `;

  scheduleAsyncJobWorker(jobId, tenantId, workspaceId, actorDisplay);
  return { ok: true, jobId, message: `死信作业 ${jobId} 已重新入队调度执行` };
}

export function startAsyncJobLeaseSweeper(intervalMs = 15_000): () => void {
  const timer = setInterval(() => {
    void reclaimExpiredLeasedJobs().catch((err) => {
      console.error("[V6 Lease Sweeper Error]", err);
    });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
