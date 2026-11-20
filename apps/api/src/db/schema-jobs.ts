import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenants, workspaces } from "./schema.js";

export type AsyncJobType = "MATERIALIZE_BATCH" | "MULTI_SOURCE_FUSION" | "SHACL_FULL_AUDIT";
export type AsyncJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export const asyncJobs = pgTable("async_jobs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  jobType: text("job_type").$type<AsyncJobType>().notNull(),
  status: text("status").$type<AsyncJobStatus>().notNull(),
  progressPct: integer("progress_pct").notNull().default(0),
  stageLabel: text("stage_label").notNull(),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
  resultJson: jsonb("result_json").$type<Record<string, unknown> | null>(),
  errorMessage: text("error_message"),
  attempts: integer("attempts").notNull().default(0),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  maxAttempts: integer("max_attempts").notNull().default(3),
  deadLettered: boolean("dead_lettered").notNull().default(false),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditHashChain = pgTable("audit_hash_chain", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  seqNo: integer("seq_no").notNull(),
  auditEventId: text("audit_event_id").notNull(),
  prevHash: text("prev_hash").notNull(),
  currHash: text("curr_hash").notNull(),
  hashAlgo: text("hash_algo").notNull().default("SM3"),
  payloadSummary: text("payload_summary").notNull(),
  actorDisplay: text("actor_display").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
