import {
  ActionIcon,
  Alert,
  Anchor,
  Autocomplete,
  Button,
  Card,
  Checkbox,
  Chip,
  Divider,
  Group,
  Image,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconQuestionMark, IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { categoryLabel } from '../lib/categories';
import { itemsTotal, type Draft, type DraftFlags } from '../lib/draft';
import { formatMoney, newId, round2, today } from '../lib/format';
import { UNCATEGORISED_ID } from '../lib/seed';
import { PAYMENT_METHODS, type LineItem, type Transaction } from '../lib/types';
import { CategoryChips } from './CategoryChips';
import { CategoryPicker } from './CategoryPicker';
import { useSaveFlow } from './useSaveFlow';
import { NecessityToggle } from './NecessityToggle';

interface Props {
  draft: Draft | null;
  /** True when editing an existing expense rather than a new one. */
  existing?: boolean;
  title?: string;
  onClose(): void;
  onSaved?(): void;
}

export function ExpenseEditor({ draft, existing, title, onClose, onSaved }: Props) {
  return (
    <Modal
      opened={!!draft}
      onClose={onClose}
      title={title ?? (existing ? 'Edit expense' : 'Check and save')}
      fullScreen
      radius={0}
      transitionProps={{ transition: 'slide-up', duration: 150 }}
    >
      {draft && <EditorBody key={draft.txn.id} draft={draft} existing={existing} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function EditorBody({ draft, existing, onClose, onSaved }: Omit<Props, 'title'> & { draft: Draft }) {
  const { index, transactions, ruleForMerchant, repo, deleteTransaction } = useStore();
  const saveFlow = useSaveFlow();
  const [txn, setTxn] = useState<Transaction>(draft.txn);
  const [flags, setFlags] = useState<DraftFlags>(draft.flags);
  const [remember, setRemember] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(draft.receipt?.previewUrl ?? null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!draft.receipt && txn.receiptPath) repo.receiptUrl(txn.receiptPath).then(setReceiptUrl);
  }, [draft.receipt, txn.receiptPath, repo]);

  const merchants = useMemo(
    () => [...new Set(transactions.map((t) => t.merchant.trim()).filter(Boolean))].slice(0, 200),
    [transactions],
  );

  const single = txn.items.length === 1;
  const sum = itemsTotal(txn.items);
  const diff = round2(txn.totalAmount - sum);

  const set = (patch: Partial<Transaction>) => setTxn((t) => ({ ...t, ...patch }));

  function setItem(id: string, patch: Partial<LineItem>) {
    setTxn((t) => {
      const items = t.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
      // With a single item, the item amount is the total.
      const totalAmount = items.length === 1 && patch.amount !== undefined ? patch.amount : t.totalAmount;
      return { ...t, items, totalAmount };
    });
  }

  function setTotal(amount: number) {
    setTxn((t) => ({ ...t, totalAmount: amount, items: t.items.length === 1 ? [{ ...t.items[0], amount }] : t.items }));
    setFlags((f) => ({ ...f, totalMissing: false }));
  }

  function pickCategory(itemId: string, categoryId: string) {
    const c = index.byId.get(categoryId);
    setItem(itemId, { categoryId, ...(c ? { necessity: c.defaultNecessity } : {}) });
    setFlags((f) => ({ ...f, items: { ...f.items, [itemId]: { ...f.items[itemId], categoryUncertain: false } } }));
  }

  function answerNecessity(itemId: string, necessity: LineItem['necessity']) {
    setItem(itemId, { necessity });
    setFlags((f) => ({ ...f, items: { ...f.items, [itemId]: { ...f.items[itemId], necessityUncertain: false } } }));
  }

  function addItem(amount = 0, description = '') {
    // New items (and tax/charges) default to the category of the biggest item.
    const biggest = [...txn.items].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
    const lastCat = biggest?.categoryId ?? UNCATEGORISED_ID;
    const c = index.byId.get(lastCat);
    setTxn((t) => ({
      ...t,
      items: [
        ...t.items,
        { id: newId(), description, amount, categoryId: lastCat, necessity: c?.defaultNecessity ?? 'necessary', quantity: null },
      ],
    }));
  }

  function removeItem(id: string) {
    setTxn((t) => {
      const items = t.items.filter((i) => i.id !== id);
      return { ...t, items, totalAmount: items.length === 1 ? items[0].amount : t.totalAmount };
    });
  }

  /** Spreads the difference across items in proportion to their amounts. */
  function spreadDifference() {
    setTxn((t) => {
      const base = itemsTotal(t.items);
      if (base === 0) return t;
      let left = round2(t.totalAmount - base);
      const items = t.items.map((i, n) => {
        const share = n === t.items.length - 1 ? left : round2(((t.totalAmount - base) * i.amount) / base);
        left = round2(left - share);
        return { ...i, amount: round2(i.amount + share) };
      });
      return { ...t, items };
    });
  }

  // ---- Questions for missing or uncertain information ----
  const questions: { key: string; text: string; body: React.ReactNode }[] = [];
  if (flags.totalMissing) {
    questions.push({
      key: 'total',
      text: 'How much was it?',
      body: (
        <NumberInput
          placeholder="Amount"
          prefix="Rs "
          thousandSeparator=","
          inputMode="decimal"
          onBlur={(e) => {
            const n = Number(e.currentTarget.value.replace(/[^\d.]/g, ''));
            if (n) setTotal(n);
          }}
        />
      ),
    });
  }
  if (flags.dateMissing) {
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    questions.push({
      key: 'date',
      text: 'No date found. When was this?',
      body: (
        <Group gap={6}>
          {[
            ['Today', today()],
            ['Yesterday', yesterday],
          ].map(([label, d]) => (
            <Chip
              key={d}
              checked={false}
              onChange={() => {
                set({ date: d });
                setFlags((f) => ({ ...f, dateMissing: false }));
              }}
            >
              {label}
            </Chip>
          ))}
          <Chip checked={false} onChange={() => setFlags((f) => ({ ...f, dateMissing: false }))} variant="outline">
            Other (set below)
          </Chip>
        </Group>
      ),
    });
  }
  for (const item of txn.items) {
    const f = flags.items[item.id];
    if (!f) continue;
    const name = item.description || txn.merchant || 'this expense';
    if (f.categoryUncertain) {
      questions.push({
        key: `cat-${item.id}`,
        text: `Which category is “${name}”${single ? '' : ` (${formatMoney(item.amount)})`}?`,
        body: (
          <CategoryChips
            value={null}
            onChange={(id) => pickCategory(item.id, id)}
            suggestions={[...new Set([item.categoryId, ...f.alternatives])].filter((id) => id !== UNCATEGORISED_ID)}
          />
        ),
      });
    }
    if (f.necessityUncertain && !f.categoryUncertain) {
      questions.push({
        key: `nec-${item.id}`,
        text: `Was “${name}” a necessity or a treat?`,
        body: (
          <Group gap={6}>
            <Chip checked={false} color="teal" onChange={() => answerNecessity(item.id, 'necessary')}>
              Necessary
            </Chip>
            <Chip checked={false} color="grape" onChange={() => answerNecessity(item.id, 'discretionary')}>
              Discretionary
            </Chip>
          </Group>
        ),
      });
    }
  }
  if (!single && Math.abs(diff) >= 1 && txn.totalAmount !== 0) {
    questions.push({
      key: 'diff',
      text: `Items add up to ${formatMoney(sum)} but the total is ${formatMoney(txn.totalAmount)}. What's the ${formatMoney(Math.abs(diff))} difference?`,
      body: (
        <Group gap={6}>
          <Chip checked={false} onChange={() => addItem(diff, diff > 0 ? 'Tax & charges' : 'Discount')}>
            Add as {diff > 0 ? '“Tax & charges”' : '“Discount”'}
          </Chip>
          <Chip checked={false} onChange={spreadDifference}>
            Spread across items
          </Chip>
          <Chip checked={false} onChange={() => set({ totalAmount: sum })}>
            Total is {formatMoney(sum)}
          </Chip>
        </Group>
      ),
    });
  }

  const canRemember = single && !!txn.merchant.trim() && !ruleForMerchant(txn.merchant);

  async function save() {
    if (!txn.totalAmount && !sum) {
      notifications.show({ color: 'red', message: 'Enter an amount first.' });
      return;
    }
    let final: Transaction = { ...txn, merchant: txn.merchant.trim(), status: questions.length ? 'needs_review' : 'confirmed' };
    if (!single && Math.abs(diff) >= 1) {
      // Keep budgets consistent with the total until the difference is sorted out.
      final = {
        ...final,
        status: 'needs_review',
        items: [
          ...final.items,
          { id: newId(), description: 'Unallocated difference', amount: diff, categoryId: UNCATEGORISED_ID, necessity: 'discretionary', quantity: null },
        ],
      };
    }
    setSaving(true);
    try {
      const saved = await saveFlow(final, { receipt: draft.receipt?.blob, rememberMerchant: remember, skipDuplicateCheck: existing });
      if (saved) {
        if (final.status === 'needs_review') notifications.show({ message: 'Saved. It’s in “Needs review” for later.' });
        onSaved?.();
        onClose();
      }
    } catch (error) {
      notifications.show({ color: 'red', title: "Couldn't save", message: String(error) });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this expense?')) return;
    await deleteTransaction(txn.id);
    onClose();
  }

  return (
    <Stack gap="md" pb={80}>
      {questions.length > 0 && (
        <Alert color="yellow" icon={<IconQuestionMark />} title={`${questions.length} thing${questions.length > 1 ? 's' : ''} to check`}>
          <Stack gap="md">
            {questions.map((q) => (
              <Stack key={q.key} gap={6}>
                <Text size="sm" fw={500}>
                  {q.text}
                </Text>
                {q.body}
              </Stack>
            ))}
            <Text size="xs" c="dimmed">
              You can save now and answer these later.
            </Text>
          </Stack>
        </Alert>
      )}

      <NumberInput
        label="Total"
        className="amount-input"
        prefix="Rs "
        thousandSeparator=","
        inputMode="decimal"
        decimalScale={2}
        value={txn.totalAmount || ''}
        onChange={(v) => setTotal(Number(v) || 0)}
        allowNegative
      />

      <Group grow align="flex-start">
        <Autocomplete label="Merchant" placeholder="e.g. Imtiaz" data={merchants} value={txn.merchant} onChange={(merchant) => set({ merchant })} limit={6} />
        <TextInput label="Date" type="date" value={txn.date} onChange={(e) => set({ date: e.currentTarget.value || today() })} />
      </Group>

      <Divider label={single ? 'Category' : `Items (${txn.items.length})`} labelPosition="left" />

      {single ? (
        <Stack gap="xs">
          <CategoryChips value={txn.items[0].categoryId} onChange={(id) => pickCategory(txn.items[0].id, id)} />
          <Text size="sm" c="dimmed">
            {categoryLabel(index, txn.items[0].categoryId)}
          </Text>
          <NecessityToggle value={txn.items[0].necessity} onChange={(n) => answerNecessity(txn.items[0].id, n)} />
        </Stack>
      ) : (
        <Stack gap="xs">
          {txn.items.map((item) => (
            <Card key={item.id} withBorder padding="sm">
              <Stack gap={8}>
                <Group gap="xs" wrap="nowrap" align="flex-end">
                  <TextInput
                    style={{ flex: 1 }}
                    size="xs"
                    label="Item"
                    placeholder="What was it?"
                    value={item.description}
                    onChange={(e) => setItem(item.id, { description: e.currentTarget.value })}
                  />
                  <NumberInput
                    w={120}
                    size="xs"
                    label="Amount"
                    prefix="Rs "
                    thousandSeparator=","
                    inputMode="decimal"
                    value={item.amount || ''}
                    onChange={(v) => setItem(item.id, { amount: Number(v) || 0 })}
                    allowNegative
                  />
                  <ActionIcon variant="subtle" color="red" onClick={() => removeItem(item.id)} aria-label="Remove item" mb={2}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
                <UnstyledButton onClick={() => setPickerFor(item.id)}>
                  <Text size="sm" c={flags.items[item.id]?.categoryUncertain ? 'orange' : 'teal'} td="underline">
                    {categoryLabel(index, item.categoryId)}
                  </Text>
                </UnstyledButton>
                <NecessityToggle value={item.necessity} onChange={(n) => answerNecessity(item.id, n)} />
              </Stack>
            </Card>
          ))}
          <Text size="xs" c={Math.abs(diff) >= 1 ? 'orange' : 'dimmed'}>
            Items total {formatMoney(sum)}
            {Math.abs(diff) >= 1 ? ` · ${formatMoney(Math.abs(diff))} ${diff > 0 ? 'unallocated' : 'over the total'}` : ''}
          </Text>
        </Stack>
      )}
      <Button
        variant="light"
        leftSection={<IconPlus size={16} />}
        onClick={() => {
          if (single && !txn.items[0].description) setItem(txn.items[0].id, { description: txn.merchant || 'Item 1' });
          addItem();
        }}
      >
        {single ? 'Split into items' : 'Add item'}
      </Button>

      <Select
        label="Paid with"
        placeholder="Optional"
        data={[...PAYMENT_METHODS]}
        value={txn.paymentMethod || null}
        onChange={(v) => set({ paymentMethod: v ?? '' })}
        clearable
      />
      <Textarea label="Notes" autosize minRows={1} value={txn.notes} onChange={(e) => set({ notes: e.currentTarget.value })} />

      {canRemember && (
        <Checkbox
          checked={remember}
          onChange={(e) => setRemember(e.currentTarget.checked)}
          label={`Always use this category for “${txn.merchant.trim()}”`}
        />
      )}

      {receiptUrl && <Image src={receiptUrl} alt="Receipt" radius="md" mah={320} fit="contain" />}
      {!receiptUrl && txn.receiptPath && (
        <Text size="xs" c="dimmed">
          Loading receipt…
        </Text>
      )}
      {txn.rawInput && (
        <Anchor size="xs" onClick={() => setShowRaw((s) => !s)}>
          {showRaw ? 'Hide' : 'Show'} original text
        </Anchor>
      )}
      {showRaw && (
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
          {txn.rawInput}
        </Text>
      )}

      {existing && (
        <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={remove}>
          Delete expense
        </Button>
      )}

      <Group
        grow
        p="md"
        className="safe-bottom"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'var(--mantine-color-body)',
          borderTop: '1px solid var(--mantine-color-default-border)',
          zIndex: 10,
        }}
      >
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} loading={saving}>
          {questions.length ? 'Save, check later' : 'Save'}
        </Button>
      </Group>

      <CategoryPicker
        opened={!!pickerFor}
        onClose={() => setPickerFor(null)}
        onPick={(id) => pickerFor && pickCategory(pickerFor, id)}
        value={txn.items.find((i) => i.id === pickerFor)?.categoryId}
      />
    </Stack>
  );
}
