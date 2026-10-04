import { Alert, Button, Center, Code, List, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Component, type ReactNode } from 'react';

/** Shown when the Supabase settings in Vercel are present but wrong. */
export function SetupProblem({ problems }: { problems: string[] }) {
  return (
    <Center mih="100dvh" p="md">
      <Stack maw={480}>
        <Title order={3}>Almost there: a setting needs fixing</Title>
        <Alert color="orange" icon={<IconAlertTriangle />}>
          <List spacing="xs" size="sm">
            {problems.map((p) => (
              <List.Item key={p}>{p}</List.Item>
            ))}
          </List>
        </Alert>
        <Text size="sm">
          In Vercel, open your project → <b>Settings → Environment Variables</b> and correct the value. Then go to{' '}
          <b>Deployments</b>, open the ⋯ menu on the latest deployment and click <b>Redeploy</b>. Changes only take
          effect after a redeploy.
        </Text>
      </Stack>
    </Center>
  );
}

/** Catches any crash so the page never goes blank, and shows what happened. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Center mih="100dvh" p="md">
        <Stack maw={480}>
          <Title order={3}>Something went wrong</Title>
          <Text size="sm">The app hit an error while starting. Try reloading. If it keeps happening, send this message to Claude:</Text>
          <Code block>{this.state.error.message}</Code>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </Stack>
      </Center>
    );
  }
}
