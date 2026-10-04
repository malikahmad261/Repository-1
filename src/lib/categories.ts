import type { Category } from './types';

export interface CategoryIndex {
  byId: Map<string, Category>;
  parents: Category[];
  childrenOf: Map<string, Category[]>;
  /** Active subcategories in display order. */
  leaves: Category[];
}

export function indexCategories(categories: Category[]): CategoryIndex {
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const byId = new Map(sorted.map((c) => [c.id, c]));
  const parents = sorted.filter((c) => c.parentId === null && !c.archived);
  const childrenOf = new Map<string, Category[]>();
  for (const c of sorted) {
    if (c.parentId === null || c.archived) continue;
    const list = childrenOf.get(c.parentId) ?? [];
    list.push(c);
    childrenOf.set(c.parentId, list);
  }
  const leaves = parents.flatMap((p) => childrenOf.get(p.id) ?? []);
  return { byId, parents, childrenOf, leaves };
}

/** "Groceries › Snacks & sweets" */
export function categoryLabel(index: CategoryIndex, id: string): string {
  const c = index.byId.get(id);
  if (!c) return 'Unknown category';
  const parent = c.parentId ? index.byId.get(c.parentId) : undefined;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

export function parentIdOf(index: CategoryIndex, id: string): string | null {
  return index.byId.get(id)?.parentId ?? null;
}
