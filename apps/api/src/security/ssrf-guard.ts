const DANGEROUS_JDBC_PARAMS = [
  "socketfactory",
  "sslfactory",
  "allowloadlocalinfile",
  "autodeserialize",
  "loggerlevel",
  "loggerfile",
  "statementinterceptors",
];

/**
 * SSRF & Dangerous JDBC Parameter Validator:
 * Blocks IPv6 private/ULA/loopback/mapped addresses, IPv4 private/metadata/zero/encoded IPs,
 * and dangerous JDBC RCE parameters.
 */
export function validateConnectorEndpoint(
  rawUrl: string,
  options?: { allowLocalSandboxHost?: boolean }
): { ok: true } {
  const lower = rawUrl.toLowerCase();
  for (const param of DANGEROUS_JDBC_PARAMS) {
    if (lower.includes(param)) {
      throw new Error(`连接器安全拦截：检测到高危 JDBC 注入参数 (${param})`);
    }
  }

  const normalized = rawUrl.replace(/^jdbc:/i, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("连接器地址格式不合法");
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  // Block IPv6 Unique Local (fc00::/7), Link-Local (fe80::/10), Loopback (::1), IPv4-mapped (::ffff:)
  if (
    host === "::1" ||
    host === "::" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:") ||
    host.startsWith("::ffff:")
  ) {
    throw new Error(`SSRF 安全拦截：禁止访问私网/本地 IPv6 地址 (${host})`);
  }

  const isLocalSandbox =
    options?.allowLocalSandboxHost && (host === "127.0.0.1" || host === "localhost" || host === "erp-db");

  if (!isLocalSandbox) {
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host.startsWith("0.") ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^(0x[0-9a-f]+|0[0-7]+|\d+)$/i.test(host)
    ) {
      throw new Error(`SSRF 安全拦截：禁止外部连接器探测私网、零地址或编码 IP (${host})`);
    }
  }

  return { ok: true };
}
