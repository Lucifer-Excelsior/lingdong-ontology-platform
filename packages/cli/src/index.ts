#!/usr/bin/env node
import { createHash, createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";

const args = process.argv.slice(2);
const cmd = args[0] ?? "help";
const apiUrl = (process.env.LINGDONG_API_URL ?? "http://127.0.0.1:8280").replace(/\/$/, "");
const gatewayToken = process.env.PLATFORM_GATEWAY_TOKEN;

function headers(): Record<string, string> {
  const h: Record<string, string> = { Origin: "http://127.0.0.1:3200" };
  if (gatewayToken) h["x-gateway-token"] = gatewayToken;
  return h;
}

function verifyBundleOffline(zipPath: string): void {
  const raw = new Uint8Array(readFileSync(zipPath));
  const entries = unzipSync(raw);
  const manifestBytes = entries["manifest.json"];
  if (!manifestBytes) throw new Error("缺少 manifest.json");
  const manifest = JSON.parse(strFromU8(manifestBytes)) as {
    workspaceSlug?: string;
    version?: string;
    secretsEmbedded?: boolean;
    checksums?: Record<string, string>;
  };
  if (manifest.secretsEmbedded === true) throw new Error("安全拦截：方案包含内嵌明文密钥");
  const checksums = manifest.checksums ?? {};
  for (const req of ["ontology.ttl", "shapes.ttl", "provenance.ttl"]) {
    const expected = checksums[req];
    if (!expected) throw new Error(`清单缺失必选文件校验项：${req}`);
    const content = entries[req] ? strFromU8(entries[req]) : "";
    const actual = createHash("sha256").update(content, "utf8").digest("hex");
    if (actual !== expected) throw new Error(`SHA-256 验签失败：${req} 被篡改`);
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        workspaceSlug: manifest.workspaceSlug,
        version: manifest.version,
        verifiedFiles: Object.keys(checksums),
      },
      null,
      2
    )
  );
}

async function main() {
  if (cmd === "verify-bundle") {
    if (!args[1]) throw new Error("用法: lingdong-cli verify-bundle <bundle.zip>");
    verifyBundleOffline(args[1]);
    return;
  }

  if (cmd === "diagnose") {
    const wsId = args[1] ?? "ws-contract";
    const res = await fetch(`${apiUrl}/api/workspaces/${wsId}/release/diagnose`, {
      method: "POST",
      headers: headers(),
    });
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
    if (!res.ok) process.exit(1);
    return;
  }

  if (cmd === "evaluate") {
    const wsId = args[1] ?? "ws-contract";
    const res = await fetch(`${apiUrl}/api/workspaces/${wsId}/apps/evaluate`, {
      method: "POST",
      headers: headers(),
    });
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
    if (!res.ok) process.exit(1);
    return;
  }

  if (cmd === "export-bundle") {
    const wsId = args[1] ?? "ws-contract";
    const relId = args[2] ?? "rel-v2-0-0";
    const outPath = args[3] ?? `${wsId}-${relId}.zip`;
    const res = await fetch(`${apiUrl}/api/workspaces/${wsId}/releases/${relId}/download`, {
      headers: headers(),
    });
    if (!res.ok) throw new Error(`导出失败: HTTP ${res.status}`);
    writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
    console.log(`已导出不可变 FDE 方案包 -> ${outPath}`);
    return;
  }

  if (cmd === "sign-license") {
    const org = args[1] ?? "中国信息通信研究院";
    const days = Number(args[2] ?? 365);
    const outPath = args[3] ?? "lingdong-v4.lic";
    const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const privPem = process.env.LINGDONG_LICENSE_PRIVATE_KEY_PEM ?? privateKey;
    const now = new Date();
    const exp = new Date(now.getTime() + days * 86_400_000);
    const payload = {
      edition: "灵·洞本体工作站 V4.0 Enterprise GA (信创兼容)",
      expiresAt: exp.toISOString(),
      features: ["IM_BIDIRECTIONAL", "REMOTE_SPARQL", "SM3_AUDIT", "XINCHUANG_BRIDGE"],
      issuedAt: now.toISOString(),
      licenseId: `LIC-CLI-${Date.now()}`,
      licensedTo: org,
      maxUsers: 200,
      maxWorkspaces: 50,
      monthlyLlmTokenQuota: 10_000_000,
    };
    const sig = sign(null, Buffer.from(JSON.stringify(payload), "utf8"), createPrivateKey(privPem)).toString("base64");
    const licText = `LINGDONG-LIC-V4:${Buffer.from(JSON.stringify({ alg: "Ed25519", payload, signature: sig }), "utf8").toString("base64")}`;
    writeFileSync(outPath, `${licText}\n`, "utf8");
    console.log(`✓ 已签发 Ed25519 离线授权证书 -> ${outPath} (有效期 ${days} 天)`);
    if (!process.env.LINGDONG_LICENSE_PRIVATE_KEY_PEM) {
      writeFileSync(`${outPath}.pub.pem`, publicKey, "utf8");
      console.log(`  已同步导出配套验签公钥 -> ${outPath}.pub.pem`);
    }
    return;
  }

  console.log(
    [
      "灵·洞本体工作站 FDE & GA CI/CD CLI (lingdong-cli v4.0)",
      "用法：",
      "  lingdong-cli verify-bundle <bundle.zip>            # 离线 SHA-256 密码学验签",
      "  lingdong-cli diagnose [workspaceId]                # 触发 W3C 三层质量门禁诊断",
      "  lingdong-cli evaluate [workspaceId]                # 运行在线黄金基准评测集",
      "  lingdong-cli export-bundle <wsId> <relId> [out]    # 下载不可变 FDE 交付包",
      "  lingdong-cli sign-license <org> [days] [out.lic]   # 签发 Ed25519 离线商业授权证书",
    ].join("\n")
  );
}

main().catch((err) => {
  console.error(`[lingdong-cli ERROR] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
