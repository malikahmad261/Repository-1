import { Button, Center, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { useState } from 'react';
import { HOUSEHOLD_EMAIL, supabase } from '../data/supabaseRepo';

/** One shared household passcode instead of user accounts. */
export function LockScreen() {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.signInWithPassword({ email: HOUSEHOLD_EMAIL, password: passcode });
    setBusy(false);
    if (error) setError(error.message === 'Invalid login credentials' ? 'Wrong passcode.' : error.message);
  }

  return (
    <Center h="100dvh" p="md">
      <form onSubmit={unlock} style={{ width: '100%', maxWidth: 360 }}>
        <Stack>
          <Center>
            <IconLock size={48} stroke={1.5} />
          </Center>
          <Title order={2} ta="center">
            Household Expenses
          </Title>
          <Text c="dimmed" ta="center" size="sm">
            Enter the household passcode. You'll only need to do this once on this device.
          </Text>
          <PasswordInput
            size="lg"
            placeholder="Passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.currentTarget.value)}
            error={error}
            autoFocus
          />
          <Button type="submit" size="lg" loading={busy} disabled={!passcode}>
            Unlock
          </Button>
        </Stack>
      </form>
    </Center>
  );
}
