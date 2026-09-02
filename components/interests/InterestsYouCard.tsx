import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { useOfficialDob } from '@/components/interests/OfficialDobHost';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { AppText } from '@/components/ui/AppText';
import {
  interestRoomStates,
  useMyInterests,
  usePinInterestChip,
} from '@/hooks/useInterests';
import { roomsNeedYouDot } from '@/lib/interests';
import { copy } from '@/lib/copy';
import { formatDateOnly, parseDateOnly } from '@/lib/officialDob';
import { INTERESTS_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import type { Profile } from '@/lib/types';

export function InterestsYouCard({ profile }: { profile: Profile }) {
  const router = useRouter();
  const officialDob = useOfficialDob();
  const { mine } = useMyInterests();
  const pin = usePinInterestChip();
  const chips = mine.data?.chips ?? [];
  const reminder = roomsNeedYouDot({
    dismissedHome: profile.interests_dismissed_home_at,
    prompted: profile.interests_prompted_at,
    states: interestRoomStates(mine.data?.rooms),
  });
  const dob = parseDateOnly(profile.date_of_birth);
  const pinnedCount = chips.filter((row) => row.pinned).length;

  return (
    <View className="gap-3">
      <Card className="gap-2">
        <View className="flex-row items-center justify-between">
          <AppText className="text-[16px] font-extrabold text-charcoal">
            {copy('interests.youTitle')}
          </AppText>
          {reminder ? (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: THEME.accent,
              }}
            />
          ) : null}
        </View>
        <AppText className="text-[13px] leading-5 text-muted">{copy('interests.youHelp')}</AppText>
        <Button title={copy('interests.edit')} onPress={() => router.push(INTERESTS_HREF)} />
        {chips.length > 0 ? (
          <View className="gap-2">
            <AppText className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {copy('interests.pin')} · {copy('interests.pinHelp')}
            </AppText>
            <ChipRow>
              {chips.map((row) => {
                const label = row.catalog?.label ?? 'Interest';
                return (
                  <Chip
                    key={row.chip_id}
                    label={label}
                    selected={row.pinned}
                    onPress={() => {
                      if (pin.isPending || (!row.pinned && pinnedCount >= 8)) {
                        return;
                      }
                      void pin.mutateAsync({ chipId: row.chip_id, pinned: !row.pinned });
                    }}
                  />
                );
              })}
            </ChipRow>
          </View>
        ) : null}
      </Card>

      <Card className="gap-2">
        <View className="flex-row items-center justify-between">
          <AppText className="text-[16px] font-extrabold text-charcoal">{copy('interests.dob')}</AppText>
          <AppText className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Private
          </AppText>
        </View>
        <AppText className="text-[13px] leading-5 text-muted">{copy('interests.dobHelp')}</AppText>
        {dob ? (
          <AppText className="text-sm font-semibold text-charcoal">{formatDateOnly(dob)}</AppText>
        ) : (
          <AppText className="text-sm font-semibold text-muted">Not set</AppText>
        )}
        <Button
          title={dob ? 'Update birth date' : 'Add birth date'}
          variant={dob ? 'outline' : undefined}
          onPress={officialDob.openEditor}
        />
      </Card>
    </View>
  );
}
