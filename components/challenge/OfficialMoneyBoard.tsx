import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { remainingFromChallenge } from '@/components/challenge/ChallengePosterCard';
import { copy } from '@/lib/copy';
import { formatWallet } from '@/lib/currency';
import { THEME } from '@/lib/theme';
import type { ChallengeWithStats } from '@/lib/types';

export function officialGuarantee(
  challenge: Pick<ChallengeWithStats, 'host_budget' | 'creator_contribution'>,
): number {
  return Math.max(Number(challenge.host_budget ?? challenge.creator_contribution) || 0, 0);
}

export function OfficialMoneyBoard({ challenge }: { challenge: ChallengeWithStats }) {
  const guarantee = officialGuarantee(challenge);
  const pot = Math.max(Number(challenge.prize_pool) || 0, 0);
  const joined = Math.max(Number(challenge.participant_count) || 0, 0);
  const remaining = remainingFromChallenge(challenge);
  const toStart = guarantee * 1.5;
  const share = remaining > 0 ? pot / remaining : 0;
  const money = (amount: number) => formatWallet(amount, challenge.currency);

  return (
    <View
      className="mt-3 gap-2"
      style={{
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: THEME.radius,
        backgroundColor: THEME.surface,
        padding: 12,
      }}>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        <Stat label={copy('board.guarantee')} value={money(guarantee)} />
        <Stat label={copy('board.pot')} value={money(pot)} />
        <Stat label={copy('board.toStart')} value={money(toStart)} />
        <Stat label={copy('board.joined')} value={String(joined)} />
        <Stat label={copy('board.remaining')} value={String(remaining)} />
        <Stat label={copy('board.yourShare')} value={money(share)} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '31%', minWidth: 88 }}>
      <AppText className="text-[9px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </AppText>
      <AppText className="mt-0.5 text-[13px] font-extrabold text-charcoal" numberOfLines={2}>
        {value}
      </AppText>
    </View>
  );
}
