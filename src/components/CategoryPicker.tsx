import { Button, Chip, Group, Modal, ScrollArea, Stack, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useStore } from '../data/store';

interface Props {
  opened: boolean;
  onClose(): void;
  onPick(categoryId: string): void;
  value?: string;
  title?: string;
}

/** Searchable list of all subcategories, grouped by category. */
export function CategoryPicker({ opened, onClose, onPick, value, title = 'Choose a category' }: Props) {
  const { index } = useStore();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return index.parents
      .map((p) => ({
        parent: p,
        subs: (index.childrenOf.get(p.id) ?? []).filter(
          (c) => !q || c.name.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.subs.length);
  }, [index, query]);

  return (
    <Modal opened={opened} onClose={onClose} title={title} fullScreen radius={0} transitionProps={{ transition: 'slide-up' }}>
      <Stack>
        <TextInput
          placeholder="Search categories"
          leftSection={<IconSearch size={16} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <ScrollArea.Autosize mah="calc(100dvh - 140px)">
          <Stack gap="md">
            {groups.map(({ parent, subs }) => (
              <div key={parent.id}>
                <Text fw={600} size="sm" mb={6}>
                  {parent.name}
                </Text>
                <Group gap={6}>
                  {subs.map((c) => (
                    <Chip
                      key={c.id}
                      checked={value === c.id}
                      onChange={() => {
                        onPick(c.id);
                        setQuery('');
                        onClose();
                      }}
                      color={c.defaultNecessity === 'necessary' ? 'teal' : 'grape'}
                    >
                      {c.name}
                    </Chip>
                  ))}
                </Group>
              </div>
            ))}
            {!groups.length && (
              <Text c="dimmed" size="sm">
                No matching category. You can add one in Settings.
              </Text>
            )}
          </Stack>
        </ScrollArea.Autosize>
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
      </Stack>
    </Modal>
  );
}
