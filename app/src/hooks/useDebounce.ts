import { useEffect, useRef, useCallback } from "react";

/**
 * Debounces `callback`. A call still pending on unmount is flushed, not dropped,
 * so leaving a page right after typing keeps the last edit.
 */
export function useDebounce<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number
): T {
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

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      const run = () => {
        pendingRef.current = null;
        callback(...args);
      };
      pendingRef.current = run;
      timeoutRef.current = setTimeout(run, delay);
    },
    [callback, delay]
  ) as T;

  return debouncedCallback;
}
