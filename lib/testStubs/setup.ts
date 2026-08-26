import { vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from() {
      return this;
    },
    auth: {},
    realtime: {},
  }),
}));
