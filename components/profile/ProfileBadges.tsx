import { ScrollView, View } from 'react-native';

import { Glyph } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { badgeGlyph, badgeTone, type BadgeWithProgress } from '@/lib/badges';
import { BADGE_TONE } from '@/lib/profileBadges';
import { THEME } from '@/lib/theme';
import { formatCoins } from '@/utils/format';

type ProfileBadgesProps = {
  badges: BadgeWithProgress[];
};

export function ProfileBadges({ badges }: ProfileBadgesProps) {
  const earned = badges.filter((badge) => badge.earned);
  const locked = badges.filter((badge) => !badge.earned);
  const previewLocked = locked.slice(0, 3);
  const shown = [...earned, ...previewLocked];

  return (
    <View className="gap-2">
      <View className="flex-row items-end justify-between">
        <AppText className="text-[12px] font-bold uppercase tracking-widest text-charcoal">
          Titles & badges
        </AppText>
        <AppText className="text-[11px] font-semibold text-muted">
          {earned.length} earned
        </AppText>
      </View>

      {shown.length === 0 ? (
        <AppText className="text-[13px] leading-5 text-muted">
          Fresh blob energy. Finish a challenge, host one, or win a call-out — titles land here.
        </AppText>
      ) : null}

      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}>
        {shown.map((badge) => (
          <BadgeTile key={badge.key} badge={badge} />
        ))}
      </ScrollView>
    </View>
  );
}

function BadgeTile({ badge }: { badge: BadgeWithProgress }) {
  const tone = BADGE_TONE[badgeTone(badge.tone)];
  const locked = !badge.earned;
  return (
    <View
      className="items-center px-2.5 py-2.5"
      style={{
        width: 96,
        backgroundColor: locked ? THEME.surface : tone.bg,
        borderColor: locked ? THEME.border : tone.ring,
        borderWidth: 1,
        borderRadius: THEME.radius,
        opacity: locked ? 0.55 : 1,
      }}>
      <View
        className="h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: THEME.surface }}>
        <Glyph name={badgeGlyph(badge.icon)} color={locked ? THEME.textMuted : tone.fg} size={18} />
      </View>
      <AppText
        className="mt-1.5 text-center text-[11px] font-bold leading-4"
        style={{ color: locked ? THEME.textMuted : tone.fg }}
        numberOfLines={2}>
        {badge.name}
      </AppText>
      {badge.earned && badge.awardedCoins > 0 ? (
        <AppText className="mt-0.5 text-center text-[10px] font-semibold" style={{ color: '#8A6A12' }}>
          +{formatCoins(badge.awardedCoins).replace(' Coins', '')}
        </AppText>
      ) : locked ? (
        <AppText className="mt-0.5 text-center text-[10px] text-muted">Locked</AppText>
      ) : null}
    </View>
  );
}
