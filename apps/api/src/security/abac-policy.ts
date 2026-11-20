import type { Role } from "@lingdong/contracts";
import { loadRuntimeKv, saveRuntimeKv } from "../db/runtime-kv.js";

export type DataClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL";

export interface AbacPolicyConfig {
  enabled: boolean;
  roleClearance: Record<Role, DataClassification>;
  confidentialFields: string[];
  internalFields: string[];
  maskToken: string;
  updatedAt: string;
  updatedBy: string;
}

const ABAC_NS = "v5_abac_policy";

const CLEARANCE_RANK: Record<DataClassification, number> = {
  PUBLIC: 1,
  INTERNAL: 2,
  CONFIDENTIAL: 3,
};

export function defaultAbacPolicy(): AbacPolicyConfig {
  return {
    enabled: true,
    roleClearance: {
      OWNER: "CONFIDENTIAL",
      MODELER: "INTERNAL",
      OPERATOR: "INTERNAL",
      REVIEWER: "INTERNAL",
      VIEWER: "PUBLIC",
    },
    confidentialFields: ["totalAmount", "amount", "bankAccount", "unitPrice", "creditLimit"],
    internalFields: ["expiresAt", "riskScore", "internalNote", "party", "supplier"],
    maskToken: "【密级受限·已脱敏】",
    updatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    updatedBy: "系统基线策略",
  };
}

export async function getAbacPolicy(tenantId: string, workspaceId: string): Promise<AbacPolicyConfig> {
  const saved = await loadRuntimeKv<AbacPolicyConfig>(tenantId, ABAC_NS, workspaceId);
  return saved ?? defaultAbacPolicy();
}

export async function updateAbacPolicy(
  tenantId: string,
  workspaceId: string,
  actorDisplay: string,
  patch: Partial<Pick<AbacPolicyConfig, "enabled" | "roleClearance" | "confidentialFields" | "internalFields" | "maskToken">>
): Promise<AbacPolicyConfig> {
  const current = await getAbacPolicy(tenantId, workspaceId);
  const next: AbacPolicyConfig = {
    ...current,
    ...patch,
    roleClearance: {
      ...current.roleClearance,
      ...(patch.roleClearance ?? {}),
    },
    confidentialFields: patch.confidentialFields ?? current.confidentialFields,
    internalFields: patch.internalFields ?? current.internalFields,
    updatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    updatedBy: actorDisplay,
  };
  await saveRuntimeKv(tenantId, ABAC_NS, workspaceId, next as unknown as Record<string, unknown>);
  return next;
}

export function resolveFieldClassification(fieldName: string, policy: AbacPolicyConfig): DataClassification {
  const lower = fieldName.toLowerCase();
  if (policy.confidentialFields.some((f) => lower.includes(f.toLowerCase()))) {
    return "CONFIDENTIAL";
  }
  if (policy.internalFields.some((f) => lower.includes(f.toLowerCase()))) {
    return "INTERNAL";
  }
  return "PUBLIC";
}

export function applyAbacToQueryRows(
  rows: Array<Record<string, string>>,
  role: Role,
  policy: AbacPolicyConfig
): {
  rows: Array<Record<string, string>>;
  callerClearance: DataClassification;
  redactedCellCount: number;
  redactedColumns: string[];
} {
  const callerClearance = policy.roleClearance[role] ?? "PUBLIC";
  if (!policy.enabled) {
    return { rows, callerClearance, redactedCellCount: 0, redactedColumns: [] };
  }

  const callerRank = CLEARANCE_RANK[callerClearance];
  const redactedColSet = new Set<string>();
  let redactedCellCount = 0;

  const nextRows = rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [col, val] of Object.entries(row)) {
      const reqClass = resolveFieldClassification(col, policy);
      if (CLEARANCE_RANK[reqClass] > callerRank && val !== "") {
        out[col] = `${policy.maskToken}(${reqClass})`;
        redactedColSet.add(col);
        redactedCellCount += 1;
      } else {
        out[col] = val;
      }
    }
    return out;
  });

  return {
    rows: nextRows,
    callerClearance,
    redactedCellCount,
    redactedColumns: [...redactedColSet],
  };
}
