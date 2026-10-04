import { Badge, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { useStore } from '../data/store';
import { formatMoney } from '../lib/format';
import type { Transaction } from '../lib/types';

export function TransactionRow({ txn, onClick }: { txn: Transaction; onClick(): void }) {
  const { index } = useStore();
  const cats = [...new Set(txn.items.map((i) => index.byId.get(i.categoryId)?.name ?? '?'))];
  const discretionary = txn.items.filter((i) => i.necessity === 'discretionary').reduce((s, i) => s + i.amount, 0);
  const title = txn.merchant || txn.items[0]?.description || cats[0];
  // With no merchant or description the title is already the category, so show its parent.
  const parentName = index.byId.get(index.byId.get(txn.items[0]?.categoryId ?? '')?.parentId ?? '')?.name;
  const subtitle = title === cats[0] && cats.length === 1 && parentName ? [parentName] : cats;

  return (
    <UnstyledButton onClick={onClick} w="100%" py={8}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <Text fw={500} truncate>
              {title}
            </Text>
            {txn.status === 'needs_review' && (
              <Badge size="xs" color="orange" variant="light">
                review
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed" truncate>
            {subtitle.slice(0, 3).join(', ')}
            {subtitle.length > 3 ? ` +${subtitle.length - 3}` : ''}
            {txn.items.length > 1 ? ` · ${txn.items.length} items` : ''}
          </Text>
        </Stack>
        <Stack gap={2} align="flex-end" style={{ flexShrink: 0 }}>
          <Text fw={600}>{formatMoney(txn.totalAmount)}</Text>
          {discretionary !== 0 && (
            <Text size="xs" c="grape">
              {discretionary === txn.totalAmount ? 'discretionary' : `${formatMoney(discretionary)} discr.`}
            </Text>
          )}
        </Stack>
      </Group>
    </UnstyledButton>
  );
}
