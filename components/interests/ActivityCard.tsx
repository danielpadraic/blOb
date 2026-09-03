import { ScrollView, View } from 'react-native';

import { ChipFollowUpCard } from '@/components/interests/ChipFollowUp';
import { StanceSlider } from '@/components/interests/StanceSlider';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import type { InterestChipDef, InterestRoomSlug } from '@/lib/interestsCatalog';
import { clampStanceScore } from '@/lib/interests';
import type { ChipFollowUp } from '@/lib/interestsFollowup';
import { copy } from '@/lib/copy';
import { THEME, themeShadow } from '@/lib/theme';

type ActivityCardProps = {
  chip: InterestChipDef;
  room: InterestRoomSlug;
  followUp: ChipFollowUp;
  onChange: (next: ChipFollowUp) => void;
  occupation: string;
  employer: string;
  otherText: string;
  onOccupation: (next: string) => void;
  onEmployer: (next: string) => void;
  onOtherText: (next: string) => void;
  error: string | null;
  index: number;
  total: number;
};

export function ActivityCard({
  chip,
  room,
  followUp,
  onChange,
  occupation,
  employer,
  otherText,
  onOccupation,
  onEmployer,
  onOtherText,
  error,
  index,
  total,
}: ActivityCardProps) {
  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 12,
      }}
      keyboardShouldPersistTaps="handled">
      <View
        className="w-full p-4"
        style={{
          backgroundColor: THEME.surface,
          borderRadius: THEME.radius,
          gap: 8,
          ...themeShadow(),
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <AppText
            className="text-[22px] font-extrabold"
            numberOfLines={1}
            style={{ color: THEME.textPrimary, lineHeight: 26, flex: 1, minWidth: 0 }}>
            {chip.label}
          </AppText>
          <AppText
            className="text-[13px] font-semibold"
            numberOfLines={1}
            style={{ color: THEME.textMuted, paddingTop: 4 }}>
            {index + 1} of {total}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {Array.from({ length: Math.max(total, 1) }, (_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 999,
                backgroundColor: i <= index ? THEME.accent : THEME.border,
              }}
            />
          ))}
        </View>
        <StanceSlider
          value={followUp.stanceScore}
          onChange={(next) => onChange({ ...followUp, stanceScore: clampStanceScore(next) })}
        />
        <ChipFollowUpCard chip={chip} room={room} followUp={followUp} onChange={onChange} />
        {chip.isWork ? (
          <View style={{ gap: 8 }}>
            <Input
              label={copy('interests.occupation')}
              value={occupation}
              onChangeText={onOccupation}
              autoCapitalize="words"
            />
            <Input
              label={copy('interests.employer')}
              value={employer}
              onChangeText={onEmployer}
              autoCapitalize="words"
            />
          </View>
        ) : null}
        {chip.isOther ? (
          <Input label={copy('interests.other')} value={otherText} onChangeText={onOtherText} grow />
        ) : null}
        {error ? (
          <AppText className="text-[13px] font-semibold" style={{ color: THEME.danger }}>
            {error}
          </AppText>
        ) : null}
      </View>
    </ScrollView>
  );
}
