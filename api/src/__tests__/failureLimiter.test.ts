import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFailureLimiter } from "../utils/failureLimiter";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createFailureLimiter", () => {
  it("blocks a key after `max` failures until the window ends", () => {
    const limiter = createFailureLimiter({ max: 3, windowMs: 60_000 });
    limiter.fail("a");
    limiter.fail("a");
    expect(limiter.retryAfter("a")).toBe(0);
    limiter.fail("a");
    expect(limiter.retryAfter("a")).toBe(60);
    expect(limiter.retryAfter("b")).toBe(0);

    vi.advanceTimersByTime(30_500);
    expect(limiter.retryAfter("a")).toBe(30);
    vi.advanceTimersByTime(30_000);
    expect(limiter.retryAfter("a")).toBe(0);
    // A new window starts from scratch.
    limiter.fail("a");
    expect(limiter.retryAfter("a")).toBe(0);
  });

  it("forgets a key on reset", () => {
    const limiter = createFailureLimiter({ max: 1, windowMs: 60_000 });
    limiter.fail("a");
    expect(limiter.retryAfter("a")).toBeGreaterThan(0);
    limiter.reset("a");
    expect(limiter.retryAfter("a")).toBe(0);
  });

  it("stays bounded: drops expired keys first, then the oldest one", () => {
    const limiter = createFailureLimiter({ max: 1, windowMs: 1_000 });
    for (let i = 0; i < 10_000; i++) limiter.fail(`old-${i}`);
    vi.advanceTimersByTime(1_000);
    limiter.fail("fresh");
    expect(limiter.retryAfter("fresh")).toBe(1);

    for (let i = 1; i < 10_000; i++) limiter.fail(`new-${i}`);
    limiter.fail("overflow");
    // "fresh" was the oldest live key: evicted to make room.
    expect(limiter.retryAfter("fresh")).toBe(0);
    expect(limiter.retryAfter("overflow")).toBe(1);
    expect(limiter.retryAfter("new-1")).toBe(1);
  });
});
