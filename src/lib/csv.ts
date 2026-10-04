import { categoryLabel, type CategoryIndex } from './categories';
import type { Transaction } from './types';

const esc = (v: string | number | null) => {
  const s = v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per line item, with the transaction's details repeated. */
export function toCsv(transactions: Transaction[], index: CategoryIndex): string {
  const header = ['date', 'merchant', 'transaction_total', 'item', 'item_amount', 'category', 'subcategory', 'necessity', 'payment_method', 'notes', 'status', 'source', 'transaction_id'];
  const rows = [header.join(',')];
  for (const t of [...transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const i of t.items) {
      const sub = index.byId.get(i.categoryId);
      const parent = sub?.parentId ? index.byId.get(sub.parentId) : undefined;
      rows.push(
        [t.date, t.merchant, t.totalAmount, i.description, i.amount, parent?.name ?? '', sub ? sub.name : categoryLabel(index, i.categoryId), i.necessity, t.paymentMethod, t.notes, t.status, t.source, t.id]
          .map(esc)
          .join(','),
      );
    }
  }
  return rows.join('\n');
}
