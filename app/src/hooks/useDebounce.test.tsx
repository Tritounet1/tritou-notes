import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedAction } from "./useDebounce";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDebouncedAction", () => {
  it("runs the last call after the delay", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedAction(callback, 1000));
    result.current.run("a");
    result.current.run("b");
    vi.advanceTimersByTime(999);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledExactlyOnceWith("b");
  });

  it("flushes or cancels the pending call", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedAction(callback, 1000));
    result.current.run("flushed");
    result.current.flush();
    expect(callback).toHaveBeenCalledExactlyOnceWith("flushed");
    result.current.run("cancelled");
    result.current.cancel();
    vi.advanceTimersByTime(2000);
    expect(callback).toHaveBeenCalledOnce();
    result.current.flush(); // nothing pending
    expect(callback).toHaveBeenCalledOnce();
  });

  it("runs a pending call on unmount instead of dropping it", () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedAction(callback, 1000));
    result.current.run("last edit");
    unmount();
    expect(callback).toHaveBeenCalledExactlyOnceWith("last edit");
  });
});
