import { Group, Progress, Stack, Text } from '@mantine/core';
import { budgetColor, type BudgetStatus } from '../lib/budgets';
import { formatMoney } from '../lib/format';

export function BudgetBars({ statuses, onClick }: { statuses: BudgetStatus[]; onClick?(s: BudgetStatus): void }) {
  return (
    <Stack gap="sm">
      {statuses.map((s) => (
        <div key={s.budget.id} onClick={() => onClick?.(s)} style={{ cursor: onClick ? 'pointer' : undefined }}>
          <Group justify="space-between" mb={4} wrap="nowrap">
            <Text size="sm" fw={500} truncate>
              {s.name}
            </Text>
            <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
              {formatMoney(s.spent)} / {formatMoney(s.budget.amount)}
            </Text>
          </Group>
          <Progress.Root size="lg">
            <Progress.Section value={Math.min(100, s.pct)} color={budgetColor(s.pct)}>
              <Progress.Label>{Math.round(s.pct)}%</Progress.Label>
            </Progress.Section>
          </Progress.Root>
          {s.periodElapsed < 1 && s.pct > s.periodElapsed * 100 + 10 && s.pct < 100 && (
            <Text size="xs" c="orange" mt={2}>
              Ahead of pace: {Math.round(s.periodElapsed * 100)}% of the month has gone
            </Text>
          )}
        </div>
      ))}
    </Stack>
  );
}
