import dayjs from 'dayjs';
import { merchantKey } from './merchant';
import type { Transaction } from './types';

/**
 * Likely duplicates: same amount (±1), dates within 2 days, and merchants
 * that match (or one side has no merchant).
 */
export function findDuplicates(candidate: Transaction, existing: Transaction[]): Transaction[] {
  const key = merchantKey(candidate.merchant);
  const d = dayjs(candidate.date);
  return existing.filter((t) => {
    if (t.id === candidate.id) return false;
    if (Math.abs(t.totalAmount - candidate.totalAmount) > 1) return false;
    if (Math.abs(dayjs(t.date).diff(d, 'day')) > 2) return false;
    const other = merchantKey(t.merchant);
    return !key || !other || key === other;
  });
}
