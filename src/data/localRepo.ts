import { seedCategories } from '../lib/seed';
import type { Budget, Category, MerchantRule, Snapshot, Transaction } from '../lib/types';
import type { Repo } from './repo';

const KEY = 'et.local-db.v1';

/**
 * Demo backend used until Supabase is configured. Everything lives in this
 * browser's localStorage; receipt photos are kept in memory only.
 */
export class LocalRepo implements Repo {
  readonly kind = 'local' as const;
  private receipts = new Map<string, string>();

  private read(): Snapshot {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as Snapshot;
    } catch {
      // fall through to a fresh database
    }
    return { categories: seedCategories(), transactions: [], budgets: [], merchantRules: [], budgetAlerts: [] };
  }

  private write(db: Snapshot) {
    localStorage.setItem(KEY, JSON.stringify(db));
  }

  private update(fn: (db: Snapshot) => void) {
    const db = this.read();
    fn(db);
    this.write(db);
  }

  async loadAll(): Promise<Snapshot> {
    return this.read();
  }

  async saveTransaction(t: Transaction): Promise<void> {
    this.update((db) => {
      db.transactions = [t, ...db.transactions.filter((x) => x.id !== t.id)];
    });
  }

  async deleteTransaction(id: string): Promise<void> {
    this.update((db) => {
      db.transactions = db.transactions.filter((x) => x.id !== id);
    });
  }

  async saveCategory(c: Category): Promise<void> {
    this.update((db) => {
      db.categories = [...db.categories.filter((x) => x.id !== c.id), c];
    });
  }

  async saveBudget(b: Budget): Promise<void> {
    this.update((db) => {
      db.budgets = [...db.budgets.filter((x) => x.id !== b.id), b];
    });
  }

  async deleteBudget(id: string): Promise<void> {
    this.update((db) => {
      db.budgets = db.budgets.filter((x) => x.id !== id);
      db.budgetAlerts = db.budgetAlerts.filter((a) => a.budgetId !== id);
    });
  }

  async saveMerchantRule(r: MerchantRule): Promise<void> {
    this.update((db) => {
      db.merchantRules = [...db.merchantRules.filter((x) => x.merchantKey !== r.merchantKey), r];
    });
  }

  async deleteMerchantRule(key: string): Promise<void> {
    this.update((db) => {
      db.merchantRules = db.merchantRules.filter((x) => x.merchantKey !== key);
    });
  }

  async claimAlert(budgetId: string, period: string, threshold: number): Promise<boolean> {
    let claimed = false;
    this.update((db) => {
      if (!db.budgetAlerts.some((a) => a.budgetId === budgetId && a.period === period && a.threshold === threshold)) {
        db.budgetAlerts.push({ budgetId, period, threshold });
        claimed = true;
      }
    });
    return claimed;
  }

  async uploadReceipt(path: string, blob: Blob): Promise<void> {
    this.receipts.set(path, URL.createObjectURL(blob));
  }

  async receiptUrl(path: string): Promise<string | null> {
    return this.receipts.get(path) ?? null;
  }

  async deleteReceipts(paths: string[]): Promise<void> {
    for (const p of paths) this.receipts.delete(p);
  }

  async accessToken(): Promise<string | null> {
    return null;
  }
}
