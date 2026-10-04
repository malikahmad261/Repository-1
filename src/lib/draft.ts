import type { ParseRequest, ParseResult, ParsedTransactionT } from '../../api/_lib/parse-core';
import { categoryLabel, type CategoryIndex } from './categories';
import { CURRENCY, newId, nowIso, round2, today } from './format';
import { merchantKey } from './merchant';
import { UNCATEGORISED_ID } from './seed';
import type { LineItem, MerchantRule, Source, Transaction } from './types';

export interface ItemFlags {
  categoryUncertain: boolean;
  alternatives: string[];
  necessityUncertain: boolean;
}

/** Things the AI was unsure about; the editor turns these into questions. */
export interface DraftFlags {
  dateMissing: boolean;
  totalMissing: boolean;
  items: Record<string, ItemFlags>;
}

export interface Draft {
  txn: Transaction;
  flags: DraftFlags;
  receipt?: { blob: Blob; previewUrl: string };
}

export const NO_FLAGS: DraftFlags = { dateMissing: false, totalMissing: false, items: {} };

export function emptyTransaction(source: Source = 'manual'): Transaction {
  const now = nowIso();
  return {
    id: newId(),
    date: today(),
    merchant: '',
    totalAmount: 0,
    currency: CURRENCY,
    paymentMethod: '',
    notes: '',
    source,
    rawInput: '',
    receiptPath: null,
    receiptUploadedAt: null,
    status: 'confirmed',
    createdAt: now,
    updatedAt: now,
    items: [],
  };
}

export function itemsTotal(items: LineItem[]): number {
  return round2(items.reduce((s, i) => s + (i.amount || 0), 0));
}

export function buildParseRequest(
  input: { text?: string; image?: { mediaType: 'image/jpeg'; data: string } },
  index: CategoryIndex,
  rules: MerchantRule[],
  transactions: Transaction[],
): ParseRequest {
  const examples: ParseRequest['examples'] = [];
  const seen = new Set<string>();
  for (const t of transactions) {
    for (const i of t.items) {
      const key = i.description.trim().toLowerCase();
      if (!key || seen.has(key) || t.status !== 'confirmed') continue;
      seen.add(key);
      examples.push({ description: i.description.trim(), categoryId: i.categoryId, necessity: i.necessity });
    }
    if (examples.length >= 60) break;
  }
  return {
    ...input,
    today: today(),
    categories: index.leaves.map((c) => ({ id: c.id, label: categoryLabel(index, c.id), necessity: c.defaultNecessity })),
    merchantRules: rules.slice(0, 100).map((r) => ({ merchant: r.merchantName, categoryId: r.categoryId, necessity: r.necessity })),
    examples,
  };
}

export async function requestParse(req: ParseRequest, token: string | null): Promise<ParseResult> {
  let res: Response;
  try {
    res = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(req),
    });
  } catch {
    throw new Error("Can't reach the server. Check your connection, or add the expense manually.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Server error (${res.status}).`);
  return body as ParseResult;
}

/** Converts one AI-parsed transaction into an editable draft. */
export function toDraft(
  parsed: ParsedTransactionT,
  index: CategoryIndex,
  ruleFor: (merchant: string) => MerchantRule | undefined,
  source: Source,
  rawInput: string,
): Draft {
  const txn = emptyTransaction(source);
  const sign = parsed.kind === 'refund' ? -1 : 1;
  const flags: DraftFlags = { dateMissing: !parsed.date, totalMissing: false, items: {} };
  const validDate = parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;

  txn.date = validDate ?? today();
  flags.dateMissing = !validDate;
  txn.merchant = parsed.merchant?.trim() ?? '';
  txn.paymentMethod = parsed.payment_method ?? '';
  txn.rawInput = rawInput;
  if (parsed.currency && parsed.currency.toUpperCase() !== CURRENCY) {
    txn.notes = `Original currency: ${parsed.currency}`;
  }

  const isLeaf = (id: string | null): id is string => !!id && !!index.byId.get(id)?.parentId;

  txn.items = parsed.line_items.map((p) => {
    const alternatives = p.alternative_category_ids.filter(isLeaf);
    const categoryId = isLeaf(p.category_id) ? p.category_id : alternatives[0] ?? UNCATEGORISED_ID;
    const item: LineItem = {
      id: newId(),
      description: p.description.trim(),
      amount: p.amount === null ? 0 : round2(Math.abs(p.amount) * sign),
      categoryId,
      necessity: p.necessity,
      quantity: null,
    };
    flags.items[item.id] = {
      categoryUncertain: !p.category_confident || !isLeaf(p.category_id),
      alternatives: alternatives.filter((a) => a !== categoryId).slice(0, 3),
      necessityUncertain: !p.necessity_confident,
    };
    return item;
  });

  const total = parsed.total_amount === null ? null : round2(Math.abs(parsed.total_amount) * sign);
  if (!txn.items.length) {
    txn.items = [{ id: newId(), description: '', amount: total ?? 0, categoryId: UNCATEGORISED_ID, necessity: 'discretionary', quantity: null }];
    flags.items[txn.items[0].id] = { categoryUncertain: true, alternatives: [], necessityUncertain: false };
  }
  if (txn.items.length === 1 && total !== null && txn.items[0].amount === 0) txn.items[0].amount = total;
  const sum = itemsTotal(txn.items);
  txn.totalAmount = total ?? sum;
  flags.totalMissing = txn.totalAmount === 0;

  // The household's own merchant rule beats the AI's guess.
  const rule = txn.merchant ? ruleFor(txn.merchant) : undefined;
  if (rule && txn.items.length === 1 && index.byId.has(rule.categoryId)) {
    txn.items[0].categoryId = rule.categoryId;
    txn.items[0].necessity = rule.necessity;
    flags.items[txn.items[0].id] = { categoryUncertain: false, alternatives: [], necessityUncertain: false };
  }
  return { txn, flags };
}

export function hasMerchantRule(rules: MerchantRule[], merchant: string): boolean {
  const key = merchantKey(merchant);
  return !!key && rules.some((r) => r.merchantKey === key);
}
