import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { reportBadgeActivity } from '@/lib/badgeActivity';
import {
  fetchCoinRecipientSuggestions,
  searchCoinRecipients,
  transferFunds,
} from '@/lib/coins';
import type { CoinTransfer, PublicProfile, WalletCurrency } from '@/lib/types';

export function useTransferCoins() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      recipientId: string;
      amount: number;
      currency?: WalletCurrency;
    }): Promise<CoinTransfer> => {
      return transferFunds(input.recipientId, input.amount, input.currency ?? 'coins');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: ['coin-recipient-suggestions'] });
      void reportBadgeActivity();
    },
  });
}

export function useCoinRecipientSearch(query: string) {
  const { user } = useAuth();
  const term = query.trim();

  return useQuery({
    queryKey: ['coin-recipient-search', user?.id, term],
    enabled: Boolean(user?.id && term.length >= 2),
    queryFn: (): Promise<PublicProfile[]> => searchCoinRecipients(term, user!.id),
  });
}

export function useCoinRecipientSuggestions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['coin-recipient-suggestions', user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchCoinRecipientSuggestions(user!.id),
  });
}
