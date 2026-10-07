import { useEffect, useRef, useCallback, useMemo } from "react";

export interface DebouncedAction<T extends (...args: Parameters<T>) => void> {
  /** Schedules `callback` after the delay, replacing any pending call. */
  run: (...args: Parameters<T>) => void;
  /** Runs the pending call now, if any. */
  flush: () => void;
  /** Drops the pending call, if any. */
  cancel: () => void;
}

/**
 * Debounces `callback`. A call still pending on unmount is flushed, not dropped,
 * so leaving a page right after typing keeps the last edit.
 */
export function useDebouncedAction<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number
): DebouncedAction<T> {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      pendingRef.current?.();
      pendingRef.current = null;
    };
  }, []);

  const run = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      const call = () => {
        pendingRef.current = null;
        callback(...args);
      };
      pendingRef.current = call;
      timeoutRef.current = setTimeout(call, delay);
    },
    [callback, delay]
  );

  const cancel = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    pendingRef.current = null;
  }, []);

  const flush = useCallback(() => {
    const pending = pendingRef.current;
    cancel();
    pending?.();
  }, [cancel]);

  return useMemo(() => ({ run, flush, cancel }), [run, flush, cancel]);
}

/** Debounced `callback` (see useDebouncedAction), when flushing or cancelling is not needed. */
export function useDebounce<T extends (...args: Parameters<T>) => void>(callback: T, delay: number): (...args: Parameters<T>) => void {
  return useDebouncedAction(callback, delay).run;
}
