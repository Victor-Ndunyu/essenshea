import { createHmac, timingSafeEqual } from 'node:crypto';

export const ECO_REWARD_MILESTONES = {
  2: 'five_percent',
  5: 'free_sample',
  8: 'fifty_percent',
} as const;

export type EcoRewardType = (typeof ECO_REWARD_MILESTONES)[keyof typeof ECO_REWARD_MILESTONES];

export function normalizeKenyanPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  throw new Error('Enter a valid Kenyan mobile number');
}

export function hashEcoAccessCode(phone: string, code: string, secret: string): string {
  if (!secret) throw new Error('Eco-Rewards hashing secret is not configured');
  return createHmac('sha256', secret)
    .update(`${normalizeKenyanPhone(phone)}:${code.trim().toUpperCase()}`)
    .digest('hex');
}

export function accessCodeMatches(actualHash: string, expectedHash: string): boolean {
  const actual = Buffer.from(actualHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function planPunches(currentPunches: number, acceptedContainers: number) {
  if (!Number.isInteger(currentPunches) || currentPunches < 0 || currentPunches > 7) {
    throw new Error('Current punches must be between 0 and 7');
  }
  if (!Number.isInteger(acceptedContainers) || acceptedContainers < 1 || acceptedContainers > 25) {
    throw new Error('Accepted containers must be between 1 and 25');
  }

  let punches = currentPunches;
  const rewards: EcoRewardType[] = [];
  for (let index = 0; index < acceptedContainers; index += 1) {
    punches += 1;
    const reward = ECO_REWARD_MILESTONES[punches as keyof typeof ECO_REWARD_MILESTONES];
    if (reward) rewards.push(reward);
    if (punches === 8) punches = 0;
  }
  return { resultingPunches: punches, rewards };
}

export function rewardLabel(type: string): string {
  if (type === 'five_percent') return '5% off one refill';
  if (type === 'free_sample') return 'Complimentary surprise sample';
  if (type === 'fifty_percent') return '50% off one refill';
  return 'Eco-Rewards benefit';
}
