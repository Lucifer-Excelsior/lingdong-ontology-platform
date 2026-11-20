#!/usr/bin/env node
/**
 * Example 01: Zero-Hallucination Contract Risk Q&A + 3-Agent Co-Review + Verifiable SM3 Receipt
 * Runs directly against the live Railway public Demo (or set LINGDONG_BASE_URL=http://127.0.0.1:8280).
 */
import { LingDongClient, verifyReceiptIntegrity } from "../packages/sdk/dist/index.js";

const client = new LingDongClient();
console.log(`[1/2] Querying ${client.baseUrl} via NL-to-SPARQL...`);

const queryRes = await client.ask("查询华东大区未来30天内到期的高风险合同及违约条款", {
  receipt: true,
});
console.log("→ Duration (ms):", queryRes.data.durationMs);
console.log("→ Evidence Anchors:", queryRes.receipt?.evidenceCount);
console.log("→ Receipt ID:", queryRes.receipt?.receiptId, "| Valid:", verifyReceiptIntegrity(queryRes.receipt, queryRes.data).valid);

console.log("\n[2/2] Invoking Legal + Finance + SupplyChain Multi-Agent Co-Review for HT-2026-089...");
const reviewRes = await client.coReview("HT-2026-089", { receipt: true });
console.log("→ Verdict:", reviewRes.data.overallVerdict, "| Composite Risk Score:", reviewRes.data.compositeRiskScore);
console.log("→ Specialists:", Array.isArray(reviewRes.data.specialists) ? reviewRes.data.specialists.length : 0);
console.log("→ SM3 Audit Head:", reviewRes.receipt?.auditChainHeadHash);
