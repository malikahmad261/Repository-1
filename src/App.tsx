import { AppShell, Badge, Center, Group, Loader, Text, UnstyledButton } from '@mantine/core';
import { IconChartPie, IconList, IconPlus, IconSettings } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DuplicateGuardProvider } from './components/DuplicateGuard';
import { SetupProblem } from './components/ErrorScreens';
import { supabaseConfig } from './lib/config';
import { LockScreen } from './components/LockScreen';
import { LocalRepo } from './data/localRepo';
import { StoreProvider, useStore } from './data/store';
import { supabase, supabaseConfigured, SupabaseRepo } from './data/supabaseRepo';
import { AddScreen } from './screens/AddScreen';
import { BudgetsScreen } from './screens/BudgetsScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export type Tab = 'add' | 'history' | 'budgets' | 'settings';

export function App() {
  if (supabaseConfig.problems.length) return <SetupProblem problems={supabaseConfig.problems} />;
  return <ConfiguredApp />;
}

function ConfiguredApp() {
  const configured = supabaseConfigured();
  const [session, setSession] = useState<'loading' | 'in' | 'out'>(configured ? 'loading' : 'in');

  useEffect(() => {
    if (!configured) return;
    supabase()
      .auth.getSession()
      .then(({ data }) => setSession(data.session ? 'in' : 'out'));
    const { data } = supabase().auth.onAuthStateChange((_event, s) => setSession(s ? 'in' : 'out'));
    return () => data.subscription.unsubscribe();
  }, [configured]);

  const repo = useMemo(() => (configured ? new SupabaseRepo() : new LocalRepo()), [configured]);

  if (session === 'loading') {
    return (
      <Center h="100dvh">
        <Loader />
      </Center>
    );
  }
  if (session === 'out') return <LockScreen />;

  return (
    <StoreProvider repo={repo}>
      <DuplicateGuardProvider>
        <Shell />
      </DuplicateGuardProvider>
    </StoreProvider>
  );
}

function Shell() {
  const [tab, setTab] = useState<Tab>('add');
  const { transactions, repo, pendingSync, loadError } = useStore();
  const reviewCount = transactions.filter((t) => t.status === 'needs_review').length;

  return (
    <AppShell header={{ height: 0 }} footer={{ height: 64 }} padding="md">
      <AppShell.Main pb={96}>
        {repo.kind === 'local' && (
          <Text size="xs" c="dimmed" ta="center" mb="xs">
            Demo mode: data is saved in this browser only.
          </Text>
        )}
        {(pendingSync > 0 || loadError === 'offline') && (
          <Text size="xs" c="orange" ta="center" mb="xs">
            Offline{pendingSync ? `: ${pendingSync} change${pendingSync > 1 ? 's' : ''} waiting to sync` : ''}
          </Text>
        )}
        {loadError && loadError !== 'offline' && (
          <Text size="xs" c="red" ta="center" mb="xs">
            Couldn't load data: {loadError}
          </Text>
        )}
        {tab === 'add' && <AddScreen onOpenHistory={() => setTab('history')} />}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'budgets' && <BudgetsScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </AppShell.Main>
      <AppShell.Footer className="safe-bottom">
        <Group grow h={64} gap={0}>
          <NavButton icon={<IconPlus />} label="Add" active={tab === 'add'} onClick={() => setTab('add')} />
          <NavButton
            icon={<IconList />}
            label="History"
            active={tab === 'history'}
            onClick={() => setTab('history')}
            badge={reviewCount}
          />
          <NavButton icon={<IconChartPie />} label="Budgets" active={tab === 'budgets'} onClick={() => setTab('budgets')} />
          <NavButton icon={<IconSettings />} label="Settings" active={tab === 'settings'} onClick={() => setTab('settings')} />
        </Group>
      </AppShell.Footer>
    </AppShell>
  );
}

function NavButton(props: { icon: ReactNode; label: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <UnstyledButton onClick={props.onClick} h="100%" aria-label={props.label}>
      <Center style={{ flexDirection: 'column', position: 'relative' }} c={props.active ? 'teal' : 'dimmed'}>
        {props.icon}
        <Text size="xs" fw={props.active ? 600 : 400}>
          {props.label}
        </Text>
        {!!props.badge && (
          <Badge size="xs" color="orange" circle style={{ position: 'absolute', top: -4, right: '30%' }}>
            {props.badge}
          </Badge>
        )}
      </Center>
    </UnstyledButton>
  );
}
