import dayjs from 'dayjs';
import type { CategoryIndex } from './categories';
import type { Budget, BudgetAlert, LineItem, Transaction } from './types';
import { formatMoney, periodOf } from './format';

export function itemMatchesBudget(budget: Budget, item: LineItem, index: CategoryIndex): boolean {
  switch (budget.scope) {
    case 'total':
      return true;
    case 'discretionary':
      return item.necessity === 'discretionary';
    case 'category': {
      if (!budget.categoryId) return false;
      if (item.categoryId === budget.categoryId) return true;
      return index.byId.get(item.categoryId)?.parentId === budget.categoryId;
    }
  }
}

export function budgetSpent(
  budget: Budget,
  transactions: Transaction[],
  period: string,
  index: CategoryIndex,
): number {
  let sum = 0;
  for (const t of transactions) {
    if (periodOf(t.date) !== period) continue;
    for (const item of t.items) {
      if (itemMatchesBudget(budget, item, index)) sum += item.amount;
    }
  }
  return sum;
}

export function budgetName(budget: Budget, index: CategoryIndex): string {
  if (budget.scope === 'total') return 'All spending';
  if (budget.scope === 'discretionary') return 'All discretionary';
  const c = budget.categoryId ? index.byId.get(budget.categoryId) : undefined;
  if (!c) return 'Deleted category';
  const parent = c.parentId ? index.byId.get(c.parentId) : undefined;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

export interface BudgetStatus {
  budget: Budget;
  name: string;
  spent: number;
  pct: number;
  remaining: number;
  /** Fraction of the period that has elapsed (0–1); 1 for past periods. */
  periodElapsed: number;
  daysLeft: number;
}

export function periodProgress(period: string, now = dayjs()): { elapsed: number; daysLeft: number } {
  const start = dayjs(period + '-01');
  const days = start.daysInMonth();
  if (now.isBefore(start)) return { elapsed: 0, daysLeft: days };
  if (now.format('YYYY-MM') !== period) return { elapsed: 1, daysLeft: 0 };
  const day = now.date();
  return { elapsed: day / days, daysLeft: days - day };
}

export function budgetStatuses(
  budgets: Budget[],
  transactions: Transaction[],
  period: string,
  index: CategoryIndex,
  now = dayjs(),
): BudgetStatus[] {
  const { elapsed, daysLeft } = periodProgress(period, now);
  return budgets.map((budget) => {
    const spent = budgetSpent(budget, transactions, period, index);
    const pct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
    return {
      budget,
      name: budgetName(budget, index),
      spent,
      pct,
      remaining: budget.amount - spent,
      periodElapsed: elapsed,
      daysLeft,
    };
  });
}

export interface PendingAlert {
  status: BudgetStatus;
  /** Highest newly reached threshold; this is the one shown. */
  threshold: number;
  /** Every newly reached threshold, all of which are marked as fired. */
  reached: number[];
}

/**
 * Thresholds that have been reached but not yet fired this period. Each
 * threshold fires once; if several are reached at once only the highest is
 * shown, but all are marked so the lower ones don't fire later.
 */
export function pendingAlerts(
  statuses: BudgetStatus[],
  fired: BudgetAlert[],
  period: string,
): PendingAlert[] {
  const firedSet = new Set(fired.filter((a) => a.period === period).map((a) => `${a.budgetId}:${a.threshold}`));
  const out: PendingAlert[] = [];
  for (const status of statuses) {
    const reached = [...status.budget.thresholds]
      .sort((a, b) => a - b)
      .filter((t) => status.pct >= t && !firedSet.has(`${status.budget.id}:${t}`));
    if (reached.length) out.push({ status, threshold: reached[reached.length - 1], reached });
  }
  return out;
}

export function alertMessage(a: PendingAlert): string {
  const { status } = a;
  const used = Math.round(status.pct);
  const pace = Math.round(status.periodElapsed * 100);
  if (status.remaining <= 0) {
    return `Over budget by ${formatMoney(-status.remaining)} with ${status.daysLeft} days to go.`;
  }
  return `${used}% used, ${formatMoney(status.remaining)} left. ${pace}% of the month has gone, ${status.daysLeft} days to go.`;
}


export function budgetColor(pct: number): string {
  if (pct >= 100) return 'red';
  if (pct >= 75) return 'orange';
  return 'teal';
}
