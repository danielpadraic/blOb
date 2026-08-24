import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const anon =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(url && anon && !url.includes('placeholder'));

export const supabase: SupabaseClient = createClient(
  url || 'https://placeholder.supabase.co',
  anon || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
