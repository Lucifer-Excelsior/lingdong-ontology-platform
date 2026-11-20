import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { checkClassHierarchyAndSatisfiability } from "@lingdong/semantic-core";
import { adminSql, withTenantDb, type AppDb } from "../db/client.js";
import { auditEvents } from "../db/schema.js";
import { asyncJobs, type AsyncJobStatus, type AsyncJobType } from "../db/schema-jobs.js";
import { materializeWorkspaceAbox } from "./data-service.js";
import { getOntologySnapshot } from "./ontology-service.js";
import { fuseMultiSourceEvidence } from "./multi-source-fusion-service.js";

export interface AsyncJobDto {
  id: string;
  workspaceId: string;
  jobType: AsyncJobType;
  status: AsyncJobStatus;
  progressPct: number;
  stageLabel: string;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  attempts: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const JOB_LABELS: Record<AsyncJobType, string> = {
  MATERIALIZE_BATCH: "大规模语义物化入图",
  MULTI_SOURCE_FUSION: "多源异构本体融合推理",
  SHACL_FULL_AUDIT: "全量 SHACL / OWL 一致性体检",
};

function toDto(row: typeof asyncJobs.$inferSelect): AsyncJobDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    jobType: row.jobType,
    status: row.status,
    progressPct: row.progressPct,
    stageLabel: row.stageLabel,
    result: row.resultJson ?? null,
    errorMessage: row.errorMessage ?? null,
    attempts: row.attempts,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAsyncJobs(txDb: AppDb, workspaceId: string): Promise<AsyncJobDto[]> {
  const rows = await txDb
    .select()
    .from(asyncJobs)
    .where(eq(asyncJobs.workspaceId, workspaceId))
    .orderBy(desc(asyncJobs.createdAt))
    .limit(20);
  return rows.map(toDto);
}

export async function getAsyncJobById(txDb: AppDb, workspaceId: string, jobId: string): Promise<AsyncJobDto | null> {
  const rows = await txDb
    .select()
    .from(asyncJobs)
    .where(and(eq(asyncJobs.workspaceId, workspaceId), eq(asyncJobs.id, jobId)))
    .limit(1);
  return rows[0] ? toDto(rows[0]) : null;
}

async function updateJobStage(
  jobId: string,
  status: AsyncJobStatus,
  progressPct: number,
  stageLabel: string,
  resultJson?: Record<string, unknown> | null,
  errorMessage?: string | null
) {
  const jsonStr = resultJson ? JSON.stringify(resultJson) : null;
  await adminSql`
    UPDATE async_jobs
    SET status = ${status},
        progress_pct = ${progressPct},
        stage_label = ${stageLabel},
        result_json = ${jsonStr}::jsonb,
        error_message = ${errorMessage ?? null},
        updated_at = NOW()
    WHERE id = ${jobId}
  `;
}

/**
 * Multi-Replica Safe Job Claim using PostgreSQL `FOR UPDATE SKIP LOCKED`:
 * Ensures two stateless API replicas never execute the same queued job twice.
 */
async function claimAndExecuteJob(jobId: string, tenantId: string, workspaceId: string, actorDisplay: string) {
  const claimed = await adminSql.begin(async (tx) => {
    const rows = await tx<{ id: string; job_type: AsyncJobType; payload_json: Record<string, unknown> }[]>`
      SELECT id, job_type, payload_json
      FROM async_jobs
      WHERE id = ${jobId} AND status = 'QUEUED'
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    await tx`
      UPDATE async_jobs
      SET status = 'RUNNING', progress_pct = 15, stage_label = '多副本锁抢占成功，已获取 60s 心跳租约…',
          lease_owner = ${process.env.HOSTNAME || `${hostname()}-${process.pid}`},
          lease_expires_at = NOW() + INTERVAL '60 seconds',
          attempts = attempts + 1, updated_at = NOW()
      WHERE id = ${row.id}
    `;
    return row;
  });

  if (!claimed) return;

  try {
    let result: Record<string, unknown> = {};
    if (claimed.job_type === "MATERIALIZE_BATCH") {
      await updateJobStage(jobId, "RUNNING", 45, "正在抽取关系库增量数据并执行 SHACL 校验…");
      const out = await withTenantDb(tenantId, (txDb) =>
        materializeWorkspaceAbox(txDb, tenantId, workspaceId, actorDisplay)
      );
      await updateJobStage(jobId, "RUNNING", 85, "已写入活跃命名图并更新物化批次水位…");
      result = {
        writtenInstances: out.run.writtenInstances,
        writtenTriples: out.run.writtenTriples,
        quarantinedCount: out.run.quarantinedCount,
        summary: out.message,
      };
    } else if (claimed.job_type === "SHACL_FULL_AUDIT") {
      await updateJobStage(jobId, "RUNNING", 50, "正在执行 OWL 类层次、互斥性与 SHACL 全量体检…");
      const snap = await withTenantDb(tenantId, (txDb) => getOntologySnapshot(txDb, workspaceId));
      const check = checkClassHierarchyAndSatisfiability(snap.classes);
      result = {
        consistent: check.hierarchyCycles.length === 0 && check.unsatisfiableClasses.length === 0,
        unsatisfiableCount: check.unsatisfiableClasses.length,
        cycleCount: check.hierarchyCycles.length,
        classCount: snap.classes.length,
        propertyCount: snap.properties.length,
        summary: `全量 OWL/SHACL 一致性体检完成：核验 ${snap.classes.length} 个本体类 / ${snap.properties.length} 条属性，不可满足类 ${check.unsatisfiableClasses.length}，循环继承 ${check.hierarchyCycles.length}`,
      };
    } else {
      await updateJobStage(jobId, "RUNNING", 50, "正在交叉比对制度文档、图件与库表元数据…");
      const fuse = await withTenantDb(tenantId, (txDb) =>
        fuseMultiSourceEvidence(txDb, tenantId, workspaceId, actorDisplay, {
          instruction: String(claimed.payload_json?.instruction ?? "后台异步多源融合扫描"),
        })
      );
      result = {
        proposalCount: fuse.proposals.length,
        corroboratedCount: fuse.fusionSummary.corroboratedCount,
        conflictCount: fuse.fusionSummary.conflictCount,
        summary: `多源融合扫描完成（引擎：${fuse.engineUsed}）：生成 ${fuse.proposals.length} 项提案（多源印证 ${fuse.fusionSummary.corroboratedCount} / 冲突 ${fuse.fusionSummary.conflictCount}）`,
      };
    }

    await updateJobStage(jobId, "COMPLETED", 100, `${JOB_LABELS[claimed.job_type]}执行完成`, result, null);
    await withTenantDb(tenantId, async (txDb) => {
      await txDb.insert(auditEvents).values({
        id: `aud-job-${Date.now()}-${randomUUID().slice(0, 8)}`,
        tenantId,
        workspaceId,
        category: "CONTROLLED_ACTION",
        categoryLabel: "异步作业完成",
        actorDisplay,
        summary: `异步作业 ${jobId} (${JOB_LABELS[claimed.job_type]}) 已完成`,
        occurredAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "异步作业执行异常";
    await updateJobStage(jobId, "FAILED", 100, "作业执行失败", null, msg);
  }
}

export function scheduleAsyncJobWorker(
  jobId: string,
  tenantId: string,
  workspaceId: string,
  actorDisplay: string
): void {
  setTimeout(() => {
    void claimAndExecuteJob(jobId, tenantId, workspaceId, actorDisplay);
  }, 30);
}

export async function enqueueAsyncJob(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  jobType: AsyncJobType,
  actorDisplay: string,
  payload: Record<string, unknown> = {}
): Promise<AsyncJobDto> {
  const id = `job-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const [inserted] = await txDb
    .insert(asyncJobs)
    .values({
      id,
      tenantId,
      workspaceId,
      jobType,
      status: "QUEUED",
      progressPct: 5,
      stageLabel: `已进入 PostgreSQL 持久化队列 (${JOB_LABELS[jobType]})`,
      payloadJson: payload,
      resultJson: null,
      errorMessage: null,
      attempts: 0,
      createdBy: actorDisplay,
    })
    .returning();

  return toDto(inserted);
}
