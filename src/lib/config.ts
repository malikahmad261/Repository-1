import { readSupabaseConfig } from '../../api/_lib/supabase-config';

export type { SupabaseConfig } from '../../api/_lib/supabase-config';

export const supabaseConfig = readSupabaseConfig(import.meta.env);
