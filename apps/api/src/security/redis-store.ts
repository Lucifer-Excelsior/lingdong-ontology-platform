import { createHash } from "node:crypto";
import net from "node:net";

interface LocalEntry {
  value: string;
  expiresAt: number;
}

const localStore = new Map<string, LocalEntry>();
let localWriteCount = 0;

function pruneLocalStore(): void {
  const now = Date.now();
  for (const [k, v] of localStore.entries()) {
    if (v.expiresAt <= now) localStore.delete(k);
  }
}

function encodeRespCommand(args: string[]): string {
  const chunks = [`*${args.length}\r\n`];
  for (const arg of args) {
    const bytes = Buffer.byteLength(arg, "utf8");
    chunks.push(`$${bytes}\r\n${arg}\r\n`);
  }
  return chunks.join("");
}

function parseRespReply(buf: string): string | number | null {
  if (!buf) return null;
  const prefix = buf[0];
  const lineEnd = buf.indexOf("\r\n");
  if (lineEnd === -1) return null;
  if (prefix === "+" || prefix === "-") return buf.slice(1, lineEnd);
  if (prefix === ":") return Number(buf.slice(1, lineEnd));
  if (prefix === "$") {
    const len = Number(buf.slice(1, lineEnd));
    if (len < 0) return null;
    return buf.slice(lineEnd + 2, lineEnd + 2 + len);
  }
  return null;
}

async function sendRedisCommand(args: string[], timeoutMs = 1500): Promise<string | number | null> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return null;

  const parsed = new URL(redisUrl);
  const host = parsed.hostname || "127.0.0.1";
  const port = Number(parsed.port || 6379);
  const password = parsed.password ? decodeURIComponent(parsed.password) : "";

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let data = "";
    let settled = false;

    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn();
    };

    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => done(() => reject(new Error("Redis timeout"))));
    socket.on("error", (err) => done(() => reject(err)));
    socket.on("connect", () => {
      if (password) {
        socket.write(encodeRespCommand(["AUTH", password]));
      }
      socket.write(encodeRespCommand(args));
    });
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
      const lines = data.split("\r\n").filter(Boolean);
      const minLines = password ? 2 : 1;
      if (lines.length >= minLines) {
        const lastStart = password ? data.indexOf("\r\n") + 2 : 0;
        const reply = parseRespReply(data.slice(lastStart));
        done(() => resolve(reply));
      }
    });
  });
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

export async function revokeSessionToken(token: string, ttlSeconds = 60 * 60 * 12): Promise<void> {
  const key = `ld:revoked:${hashSessionToken(token)}`;
  try {
    if (process.env.REDIS_URL?.trim()) {
      await sendRedisCommand(["SETEX", key, String(ttlSeconds), "1"]);
      return;
    }
  } catch {
    // Graceful fallback to local revocation map if Redis is temporarily unreachable
  }
  localStore.set(key, { value: "1", expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function isSessionRevoked(token: string): Promise<boolean> {
  const key = `ld:revoked:${hashSessionToken(token)}`;
  try {
    if (process.env.REDIS_URL?.trim()) {
      const res = await sendRedisCommand(["EXISTS", key]);
      return res === 1;
    }
  } catch {
    // Fallback below
  }
  const entry = localStore.get(key);
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) {
    localStore.delete(key);
    return false;
  }
  return true;
}

export async function incrementDistributedRateLimit(
  bucketKey: string,
  windowSeconds = 300
): Promise<{ count: number; backend: "redis" | "memory" }> {
  const key = `ld:rl:${bucketKey}`;
  try {
    if (process.env.REDIS_URL?.trim()) {
      const next = Number((await sendRedisCommand(["INCR", key])) ?? 1);
      if (next === 1) await sendRedisCommand(["EXPIRE", key, String(windowSeconds)]);
      return { count: next, backend: "redis" };
    }
  } catch {
    // Fallback to local memory
  }
  if (++localWriteCount % 100 === 0) pruneLocalStore();
  const now = Date.now();
  const existing = localStore.get(key);
  const nextCount = existing && existing.expiresAt > now ? Number(existing.value) + 1 : 1;
  localStore.set(key, {
    value: String(nextCount),
    expiresAt: existing && existing.expiresAt > now ? existing.expiresAt : now + windowSeconds * 1000,
  });
  return { count: nextCount, backend: "memory" };
}

export async function clearDistributedRateLimit(bucketKey: string): Promise<void> {
  const key = `ld:rl:${bucketKey}`;
  localStore.delete(key);
  if (process.env.REDIS_URL?.trim()) {
    await sendRedisCommand(["DEL", key]).catch(() => undefined);
  }
}

export async function getRedisClusterStatus(): Promise<{
  mode: "redis" | "memory_fallback";
  healthy: boolean;
  latencyMs: number;
}> {
  if (!process.env.REDIS_URL?.trim()) {
    return { mode: "memory_fallback", healthy: true, latencyMs: 0 };
  }
  const t0 = performance.now();
  try {
    const res = await sendRedisCommand(["PING"], 1200);
    return {
      mode: "redis",
      healthy: res === "PONG",
      latencyMs: Math.max(1, Math.round(performance.now() - t0)),
    };
  } catch {
    return {
      mode: "redis",
      healthy: false,
      latencyMs: Math.max(1, Math.round(performance.now() - t0)),
    };
  }
}
