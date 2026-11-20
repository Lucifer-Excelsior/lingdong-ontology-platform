import { useEffect, useRef, type ReactNode } from "react";

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  maxWidthClass?: string;
  children: ReactNode;
}

export function ModalDialog({
  open,
  onClose,
  titleId,
  maxWidthClass = "max-w-xl",
  children,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = "";
      onClose();
    };
    const handleCancel = (event: Event) => {
      event.preventDefault();
      dialog.close();
    };
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("cancel", handleCancel);

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dialog.open) {
        event.preventDefault();
        dialog.close();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);

    let cleanupFallback: (() => void) | undefined;
    if (typeof HTMLDialogElement !== "undefined" && !("closedBy" in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (event: PointerEvent) => {
        const rect = dialog.getBoundingClientRect();
        return (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        );
      };
      const onPointerDown = (event: PointerEvent) => {
        pressedOutside = isOutside(event);
      };
      const onPointerUp = (event: PointerEvent) => {
        if (pressedOutside && isOutside(event)) {
          dialog.close();
        }
      };
      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
      cleanupFallback = () => {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("cancel", handleCancel);
      window.removeEventListener("keydown", handleGlobalKeyDown);
      cleanupFallback?.();
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      className={`m-auto w-full ${maxWidthClass} rounded-2xl bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] shadow-2xl p-0`}
      {...({ closedby: "any" } as Record<string, string>)}
    >
      {children}
    </dialog>
  );
}
