import { Button, Modal, Stack, Text } from '@mantine/core';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../data/store';
import { findDuplicates } from '../lib/duplicates';
import { formatDay, formatMoney } from '../lib/format';
import type { Transaction } from '../lib/types';

export type DuplicateChoice = 'save' | 'replace' | 'cancel';

type Check = (txn: Transaction) => Promise<{ choice: DuplicateChoice; duplicate?: Transaction }>;

const Ctx = createContext<Check | null>(null);

/** Asks before saving something that looks like an expense already logged. */
export function useDuplicateCheck(): Check {
  const check = useContext(Ctx);
  if (!check) throw new Error('useDuplicateCheck outside provider');
  return check;
}

export function DuplicateGuardProvider({ children }: { children: ReactNode }) {
  const { transactions } = useStore();
  const [pending, setPending] = useState<{ txn: Transaction; dup: Transaction } | null>(null);
  const resolver = useRef<(c: DuplicateChoice) => void>(undefined);

  const check: Check = useCallback(
    (txn) => {
      const dup = findDuplicates(txn, transactions)[0];
      if (!dup) return Promise.resolve({ choice: 'save' });
      setPending({ txn, dup });
      return new Promise((resolve) => {
        resolver.current = (choice) => {
          setPending(null);
          resolve({ choice, duplicate: dup });
        };
      });
    },
    [transactions],
  );

  return (
    <Ctx.Provider value={check}>
      {children}
      <Modal opened={!!pending} onClose={() => resolver.current?.('cancel')} title="Already logged?" centered>
        {pending && (
          <Stack>
            <Text size="sm">
              This looks like an expense you already have: <b>{pending.dup.merchant || 'No merchant'}</b>,{' '}
              {formatMoney(pending.dup.totalAmount)} on {formatDay(pending.dup.date)}.
            </Text>
            <Button onClick={() => resolver.current?.('replace')}>Replace the older one with this</Button>
            <Button variant="default" onClick={() => resolver.current?.('save')}>
              It's different, save both
            </Button>
            <Button variant="subtle" color="red" onClick={() => resolver.current?.('cancel')}>
              Discard this one
            </Button>
          </Stack>
        )}
      </Modal>
    </Ctx.Provider>
  );
}
