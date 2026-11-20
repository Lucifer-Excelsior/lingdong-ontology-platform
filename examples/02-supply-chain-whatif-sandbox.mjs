#!/usr/bin/env node
/**
 * Example 02: Zero-Pollution Shadow Graph What-If Cascade Risk Simulation
 * Computes multi-hop financial exposure in an ephemeral in-memory sandbox with 0 production writes.
 */
import { LingDongClient, verifyReceiptIntegrity } from "../packages/sdk/dist/index.js";

const client = new LingDongClient();
console.log(`[Shadow What-If] Simulating supplier default on HT-2026-089 (threshold: 500万)...`);

const simRes = await client.simulateWhatIf("HT-2026-089", {
  riskThresholdWan: 500,
  receipt: true,
});

console.log("→ Shadow Graph URI:", simRes.data.shadowGraphUri);
console.log("→ Shadow Graph Cleaned (0 Production Pollution):", simRes.data.shadowGraphCleaned);
console.log("→ Affected Entities:", simRes.data.affectedCount, "| Violated SHACL:", simRes.data.violatedShaclCount);
console.log("→ Total Exposure (万元):", simRes.data.totalExposureWan);
console.log("→ Verifiable Receipt:", simRes.receipt?.receiptId, "| Valid:", verifyReceiptIntegrity(simRes.receipt, simRes.data).valid);
