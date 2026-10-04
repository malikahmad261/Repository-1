import { describe, expect, it } from 'vitest';
import { normaliseUrl, readSupabaseConfig } from '../../../api/_lib/supabase-config';

describe('supabase config', () => {
  it('fixes common copy-paste slips in the URL', () => {
    for (const raw of ['abcd.supabase.co', ' https://abcd.supabase.co ', 'https://abcd.supabase.co/', 'https://abcd.supabase.co/rest/v1', '"https://abcd.supabase.co"']) {
      expect(normaliseUrl(raw)).toBe('https://abcd.supabase.co');
    }
  });

  it('is demo mode when nothing is set and OK when both are valid', () => {
    expect(readSupabaseConfig({}).demo).toBe(true);
    const ok = readSupabaseConfig({ VITE_SUPABASE_URL: 'abcd.supabase.co', VITE_SUPABASE_KEY: ' sb_publishable_x ' });
    expect(ok).toMatchObject({ demo: false, problems: [], key: 'sb_publishable_x' });
  });

  it('explains swapped, missing or secret values', () => {
    const swapped = readSupabaseConfig({ VITE_SUPABASE_URL: 'sb_publishable_x', VITE_SUPABASE_KEY: 'https://abcd.supabase.co' });
    expect(swapped.problems.join(' ')).toMatch(/Swap the two values/);
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://abcd.supabase.co' }).problems[0]).toMatch(/VITE_SUPABASE_KEY is empty/);
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://abcd.supabase.co', VITE_SUPABASE_KEY: 'sb_secret_x' }).problems[0]).toMatch(/secret key/);
  });
});
