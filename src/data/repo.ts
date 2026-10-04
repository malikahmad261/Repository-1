import type { Budget, Category, MerchantRule, Snapshot, Transaction } from '../lib/types';

/** Storage backend. SupabaseRepo is the real one; LocalRepo is a browser-only demo. */
export interface Repo {
  readonly kind: 'supabase' | 'local';
  loadAll(): Promise<Snapshot>;
  saveTransaction(t: Transaction): Promise<void>;
  deleteTransaction(id: string): Promise<void>;
  saveCategory(c: Category): Promise<void>;
  saveBudget(b: Budget): Promise<void>;
  deleteBudget(id: string): Promise<void>;
  saveMerchantRule(r: MerchantRule): Promise<void>;
  deleteMerchantRule(key: string): Promise<void>;
  /** Records a fired threshold. Returns false if another device already fired it. */
  claimAlert(budgetId: string, period: string, threshold: number): Promise<boolean>;
  uploadReceipt(path: string, blob: Blob): Promise<void>;
  receiptUrl(path: string): Promise<string | null>;
  deleteReceipts(paths: string[]): Promise<void>;
  /** Access token for calling /api/parse, if signed in. */
  accessToken(): Promise<string | null>;
}

/** True when an error looks like "no connection" rather than a real failure. */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const msg = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|network request failed|load failed/i.test(msg);
}
