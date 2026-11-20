#!/usr/bin/env node
/**
 * Example 03: 4-Layer Schema Lineage Drift Radar + Sovereign SM3 Audit Chain Verification
 */
import { LingDongClient } from "../packages/sdk/dist/index.js";

const client = new LingDongClient();

console.log("[1/2] Running 4-layer Schema Lineage Drift Scan...");
const drift = await client.detectLineageDrift({ droppedColumns: ["expires_at"], receipt: true });
console.log("→ Total Links:", drift.data.totalLinks, "| Broken:", drift.data.brokenCount, "| Drift:", drift.data.driftCount);

console.log("\n[2/2] Verifying Sovereign SM3 Forward-Hash Audit Chain...");
const audit = await client.verifyAuditChain();
console.log("→ Chain Intact:", audit.intact, "| Blocks:", audit.totalEntries, "| Algo:", audit.algo);
console.log("→ Head Hash:", audit.headHash);
