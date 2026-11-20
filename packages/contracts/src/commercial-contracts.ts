import { z } from "zod";
import { RoleSchema } from "./workspace-ontology.js";

export const OntologyBranchSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  baseRevisionCode: z.string(),
  headRevisionCode: z.string(),
  status: z.enum(["OPEN", "MERGED"]),
  createdBy: z.string(),
  createdAt: z.string(),
  description: z.string(),
});
export type OntologyBranch = z.infer<typeof OntologyBranchSchema>;

export const ImpactSimulationResultSchema = z.object({
  operation: z.enum(["DELETE_CLASS", "RENAME_CLASS", "DELETE_PROPERTY", "ADD_SHACL_CONSTRAINT"]),
  targetLocalName: z.string(),
  riskLevel: z.enum(["SAFE", "WARN", "BREAKING"]),
  affectedInstanceCount: z.number().int(),
  brokenMappings: z.array(z.string()),
  brokenCapabilities: z.array(z.string()),
  brokenMcpTools: z.array(z.string()),
  shaclViolationsSimulated: z.number().int(),
  recommendation: z.string(),
});
export type ImpactSimulationResult = z.infer<typeof ImpactSimulationResultSchema>;

export const Entity360ProfileSchema = z.object({
  entityKey: z.string(),
  title: z.string(),
  entityTypeLabel: z.string(),
  statusBadge: z.string(),
  summaryMetrics: z.array(z.object({ label: z.string(), value: z.string() })),
  relations: z.array(z.object({ relationLabel: z.string(), targetTitle: z.string(), targetType: z.string() })),
  timeline: z.array(z.object({ date: z.string(), event: z.string() })),
  documentEvidences: z.array(z.object({ docTitle: z.string(), chunkCode: z.string(), excerpt: z.string() })),
});
export type Entity360Profile = z.infer<typeof Entity360ProfileSchema>;

export const PortalAppConfigSchema = z.object({
  workspaceId: z.string(),
  portalTitle: z.string(),
  subtitle: z.string(),
  enabledWidgets: z.array(z.enum(["kpi_alerts", "entity_360", "ai_copilot", "itu_review", "im_push", "csv_export"])),
  alertWindowDays: z.number().int().min(7).max(180),
  imChannel: z.enum(["WECOM", "DINGTALK", "FEISHU"]),
  imWebhookUrl: z.string(),
  customDocxHeader: z.string(),
});
export type PortalAppConfig = z.infer<typeof PortalAppConfigSchema>;

export const BusinessFeedbackSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  question: z.string(),
  rating: z.enum(["UP", "DOWN"]),
  correctionNote: z.string(),
  submittedBy: z.string(),
  createdAt: z.string(),
});
export type BusinessFeedback = z.infer<typeof BusinessFeedbackSchema>;

export const EnterpriseUserRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  role: RoleSchema,
  department: z.string(),
  regionScope: z.string(),
  complianceRole: z.enum(["NONE", "SYS_ADMIN", "SEC_ADMIN", "AUDIT_ADMIN"]),
  status: z.enum(["ACTIVE", "LOCKED"]),
});
export type EnterpriseUserRecord = z.infer<typeof EnterpriseUserRecordSchema>;

export const CommercialLicenseInfoSchema = z.object({
  edition: z.string(),
  licensedTo: z.string(),
  validUntil: z.string(),
  maxWorkspaces: z.number().int(),
  usedWorkspaces: z.number().int(),
  maxUsers: z.number().int(),
  usedUsers: z.number().int(),
  cryptoStandard: z.string(),
  auditChainHeadHash: z.string(),
  monthlyLlmTokensUsed: z.number().int(),
  monthlyLlmTokenQuota: z.number().int(),
});
export type CommercialLicenseInfo = z.infer<typeof CommercialLicenseInfoSchema>;
