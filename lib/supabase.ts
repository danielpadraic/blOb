import { createClient } from '@supabase/supabase-js';

import { getRealtimeTransport } from '@/lib/realtimeTransport';
import type { Database } from '@/lib/types';
import { authStorage } from '@/lib/utils/secureStore';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (__DEV__ && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn(
    '[blOb] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('YOUR_PROJECT') &&
    supabaseAnonKey !== 'your-anon-key' &&
    supabaseAnonKey !== 'PASTE_YOUR_PUBLISHABLE_KEY_HERE',
);

export const supabase = createClient<Database>(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    realtime: getRealtimeTransport(),
  },
);
