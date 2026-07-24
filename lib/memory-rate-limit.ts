import { createHash } from 'crypto';

type RateLimitOptions = {
  key: string;
  limit: number;
  windowSeconds: number;
};

type MemoryRateLimitEntry = {
  count: number;
  expiresAt: number;
};

const memoryRateLimits = new Map<string, MemoryRateLimitEntry>();
const MAX_MEMORY_RATE_LIMIT_KEYS = 5_000;

export function checkMemoryRateLimit({
  key,
  limit,
  windowSeconds,
}: RateLimitOptions): boolean {
  const now = Date.now();
  const keyHash = createHash('sha256').update(key).digest('hex');
  const existing = memoryRateLimits.get(keyHash);

  if (existing && existing.expiresAt > now) {
    if (existing.count >= limit) return false;
    existing.count += 1;
    return true;
  }

  if (memoryRateLimits.size >= MAX_MEMORY_RATE_LIMIT_KEYS) {
    for (const [storedKey, entry] of memoryRateLimits) {
      if (entry.expiresAt <= now) memoryRateLimits.delete(storedKey);
    }
    if (memoryRateLimits.size >= MAX_MEMORY_RATE_LIMIT_KEYS) {
      const oldestKey = memoryRateLimits.keys().next().value;
      if (oldestKey) memoryRateLimits.delete(oldestKey);
    }
  }

  memoryRateLimits.set(keyHash, {
    count: 1,
    expiresAt: now + windowSeconds * 1_000,
  });
  return true;
}
