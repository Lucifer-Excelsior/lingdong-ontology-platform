import { describe, expect, it } from "vitest";
import {
  LingDongClient,
  buildVerifiableReceipt,
  verifyReceiptIntegrity,
  parseCliArgs,
} from "./index.js";

describe("@lingdong/sdk — Verifiable Receipts, Client & CLI", () => {
  it("builds and verifies a deterministic SM3-anchored execution receipt", () => {
    const payload = { latencyMs: 2.93, rows: [{ contractNo: "HT-2026-089", amount: 2850000 }] };
    const receipt = buildVerifiableReceipt({
      operation: "portal.nl-query",
      workspaceId: "ws-contract",
      baseUrl: "https://lingdong-demo-production.up.railway.app",
      payload,
      evidenceCount: 3,
      auditChain: { intact: true, headHash: "85c98f62b1b073c4", hashAlgo: "SM3" },
      executedAt: "2026-11-20T08:00:00.000Z",
    });

    expect(receipt.receiptId).toMatch(/^rcpt_[0-9a-f]{16}$/);
    expect(receipt.status).toBe("VERIFIED");
    expect(receipt.auditChainHeadHash).toBe("85c98f62b1b073c4");
    expect(verifyReceiptIntegrity(receipt, payload).valid).toBe(true);

    // Tampering with payload invalidates receipt immediately
    const tampered = { ...payload, latencyMs: 999 };
    expect(verifyReceiptIntegrity(receipt, tampered).valid).toBe(false);
  });

  it("parses CLI arguments and flags accurately", () => {
    const parsed = parseCliArgs([
      "whatif",
      "HT-2026-089",
      "--threshold",
      "500",
      "--receipt",
      "--compact",
    ]);
    expect(parsed.command).toBe("whatif");
    expect(parsed.positional).toEqual(["HT-2026-089"]);
    expect(parsed.flags.threshold).toBe("500");
    expect(parsed.flags.receipt).toBe(true);
    expect(parsed.flags.compact).toBe(true);
  });

  it("executes SDK ask() and attaches SM3 audit receipt via mocked fetch", async () => {
    const calls: string[] = [];
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/portal/nl-query")) {
        return new Response(
          JSON.stringify({
            latencyMs: 2.93,
            evidenceAnchors: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
            rows: [{ contractNo: "HT-2026-089" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.endsWith("/governance/audit-chain/verify")) {
        return new Response(
          JSON.stringify({ intact: true, totalBlocks: 45, headHash: "sm3_head_abc", hashAlgo: "SM3" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 404 });
    };

    const client = new LingDongClient({
      baseUrl: "https://demo.local",
      workspaceId: "ws-contract",
      fetchImpl: mockFetch,
    });
    const res = await client.ask("30天内到期高风险合同", { receipt: true });

    expect(calls).toHaveLength(2);
    expect(res.data.latencyMs).toBe(2.93);
    expect(res.receipt?.status).toBe("VERIFIED");
    expect(res.receipt?.evidenceCount).toBe(3);
    expect(res.receipt?.auditChainHeadHash).toBe("sm3_head_abc");
    expect(verifyReceiptIntegrity(res.receipt!, res.data).valid).toBe(true);
  });
});
