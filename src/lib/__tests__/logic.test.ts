import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { budgetStatuses, pendingAlerts, periodProgress } from '../budgets';
import { indexCategories } from '../categories';
import { toCsv } from '../csv';
import { emptyTransaction, toDraft } from '../draft';
import { findDuplicates } from '../duplicates';
import { merchantKey } from '../merchant';
import { seedCategories } from '../seed';
import type { Budget, LineItem, MerchantRule, Transaction } from '../types';

const index = indexCategories(seedCategories());

function txn(date: string, items: Partial<LineItem>[], merchant = ''): Transaction {
  const t = emptyTransaction();
  t.date = date;
  t.merchant = merchant;
  t.items = items.map((i, n) => ({
    id: `i${n}`,
    description: '',
    amount: 0,
    categoryId: 'other.uncategorised',
    necessity: 'discretionary',
    quantity: null,
    ...i,
  }));
  t.totalAmount = t.items.reduce((s, i) => s + i.amount, 0);
  return t;
}

const budget = (patch: Partial<Budget>): Budget => ({
  id: 'b1',
  scope: 'category',
  categoryId: 'eating_out',
  amount: 10000,
  thresholds: [50, 75, 90, 100],
  createdAt: '',
  ...patch,
});

describe('budgets', () => {
  const txns = [
    txn('2026-10-02', [{ amount: 3000, categoryId: 'eating_out.restaurants' }]),
    txn('2026-10-03', [
      { amount: 2000, categoryId: 'groceries.staples', necessity: 'necessary' },
      { amount: 2500, categoryId: 'eating_out.coffee' },
    ]),
    txn('2026-09-30', [{ amount: 9999, categoryId: 'eating_out.restaurants' }]),
  ];

  it('counts line items in a whole category, only in the period', () => {
    const [s] = budgetStatuses([budget({})], txns, '2026-10', index);
    expect(s.spent).toBe(5500);
    expect(s.pct).toBeCloseTo(55);
  });

  it('supports subcategory, discretionary and total scopes', () => {
    const statuses = budgetStatuses(
      [
        budget({ id: 'a', categoryId: 'eating_out.coffee' }),
        budget({ id: 'b', scope: 'discretionary', categoryId: null }),
        budget({ id: 'c', scope: 'total', categoryId: null }),
      ],
      txns,
      '2026-10',
      index,
    );
    expect(statuses.map((s) => s.spent)).toEqual([2500, 5500, 7500]);
  });

  it('fires each threshold once and shows only the highest newly reached', () => {
    const [s] = budgetStatuses([budget({ amount: 6000 })], txns, '2026-10', index); // 91.7%
    const [a] = pendingAlerts([s], [], '2026-10');
    expect(a.threshold).toBe(90);
    expect(a.reached).toEqual([50, 75, 90]);
    const fired = a.reached.map((threshold) => ({ budgetId: 'b1', period: '2026-10', threshold }));
    expect(pendingAlerts([s], fired, '2026-10')).toEqual([]);
    // Alerts from last month don't count.
    expect(pendingAlerts([s], fired.map((f) => ({ ...f, period: '2026-09' })), '2026-10')).toHaveLength(1);
  });

  it('reports pace through the month', () => {
    expect(periodProgress('2026-10', dayjs('2026-10-15'))).toEqual({ elapsed: 15 / 31, daysLeft: 16 });
    expect(periodProgress('2026-09', dayjs('2026-10-15')).elapsed).toBe(1);
  });
});

describe('duplicates', () => {
  const existing = [txn('2026-10-02', [{ amount: 2340 }], 'IMTIAZ SUPER MKT 0042')];
  it('matches same amount, nearby date and merchant', () => {
    expect(findDuplicates(txn('2026-10-03', [{ amount: 2340 }], 'Imtiaz Super Mkt'), existing)).toHaveLength(1);
    expect(findDuplicates(txn('2026-10-03', [{ amount: 2340 }]), existing)).toHaveLength(1);
  });
  it('ignores different merchants, amounts or dates', () => {
    expect(findDuplicates(txn('2026-10-03', [{ amount: 2340 }], 'Careem'), existing)).toHaveLength(0);
    expect(findDuplicates(txn('2026-10-03', [{ amount: 2500 }], 'Imtiaz'), existing)).toHaveLength(0);
    expect(findDuplicates(txn('2026-10-09', [{ amount: 2340 }], 'Imtiaz'), existing)).toHaveLength(0);
  });
});

describe('merchantKey', () => {
  it('normalises noise', () => {
    expect(merchantKey('TESCO STORES 2041')).toBe('tesco');
    expect(merchantKey('Imtiaz Super Market (Pvt) Ltd')).toBe('imtiaz super market');
    expect(merchantKey('')).toBe('');
  });
});

describe('toDraft', () => {
  const noRule = () => undefined;

  it('builds line items, flags uncertainty and falls back for unknown categories', () => {
    const d = toDraft(
      {
        kind: 'expense',
        date: null,
        merchant: 'Imtiaz',
        total_amount: 4350,
        currency: 'PKR',
        payment_method: 'Card',
        line_items: [
          { description: 'Atta, oil', amount: 3000, category_id: 'groceries.staples', category_confident: true, alternative_category_ids: [], necessity: 'necessary', necessity_confident: true },
          { description: 'Chips', amount: 450, category_id: 'made.up', category_confident: true, alternative_category_ids: ['groceries.snacks'], necessity: 'discretionary', necessity_confident: false },
        ],
      },
      index,
      noRule,
      'text',
      'raw',
    );
    expect(d.flags.dateMissing).toBe(true);
    expect(d.txn.totalAmount).toBe(4350);
    expect(d.txn.items[1].categoryId).toBe('groceries.snacks');
    expect(d.flags.items[d.txn.items[1].id].categoryUncertain).toBe(true);
    expect(d.flags.items[d.txn.items[0].id].categoryUncertain).toBe(false);
  });

  it('makes refunds negative and applies merchant rules to single items', () => {
    const rule: MerchantRule = { merchantKey: 'daraz', merchantName: 'Daraz', categoryId: 'groceries.household', necessity: 'necessary', updatedAt: '' };
    const d = toDraft(
      {
        kind: 'refund',
        date: '2026-10-01',
        merchant: 'Daraz',
        total_amount: 1200,
        currency: null,
        payment_method: null,
        line_items: [{ description: 'Order', amount: null, category_id: null, category_confident: false, alternative_category_ids: [], necessity: 'discretionary', necessity_confident: false }],
      },
      index,
      (m) => (merchantKey(m) === 'daraz' ? rule : undefined),
      'text',
      '',
    );
    expect(d.txn.totalAmount).toBe(-1200);
    expect(d.txn.items[0].amount).toBe(-1200);
    expect(d.txn.items[0].categoryId).toBe('groceries.household');
    expect(d.flags.items[d.txn.items[0].id].categoryUncertain).toBe(false);
  });
});

describe('csv', () => {
  it('writes one row per item and escapes commas', () => {
    const csv = toCsv([txn('2026-10-02', [{ amount: 10, description: 'Bread, eggs', categoryId: 'groceries.staples' }], 'Imtiaz')], index);
    const [, row] = csv.split('\n');
    expect(row).toContain('"Bread, eggs"');
    expect(row).toContain('Groceries,Staples');
  });
});
