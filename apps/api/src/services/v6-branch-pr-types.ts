import type { OntologyClass, OntologyProperty, Role } from "@lingdong/contracts";

export interface OntologyBranchRecord {
  id: string;
  workspaceId: string;
  branchName: string;
  baseRevisionCode: string;
  classes: OntologyClass[];
  properties: OntologyProperty[];
  status: "ACTIVE" | "MERGED" | "CLOSED";
  createdBy: string;
  createdAt: string;
}

export interface ApprovalStage {
  stageOrder: 1 | 2;
  stageName: string;
  requiredRoles: Role[];
  status: "PENDING" | "APPROVED";
  approvedBy?: string;
  approvedAt?: string;
}

export interface MergeRequestRecord {
  id: string;
  workspaceId: string;
  branchId: string;
  branchName: string;
  title: string;
  baseRevisionCode: string;
  targetRevisionCode: string;
  addedClasses: string[];
  modifiedClasses: string[];
  conflictItems: string[];
  approvalChain: ApprovalStage[];
  status: "OPEN" | "MERGED" | "REJECTED";
  createdBy: string;
  createdAt: string;
  mergedRevisionCode?: string;
}
