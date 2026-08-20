import { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import { formatCash } from '@/lib/currency';
import { isOfficialAccount } from '@/lib/official';
import { THEME, themeShadow } from '@/lib/theme';
import type { Profile } from '@/lib/types';

type WalletBalancesProps = {
  profile: Pick<Profile, 'coins' | 'bucks' | 'credits' | 'is_official'>;
};

export function WalletBalances({ profile }: WalletBalancesProps) {
  const official = isOfficialAccount(profile);
  const coins = Number(profile.coins ?? profile.credits ?? 0);
  const bucks = Number(profile.bucks ?? 0);

  return (
    <View className="flex-row gap-2">
      <Tile>
        <CurrencyMark currency="coins" size={22} />
        <AppText className="ml-1.5 text-[15px] font-extrabold text-charcoal">
          {official ? copy('official.infinity') : Number(coins).toFixed(2)}
        </AppText>
      </Tile>
      <Tile>
        <CurrencyMark currency="bucks" size={22} />
        <AppText className="ml-1.5 text-[15px] font-extrabold" style={{ color: '#1B7A4A' }}>
          {formatCash(bucks)}
        </AppText>
      </Tile>
    </View>
  );
}

export function SendWalletButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Send"
      onPress={onPress}
      className="w-full flex-row items-center justify-center"
      style={{
        minHeight: 48,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: THEME.border,
        backgroundColor: THEME.surface,
        gap: 8,
      }}>
      <AppText className="text-[16px] font-semibold text-charcoal">Send</AppText>
      <CurrencyMark currency="coins" size={18} />
      <AppText className="text-[16px] font-semibold text-muted">or</AppText>
      <CurrencyMark currency="bucks" size={18} />
    </Pressable>
  );
}

function Tile({ children }: { children: ReactNode }) {
  return (
    <View
      className="flex-1 flex-row items-center justify-center px-3 py-3"
      style={{
        backgroundColor: THEME.surface,
        borderColor: THEME.border,
        borderWidth: 1,
        borderRadius: THEME.radius,
        ...themeShadow('card'),
      }}>
      {children}
    </View>
  );
}
