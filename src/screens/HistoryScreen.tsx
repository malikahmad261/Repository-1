import { ActionIcon, Chip, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { ExpenseEditor } from '../components/ExpenseEditor';
import { TransactionRow } from '../components/TransactionRow';
import { useStore } from '../data/store';
import { categoryLabel } from '../lib/categories';
import { NO_FLAGS, type Draft } from '../lib/draft';
import { currentPeriod, formatDay, formatMoney, formatPeriod, periodOf, shiftPeriod } from '../lib/format';
import type { Transaction } from '../lib/types';

type Filter = 'all' | 'review' | 'necessary' | 'discretionary';

export function HistoryScreen() {
  const { transactions, index } = useStore();
  const [period, setPeriod] = useState(currentPeriod());
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);

  const reviewCount = transactions.filter((t) => t.status === 'needs_review').length;

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      // "Needs review" shows every month so nothing gets lost.
      if (filter === 'review') return t.status === 'needs_review';
      if (periodOf(t.date) !== period) return false;
      if (filter === 'necessary' && !t.items.some((i) => i.necessity === 'necessary')) return false;
      if (filter === 'discretionary' && !t.items.some((i) => i.necessity === 'discretionary')) return false;
      if (categoryId && !t.items.some((i) => i.categoryId === categoryId || index.byId.get(i.categoryId)?.parentId === categoryId))
        return false;
      if (q) {
        const hay = [t.merchant, t.notes, ...t.items.map((i) => i.description)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, period, filter, query, categoryId, index]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of list) map.set(t.date, [...(map.get(t.date) ?? []), t]);
    return [...map.entries()];
  }, [list]);

  const total = list.reduce((s, t) => s + t.totalAmount, 0);

  const categoryOptions = index.parents.map((p) => ({
    group: p.name,
    items: [
      { value: p.id, label: `All ${p.name}` },
      ...(index.childrenOf.get(p.id) ?? []).map((c) => ({ value: c.id, label: categoryLabel(index, c.id) })),
    ],
  }));

  return (
    <Stack gap="md" maw={560} mx="auto">
      <Title order={3}>History</Title>

      {filter !== 'review' && (
        <Group justify="space-between">
          <ActionIcon variant="default" onClick={() => setPeriod((p) => shiftPeriod(p, -1))} aria-label="Previous month">
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Text fw={600}>{formatPeriod(period)}</Text>
          <ActionIcon
            variant="default"
            onClick={() => setPeriod((p) => shiftPeriod(p, 1))}
            disabled={period >= currentPeriod()}
            aria-label="Next month"
          >
            <IconChevronRight size={18} />
          </ActionIcon>
        </Group>
      )}

      <Chip.Group multiple={false} value={filter} onChange={(v) => setFilter(v as Filter)}>
        <Group gap={6}>
          <Chip value="all" size="sm">All</Chip>
          <Chip value="review" size="sm" color="orange">Needs review ({reviewCount})</Chip>
          <Chip value="necessary" size="sm" color="teal">Necessary</Chip>
          <Chip value="discretionary" size="sm" color="grape">Discretionary</Chip>
        </Group>
      </Chip.Group>

      <Group grow>
        <TextInput placeholder="Search" leftSection={<IconSearch size={16} />} value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
        <Select placeholder="Category" data={categoryOptions} value={categoryId} onChange={setCategoryId} clearable searchable />
      </Group>

      <Text size="sm" c="dimmed">
        {list.length} expense{list.length === 1 ? '' : 's'} · {formatMoney(total)}
      </Text>

      {groups.map(([date, txns]) => (
        <div key={date}>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            {formatDay(date)}
          </Text>
          {txns.map((t) => (
            <TransactionRow key={t.id} txn={t} onClick={() => setEditing({ txn: t, flags: reviewFlags(t) })} />
          ))}
        </div>
      ))}
      {!list.length && (
        <Text c="dimmed" size="sm" ta="center" py="xl">
          {filter === 'review' ? 'Nothing needs reviewing.' : 'No expenses here.'}
        </Text>
      )}

      <ExpenseEditor draft={editing} existing onClose={() => setEditing(null)} />
    </Stack>
  );
}

/** Re-ask about uncategorised items when reopening an entry that needs review. */
function reviewFlags(t: Transaction) {
  if (t.status !== 'needs_review') return NO_FLAGS;
  const items = Object.fromEntries(
    t.items
      .filter((i) => i.categoryId === 'other.uncategorised' && i.description !== 'Unallocated difference')
      .map((i) => [i.id, { categoryUncertain: true, alternatives: [], necessityUncertain: false }]),
  );
  return { dateMissing: false, totalMissing: t.totalAmount === 0, items };
}
