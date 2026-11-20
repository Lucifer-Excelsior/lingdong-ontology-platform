import { describe, expect, it } from "vitest";
import {
  generateLicenseKeyPair,
  guardSparqlSelectQuery,
  RemoteSparqlAdapter,
  signOfflineLicense,
  sm3Hex,
  verifyOfflineLicense,
} from "./index.js";

describe("GA Crypto (SM3 + Ed25519 License) & Remote SPARQL Adapter", () => {
  it("matches official GM/T 0004-2012 SM3 standard test vector for 'abc'", () => {
    expect(sm3Hex("abc")).toBe(
      "66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0"
    );
  });

  it("signs, verifies, rejects tampered, and rejects expired Ed25519 offline licenses", () => {
    const { publicKeyPem, privateKeyPem } = generateLicenseKeyPair();
    const payload = {
      licenseId: "LIC-2026-001",
      licensedTo: "中国信息通信研究院",
      edition: "ENTERPRISE_GA_V4",
      maxWorkspaces: 50,
      maxUsers: 200,
      monthlyLlmTokenQuota: 10_000_000,
      issuedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2029-12-31T23:59:59Z",
      features: ["SM3_AUDIT", "REMOTE_OXIGRAPH", "XINCHUANG_BRIDGE"],
    };

    const lic = signOfflineLicense(payload, privateKeyPem);
    expect(lic.startsWith("LINGDONG-LIC-V4:")).toBe(true);

    const ok = verifyOfflineLicense(lic, publicKeyPem, Date.parse("2026-11-19T00:00:00Z"));
    expect(ok.valid).toBe(true);
    expect(ok.expired).toBe(false);
    expect(ok.payload?.licensedTo).toBe("中国信息通信研究院");

    // Tamper 1 byte in base64 payload
    const raw = Buffer.from(lic.slice("LINGDONG-LIC-V4:".length), "base64").toString("utf8");
    const tamperedJson = raw.replace("200", "9999");
    const tamperedLic = `LINGDONG-LIC-V4:${Buffer.from(tamperedJson, "utf8").toString("base64")}`;
    const bad = verifyOfflineLicense(tamperedLic, publicKeyPem);
    expect(bad.valid).toBe(false);
    expect(bad.reason).toContain("篡改");

    // Expired check
    const exp = verifyOfflineLicense(lic, publicKeyPem, Date.parse("2030-01-02T00:00:00Z"));
    expect(exp.valid).toBe(false);
    expect(exp.expired).toBe(true);
  });

  it("enforces SPARQL read-only LIMIT guard and blocks destructive DROP ALL updates", async () => {
    const guarded = guardSparqlSelectQuery("SELECT ?s ?p ?o WHERE { ?s ?p ?o }", 5000);
    expect(guarded).toContain("LIMIT 5000");
    expect(() => guardSparqlSelectQuery("DELETE DATA { <a> <b> <c> }")).toThrow(/只读查询通道拦截/);

    const adapter = new RemoteSparqlAdapter({ endpointUrl: "http://oxigraph.example:7878" });
    await expect(adapter.executeUpdate("DROP ALL")).rejects.toThrow(/禁止执行全库清零/);
  });
});
