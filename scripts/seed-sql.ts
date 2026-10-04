// Prints the category seed as SQL: npx tsx scripts/seed-sql.ts
import { seedCategories } from '../src/lib/seed';
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const rows = seedCategories().map(
  (c) => `  (${q(c.id)}, ${q(c.name)}, ${c.parentId ? q(c.parentId) : 'null'}, ${q(c.defaultNecessity)}, ${c.sortOrder})`,
);
console.log(`insert into public.categories (id, name, parent_id, default_necessity, sort_order) values\n${rows.join(',\n')}\non conflict (id) do nothing;`);
