/**
 * Reads and tidies the Supabase settings baked in at build time, so small
 * copy-paste slips (spaces, missing https://, a trailing /rest/v1) still work.
 */
export interface SupabaseConfig {
  url: string;
  key: string;
  /** Plain-language problems; empty when the config is usable. */
  problems: string[];
  /** True when neither value is set: the app runs in local demo mode. */
  demo: boolean;
}

export function normaliseUrl(raw: string): string {
  let url = raw.trim().replace(/^["']|["']$/g, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '');
}

export function readSupabaseConfig(env: { VITE_SUPABASE_URL?: string; VITE_SUPABASE_KEY?: string }): SupabaseConfig {
  const url = normaliseUrl(env.VITE_SUPABASE_URL ?? '');
  const key = (env.VITE_SUPABASE_KEY ?? '').trim().replace(/^["']|["']$/g, '');
  const problems: string[] = [];
  if (!url && !key) return { url, key, problems, demo: true };

  if (!url) problems.push('VITE_SUPABASE_URL is empty. Paste your Supabase Project URL (https://xxxx.supabase.co).');
  else {
    try {
      const host = new URL(url).hostname;
      if (url.startsWith('https://sb_') || url.includes('eyJ')) {
        problems.push('VITE_SUPABASE_URL contains a key, not a web address. Swap the two values.');
      } else if (!host.includes('.')) {
        problems.push('VITE_SUPABASE_URL should look like https://xxxx.supabase.co.');
      }
    } catch {
      problems.push('VITE_SUPABASE_URL is not a valid web address. It should look like https://xxxx.supabase.co.');
    }
  }
  if (!key) problems.push('VITE_SUPABASE_KEY is empty. Paste your Supabase publishable (or anon) key.');
  else if (key.startsWith('sb_secret_')) {
    problems.push('VITE_SUPABASE_KEY is the secret key. Use the publishable key instead, and keep the secret key private.');
  } else if (/^https?:\/\//.test(key) || key.includes('supabase.co')) {
    problems.push('VITE_SUPABASE_KEY contains a web address, not a key. Swap the two values.');
  }
  return { url, key, problems, demo: false };
}
