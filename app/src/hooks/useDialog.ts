import { useEffect, useRef, type KeyboardEvent } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behaviour of a modal dialog (same as ConfirmDialog): Escape closes it, focus moves
 * into it on open ([data-autofocus] first, else the first focusable element), Tab stays inside,
 * and focus returns to what had it before. Spread the result on the element with role="dialog".
 */
export const useDialog = <T extends HTMLElement = HTMLDivElement>(onClose: () => void) => {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const target = root?.querySelector<HTMLElement>("[data-autofocus]") ?? root?.querySelector<HTMLElement>(FOCUSABLE) ?? root;
    target?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (event: KeyboardEvent<T>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close.current();
      return;
    }
    if (event.key !== "Tab" || !ref.current) return;
    const focusable = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return { ref, onKeyDown, tabIndex: -1 };
};
