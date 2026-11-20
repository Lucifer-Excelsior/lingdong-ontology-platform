import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { AppDb } from "../db/client.js";
import { saveRuntimeKv } from "../db/runtime-kv.js";
import { auditEvents, materializationRuns } from "../db/schema.js";
import { validateConnectorEndpoint } from "../security/guards.js";
import { repairAndReplayQuarantineRow } from "./connector-and-replay-service.js";

function csvCell(raw: string): string {
  const s = String(raw ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

export async function exportQuarantineCsv(txDb: AppDb, workspaceId: string): Promise<{ filename: string; csv: string }> {
  const runs = await txDb
    .select()
    .from(materializationRuns)
    .where(eq(materializationRuns.workspaceId, workspaceId))
    .orderBy(desc(materializationRuns.executedAt))
    .limit(5);

  const records = runs.find((r) => (r.quarantineRecordsJson?.length ?? 0) > 0)?.quarantineRecordsJson ?? [];
  const header = ["row_key", "source_table", "violated_property", "reason", "repaired_expires_at"].join(",");
  const lines = records.map((q) =>
    [q.sourceRowKey, q.sourceTable, q.violatedProperty, q.reason, "2027-06-30"].map(csvCell).join(",")
  );
  const bom = "\uFEFF";
  return {
    filename: `${workspaceId}-shacl-quarantine.csv`,
    csv: `${bom}${[header, ...lines].join("\n")}\n`,
  };
}

export async function importQuarantineCsvAndReplay(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  csvText: string,
  actorDisplay: string
): Promise<{ replayedCount: number; rowKeys: string[]; message: string }> {
  const clean = csvText.replace(/^\uFEFF/, "").trim();
  const rows = clean.split(/\r?\n/).slice(1).filter((l) => l.trim().length > 0);
  const replayedKeys: string[] = [];

  for (const line of rows) {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const rowKey = cols[0];
    const repairedExpiresAt = cols[4] || "2027-06-30";
    if (!rowKey || !/^\d{4}-\d{2}-\d{2}$/.test(repairedExpiresAt)) continue;
    await repairAndReplayQuarantineRow(txDb, tenantId, workspaceId, rowKey, repairedExpiresAt, actorDisplay);
    replayedKeys.push(rowKey);
  }

  return {
    replayedCount: replayedKeys.length,
    rowKeys: replayedKeys,
    message:
      replayedKeys.length > 0
        ? `已批量修复并重放 ${replayedKeys.length} 条隔离记录 (${replayedKeys.join(", ")}) 重新入图！`
        : "CSV 中未解析到有效的修复记录（请确保第 1 列为 row_key、第 5 列为 YYYY-MM-DD）",
  };
}

export async function testCapabilityWebhookAction(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  capabilityCode: string,
  actorDisplay: string,
  input: { webhookUrl: string; method?: "POST" | "PATCH" | "PUT"; samplePayload?: Record<string, unknown> }
): Promise<{
  ok: boolean;
  httpStatus: number;
  latencyMs: number;
  idempotencyKey: string;
  responsePreview: string;
  message: string;
}> {
  const url = input.webhookUrl.trim();
  validateConnectorEndpoint(url, { allowLocalSandboxHost: false });

  const idempotencyKey = `idem_${randomUUID().slice(0, 12)}`;
  const method = input.method ?? "POST";
  const payload = input.samplePayload ?? {
    capabilityCode,
    workspaceId,
    dryRun: true,
    timestamp: new Date().toISOString(),
  };

  const t0 = performance.now();
  let httpStatus = 200;
  let responsePreview = "";

  if (url.includes(".example")) {
    responsePreview = JSON.stringify(
      {
        status: "ACCEPTED_DRY_RUN",
        webhook: url,
        idempotencyKey,
        echoCapability: capabilityCode,
      },
      null,
      2
    );
  } else {
    const resp = await fetch(url, {
      method,
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "X-Lingdong-Workspace": workspaceId,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    httpStatus = resp.status;
    responsePreview = (await resp.text()).slice(0, 400);
  }

  const latencyMs = Math.max(2, Math.round(performance.now() - t0));
  await saveRuntimeKv(tenantId, "capability_webhook", `${workspaceId}:${capabilityCode}`, {
    webhookUrl: url,
    method,
    lastTestedAt: new Date().toISOString(),
    lastStatus: httpStatus,
  });

  await txDb.insert(auditEvents).values({
    id: `aud-wh-${Date.now()}`,
    tenantId,
    workspaceId,
    category: "CONTROLLED_ACTION",
    categoryLabel: "Webhook 调试",
    actorDisplay,
    summary: `调试受控动作 ${capabilityCode} 外部执行器 (${method} ${url.slice(0, 48)}) → HTTP ${httpStatus}`,
    occurredAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  });

  return {
    ok: httpStatus >= 200 && httpStatus < 400,
    httpStatus,
    latencyMs,
    idempotencyKey,
    responsePreview,
    message: `外部 Webhook 调试完成 (HTTP ${httpStatus} · ${latencyMs}ms · Idempotency-Key: ${idempotencyKey})`,
  };
}
