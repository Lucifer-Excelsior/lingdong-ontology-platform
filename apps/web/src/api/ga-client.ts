export interface AuthModeResponse {
  appEnv: "production" | "development";
  demoSwitcherEnabled: boolean;
  oidcConfigured: boolean;
  oidcLoginUrl: string | null;
  auditHashAlgo: "SM3" | "SHA256";
}

export interface EnterpriseLoginActor {
  userId: string;
  name: string;
  role: string;
  tenantId: string;
}

export interface EnterpriseLoginResponse {
  ok: boolean;
  actor: EnterpriseLoginActor;
  message: string;
}

export interface EnterpriseLogoutResponse {
  ok: boolean;
  message: string;
}

export interface OfflineLicensePayload {
  licenseId: string;
  licensedTo: string;
  edition: string;
  maxWorkspaces: number;
  maxUsers: number;
  monthlyLlmTokenQuota: number;
  issuedAt: string;
  expiresAt: string;
  features: string[];
}

export interface GaStatusResponse {
  appEnv: "production" | "development";
  auditHashAlgo: "SM3" | "SHA256";
  graphCluster: {
    mode: string;
    endpoint: string | null;
    healthy: boolean;
    latencyMs: number;
    statelessClusterReady: boolean;
  };
  offlineLicenseActive: boolean;
  offlineLicense: OfflineLicensePayload | null;
  tokenUsage: {
    used: number;
    quota: number;
    monthKey: string;
  };
}

export interface UploadOfflineLicenseResponse {
  valid: boolean;
  payload: OfflineLicensePayload;
  message: string;
}

export interface IssueDemoLicenseResponse {
  licenseText: string;
  alg: string;
  message: string;
}

export type HttpStatusError = Error & { status?: number };

async function requestGaJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let errorMessage = `请求失败 (${response.status})`;
    try {
      const errBody = (await response.json()) as { message?: string; error?: string };
      errorMessage = errBody.message ?? errBody.error ?? errorMessage;
    } catch {
      // keep status fallback
    }
    const err: HttpStatusError = Object.assign(new Error(errorMessage), { status: response.status });
    throw err;
  }
  return (await response.json()) as T;
}

export const gaApi = {
  getAuthMode() {
    return requestGaJson<AuthModeResponse>("/api/auth/mode");
  },

  enterpriseLogin(payload: { username: string; passcode: string }) {
    return requestGaJson<EnterpriseLoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  enterpriseLogout() {
    return requestGaJson<EnterpriseLogoutResponse>("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  getGaStatus(workspaceId: string) {
    return requestGaJson<GaStatusResponse>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/ga/status`
    );
  },

  uploadOfflineLicense(licenseText: string) {
    return requestGaJson<UploadOfflineLicenseResponse>("/api/governance/license/upload", {
      method: "POST",
      body: JSON.stringify({ licenseText }),
    });
  },

  issueDemoLicense(payload?: { licensedTo?: string; maxUsers?: number }) {
    return requestGaJson<IssueDemoLicenseResponse>("/api/governance/license/issue-demo", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    });
  },
};
