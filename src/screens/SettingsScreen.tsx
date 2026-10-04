import { Accordion, ActionIcon, Button, Card, Group, Modal, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconLock, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { NecessityToggle } from '../components/NecessityToggle';
import { useStore } from '../data/store';
import { supabase } from '../data/supabaseRepo';
import { categoryLabel } from '../lib/categories';
import { toCsv } from '../lib/csv';
import { newId, today } from '../lib/format';
import type { Category } from '../lib/types';

export function SettingsScreen() {
  const { repo, transactions, index, merchantRules, deleteMerchantRule } = useStore();
  const [editing, setEditing] = useState<Category | null>(null);

  async function exportCsv() {
    const csv = toCsv(transactions, index);
    const name = `expenses-${today()}.csv`;
    const file = new File([csv], name, { type: 'text/csv' });
    // On phones, the share sheet is the easiest way to save or send the file.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch {
        // cancelled: fall back to a download
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Stack gap="md" maw={560} mx="auto">
      <Title order={3}>Settings</Title>

      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <Text fw={600}>Categories</Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={() => setEditing({ id: newId(), name: '', parentId: null, defaultNecessity: 'necessary', sortOrder: (index.parents.length + 1) * 100, archived: false })}
          >
            Category
          </Button>
        </Group>
        <Text size="xs" c="dimmed" mb="sm">
          Each subcategory has a default: necessary or discretionary. You can still change it on any expense.
        </Text>
        <Accordion variant="contained" chevronPosition="left">
          {index.parents.map((p) => {
            const subs = index.childrenOf.get(p.id) ?? [];
            return (
              <Accordion.Item key={p.id} value={p.id}>
                <Accordion.Control>
                  <Text size="sm" fw={500}>
                    {p.name} <Text span c="dimmed" size="xs">({subs.length})</Text>
                  </Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap={6}>
                    {subs.map((c) => (
                      <Group key={c.id} justify="space-between" wrap="nowrap">
                        <Text size="sm">{c.name}</Text>
                        <Group gap={6} wrap="nowrap">
                          <Text size="xs" c={c.defaultNecessity === 'necessary' ? 'teal' : 'grape'}>
                            {c.defaultNecessity}
                          </Text>
                          <ActionIcon variant="subtle" size="sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                            <IconPencil size={14} />
                          </ActionIcon>
                        </Group>
                      </Group>
                    ))}
                    <Group gap="xs">
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        leftSection={<IconPlus size={12} />}
                        onClick={() =>
                          setEditing({ id: newId(), name: '', parentId: p.id, defaultNecessity: 'necessary', sortOrder: p.sortOrder + subs.length + 1, archived: false })
                        }
                      >
                        Subcategory
                      </Button>
                      <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconPencil size={12} />} onClick={() => setEditing(p)}>
                        Rename {p.name}
                      </Button>
                    </Group>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      </Card>

      <Card withBorder>
        <Text fw={600} mb={4}>
          Merchant memory
        </Text>
        <Text size="xs" c="dimmed" mb="sm">
          The app pre-fills these categories next time you log the same merchant.
        </Text>
        {merchantRules.length === 0 && (
          <Text size="sm" c="dimmed">
            None yet.
          </Text>
        )}
        <Stack gap={4}>
          {[...merchantRules]
            .sort((a, b) => a.merchantName.localeCompare(b.merchantName))
            .map((r) => (
              <Group key={r.merchantKey} justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" truncate>
                    {r.merchantName}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {categoryLabel(index, r.categoryId)} · {r.necessity}
                  </Text>
                </div>
                <ActionIcon variant="subtle" color="red" onClick={() => deleteMerchantRule(r.merchantKey)} aria-label="Forget">
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            ))}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="xs">
          <Text fw={600}>Your data</Text>
          <Button variant="light" leftSection={<IconDownload size={16} />} onClick={exportCsv} disabled={!transactions.length}>
            Export to CSV ({transactions.length} expenses)
          </Button>
          <Text size="xs" c="dimmed">
            Receipt photos are deleted automatically 60 days after upload. Your expense details are kept.
          </Text>
          {repo.kind === 'supabase' ? (
            <Button variant="subtle" color="gray" leftSection={<IconLock size={16} />} onClick={() => supabase().auth.signOut()}>
              Lock this device
            </Button>
          ) : (
            <Text size="xs" c="orange">
              Demo mode: data is only stored in this browser. Connect Supabase to share it across phones (see docs/SETUP.md).
            </Text>
          )}
        </Stack>
      </Card>

      <CategoryEditor category={editing} onClose={() => setEditing(null)} />
    </Stack>
  );
}

function CategoryEditor({ category, onClose }: { category: Category | null; onClose(): void }) {
  return (
    <Modal opened={!!category} onClose={onClose} title={category?.parentId ? 'Subcategory' : 'Category'} centered>
      {category && <CategoryForm key={category.id} category={category} onClose={onClose} />}
    </Modal>
  );
}

function CategoryForm({ category, onClose }: { category: Category; onClose(): void }) {
  const { saveCategory, index, transactions } = useStore();
  const [c, setC] = useState(category);
  const isNew = !index.byId.has(category.id);
  const inUse = transactions.some((t) => t.items.some((i) => i.categoryId === c.id));

  async function save(next = c) {
    try {
      await saveCategory({ ...next, name: next.name.trim() });
      // A new top-level category needs at least one subcategory to be usable.
      if (isNew && !next.parentId) {
        await saveCategory({ id: newId(), name: 'General', parentId: next.id, defaultNecessity: 'necessary', sortOrder: next.sortOrder + 1, archived: false });
      }
      onClose();
    } catch (error) {
      notifications.show({ color: 'red', message: String(error) });
    }
  }

  return (
    <Stack>
      <TextInput label="Name" value={c.name} onChange={(e) => setC({ ...c, name: e.currentTarget.value })} data-autofocus />
      {c.parentId && (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Default for new expenses
          </Text>
          <NecessityToggle size="sm" value={c.defaultNecessity} onChange={(n) => setC({ ...c, defaultNecessity: n })} />
        </Stack>
      )}
      {!isNew && (
        <Switch
          label="Hide this category"
          description={inUse ? 'Past expenses keep it; it just won’t be offered any more.' : undefined}
          checked={c.archived}
          onChange={(e) => setC({ ...c, archived: e.currentTarget.checked })}
        />
      )}
      <Button onClick={() => save()} disabled={!c.name.trim()}>
        Save
      </Button>
    </Stack>
  );
}
