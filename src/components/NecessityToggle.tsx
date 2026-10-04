import { SegmentedControl } from '@mantine/core';
import type { Necessity } from '../lib/types';

export function NecessityToggle({ value, onChange, size = 'xs' }: { value: Necessity; onChange(n: Necessity): void; size?: string }) {
  return (
    <SegmentedControl
      size={size}
      value={value}
      onChange={(v) => onChange(v as Necessity)}
      color={value === 'necessary' ? 'teal' : 'grape'}
      data={[
        { value: 'necessary', label: 'Necessary' },
        { value: 'discretionary', label: 'Discretionary' },
      ]}
    />
  );
}
