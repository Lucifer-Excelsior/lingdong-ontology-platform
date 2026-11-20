export interface RolePermissions {
  role: string;
  isOwner: boolean;
  canModel: boolean;
  canOperate: boolean;
  canApprove: boolean;
  isViewer: boolean;
}

export function getRolePermissions(role?: string): RolePermissions {
  const r = role ?? "VIEWER";
  const isOwner = r === "OWNER";
  const canModel = isOwner || r === "MODELER";
  const canOperate = canModel || r === "OPERATOR";
  const canApprove = isOwner || r === "REVIEWER";
  return {
    role: r,
    isOwner,
    canModel,
    canOperate,
    canApprove,
    isViewer: r === "VIEWER",
  };
}

export const ROLE_TIPS = {
  owner: "仅 OWNER 架构师可执行此操作",
  ownerLlm: "仅 OWNER 架构师可修改大模型密钥配置",
  model: "仅 OWNER / MODELER 本体工程师可执行建模变更",
  operate: "仅 OWNER / MODELER / OPERATOR 业务操作员可执行此操作",
  approve: "仅 OWNER / REVIEWER 独立审核员可执行审批签署",
} as const;
