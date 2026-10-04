import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Budget, BudgetAlert, Category, LineItem, MerchantRule, Snapshot, Transaction } from '../lib/types';
import type { Repo } from './repo';

const PAGE = 1000;

export const HOUSEHOLD_EMAIL = import.meta.env.VITE_HOUSEHOLD_EMAIL || 'household@example.com';

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

export function supabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_KEY);
}

/** Supabase calls return {data, error}; this throws on error instead. */
function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

async function selectAll<T>(table: string, columns: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = check(
      await supabase().from(table).select(columns).order(order).range(from, from + PAGE - 1),
    ) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

type Row = Record<string, any>;

const toCategory = (r: Row): Category => ({
  id: r.id,
  name: r.name,
  parentId: r.parent_id,
  defaultNecessity: r.default_necessity,
  sortOrder: r.sort_order,
  archived: r.archived,
});

const toItem = (r: Row): LineItem => ({
  id: r.id,
  description: r.description,
  amount: Number(r.amount),
  categoryId: r.category_id,
  necessity: r.necessity,
  quantity: r.quantity === null ? null : Number(r.quantity),
});

const toTransaction = (r: Row, items: LineItem[]): Transaction => ({
  id: r.id,
  date: r.date,
  merchant: r.merchant,
  totalAmount: Number(r.total_amount),
  currency: r.currency,
  paymentMethod: r.payment_method,
  notes: r.notes,
  source: r.source,
  rawInput: r.raw_input,
  receiptPath: r.receipt_path,
  receiptUploadedAt: r.receipt_uploaded_at,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  items,
});

const toBudget = (r: Row): Budget => ({
  id: r.id,
  scope: r.scope,
  categoryId: r.category_id,
  amount: Number(r.amount),
  thresholds: r.thresholds,
  createdAt: r.created_at,
});

const toRule = (r: Row): MerchantRule => ({
  merchantKey: r.merchant_key,
  merchantName: r.merchant_name,
  categoryId: r.category_id,
  necessity: r.necessity,
  updatedAt: r.updated_at,
});

export class SupabaseRepo implements Repo {
  readonly kind = 'supabase' as const;

  async loadAll(): Promise<Snapshot> {
    const [cats, txns, items, budgets, rules, alerts] = await Promise.all([
      selectAll<Row>('categories', '*', 'sort_order'),
      selectAll<Row>('transactions', '*', 'date'),
      selectAll<Row>('line_items', '*', 'position'),
      selectAll<Row>('budgets', '*', 'created_at'),
      selectAll<Row>('merchant_rules', '*', 'merchant_key'),
      selectAll<Row>('budget_alerts', 'budget_id, period, threshold', 'period'),
    ]);
    const byTxn = new Map<string, LineItem[]>();
    for (const r of items) {
      const list = byTxn.get(r.transaction_id) ?? [];
      list.push(toItem(r));
      byTxn.set(r.transaction_id, list);
    }
    return {
      categories: cats.map(toCategory),
      transactions: txns.map((r) => toTransaction(r, byTxn.get(r.id) ?? [])).reverse(),
      budgets: budgets.map(toBudget),
      merchantRules: rules.map(toRule),
      budgetAlerts: alerts.map(
        (r): BudgetAlert => ({ budgetId: r.budget_id, period: r.period, threshold: r.threshold }),
      ),
    };
  }

  async saveTransaction(t: Transaction): Promise<void> {
    check(
      await supabase().rpc('save_transaction', {
        txn: {
          id: t.id,
          date: t.date,
          merchant: t.merchant,
          total_amount: t.totalAmount,
          currency: t.currency,
          payment_method: t.paymentMethod,
          notes: t.notes,
          source: t.source,
          raw_input: t.rawInput,
          receipt_path: t.receiptPath,
          receipt_uploaded_at: t.receiptUploadedAt,
          status: t.status,
          created_at: t.createdAt,
        },
        items: t.items.map((i) => ({
          id: i.id,
          description: i.description,
          amount: i.amount,
          category_id: i.categoryId,
          necessity: i.necessity,
          quantity: i.quantity,
        })),
      }),
    );
  }

  async deleteTransaction(id: string): Promise<void> {
    check(await supabase().from('transactions').delete().eq('id', id));
  }

  async saveCategory(c: Category): Promise<void> {
    check(
      await supabase().from('categories').upsert({
        id: c.id,
        name: c.name,
        parent_id: c.parentId,
        default_necessity: c.defaultNecessity,
        sort_order: c.sortOrder,
        archived: c.archived,
      }),
    );
  }

  async saveBudget(b: Budget): Promise<void> {
    check(
      await supabase().from('budgets').upsert({
        id: b.id,
        scope: b.scope,
        category_id: b.categoryId,
        amount: b.amount,
        thresholds: b.thresholds,
        created_at: b.createdAt,
      }),
    );
  }

  async deleteBudget(id: string): Promise<void> {
    check(await supabase().from('budgets').delete().eq('id', id));
  }

  async saveMerchantRule(r: MerchantRule): Promise<void> {
    check(
      await supabase().from('merchant_rules').upsert({
        merchant_key: r.merchantKey,
        merchant_name: r.merchantName,
        category_id: r.categoryId,
        necessity: r.necessity,
        updated_at: r.updatedAt,
      }),
    );
  }

  async deleteMerchantRule(key: string): Promise<void> {
    check(await supabase().from('merchant_rules').delete().eq('merchant_key', key));
  }

  async claimAlert(budgetId: string, period: string, threshold: number): Promise<boolean> {
    const rows = check(
      await supabase()
        .from('budget_alerts')
        .upsert(
          { budget_id: budgetId, period, threshold },
          { onConflict: 'budget_id,period,threshold', ignoreDuplicates: true },
        )
        .select('budget_id'),
    );
    return (rows?.length ?? 0) > 0;
  }

  async uploadReceipt(path: string, blob: Blob): Promise<void> {
    check(
      await supabase().storage.from('receipts').upload(path, blob, {
        upsert: true,
        contentType: blob.type || 'image/jpeg',
      }),
    );
  }

  async receiptUrl(path: string): Promise<string | null> {
    const res = await supabase().storage.from('receipts').createSignedUrl(path, 600);
    return res.data?.signedUrl ?? null;
  }

  async deleteReceipts(paths: string[]): Promise<void> {
    if (paths.length) check(await supabase().storage.from('receipts').remove(paths));
  }

  async accessToken(): Promise<string | null> {
    const { data } = await supabase().auth.getSession();
    return data.session?.access_token ?? null;
  }
}
