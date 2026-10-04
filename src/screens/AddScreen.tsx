import {
  Anchor,
  Button,
  Card,
  Collapse,
  Divider,
  FileButton,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCamera, IconChevronDown, IconSparkles } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BudgetBars } from '../components/BudgetBars';
import { CategoryChips } from '../components/CategoryChips';
import { ExpenseEditor } from '../components/ExpenseEditor';
import { TransactionRow } from '../components/TransactionRow';
import { useSaveFlow } from '../components/useSaveFlow';
import { useStore } from '../data/store';
import { budgetStatuses } from '../lib/budgets';
import { categoryLabel } from '../lib/categories';
import { buildParseRequest, emptyTransaction, NO_FLAGS, requestParse, toDraft, type Draft } from '../lib/draft';
import { currentPeriod, formatMoney, newId, periodOf, today } from '../lib/format';
import { prepareImage } from '../lib/image';
import { PAYMENT_METHODS, type Source } from '../lib/types';

export function AddScreen({ onOpenHistory }: { onOpenHistory(): void }) {
  const store = useStore();
  const { index, transactions, budgets } = store;
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);

  const period = currentPeriod();
  const monthTotal = useMemo(
    () => transactions.filter((t) => periodOf(t.date) === period).reduce((s, t) => s + t.totalAmount, 0),
    [transactions, period],
  );
  const statuses = useMemo(() => budgetStatuses(budgets, transactions, period, index), [budgets, transactions, period, index]);

  return (
    <Stack gap="lg" maw={560} mx="auto">
      <Group justify="space-between" align="baseline">
        <Title order={3}>Add expense</Title>
        <Text size="sm" c="dimmed">
          This month: <b>{formatMoney(monthTotal)}</b>
        </Text>
      </Group>

      <QuickAdd onSplit={(d) => setEditing(d)} />

      <SmartInput onDrafts={(ds) => setDrafts(ds)} />

      {statuses.length > 0 && (
        <Card withBorder>
          <Text fw={600} mb="sm">
            Budgets
          </Text>
          <BudgetBars statuses={statuses} />
        </Card>
      )}

      <div>
        <Group justify="space-between" mb={4}>
          <Text fw={600}>Recent</Text>
          <Anchor size="sm" onClick={onOpenHistory}>
            See all
          </Anchor>
        </Group>
        {transactions.length === 0 && (
          <Text size="sm" c="dimmed">
            Nothing yet. Your expenses will show up here.
          </Text>
        )}
        {transactions.slice(0, 5).map((t) => (
          <TransactionRow key={t.id} txn={t} onClick={() => setEditing({ txn: t, flags: NO_FLAGS })} />
        ))}
      </div>

      {/* AI drafts are reviewed one at a time. */}
      <ExpenseEditor
        draft={drafts[0] ?? null}
        title={drafts.length > 1 ? `Check and save (1 of ${drafts.length})` : undefined}
        onClose={() => setDrafts((d) => d.slice(1))}
      />
      <ExpenseEditor
        draft={editing}
        existing={!!editing && transactions.some((t) => t.id === editing.txn.id)}
        onClose={() => setEditing(null)}
      />
    </Stack>
  );
}

/** Amount → category chip → Save. Works offline. */
function QuickAdd({ onSplit }: { onSplit(d: Draft): void }) {
  const { index, ruleForMerchant, transactions } = useStore();
  const saveFlow = useSaveFlow();
  const [amount, setAmount] = useState<number | ''>('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [details, setDetails] = useState(false);
  const [saving, setSaving] = useState(false);

  // Merchant memory: pre-select the category used last time.
  useEffect(() => {
    if (categoryTouched || !merchant) return;
    const rule = ruleForMerchant(merchant);
    if (rule) setCategoryId(rule.categoryId);
  }, [merchant, categoryTouched, ruleForMerchant]);

  const merchants = useMemo(
    () => [...new Set(transactions.map((t) => t.merchant.trim()).filter(Boolean))].slice(0, 200),
    [transactions],
  );

  function build() {
    const txn = emptyTransaction('manual');
    const c = categoryId ? index.byId.get(categoryId) : undefined;
    const value = Number(amount) || 0;
    txn.date = date;
    txn.merchant = merchant.trim();
    txn.totalAmount = value;
    txn.paymentMethod = paymentMethod ?? '';
    txn.notes = notes;
    txn.items = [
      {
        id: newId(),
        description: '',
        amount: value,
        categoryId: categoryId ?? 'other.uncategorised',
        necessity: c?.defaultNecessity ?? 'discretionary',
        quantity: null,
      },
    ];
    return txn;
  }

  function reset() {
    setAmount('');
    setCategoryId(null);
    setCategoryTouched(false);
    setMerchant('');
    setNotes('');
    setDate(today());
    setPaymentMethod(null);
  }

  async function save() {
    if (!amount || !categoryId) return;
    setSaving(true);
    try {
      const txn = build();
      // Merchant memory: the latest category chosen for a merchant wins.
      const saved = await saveFlow(txn, { rememberMerchant: !!txn.merchant });
      if (saved) {
        notifications.show({ color: 'teal', message: `Saved ${formatMoney(txn.totalAmount)} · ${categoryLabel(index, categoryId)}` });
        reset();
      }
    } catch (error) {
      notifications.show({ color: 'red', title: "Couldn't save", message: String(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card withBorder>
      <Stack gap="sm">
        <NumberInput
          className="amount-input"
          placeholder="Rs 0"
          prefix="Rs "
          thousandSeparator=","
          inputMode="decimal"
          decimalScale={2}
          hideControls
          value={amount}
          onChange={(v) => setAmount(v === '' ? '' : Number(v))}
          aria-label="Amount"
        />
        <CategoryChips
          value={categoryId}
          onChange={(id) => {
            setCategoryId(id);
            setCategoryTouched(true);
          }}
        />
        <Anchor size="xs" onClick={() => setDetails((d) => !d)}>
          <Group gap={4}>
            Merchant, date, notes <IconChevronDown size={12} />
          </Group>
        </Anchor>
        <Collapse in={details}>
          <Stack gap="xs">
            <TextInput
              placeholder="Merchant (optional)"
              value={merchant}
              onChange={(e) => setMerchant(e.currentTarget.value)}
              list="merchant-suggestions"
            />
            <datalist id="merchant-suggestions">
              {merchants.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <Group grow>
              <TextInput type="date" value={date} onChange={(e) => setDate(e.currentTarget.value || today())} />
              <Select placeholder="Paid with" data={[...PAYMENT_METHODS]} value={paymentMethod} onChange={setPaymentMethod} clearable />
            </Group>
            <TextInput placeholder="Note (optional)" value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
          </Stack>
        </Collapse>
        <Group grow>
          <Button
            variant="default"
            disabled={!amount}
            onClick={() => {
              const txn = build();
              txn.items[0].description = txn.merchant || 'Item 1';
              onSplit({ txn, flags: NO_FLAGS });
              reset();
            }}
          >
            Split into items
          </Button>
          <Button onClick={save} loading={saving} disabled={!amount || !categoryId}>
            Save
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

/** Paste text or snap a receipt; Claude turns it into draft expenses. */
function SmartInput({ onDrafts }: { onDrafts(drafts: Draft[]): void }) {
  const { index, merchantRules, transactions, ruleForMerchant, repo } = useStore();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const autoRan = useRef(false);

  async function run(input: { text?: string; file?: File }) {
    setMessage(null);
    setBusy(input.file ? 'Reading receipt…' : 'Reading…');
    try {
      const image = input.file ? await prepareImage(input.file) : undefined;
      const req = buildParseRequest(
        { text: input.text, image: image && { mediaType: image.mediaType, data: image.base64 } },
        index,
        merchantRules,
        transactions,
      );
      const result = await requestParse(req, await repo.accessToken());
      if (!result.transactions.length) {
        setMessage(result.message || "Couldn't find an expense in that. Try adding it manually.");
        return;
      }
      const source: Source = input.file ? 'photo' : 'text';
      const drafts = result.transactions.map((p) => {
        const d = toDraft(p, index, ruleForMerchant, source, input.text ?? '');
        return image ? { ...d, receipt: { blob: image.blob, previewUrl: image.previewUrl } } : d;
      });
      onDrafts(drafts);
      setText('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  // Android "Share to app": /?text=...
  useEffect(() => {
    if (autoRan.current) return;
    const params = new URLSearchParams(window.location.search);
    const shared = [params.get('title'), params.get('text'), params.get('url')].filter(Boolean).join('\n');
    if (!shared) return;
    autoRan.current = true;
    window.history.replaceState(null, '', '/');
    setText(shared);
    void run({ text: shared });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Divider label="or let AI read it" labelPosition="center" />
        <Textarea
          placeholder={'Paste a bank SMS, receipt email or a quick note\ne.g. "imtiaz 4,350 — atta 1800, oil 1200, chips 450, cold drinks 900"'}
          autosize
          minRows={2}
          maxRows={8}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          disabled={!!busy}
        />
        <Group grow>
          <FileButton onChange={(f) => f && run({ file: f })} accept="image/*">
            {(props) => (
              <Button {...props} variant="light" leftSection={<IconCamera size={18} />} disabled={!!busy}>
                Photo / screenshot
              </Button>
            )}
          </FileButton>
          <Button leftSection={<IconSparkles size={18} />} onClick={() => run({ text })} disabled={!text.trim() || !!busy}>
            Read text
          </Button>
        </Group>
        {busy && (
          <Group gap="xs" justify="center">
            <Loader size="xs" />
            <Text size="sm" c="dimmed">
              {busy}
            </Text>
          </Group>
        )}
        {message && (
          <Text size="sm" c="orange">
            {message}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
