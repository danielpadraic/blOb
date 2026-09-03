import { View } from 'react-native';

import { PeriodRow, QtyPairSlider, QtySlider } from '@/components/interests/QtyPairSlider';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import {
  isDietChip,
  isPlayCard,
  qtyPeriodsForChip,
  showsGoalQty,
  showsHighestLevel,
  type InterestChipDef,
  type InterestRoomSlug,
} from '@/lib/interestsCatalog';
import {
  ACADEMICS_FOCUSES,
  ACADEMICS_FOCUS_LABELS,
  ACADEMICS_LEVELS,
  ACADEMICS_LEVEL_LABELS,
  DIET_GOALS,
  DIET_GOAL_LABELS,
  DIET_STYLES,
  DIET_STYLE_LABELS,
  FASTING_PRACTICES,
  FASTING_PRACTICE_LABELS,
  RATING_LABELS,
  SPORTS_LEVELS,
  SPORTS_LEVEL_LABELS,
  currentVolumeLabel,
  goalVolumeLabel,
  isQtyKind,
  isRatingKind,
  setGoalQtyPeriod,
  setQtyPeriod,
  setQtyUnknown,
  setQtyValue,
  setRatingUnknown,
  setRatingValue,
  toggleDietGoal,
  toggleDietStyle,
  type ChipFollowUp,
} from '@/lib/interestsFollowup';
import { copy } from '@/lib/copy';

type ChipFollowUpCardProps = {
  chip: InterestChipDef;
  followUp: ChipFollowUp;
  onChange: (next: ChipFollowUp) => void;
  room: InterestRoomSlug;
};

export function ChipFollowUpCard({
  chip,
  followUp,
  onChange,
  room,
}: ChipFollowUpCardProps) {
  const ratingKind = isRatingKind(chip.ratingKind) ? chip.ratingKind : null;
  const qtyKind = isQtyKind(chip.qtyKind) ? chip.qtyKind : null;
  const showAcademics = chip.slug === 'academics';
  const showFasting = chip.slug === 'fasting';
  const showDiet = isDietChip(chip.slug);
  const showRank = ratingKind === 'mmr';
  const showGrade = ratingKind === 'grade';
  const showNumericRating = Boolean(ratingKind) && !showRank && !showGrade;
  const play = isPlayCard(room);
  const showPlay = Boolean(qtyKind) && play && !showFasting;
  const showVolume = Boolean(qtyKind) && !play && !showFasting && !showDiet && showsGoalQty(room, chip);
  const qtyOptional = Boolean(chip.isOther);

  return (
    <View style={{ gap: 8 }}>
      {showNumericRating && ratingKind ? (
        <View style={{ gap: 8 }}>
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
        <View style={{ gap: 8 }}>
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
        <View style={{ gap: 8 }}>
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

      {showVolume && qtyKind ? (
        <QtyPairSlider
          kind={qtyKind}
          current={followUp.currentQty}
          goal={followUp.goalQty}
          currentLabel={currentVolumeLabel(chip)}
          goalLabel={goalVolumeLabel(chip)}
          currentPeriod={qtyKind === 'steps_day' ? 'day' : followUp.qtyPeriod}
          goalPeriod={qtyKind === 'steps_day' ? 'day' : followUp.goalQtyPeriod}
          onCurrentPeriod={(next) => onChange(setQtyPeriod(followUp, qtyKind === 'steps_day' ? 'day' : next))}
          onGoalPeriod={(next) => onChange(setGoalQtyPeriod(followUp, qtyKind === 'steps_day' ? 'day' : next))}
          onCurrent={(next) => onChange(setQtyValue(followUp, qtyKind, 'currentQty', next))}
          onGoal={(next) => onChange(setQtyValue(followUp, qtyKind, 'goalQty', next))}
          unitLabel={qtyKind === 'steps_day' ? 'steps' : undefined}
          periods={qtyPeriodsForChip(chip)}
        />
      ) : null}

      {showPlay && qtyKind ? (
        <View style={{ gap: 8 }}>
          <QtySlider
            label={copy('interests.currentlyPlay')}
            kind={qtyKind}
            value={followUp.currentQty}
            onChange={(next) => onChange(setQtyValue(followUp, qtyKind, 'currentQty', next))}
          />
          <PeriodRow
            period={followUp.qtyPeriod}
            onPeriod={(next) => onChange(setQtyPeriod(followUp, next))}
          />
        </View>
      ) : null}

      {showsHighestLevel(room) ? (
        <View className="gap-1">
          <AppText className="text-[13px] font-semibold text-charcoal">{copy('interests.highestLevel')}</AppText>
          <ChipRow>
            {SPORTS_LEVELS.map((value) => (
              <Chip
                key={value}
                label={SPORTS_LEVEL_LABELS[value]}
                selected={followUp.highestLevel === value}
                onPress={() =>
                  onChange({
                    ...followUp,
                    highestLevel: followUp.highestLevel === value ? null : value,
                  })
                }
              />
            ))}
          </ChipRow>
        </View>
      ) : null}

      {showDiet ? (
        <>
          <View className="gap-1">
            <AppText className="text-[13px] font-semibold text-charcoal">{copy('interests.nutritionGoals')}</AppText>
            <ChipRow>
              {DIET_GOALS.map((value) => (
                <Chip
                  key={value}
                  label={DIET_GOAL_LABELS[value]}
                  selected={followUp.dietGoals.includes(value)}
                  onPress={() => onChange(toggleDietGoal(followUp, value))}
                />
              ))}
            </ChipRow>
          </View>
          {followUp.dietGoals.includes('other') ? (
            <Input
              label={copy('interests.other')}
              value={followUp.otherGoalText}
              onChangeText={(otherGoalText) => onChange({ ...followUp, otherGoalText })}
            />
          ) : null}
          <View className="gap-1">
            <AppText className="text-[13px] font-semibold text-charcoal">{copy('interests.currentDiet')}</AppText>
            <ChipRow>
              {DIET_STYLES.map((value) => (
                <Chip
                  key={value}
                  label={DIET_STYLE_LABELS[value]}
                  selected={followUp.dietStyles.includes(value)}
                  onPress={() => onChange(toggleDietStyle(followUp, value))}
                />
              ))}
            </ChipRow>
          </View>
          {followUp.dietStyles.includes('other') ? (
            <Input
              label={copy('interests.other')}
              value={followUp.otherDietText}
              onChangeText={(otherDietText) => onChange({ ...followUp, otherDietText })}
            />
          ) : null}
        </>
      ) : null}

      {qtyOptional && (showVolume || showPlay) ? (
        <AppText className="text-[12px] text-muted">Optional.</AppText>
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
            <View style={{ gap: 8 }}>
              <QtySlider
                label="Current · hours"
                kind={qtyKind}
                value={followUp.currentQty}
                onChange={(next) => onChange(setQtyValue(followUp, qtyKind, 'currentQty', next))}
              />
              <QtySlider
                label="Goal · hours"
                kind={qtyKind}
                value={followUp.goalQty}
                onChange={(next) => onChange(setQtyValue(followUp, qtyKind, 'goalQty', next))}
                previewValue={followUp.currentQty}
                emptyOk
              />
            </View>
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
