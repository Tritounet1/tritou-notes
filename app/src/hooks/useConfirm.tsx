import { useState } from "react";
import { ConfirmDialog, type ConfirmOptions, type PendingConfirm } from "../components/ConfirmDialog";

/**
 * Styled replacement for window.confirm:
 * `const [confirm, confirmDialog] = useConfirm();` then render `{confirmDialog}`
 * and `if (!(await confirm({ title: "…" }))) return;`.
 */
export const useConfirm = () => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      setPending({
        ...options,
        resolve: (ok) => {
          setPending(null);
          resolve(ok);
        },
      });
    });

  return [confirm, pending ? <ConfirmDialog {...pending} /> : null] as const;
};
