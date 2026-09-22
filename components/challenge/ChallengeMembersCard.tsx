import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { buildChallengeMembers } from '@/lib/challengeMembers';
import { THEME } from '@/lib/theme';
import type { Challenge, ChallengeParticipantWithProfile } from '@/lib/types';

export function ChallengeMembersCard({
  challenge,
  roster,
  moderatorIds,
}: {
  challenge: Challenge;
  roster?: ChallengeParticipantWithProfile[] | null;
  moderatorIds?: readonly string[] | null;
}) {
  const width = useWindowDimensions().width;
  const [open, setOpen] = useState(width >= 768);
  const members = buildChallengeMembers({
    roster,
    hostId: challenge.created_by,
    moderatorIds,
    challenge,
  });
  if (members.length === 0) {
    return null;
  }

  return (
    <Card className="mt-4">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Members, ${members.length}`}
        onPress={() => setOpen((current) => !current)}
        className="flex-row items-center"
        style={{ minHeight: 44 }}>
        <AppText
          className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted">
          Members
        </AppText>
        <AppText className="text-[13px] font-semibold" style={{ color: THEME.textMuted }}>
          {open ? '▴' : '▾'}  {members.length}
        </AppText>
      </Pressable>
      {open ? (
        <View className="mt-2 gap-3">
          {members.map((row) => (
            <ProfileLink
              key={row.userId}
              username={row.username}
              userId={row.userId}
              fill
              accessibilityLabel={`${row.name}. ${row.subtitle}`}
              style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar uri={row.avatarUrl} name={row.name} size={40} />
              <View className="min-w-0 flex-1">
                <AppText className="font-semibold text-charcoal" numberOfLines={1}>
                  {row.name}
                </AppText>
                <AppText className="text-sm text-muted" numberOfLines={1}>
                  {row.subtitle}
                </AppText>
              </View>
            </ProfileLink>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
