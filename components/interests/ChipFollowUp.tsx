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
  RATING_LABELS,
  isQtyKind,
  isRatingKind,
  qtyUnitLabel,
  setQtyUnknown,
  setQtyPeriod,
  setQtyValue,
  setRatingUnknown,
  setRatingValue,
  type ChipFollowUp,
} from '@/lib/interestsFollowup';
import { copy } from '@/lib/copy';

type ChipFollowUpCardProps = {
  chip: InterestChipDef;
  followUp: ChipFollowUp;
  onChange: (next: ChipFollowUp) => void;
  units?: 'imperial' | 'metric';
};

export function ChipFollowUpCard({
  chip,
  followUp,
  onChange,
  units = 'imperial',
}: ChipFollowUpCardProps) {
  const ratingKind = isRatingKind(chip.ratingKind) ? chip.ratingKind : null;
  const qtyKind = isQtyKind(chip.qtyKind) ? chip.qtyKind : null;
  const showAcademics = chip.slug === 'academics';
  const showFasting = chip.slug === 'fasting';
  const showRank = ratingKind === 'mmr';
  const showGrade = ratingKind === 'grade';
  const showNumericRating = Boolean(ratingKind) && !showRank && !showGrade;
  const showIndoor = chip.allowsIndoorOutdoor;
  const showQty = Boolean(qtyKind) && !showFasting;
  const qtyOptional = Boolean(chip.isOther);

  return (
    <View className="gap-3">
      {showNumericRating && ratingKind ? (
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
        <View className="gap-2">
          <Input
            label={copy('interests.rank')}
            value={followUp.ratingUnknown ? '' : followUp.mmrLabel}
            onChangeText={(mmrLabel) => onChange({ ...followUp, mmrLabel, ratingUnknown: false })}
            editable={!followUp.ratingUnknown}
          />
          <Chip
            label={copy('interests.unknown')}
            selected={followUp.ratingUnknown}
            onPress={() => onChange(setRatingUnknown({ ...followUp, mmrLabel: '' }, !followUp.ratingUnknown))}
          />
        </View>
      ) : null}

      {showGrade ? (
        <View className="gap-2">
          <Input
            label={copy('interests.grade')}
            value={followUp.ratingUnknown ? '' : followUp.gradeLabel}
            onChangeText={(gradeLabel) => onChange({ ...followUp, gradeLabel, ratingUnknown: false })}
            editable={!followUp.ratingUnknown}
          />
          <Chip
            label={copy('interests.unknown')}
            selected={followUp.ratingUnknown}
            onPress={() => onChange(setRatingUnknown({ ...followUp, gradeLabel: '' }, !followUp.ratingUnknown))}
          />
        </View>
      ) : null}

      {showQty && qtyKind ? (
        <QtyPairSlider
          kind={qtyKind}
          current={followUp.currentQty}
          goal={followUp.goalQty}
          unitLabel={qtyUnitLabel(qtyKind, chip.slug, units)}
          period={followUp.qtyPeriod}
          onPeriod={(next) => onChange(setQtyPeriod(followUp, next))}
          onCurrent={(next) => onChange(setQtyValue(followUp, qtyKind, 'currentQty', next))}
          onGoal={(next) => onChange(setQtyValue(followUp, qtyKind, 'goalQty', next))}
        />
      ) : null}

      {qtyOptional && showQty ? (
        <AppText className="text-[12px] text-muted">Optional.</AppText>
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
              unitLabel={qtyUnitLabel(qtyKind, chip.slug, units)}
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
    </View>
  );
}
