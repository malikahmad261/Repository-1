export type Necessity = 'necessary' | 'discretionary';
export type Source = 'manual' | 'text' | 'photo' | 'share';
export type TxnStatus = 'confirmed' | 'needs_review';

/** A top-level category (parentId null) or a subcategory (parentId set). */
export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  /** Only meaningful on subcategories. */
  defaultNecessity: Necessity;
  sortOrder: number;
  archived: boolean;
}

export interface LineItem {
  id: string;
  description: string;
  amount: number;
  /** Always a subcategory id. */
  categoryId: string;
  necessity: Necessity;
  quantity: number | null;
}

export interface Transaction {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  merchant: string;
  totalAmount: number;
  currency: string;
  paymentMethod: string;
  notes: string;
  source: Source;
  rawInput: string;
  receiptPath: string | null;
  receiptUploadedAt: string | null;
  status: TxnStatus;
  createdAt: string;
  updatedAt: string;
  items: LineItem[];
}

export type BudgetScope = 'category' | 'discretionary' | 'total';

export interface Budget {
  id: string;
  scope: BudgetScope;
  /** Category or subcategory id when scope is 'category'. */
  categoryId: string | null;
  amount: number;
  thresholds: number[];
  createdAt: string;
}

export interface MerchantRule {
  merchantKey: string;
  merchantName: string;
  categoryId: string;
  necessity: Necessity;
  updatedAt: string;
}

/** A threshold that has already fired for a budget in a period (YYYY-MM). */
export interface BudgetAlert {
  budgetId: string;
  period: string;
  threshold: number;
}

export interface Snapshot {
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  merchantRules: MerchantRule[];
  budgetAlerts: BudgetAlert[];
}

export const PAYMENT_METHODS = ['Card', 'Cash', 'Bank transfer', 'Mobile wallet', 'Other'] as const;
