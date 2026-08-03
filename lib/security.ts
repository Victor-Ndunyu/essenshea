import { timingSafeEqual } from 'node:crypto';

export function secretsMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const suppliedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return suppliedBuffer.length === expectedBuffer.length
    && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function parseTelegramOwnerIds(value: string | undefined): Set<number> {
  if (!value) return new Set();
  return new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => /^\d{1,16}$/.test(item))
      .map(Number)
      .filter((item) => Number.isSafeInteger(item) && item > 0),
  );
}
