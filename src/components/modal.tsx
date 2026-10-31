"use client";

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { IconX } from "@/components/icons";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  maxWidth?: string;
  panelStyle?: CSSProperties;
  closeTitle?: string;
}

/**
 * Accessible dialog shell used across the app.
 * - role="dialog" + aria-modal + aria-labelledby
 * - Escape closes
 * - click outside closes
 * - focus is moved into the dialog and restored on close
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth,
  panelStyle,
  closeTitle = "Close dialog",
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", handleKey);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKey);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="modal"
        style={{ maxWidth, ...panelStyle }}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            title={closeTitle}
            aria-label={closeTitle}
          >
            <IconX size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
