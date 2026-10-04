import { useCallback } from 'react';
import { useStore } from '../data/store';
import type { Transaction } from '../lib/types';
import { useDuplicateCheck } from './DuplicateGuard';

interface Options {
  receipt?: Blob;
  rememberMerchant?: boolean;
  skipDuplicateCheck?: boolean;
}

/** Saves a transaction after the duplicate check. Resolves false if the user discarded it. */
export function useSaveFlow() {
  const { saveTransaction, deleteTransaction } = useStore();
  const checkDuplicate = useDuplicateCheck();

  return useCallback(
    async (txn: Transaction, opts: Options = {}): Promise<boolean> => {
      let toSave = txn;
      if (!opts.skipDuplicateCheck) {
        const { choice, duplicate } = await checkDuplicate(txn);
        if (choice === 'cancel') return false;
        if (choice === 'replace' && duplicate) {
          // Keep the older entry's receipt photo if this one has none.
          const keepReceipt = !opts.receipt && !!duplicate.receiptPath;
          if (keepReceipt) {
            toSave = { ...toSave, receiptPath: duplicate.receiptPath, receiptUploadedAt: duplicate.receiptUploadedAt };
          }
          await deleteTransaction(duplicate.id, { keepReceipt });
        }
      }
      await saveTransaction(toSave, { receipt: opts.receipt, rememberMerchant: opts.rememberMerchant });
      return true;
    },
    [saveTransaction, deleteTransaction, checkDuplicate],
  );
}
