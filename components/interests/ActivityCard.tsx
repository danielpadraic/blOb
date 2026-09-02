import { ScrollView, View } from 'react-native';

import { ChipFollowUpCard } from '@/components/interests/ChipFollowUp';
import { StanceSlider } from '@/components/interests/StanceSlider';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import type { InterestChipDef } from '@/lib/interestsCatalog';
import { clampStanceScore } from '@/lib/interests';
import type { ChipFollowUp } from '@/lib/interestsFollowup';
import { copy } from '@/lib/copy';
import { THEME, themeShadow } from '@/lib/theme';

type ActivityCardProps = {
  chip: InterestChipDef;
  index: number;
  total: number;
  followUp: ChipFollowUp;
  onChange: (next: ChipFollowUp) => void;
  occupation: string;
  employer: string;
  otherText: string;
  onOccupation: (next: string) => void;
  onEmployer: (next: string) => void;
  onOtherText: (next: string) => void;
  error: string | null;
  units?: 'imperial' | 'metric';
};

export function ActivityCard({
  chip,
  index,
  total,
  followUp,
  onChange,
  occupation,
  employer,
  otherText,
  onOccupation,
  onEmployer,
  onOtherText,
  error,
  units = 'imperial',
}: ActivityCardProps) {
  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 56,
        paddingBottom: 16,
        alignItems: 'center',
      }}
      keyboardShouldPersistTaps="handled">
      <AppText className="mb-3 self-start text-[13px] font-semibold" style={{ color: THEME.accentBright }}>
        {chip.label}  {index + 1} of {total}
      </AppText>
      <View
        className="w-full gap-3 p-4"
        style={{
          maxWidth: 370,
          backgroundColor: THEME.surface,
          borderRadius: THEME.radius,
          ...themeShadow(),
        }}>
        <AppText
          className="text-center text-[34px] font-extrabold"
          numberOfLines={1}
          style={{ color: THEME.textPrimary, lineHeight: 40 }}>
          {chip.label}
        </AppText>
        <StanceSlider
          value={followUp.stanceScore}
          onChange={(next) => onChange({ ...followUp, stanceScore: clampStanceScore(next) })}
        />
        <ChipFollowUpCard chip={chip} followUp={followUp} onChange={onChange} units={units} />
        {chip.isWork ? (
          <View className="gap-3">
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
