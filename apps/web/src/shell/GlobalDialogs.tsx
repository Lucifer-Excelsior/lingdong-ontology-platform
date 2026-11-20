import type {
  ChangeSetProposal,
  DialogId,
  EngineeringViewId,
  OntologyClass,
  OntologyMode,
  PersonaMode,
  PortalAppId,
  Workspace,
} from "../api/types";
import { ChangeSetDialog } from "../dialogs/ChangeSetDialog";
import { CommandPaletteDialog } from "../dialogs/CommandPaletteDialog";
import { ContractProvenanceDialog, TutorialDialog } from "../dialogs/InfoDialogs";
import { QuickCreateDialog } from "../dialogs/QuickCreateDialog";
import { getRolePermissions } from "../utils/rbac";

interface GlobalDialogsProps {
  openDialog: DialogId;
  onClose: () => void;
  workspace?: Workspace;
  workspaceId: string;
  baseRevisionId: string;
  proposals: ChangeSetProposal[];
  ontologyClasses: OntologyClass[];
  currentRole?: string;
  completedOnboardingIds: string[];
  onToggleOnboardingStep: (stepId: string) => void;
  onNavigateEngineering: (view: EngineeringViewId, mode?: OntologyMode, entityKey?: string) => void;
  onNavigatePortal: (app: PortalAppId) => void;
  onSwitchPersona: (persona: PersonaMode) => void;
  onToast: (msg: string) => void;
}

export function GlobalDialogs({
  openDialog,
  onClose,
  workspace,
  workspaceId,
  baseRevisionId,
  proposals,
  ontologyClasses,
  currentRole,
  completedOnboardingIds,
  onToggleOnboardingStep,
  onNavigateEngineering,
  onNavigatePortal,
  onSwitchPersona,
  onToast,
}: GlobalDialogsProps) {
  const { canModel } = getRolePermissions(currentRole);

  return (
    <>
      <ChangeSetDialog
        open={openDialog === "changeset"}
        onClose={onClose}
        workspaceId={workspaceId}
        baseRevisionId={baseRevisionId}
        proposals={proposals}
        canModel={canModel}
        onToast={onToast}
      />

      <CommandPaletteDialog
        open={openDialog === "command"}
        workspaceId={workspaceId}
        onClose={onClose}
        ontologyClasses={ontologyClasses}
        onNavigateEngineering={onNavigateEngineering}
        onNavigatePortal={onNavigatePortal}
        onSwitchPersona={onSwitchPersona}
      />

      <QuickCreateDialog
        open={openDialog === "create" || openDialog === "create-cq"}
        defaultKind={openDialog === "create-cq" ? "COMPETENCY_QUESTION" : "OWL_CLASS"}
        workspaceId={workspaceId}
        canModel={canModel}
        onClose={onClose}
        onToast={onToast}
      />

      <TutorialDialog
        open={openDialog === "tutorial"}
        completedIds={completedOnboardingIds}
        onToggleStep={onToggleOnboardingStep}
        onClose={onClose}
      />

      <ContractProvenanceDialog
        open={openDialog === "contract"}
        onClose={onClose}
        workspace={workspace}
      />
    </>
  );
}
