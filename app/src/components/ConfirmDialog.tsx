import { useEffect, useRef, type ReactNode } from "react";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  /** Red confirm button for destructive actions (default). */
  danger?: boolean;
}

export interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export const ConfirmDialog = ({ title, message, confirmLabel = "Supprimer", danger = true, resolve }: PendingConfirm) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Destructive by default: focus "Annuler" so Enter doesn't delete by accident.
    cancelRef.current?.focus();
    return () => previous?.focus();
  }, []);

  return (
    <div className="modal-backdrop" onClick={() => resolve(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={message ? "confirm-message" : undefined}
        className="modal max-w-md p-6 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") resolve(false);
          // Two buttons only: keep Tab inside the dialog.
          if (e.key === "Tab") {
            const buttons = [...e.currentTarget.querySelectorAll("button")];
            const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
            e.preventDefault();
            buttons[(i + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
          }
        }}
      >
        <div className="flex gap-4">
          <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${danger ? "bg-danger-tint text-danger-ink" : "bg-indigo-tint text-indigo-ink"}`}>
            <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              {danger ? <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /> : <path d="M12 8v4M12 16h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />}
            </svg>
          </span>
          <div className="flex flex-col gap-1.5 min-w-0">
            <h2 id="confirm-title" className="font-display text-xl font-bold tracking-tight text-ink">{title}</h2>
            {message && <div id="confirm-message" className="text-sm text-ink-2 leading-relaxed">{message}</div>}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={() => resolve(false)} className="btn-secondary">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => resolve(true)}
            className={danger ? "btn bg-danger text-white hover:bg-danger-ink" : "btn-primary"}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
