import { ScrollView, View } from 'react-native';

import { ChipFollowUpCard } from '@/components/interests/ChipFollowUp';
import { StanceSlider } from '@/components/interests/StanceSlider';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import type { InterestChipDef, InterestRoomSlug } from '@/lib/interestsCatalog';
import { isDietChip } from '@/lib/interestsCatalog';
import { clampStanceScore, type ActivityCardPage } from '@/lib/interests';
import type { ChipFollowUp } from '@/lib/interestsFollowup';
import { copy } from '@/lib/copy';
import { THEME, themeShadow } from '@/lib/theme';

/** Diet / Academics / Fasting / Work only — volume and play cards never scroll. */
function mayInnerScroll(chip: InterestChipDef): boolean {
  return isDietChip(chip.slug) || chip.slug === 'academics' || chip.slug === 'fasting' || Boolean(chip.isWork);
}

const DENSE_FIELD = {
  minHeight: 40,
  paddingVertical: 8,
  paddingHorizontal: 12,
};

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
  page: ActivityCardPage;
  units?: 'imperial' | 'metric';
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
  page,
  units = 'imperial',
}: ActivityCardProps) {
  const page2 = (
    <>
      <ChipFollowUpCard chip={chip} room={room} followUp={followUp} onChange={onChange} units={units} />
      {chip.isWork ? (
        <View style={{ gap: 6 }}>
          <Input
            label={copy('interests.occupation')}
            value={occupation}
            onChangeText={onOccupation}
            autoCapitalize="words"
            style={DENSE_FIELD}
          />
          <Input
            label={copy('interests.employer')}
            value={employer}
            onChangeText={onEmployer}
            autoCapitalize="words"
            style={DENSE_FIELD}
          />
        </View>
      ) : null}
      {chip.isOther ? (
        <Input
          label={copy('interests.other')}
          value={otherText}
          onChangeText={onOtherText}
          grow
          growMaxLines={2}
          style={DENSE_FIELD}
        />
      ) : null}
    </>
  );

  return (
    <View style={{ flex: 1, minHeight: 0, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
      <View
        style={{
          flex: 1,
          minHeight: 0,
          backgroundColor: THEME.surface,
          borderRadius: THEME.radius,
          paddingHorizontal: 12,
          paddingTop: 12,
          paddingBottom: 10,
          gap: 6,
          ...themeShadow(),
        }}>
        <AppText
          className="text-[20px] font-extrabold"
          numberOfLines={1}
          style={{ color: THEME.textPrimary, lineHeight: 24 }}>
          {chip.label}
        </AppText>
        {page === 1 ? (
          <View style={{ flex: 1, minHeight: 0, justifyContent: 'center', gap: 6 }}>
            <AppText
              className="text-[17px] font-extrabold"
              numberOfLines={1}
              style={{ color: THEME.textPrimary, lineHeight: 22 }}>
              {copy('interests.rateSkill')}
            </AppText>
            <StanceSlider
              value={followUp.stanceScore}
              onChange={(next) => onChange({ ...followUp, stanceScore: clampStanceScore(next) })}
            />
          </View>
        ) : mayInnerScroll(chip) ? (
          <ScrollView
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={{ gap: 6, paddingBottom: 4 }}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}>
            {page2}
            {error ? (
              <AppText className="text-[13px] font-semibold" style={{ color: THEME.danger }}>
                {error}
              </AppText>
            ) : null}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, minHeight: 0, gap: 6 }}>
            {page2}
            {error ? (
              <AppText className="text-[13px] font-semibold" style={{ color: THEME.danger }}>
                {error}
              </AppText>
            ) : null}
          </View>
        )}
        {page === 1 && error ? (
          <AppText className="text-[13px] font-semibold" style={{ color: THEME.danger }}>
            {error}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
