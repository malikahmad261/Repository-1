import { ActionIcon, Button, Card, Group, Modal, NumberInput, Progress, Select, Stack, TagsInput, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconChevronLeft, IconChevronRight, IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { BudgetBars } from '../components/BudgetBars';
import { useStore } from '../data/store';
import { budgetStatuses } from '../lib/budgets';
import { currentPeriod, formatMoney, formatPeriod, newId, nowIso, periodOf, shiftPeriod } from '../lib/format';
import type { Budget } from '../lib/types';

export function BudgetsScreen() {
  const { budgets, transactions, index } = useStore();
  const [period, setPeriod] = useState(currentPeriod());
  const [editing, setEditing] = useState<Budget | null>(null);

  const statuses = useMemo(() => budgetStatuses(budgets, transactions, period, index), [budgets, transactions, period, index]);

  const summary = useMemo(() => {
    let necessary = 0;
    let discretionary = 0;
    const byCat = new Map<string, number>();
    for (const t of transactions) {
      if (periodOf(t.date) !== period) continue;
      for (const i of t.items) {
        if (i.necessity === 'necessary') necessary += i.amount;
        else discretionary += i.amount;
        const parent = index.byId.get(i.categoryId)?.parentId ?? i.categoryId;
        byCat.set(parent, (byCat.get(parent) ?? 0) + i.amount);
      }
    }
    const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { necessary, discretionary, total: necessary + discretionary, top };
  }, [transactions, period, index]);

  const pct = (n: number) => (summary.total ? (n / summary.total) * 100 : 0);

  return (
    <Stack gap="md" maw={560} mx="auto">
      <Title order={3}>Budgets</Title>
      <Group justify="space-between">
        <ActionIcon variant="default" onClick={() => setPeriod((p) => shiftPeriod(p, -1))} aria-label="Previous month">
          <IconChevronLeft size={18} />
        </ActionIcon>
        <Text fw={600}>{formatPeriod(period)}</Text>
        <ActionIcon variant="default" onClick={() => setPeriod((p) => shiftPeriod(p, 1))} disabled={period >= currentPeriod()} aria-label="Next month">
          <IconChevronRight size={18} />
        </ActionIcon>
      </Group>

      <Card withBorder>
        <Text size="sm" c="dimmed">
          Spent this month
        </Text>
        <Text fz={28} fw={700}>
          {formatMoney(summary.total)}
        </Text>
        <Progress.Root size={20} mt="sm">
          <Progress.Section value={pct(summary.necessary)} color="teal">
            <Progress.Label>Necessary</Progress.Label>
          </Progress.Section>
          <Progress.Section value={pct(summary.discretionary)} color="grape">
            <Progress.Label>Discretionary</Progress.Label>
          </Progress.Section>
        </Progress.Root>
        <Group justify="space-between" mt={6}>
          <Text size="sm" c="teal">
            Necessary {formatMoney(summary.necessary)} ({Math.round(pct(summary.necessary))}%)
          </Text>
          <Text size="sm" c="grape">
            Discretionary {formatMoney(summary.discretionary)}
          </Text>
        </Group>
        {summary.top.length > 0 && (
          <Stack gap={4} mt="md">
            {summary.top.map(([id, amount]) => (
              <Group key={id} justify="space-between">
                <Text size="sm">{index.byId.get(id)?.name ?? id}</Text>
                <Text size="sm" fw={500}>
                  {formatMoney(amount)}
                </Text>
              </Group>
            ))}
          </Stack>
        )}
      </Card>

      <Card withBorder>
        <Group justify="space-between" mb="sm">
          <Text fw={600}>Monthly budgets</Text>
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={() => setEditing({ id: newId(), scope: 'category', categoryId: null, amount: 0, thresholds: [50, 75, 90, 100], createdAt: nowIso() })}
          >
            Add budget
          </Button>
        </Group>
        {statuses.length ? (
          <BudgetBars statuses={statuses} onClick={(s) => setEditing(s.budget)} />
        ) : (
          <Text size="sm" c="dimmed">
            Set a monthly budget for a category (e.g. Eating out) to get alerts at 50%, 75%, 90% and 100%.
          </Text>
        )}
      </Card>

      <BudgetEditor budget={editing} onClose={() => setEditing(null)} />
    </Stack>
  );
}

function BudgetEditor({ budget, onClose }: { budget: Budget | null; onClose(): void }) {
  return (
    <Modal opened={!!budget} onClose={onClose} title="Budget" centered>
      {budget && <BudgetForm key={budget.id} budget={budget} onClose={onClose} />}
    </Modal>
  );
}

function BudgetForm({ budget, onClose }: { budget: Budget; onClose(): void }) {
  const { index, budgets, saveBudget, deleteBudget } = useStore();
  const [b, setB] = useState(budget);
  const [busy, setBusy] = useState(false);
  const exists = budgets.some((x) => x.id === budget.id);

  const target = b.scope === 'category' ? b.categoryId : `__${b.scope}`;
  const options = [
    { group: 'Overall', items: [{ value: '__total', label: 'All spending' }, { value: '__discretionary', label: 'All discretionary spending' }] },
    ...index.parents.map((p) => ({
      group: p.name,
      items: [
        { value: p.id, label: `${p.name} (whole category)` },
        ...(index.childrenOf.get(p.id) ?? []).map((c) => ({ value: c.id, label: `${p.name} › ${c.name}` })),
      ],
    })),
  ];

  async function save() {
    setBusy(true);
    try {
      await saveBudget(b);
      onClose();
    } catch (error) {
      notifications.show({ color: 'red', message: String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack>
      <Select
        label="What to budget"
        data={options}
        value={target}
        searchable
        onChange={(v) => {
          if (v === '__total' || v === '__discretionary') setB({ ...b, scope: v.slice(2) as Budget['scope'], categoryId: null });
          else setB({ ...b, scope: 'category', categoryId: v });
        }}
      />
      <NumberInput
        label="Monthly amount"
        prefix="Rs "
        thousandSeparator=","
        inputMode="decimal"
        value={b.amount || ''}
        onChange={(v) => setB({ ...b, amount: Number(v) || 0 })}
      />
      <TagsInput
        label="Alert at (% of budget)"
        description="Press enter after each number"
        value={b.thresholds.map(String)}
        onChange={(vals) =>
          setB({ ...b, thresholds: [...new Set(vals.map(Number).filter((n) => n > 0 && n <= 500))].sort((x, y) => x - y) })
        }
      />
      <Group grow>
        {exists && (
          <Button
            color="red"
            variant="light"
            onClick={async () => {
              await deleteBudget(b.id);
              onClose();
            }}
          >
            Delete
          </Button>
        )}
        <Button onClick={save} loading={busy} disabled={!b.amount || (b.scope === 'category' && !b.categoryId)}>
          Save
        </Button>
      </Group>
    </Stack>
  );
}
