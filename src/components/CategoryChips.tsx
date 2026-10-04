import { Chip, Group } from '@mantine/core';
import { useState } from 'react';
import { useStore } from '../data/store';
import { CategoryPicker } from './CategoryPicker';

interface Props {
  value: string | null;
  onChange(categoryId: string): void;
  /** Ids to show first (e.g. AI alternatives); falls back to frequently used. */
  suggestions?: string[];
  limit?: number;
}

/** Frequently used subcategories as one-tap chips, plus "More…". */
export function CategoryChips({ value, onChange, suggestions, limit = 6 }: Props) {
  const { index, frequentCategoryIds } = useStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const ids = suggestions?.length ? suggestions : frequentCategoryIds(limit);
  const shown = value && !ids.includes(value) ? [value, ...ids] : ids;

  return (
    <>
      <Group gap={6}>
        {shown.map((id) => {
          const c = index.byId.get(id);
          if (!c) return null;
          return (
            <Chip
              key={id}
              checked={value === id}
              onChange={() => onChange(id)}
              color={c.defaultNecessity === 'necessary' ? 'teal' : 'grape'}
              size="sm"
            >
              {c.name}
            </Chip>
          );
        })}
        <Chip checked={false} onChange={() => setPickerOpen(true)} variant="outline" size="sm">
          More…
        </Chip>
      </Group>
      <CategoryPicker opened={pickerOpen} onClose={() => setPickerOpen(false)} onPick={onChange} value={value ?? undefined} />
    </>
  );
}
