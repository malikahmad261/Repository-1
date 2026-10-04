import { notifications } from '@mantine/notifications';
import dayjs from 'dayjs';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { alertMessage, budgetStatuses, pendingAlerts } from '../lib/budgets';
import { indexCategories, type CategoryIndex } from '../lib/categories';
import { currentPeriod, nowIso } from '../lib/format';
import { merchantKey } from '../lib/merchant';
import type { Budget, Category, MerchantRule, Snapshot, Transaction } from '../lib/types';
import { isNetworkError, type Repo } from './repo';

const CACHE_KEY = 'et.cache.v1';
const OUTBOX_KEY = 'et.outbox.v1';
const RECEIPT_DAYS = 60;

type OutboxOp = { type: 'save'; txn: Transaction } | { type: 'delete'; id: string };

const EMPTY: Snapshot = { categories: [], transactions: [], budgets: [], merchantRules: [], budgetAlerts: [] };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the app still works, just without the offline cache.
  }
}

function applyOp(snapshot: Snapshot, op: OutboxOp): Snapshot {
  const rest = snapshot.transactions.filter((t) => t.id !== (op.type === 'save' ? op.txn.id : op.id));
  const transactions = op.type === 'save' ? [op.txn, ...rest] : rest;
  return { ...snapshot, transactions: sortTxns(transactions) };
}

function sortTxns(txns: Transaction[]): Transaction[] {
  return [...txns].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
}

interface SaveOptions {
  receipt?: Blob;
  /** Remember merchant → category for next time. */
  rememberMerchant?: boolean;
}

interface StoreValue extends Snapshot {
  repo: Repo;
  index: CategoryIndex;
  loading: boolean;
  loadError: string | null;
  pendingSync: number;
  refresh(): Promise<void>;
  saveTransaction(t: Transaction, opts?: SaveOptions): Promise<void>;
  deleteTransaction(id: string, opts?: { keepReceipt?: boolean }): Promise<void>;
  saveCategory(c: Category): Promise<void>;
  saveBudget(b: Budget): Promise<void>;
  deleteBudget(id: string): Promise<void>;
  deleteMerchantRule(key: string): Promise<void>;
  ruleForMerchant(merchant: string): MerchantRule | undefined;
  /** Most-used subcategories recently, for quick-add chips. */
  frequentCategoryIds(limit: number): string[];
}

const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore outside StoreProvider');
  return value;
}

export function StoreProvider({ repo, children }: { repo: Repo; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => (repo.kind === 'supabase' ? readJson(CACHE_KEY, EMPTY) : EMPTY));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<OutboxOp[]>(() => readJson(OUTBOX_KEY, []));
  const outboxRef = useRef(outbox);
  const snapshotRef = useRef(snapshot);
  const flushing = useRef(false);

  const commitSnapshot = useCallback(
    (next: Snapshot | ((s: Snapshot) => Snapshot)) => {
      const value = typeof next === 'function' ? next(snapshotRef.current) : next;
      snapshotRef.current = value;
      setSnapshot(value);
      if (repo.kind === 'supabase') writeJson(CACHE_KEY, value);
    },
    [repo],
  );

  const commitOutbox = useCallback((ops: OutboxOp[]) => {
    outboxRef.current = ops;
    setOutbox(ops);
    writeJson(OUTBOX_KEY, ops);
  }, []);

  /** Sends queued offline changes. Stops at the first network failure. */
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (outboxRef.current.length) {
        const [op, ...rest] = outboxRef.current;
        try {
          if (op.type === 'save') await repo.saveTransaction(op.txn);
          else await repo.deleteTransaction(op.id);
        } catch (error) {
          if (isNetworkError(error)) return;
          notifications.show({ color: 'red', title: "Couldn't sync a change", message: String(error) });
        }
        commitOutbox(rest);
      }
    } finally {
      flushing.current = false;
    }
  }, [repo, commitOutbox]);

  const cleanupReceipts = useCallback(
    async (snap: Snapshot) => {
      const cutoff = dayjs().subtract(RECEIPT_DAYS, 'day');
      const old = snap.transactions.filter(
        (t) => t.receiptPath && t.receiptUploadedAt && dayjs(t.receiptUploadedAt).isBefore(cutoff),
      );
      if (!old.length) return;
      try {
        await repo.deleteReceipts(old.map((t) => t.receiptPath!));
        for (const t of old) {
          const updated = { ...t, receiptPath: null, receiptUploadedAt: null };
          await repo.saveTransaction(updated);
          commitSnapshot((s) => applyOp(s, { type: 'save', txn: updated }));
        }
      } catch {
        // Try again next time the app opens.
      }
    },
    [repo, commitSnapshot],
  );

  const refresh = useCallback(async () => {
    try {
      await flush();
      let snap = await repo.loadAll();
      snap = { ...snap, transactions: sortTxns(snap.transactions) };
      for (const op of outboxRef.current) snap = applyOp(snap, op);
      commitSnapshot(snap);
      setLoadError(null);
      void cleanupReceipts(snap);
    } catch (error) {
      setLoadError(isNetworkError(error) ? 'offline' : String(error));
    } finally {
      setLoading(false);
    }
  }, [repo, flush, commitSnapshot, cleanupReceipts]);

  useEffect(() => {
    void refresh();
    const onOnline = () => void refresh();
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const index = useMemo(() => indexCategories(snapshot.categories), [snapshot.categories]);

  const checkBudgets = useCallback(
    async (snap: Snapshot) => {
      const period = currentPeriod();
      const statuses = budgetStatuses(snap.budgets, snap.transactions, period, indexCategories(snap.categories));
      const pending = pendingAlerts(statuses, snap.budgetAlerts, period);
      for (const alert of pending) {
        let show = true;
        for (const threshold of alert.reached) {
          try {
            const claimed = await repo.claimAlert(alert.status.budget.id, period, threshold);
            // Another phone already showed this threshold.
            if (threshold === alert.threshold && !claimed) show = false;
          } catch {
            // Offline: still alert on this device.
          }
        }
        commitSnapshot((s) => ({
          ...s,
          budgetAlerts: [
            ...s.budgetAlerts,
            ...alert.reached.map((threshold) => ({ budgetId: alert.status.budget.id, period, threshold })),
          ],
        }));
        if (!show) continue;
        notifications.show({
          color: alert.threshold >= 100 ? 'red' : alert.threshold >= 75 ? 'orange' : 'yellow',
          title: `${alert.status.name}: ${alert.threshold}% of budget`,
          message: alertMessage(alert),
          autoClose: 10000,
        });
      }
    },
    [repo, commitSnapshot],
  );

  const saveTransaction = useCallback(
    async (input: Transaction, opts: SaveOptions = {}) => {
      let txn = { ...input, updatedAt: nowIso() };
      if (opts.receipt) {
        const path = `${txn.id}.jpg`;
        try {
          await repo.uploadReceipt(path, opts.receipt);
          txn = { ...txn, receiptPath: path, receiptUploadedAt: nowIso() };
        } catch {
          notifications.show({ color: 'orange', message: "Saved, but the receipt photo couldn't be uploaded." });
        }
      }
      if (opts.rememberMerchant && txn.merchant.trim() && txn.items.length === 1) {
        const rule: MerchantRule = {
          merchantKey: merchantKey(txn.merchant),
          merchantName: txn.merchant.trim(),
          categoryId: txn.items[0].categoryId,
          necessity: txn.items[0].necessity,
          updatedAt: nowIso(),
        };
        if (rule.merchantKey) {
          commitSnapshot((s) => ({
            ...s,
            merchantRules: [...s.merchantRules.filter((r) => r.merchantKey !== rule.merchantKey), rule],
          }));
          repo.saveMerchantRule(rule).catch(() => undefined);
        }
      }

      const prev = snapshotRef.current;
      const next = applyOp(prev, { type: 'save', txn });
      commitSnapshot(next);
      try {
        await repo.saveTransaction(txn);
      } catch (error) {
        if (!isNetworkError(error)) {
          commitSnapshot(prev);
          throw error;
        }
        commitOutbox([...outboxRef.current, { type: 'save', txn }]);
        notifications.show({ color: 'gray', message: "You're offline. Saved on this phone; it will sync later." });
      }
      await checkBudgets(next);
    },
    [repo, commitSnapshot, commitOutbox, checkBudgets],
  );

  const deleteTransaction = useCallback(
    async (id: string, opts: { keepReceipt?: boolean } = {}) => {
      const txn = snapshotRef.current.transactions.find((t) => t.id === id);
      commitSnapshot((s) => applyOp(s, { type: 'delete', id }));
      try {
        await repo.deleteTransaction(id);
        if (txn?.receiptPath && !opts.keepReceipt) await repo.deleteReceipts([txn.receiptPath]).catch(() => undefined);
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        commitOutbox([...outboxRef.current, { type: 'delete', id }]);
      }
    },
    [repo, commitSnapshot, commitOutbox],
  );

  const saveCategory = useCallback(
    async (c: Category) => {
      await repo.saveCategory(c);
      commitSnapshot((s) => ({ ...s, categories: [...s.categories.filter((x) => x.id !== c.id), c] }));
    },
    [repo, commitSnapshot],
  );

  const saveBudget = useCallback(
    async (b: Budget) => {
      await repo.saveBudget(b);
      const next = { ...snapshotRef.current, budgets: [...snapshotRef.current.budgets.filter((x) => x.id !== b.id), b] };
      commitSnapshot(next);
      await checkBudgets(next);
    },
    [repo, commitSnapshot, checkBudgets],
  );

  const deleteBudget = useCallback(
    async (id: string) => {
      await repo.deleteBudget(id);
      commitSnapshot((s) => ({
        ...s,
        budgets: s.budgets.filter((x) => x.id !== id),
        budgetAlerts: s.budgetAlerts.filter((a) => a.budgetId !== id),
      }));
    },
    [repo, commitSnapshot],
  );

  const deleteMerchantRule = useCallback(
    async (key: string) => {
      await repo.deleteMerchantRule(key);
      commitSnapshot((s) => ({ ...s, merchantRules: s.merchantRules.filter((r) => r.merchantKey !== key) }));
    },
    [repo, commitSnapshot],
  );

  const ruleForMerchant = useCallback(
    (merchant: string) => {
      const key = merchantKey(merchant);
      return key ? snapshot.merchantRules.find((r) => r.merchantKey === key) : undefined;
    },
    [snapshot.merchantRules],
  );

  const frequentCategoryIds = useCallback(
    (limit: number) => {
      const since = dayjs().subtract(90, 'day').format('YYYY-MM-DD');
      const counts = new Map<string, number>();
      for (const t of snapshot.transactions) {
        if (t.date < since) continue;
        for (const i of t.items) counts.set(i.categoryId, (counts.get(i.categoryId) ?? 0) + 1);
      }
      const ranked = [...counts.entries()]
        .filter(([id]) => index.byId.get(id) && !index.byId.get(id)!.archived)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
      const defaults = ['groceries.staples', 'eating_out.restaurants', 'eating_out.delivery', 'transport.fuel', 'transport.ride_hail', 'health.pharmacy'];
      for (const id of defaults) if (!ranked.includes(id) && index.byId.has(id)) ranked.push(id);
      return ranked.slice(0, limit);
    },
    [snapshot.transactions, index],
  );

  const value: StoreValue = {
    ...snapshot,
    repo,
    index,
    loading,
    loadError,
    pendingSync: outbox.length,
    refresh,
    saveTransaction,
    deleteTransaction,
    saveCategory,
    saveBudget,
    deleteBudget,
    deleteMerchantRule,
    ruleForMerchant,
    frequentCategoryIds,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

