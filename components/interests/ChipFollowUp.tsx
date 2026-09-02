import { View } from 'react-native';

import { QtyPairSlider } from '@/components/interests/QtyPairSlider';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import type { InterestChipDef } from '@/lib/interestsCatalog';
import {
  ACADEMICS_FOCUSES,
  ACADEMICS_FOCUS_LABELS,
  ACADEMICS_LEVELS,
  ACADEMICS_LEVEL_LABELS,
  FASTING_PRACTICES,
  FASTING_PRACTICE_LABELS,
  INDOOR_OUTDOOR,
  INDOOR_LABELS,
  PROOF_PREFS,
  PROOF_LABELS,
  RATING_LABELS,
  isQtyKind,
  isRatingKind,
  setQtyUnknown,
  setQtyValue,
  setRatingUnknown,
  setRatingValue,
  type ChipFollowUp,
} from '@/lib/interestsFollowup';
import { copy } from '@/lib/copy';
import { THEME, themeShadow } from '@/lib/theme';

type ChipFollowUpCardProps = {
  chip: InterestChipDef;
  followUp: ChipFollowUp;
  onChange: (next: ChipFollowUp) => void;
};

export function ChipFollowUpCard({ chip, followUp, onChange }: ChipFollowUpCardProps) {
  const ratingKind = isRatingKind(chip.ratingKind) ? chip.ratingKind : null;
  const qtyKind = isQtyKind(chip.qtyKind) ? chip.qtyKind : null;
  const showAcademics = chip.slug === 'academics';
  const showFasting = chip.slug === 'fasting';
  const showRank = ratingKind === 'mmr';
  const showIndoor = chip.allowsIndoorOutdoor;

  return (
    <View
      className="gap-3 p-4"
      style={{
        backgroundColor: THEME.surface,
        borderRadius: THEME.radius,
        ...themeShadow(),
      }}>
      <AppText className="text-[15px] font-extrabold text-charcoal">{chip.label}</AppText>

      {ratingKind ? (
        <View className="gap-2">
          <Input
            label={RATING_LABELS[ratingKind]}
            value={followUp.ratingUnknown ? '' : followUp.ratingValue == null ? '' : String(followUp.ratingValue)}
            onChangeText={(text) => onChange(setRatingValue(followUp, text))}
            keyboardType="decimal-pad"
            editable={!followUp.ratingUnknown}
          />
          <Chip
            label={copy('interests.unknown')}
            selected={followUp.ratingUnknown}
            onPress={() => onChange(setRatingUnknown(followUp, !followUp.ratingUnknown))}
          />
        </View>
      ) : null}

      {showRank ? (
        <Input
          label={copy('interests.rank')}
          value={followUp.mmrLabel}
          onChangeText={(mmrLabel) => onChange({ ...followUp, mmrLabel })}
        />
      ) : null}

      {qtyKind && !showFasting ? (
        <QtyPairSlider
          kind={qtyKind}
          current={followUp.currentQty}
          goal={followUp.goalQty}
          onCurrent={(next) => onChange(setQtyValue(followUp, qtyKind, 'currentQty', next))}
          onGoal={(next) => onChange(setQtyValue(followUp, qtyKind, 'goalQty', next))}
        />
      ) : null}

      {showIndoor ? (
        <View className="gap-1">
          <AppText className="text-[13px] font-semibold text-charcoal">{copy('interests.place')}</AppText>
          <ChipRow>
            {INDOOR_OUTDOOR.map((value) => (
              <Chip
                key={value}
                label={INDOOR_LABELS[value]}
                selected={followUp.indoorOutdoor === value}
                onPress={() =>
                  onChange({
                    ...followUp,
                    indoorOutdoor: followUp.indoorOutdoor === value ? null : value,
                  })
                }
              />
            ))}
          </ChipRow>
        </View>
      ) : null}

      {showAcademics ? (
        <>
          <View className="gap-1">
            <AppText className="text-[13px] font-semibold text-charcoal">{copy('interests.level')}</AppText>
            <ChipRow>
              {ACADEMICS_LEVELS.map((value) => (
                <Chip
                  key={value}
                  label={ACADEMICS_LEVEL_LABELS[value]}
                  selected={followUp.academicsLevel === value}
                  onPress={() =>
                    onChange({
                      ...followUp,
                      academicsLevel: followUp.academicsLevel === value ? null : value,
                    })
                  }
                />
              ))}
            </ChipRow>
          </View>
          <View className="gap-1">
            <AppText className="text-[13px] font-semibold text-charcoal">{copy('interests.focus')}</AppText>
            <ChipRow>
              {ACADEMICS_FOCUSES.map((value) => (
                <Chip
                  key={value}
                  label={ACADEMICS_FOCUS_LABELS[value]}
                  selected={followUp.academicsFocus === value}
                  onPress={() =>
                    onChange({
                      ...followUp,
                      academicsFocus: followUp.academicsFocus === value ? null : value,
                    })
                  }
                />
              ))}
            </ChipRow>
          </View>
          {followUp.academicsFocus === 'other' ? (
            <Input
              label={copy('interests.other')}
              value={followUp.academicsFocusOther}
              onChangeText={(academicsFocusOther) => onChange({ ...followUp, academicsFocusOther })}
            />
          ) : null}
        </>
      ) : null}

      {showFasting && qtyKind === 'fasting_hours' ? (
        <>
          <View className="gap-1">
            <AppText className="text-[13px] font-semibold text-charcoal">{copy('interests.practice')}</AppText>
            <ChipRow>
              {FASTING_PRACTICES.map((value) => (
                <Chip
                  key={value}
                  label={FASTING_PRACTICE_LABELS[value]}
                  selected={followUp.fastingPractice === value}
                  onPress={() =>
                    onChange({
                      ...followUp,
                      fastingPractice: followUp.fastingPractice === value ? null : value,
                    })
                  }
                />
              ))}
            </ChipRow>
          </View>
          <AppText className="text-[12px] text-muted">{copy('interests.fastingNote')}</AppText>
          {followUp.qtyUnknown ? null : (
            <QtyPairSlider
              kind={qtyKind}
              current={followUp.currentQty}
              goal={followUp.goalQty}
              onCurrent={(next) => onChange(setQtyValue(followUp, qtyKind, 'currentQty', next))}
              onGoal={(next) => onChange(setQtyValue(followUp, qtyKind, 'goalQty', next))}
            />
          )}
          <Chip
            label={copy('interests.unknown')}
            selected={followUp.qtyUnknown}
            onPress={() => onChange(setQtyUnknown(followUp, !followUp.qtyUnknown))}
          />
        </>
      ) : null}

      <View className="gap-1">
        <AppText className="text-[13px] font-semibold text-charcoal">{copy('interests.proof')}</AppText>
        <ChipRow>
          {PROOF_PREFS.map((value) => (
            <Chip
              key={value}
              label={PROOF_LABELS[value]}
              selected={followUp.preferredProof === value}
              onPress={() =>
                onChange({
                  ...followUp,
                  preferredProof: followUp.preferredProof === value ? null : value,
                })
              }
            />
          ))}
        </ChipRow>
      </View>
    </View>
  );
}
