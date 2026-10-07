// In-memory counter of failed attempts (logins, password checks), per key and per window.
// A single API process is deployed, so memory is enough; a restart clears the counters.

const MAX_KEYS = 10_000;

export const createFailureLimiter = ({ max, windowMs }: { max: number; windowMs: number }) => {
  const failures = new Map<string, { count: number; resetAt: number }>();

  const current = (key: string) => {
    const entry = failures.get(key);
    if (entry && entry.resetAt <= Date.now()) {
      failures.delete(key);
      return undefined;
    }
    return entry;
  };

  return {
    /** Seconds to wait before trying again, or 0 when `key` may try. */
    retryAfter(key: string) {
      const entry = current(key);
      return entry && entry.count >= max ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 0;
    },
    fail(key: string) {
      const entry = current(key);
      if (entry) {
        entry.count += 1;
        return;
      }
      if (failures.size >= MAX_KEYS) {
        for (const [stale, { resetAt }] of failures) if (resetAt <= Date.now()) failures.delete(stale);
        if (failures.size >= MAX_KEYS) failures.delete(failures.keys().next().value as string);
      }
      failures.set(key, { count: 1, resetAt: Date.now() + windowMs });
    },
    reset(key: string) {
      failures.delete(key);
    },
    clear() {
      failures.clear();
    },
  };
};

const FIFTEEN_MINUTES = 15 * 60 * 1000;
/** Per account (email / username / user id): the real brute-force protection. */
export const accountFailures = createFailureLimiter({ max: 10, windowMs: FIFTEEN_MINUTES });
/** Per client IP: generous, since behind a reverse proxy every user may share one address. */
export const ipFailures = createFailureLimiter({ max: 100, windowMs: FIFTEEN_MINUTES });
