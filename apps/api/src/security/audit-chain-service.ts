import { randomUUID } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import { computeAuditHash, resolveAuditHashAlgo } from "@lingdong/semantic-core";
import type { AppDb } from "../db/client.js";
import { auditHashChain } from "../db/schema-jobs.js";

const GENESIS_HASH = "0".repeat(64);

export interface AuditChainVerifyResult {
  intact: boolean;
  totalEntries: number;
  algo: string;
  headHash: string;
  brokenAtSeq: number | null;
  reason: string;
  recentEntries: Array<{
    seqNo: number;
    auditEventId: string;
    prevHash: string;
    currHash: string;
    actorDisplay: string;
    payloadSummary: string;
    createdAt: string;
  }>;
}

export async function appendAuditChainEntry(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  auditEventId: string,
  actorDisplay: string,
  payloadSummary: string
): Promise<{ seqNo: number; currHash: string; algo: string }> {
  const [latest] = await txDb
    .select()
    .from(auditHashChain)
    .where(eq(auditHashChain.workspaceId, workspaceId))
    .orderBy(desc(auditHashChain.seqNo))
    .limit(1);

  const seqNo = (latest?.seqNo ?? 0) + 1;
  const prevHash = latest?.currHash ?? GENESIS_HASH;
  const algo = resolveAuditHashAlgo();
  const currHash = computeAuditHash(
    `${seqNo}|${prevHash}|${auditEventId}|${actorDisplay}|${payloadSummary}`,
    algo
  );

  await txDb.insert(auditHashChain).values({
    id: `achain-${Date.now()}-${randomUUID().slice(0, 8)}`,
    tenantId,
    workspaceId,
    seqNo,
    auditEventId,
    prevHash,
    currHash,
    hashAlgo: algo,
    payloadSummary,
    actorDisplay,
  });

  return { seqNo, currHash, algo };
}

export async function verifyAuditHashChain(
  txDb: AppDb,
  workspaceId: string
): Promise<AuditChainVerifyResult> {
  const rows = await txDb
    .select()
    .from(auditHashChain)
    .where(eq(auditHashChain.workspaceId, workspaceId))
    .orderBy(asc(auditHashChain.seqNo));

  const algo = rows[rows.length - 1]?.hashAlgo ?? resolveAuditHashAlgo();
  if (rows.length === 0) {
    return {
      intact: true,
      totalEntries: 0,
      algo,
      headHash: GENESIS_HASH,
      brokenAtSeq: null,
      reason: "当前空间审计哈希链为空（创世态完整）",
      recentEntries: [],
    };
  }

  let expectedPrev = GENESIS_HASH;
  let brokenAtSeq: number | null = null;
  let reason = `全部 ${rows.length} 条 ${algo} 审计链区块校验通过，零篡改、零缺失`;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const expectedSeq = i + 1;
    if (r.seqNo !== expectedSeq) {
      brokenAtSeq = expectedSeq;
      reason = `检测到审计链序号断裂（期望 #${expectedSeq}，实测 #${r.seqNo}，疑似存在数据库行删除）`;
      break;
    }
    if (r.prevHash !== expectedPrev) {
      brokenAtSeq = r.seqNo;
      reason = `区块 #${r.seqNo} 前驱哈希不匹配，链式关联已被破坏`;
      break;
    }
    const recomputed = computeAuditHash(
      `${r.seqNo}|${r.prevHash}|${r.auditEventId}|${r.actorDisplay}|${r.payloadSummary}`,
      r.hashAlgo === "SHA256" ? "SHA256" : "SM3"
    );
    if (recomputed !== r.currHash) {
      brokenAtSeq = r.seqNo;
      reason = `区块 #${r.seqNo} 载荷摘要验真失败，审计内容疑似被篡改`;
      break;
    }
    expectedPrev = r.currHash;
  }

  const recentEntries = rows.slice(-8).reverse().map((r) => ({
    seqNo: r.seqNo,
    auditEventId: r.auditEventId,
    prevHash: r.prevHash,
    currHash: r.currHash,
    actorDisplay: r.actorDisplay,
    payloadSummary: r.payloadSummary,
    createdAt: r.createdAt.toISOString(),
  }));

  return {
    intact: brokenAtSeq === null,
    totalEntries: rows.length,
    algo,
    headHash: rows[rows.length - 1].currHash,
    brokenAtSeq,
    reason,
    recentEntries,
  };
}
