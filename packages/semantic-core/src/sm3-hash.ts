import { createHash } from "node:crypto";

/**
 * Pure TypeScript implementation of Chinese National Cryptographic Hash Standard
 * GM/T 0004-2012 (SM3), zero native C++ bindings (ARM64/x86/Kunpeng/Phytium portable).
 * Standard test vector: sm3Hex("abc") === "66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0"
 */
const IV = [
  0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600,
  0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e,
];

function rotl(x: number, n: number): number {
  const k = n & 31;
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

function p0(x: number): number {
  return (x ^ rotl(x, 9) ^ rotl(x, 17)) >>> 0;
}

function p1(x: number): number {
  return (x ^ rotl(x, 15) ^ rotl(x, 23)) >>> 0;
}

function ff(j: number, x: number, y: number, z: number): number {
  return j < 16 ? (x ^ y ^ z) >>> 0 : ((x & y) | (x & z) | (y & z)) >>> 0;
}

function gg(j: number, x: number, y: number, z: number): number {
  return j < 16 ? (x ^ y ^ z) >>> 0 : ((x & y) | (~x & z)) >>> 0;
}

export function sm3Hex(input: string | Uint8Array): string {
  const msg = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  const bitLen = BigInt(msg.length) * 8n;
  const padLen = ((56 - ((msg.length + 1) % 64)) + 64) % 64;
  const padded = Buffer.alloc(msg.length + 1 + padLen + 8);
  msg.copy(padded, 0);
  padded[msg.length] = 0x80;
  padded.writeBigUInt64BE(bitLen, padded.length - 8);

  const v = IV.slice();
  const w = new Uint32Array(68);
  const w1 = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = padded.readUInt32BE(offset + i * 4);
    }
    for (let j = 16; j < 68; j++) {
      w[j] = (p1(w[j - 16] ^ w[j - 9] ^ rotl(w[j - 3], 15)) ^ rotl(w[j - 13], 7) ^ w[j - 6]) >>> 0;
    }
    for (let j = 0; j < 64; j++) {
      w1[j] = (w[j] ^ w[j + 4]) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = v;
    for (let j = 0; j < 64; j++) {
      const tj = j < 16 ? 0x79cc4519 : 0x7a879d8a;
      const ss1 = rotl((rotl(a, 12) + e + rotl(tj, j)) >>> 0, 7);
      const ss2 = (ss1 ^ rotl(a, 12)) >>> 0;
      const tt1 = (ff(j, a, b, c) + d + ss2 + w1[j]) >>> 0;
      const tt2 = (gg(j, e, f, g) + h + ss1 + w[j]) >>> 0;
      d = c;
      c = rotl(b, 9);
      b = a;
      a = tt1;
      h = g;
      g = rotl(f, 19);
      f = e;
      e = p0(tt2);
    }

    v[0] = (v[0] ^ a) >>> 0;
    v[1] = (v[1] ^ b) >>> 0;
    v[2] = (v[2] ^ c) >>> 0;
    v[3] = (v[3] ^ d) >>> 0;
    v[4] = (v[4] ^ e) >>> 0;
    v[5] = (v[5] ^ f) >>> 0;
    v[6] = (v[6] ^ g) >>> 0;
    v[7] = (v[7] ^ h) >>> 0;
  }

  return v.map((x) => x.toString(16).padStart(8, "0")).join("");
}

export type AuditHashAlgo = "SM3" | "SHA256";

export function resolveAuditHashAlgo(): AuditHashAlgo {
  return (process.env.AUDIT_HASH_ALGO ?? "SM3").toUpperCase() === "SHA256" ? "SHA256" : "SM3";
}

export function computeAuditHash(payload: string, algo: AuditHashAlgo = resolveAuditHashAlgo()): string {
  if (algo === "SM3") return sm3Hex(payload);
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
