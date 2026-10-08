import type { ReactNode } from "react";
import { useDialog } from "../hooks/useDialog";

interface DialogProps {
  onClose: () => void;
  /** Classes of the dialog box (e.g. "modal max-w-md p-6"). */
  className: string;
  /** Id of the visible title; or `label` when there is none. */
  labelledBy?: string;
  label?: string;
  /** Clicking outside the box closes it. */
  closeOnBackdrop?: boolean;
  children: ReactNode;
}

/** Modal dialog: backdrop, role="dialog", Escape, focus moved in, trapped and given back. */
export const Dialog = ({ onClose, className, labelledBy, label, closeOnBackdrop = false, children }: DialogProps) => {
  const dialog = useDialog(onClose);
  return (
    <div className="modal-backdrop" onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        {...dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        className={`${className} outline-none`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};
