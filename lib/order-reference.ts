import { randomBytes } from 'crypto';

export function createOrderReference(date = new Date()): string {
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(4);
  let suffix = '';
  for (let i = 0; i < bytes.length; i += 1) {
    suffix += alphabet[bytes[i] % alphabet.length];
  }
  return `ESS-${datePart}-${suffix}`;
}
