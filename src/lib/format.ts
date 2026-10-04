import dayjs from 'dayjs';

export const CURRENCY = 'PKR';

const moneyFmt = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: CURRENCY,
  maximumFractionDigits: 0,
});

/** "Rs 1,250" */
export function formatMoney(amount: number): string {
  return moneyFmt.format(Math.round(amount));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function today(): string {
  return dayjs().format('YYYY-MM-DD');
}

/** YYYY-MM for a YYYY-MM-DD date. */
export function periodOf(date: string): string {
  return date.slice(0, 7);
}

export function currentPeriod(): string {
  return dayjs().format('YYYY-MM');
}

export function formatPeriod(period: string): string {
  return dayjs(period + '-01').format('MMMM YYYY');
}

export function shiftPeriod(period: string, months: number): string {
  return dayjs(period + '-01').add(months, 'month').format('YYYY-MM');
}

export function formatDay(date: string): string {
  const d = dayjs(date);
  if (date === today()) return 'Today';
  if (date === dayjs().subtract(1, 'day').format('YYYY-MM-DD')) return 'Yesterday';
  return d.year() === dayjs().year() ? d.format('ddd D MMM') : d.format('D MMM YYYY');
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
