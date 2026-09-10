import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export function useOfficialOps() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['official-ops', user?.id ?? ''],
    enabled: Boolean(user?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_official_ops');
      if (error) {
        return false;
      }
      return data === true;
    },
  });
}
