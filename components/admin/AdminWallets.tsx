import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { MascotState } from '@/components/mascot/MascotState';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { useAdminWallets } from '@/hooks/useAdmin';
import type { AdminWalletRow } from '@/lib/admin';
import { formatCash } from '@/lib/currency';
import { THEME } from '@/lib/theme';

type WalletSort = 'coins' | 'bucks';

function coinLabel(amount: number): string {
  return Number(amount).toFixed(2);
}

export function AdminWallets() {
  const router = useRouter();
  const wallets = useAdminWallets(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<WalletSort>('coins');

  const rows = useMemo(() => {
    const needle = query.trim().replace(/^@/, '').toLowerCase();
    const list = [...(wallets.data ?? [])];
    const filtered = needle
      ? list.filter((row) => (row.username ?? '').toLowerCase().includes(needle))
      : list;
    filtered.sort((a, b) => {
      const delta = sort === 'bucks' ? b.bucks - a.bucks : b.coins - a.coins;
      if (delta !== 0) {
        return delta;
      }
      return (a.username ?? '').localeCompare(b.username ?? '', undefined, { sensitivity: 'base' });
    });
    return filtered;
  }, [query, sort, wallets.data]);

  function openProfile(row: AdminWalletRow) {
    if (!row.username) {
      return;
    }
    router.push({
      pathname: '/profile/u/[username]',
      params: { username: row.username },
    });
  }

  return (
    <View className="gap-3">
      <AppText className="text-[18px] font-extrabold text-charcoal">Wallets</AppText>
      <AppText className="text-[13px] text-muted">Live balances. Same numbers as the header wallet.</AppText>
      <Input
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Search username"
        accessibilityLabel="Search username"
      />
      <View
        className="flex-row p-1"
        accessibilityRole="tablist"
        accessibilityLabel="Sort wallets"
        style={{
          backgroundColor: THEME.border,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: THEME.border,
        }}>
        <SortChip
          selected={sort === 'coins'}
          accessibilityLabel="Sort by coin balance"
          onPress={() => setSort('coins')}>
          <CurrencyMark currency="coins" size={16} />
        </SortChip>
        <SortChip
          selected={sort === 'bucks'}
          accessibilityLabel="Sort by cash"
          onPress={() => setSort('bucks')}>
          <AppText
            className="text-[14px] font-extrabold"
            style={{ color: sort === 'bucks' ? THEME.primaryForeground : '#1B7A4A' }}>
            $
          </AppText>
        </SortChip>
      </View>

      {wallets.isLoading && !wallets.data ? (
        <MascotState kind="loading" title="Loading wallets…" compact />
      ) : wallets.error ? (
        <MascotState
          kind="error"
          title="Couldn’t load wallets"
          body="Try again in a moment."
          actionLabel="Retry"
          onAction={() => void wallets.refetch()}
          compact
        />
      ) : rows.length === 0 ? (
        <MascotState kind="empty" title="No wallets match" compact />
      ) : (
        rows.map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={`@${row.username ?? 'profile'}`}
            onPress={() => openProfile(row)}
            disabled={!row.username}>
            <Card>
              <View className="flex-row items-center justify-between gap-3">
                <View className="min-w-0 flex-1">
                  <AppText className="text-[15px] font-bold text-charcoal" numberOfLines={1}>
                    {row.display_name?.trim() || row.username || '—'}
                  </AppText>
                  <AppText className="mt-0.5 text-[13px] text-muted" numberOfLines={1}>
                    {row.username ? `@${row.username}` : '—'}
                  </AppText>
                </View>
                <View className="items-end gap-1">
                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    <CurrencyMark currency="coins" size={16} />
                    <AppText className="text-[14px] font-extrabold text-charcoal">
                      {coinLabel(row.coins)}
                    </AppText>
                  </View>
                  <AppText className="text-[14px] font-extrabold" style={{ color: '#1B7A4A' }}>
                    {formatCash(row.bucks)}
                  </AppText>
                </View>
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </View>
  );
}

function SortChip({
  selected,
  accessibilityLabel,
  onPress,
  children,
}: {
  selected: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="min-h-[44px] flex-1 items-center justify-center"
      style={{
        backgroundColor: selected ? THEME.primary : 'transparent',
        borderRadius: 999,
      }}>
      {children}
    </Pressable>
  );
}
