import { Pressable, View } from 'react-native';

import { ChallengeHeroCard } from '@/components/challenge/ChallengeHeroCard';
import { ChallengeLeaderboard } from '@/components/challenge/ChallengeLeaderboard';
import { ChallengePrizeLine } from '@/components/challenge/ChallengePrizeLine';
import { FieldNoteLabel } from '@/components/challenge/FieldNote';
import { StakeAmount } from '@/components/currency/CurrencyMark';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { signupProofLines } from '@/lib/challengeProofs';
import { challengeRuleCopy } from '@/lib/challengeRuleCopy';
import { challengeGoalLabel } from '@/lib/challengeGoal';
import { entryFieldNote, prizeFieldNote, userStartNeededLabel } from '@/lib/challengeFieldNotes';
import { isPointsChallenge } from '@/lib/challenges';
import { copy } from '@/lib/copy';
import { previewFromValues } from '@/lib/challengeTemplates';
import {
  activityQtyLabel,
  comparablePointsHeadline,
  parseComparablePointsConfig,
} from '@/lib/comparablePoints';
import { nobodyFinishedRuleCopy } from '@/lib/settlement/receipts';
import { THEME } from '@/lib/theme';
import type { CreateChallengeValues } from '@/utils/validators';

export type CreateReviewEditKey =
  | 'title'
  | 'task'
  | 'proofs'
  | 'duration'
  | 'frequency'
  | 'visibility'
  | 'prize'
  | 'scoring'
  | 'start';

function EditLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy('create.edit')}
      onPress={onPress}
      hitSlop={8}
      style={{ minHeight: 32, justifyContent: 'center' }}>
      <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
        {copy('create.edit')}
      </AppText>
    </Pressable>
  );
}

export function CreateReviewPreview({
  values,
  onEdit,
}: {
  values: CreateChallengeValues;
  onEdit: (key: CreateReviewEditKey) => void;
}) {
  const preview = previewFromValues(values);
  const challenge = {
    ...preview,
    currency: values.currency === 'bucks' ? 'bucks' : preview.currency,
    host_funded:
      Boolean(values.host_funded) || Math.max(Number(values.creator_contribution) || 0, 0) > 0,
    host_budget: Math.max(Number(values.host_budget ?? values.creator_contribution) || 0, 0),
    creator_contribution: Math.max(Number(values.creator_contribution) || 0, 0),
    buy_in_amount: Math.max(Number(values.buy_in) || 0, 0),
  };
  const ruleCopy = challengeRuleCopy(challenge);
  const signupLines = signupProofLines(challenge);
  const isPoints = isPointsChallenge(challenge);
  const extraTasks = (challenge.tasks ?? []).filter((task) => task.id !== 'primary');
  const comparable = parseComparablePointsConfig(values.scoring_config);
  const showComparable = values.scoring_method === 'comparable_points' && comparable != null;
  const showTasks =
    !showComparable && (isPoints || extraTasks.length > 0 || (challenge.tasks?.length ?? 0) > 1);
  const startNeeded = userStartNeededLabel(challenge);

  return (
    <View className="gap-4">
      <View>
        <View className="mb-2 flex-row items-center justify-between">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Challenge
          </AppText>
          <EditLink onPress={() => onEdit('title')} />
        </View>
        <ChallengeHeroCard
          challenge={challenge}
          goalLabel={challengeGoalLabel(challenge)}
          nowMs={Date.now()}
        />
      </View>

      {signupLines.length > 0 || isPoints ? (
        <Card>
          <View className="flex-row items-start justify-between gap-3">
            <AppText
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: THEME.textPrimary }}>
              What you’re signing up for
            </AppText>
            <EditLink onPress={() => onEdit('proofs')} />
          </View>
          {signupLines.length > 0 ? (
            <View className="mt-2 gap-2">
              {signupLines.map((line, index) => (
                <AppText
                  key={`${index}-${line}`}
                  className="text-[14px] leading-6"
                  style={{ color: THEME.textPrimary }}>
                  {line}
                </AppText>
              ))}
            </View>
          ) : null}
          {showTasks ? (
            <View className="mt-3 gap-2.5">
              {challenge.tasks.map((task, index) => (
                <View key={task.id} className="flex-row gap-3">
                  <View
                    className="h-6 w-6 items-center justify-center rounded-full"
                    style={{ backgroundColor: THEME.accentSoft }}>
                    <AppText className="text-[12px] font-bold" style={{ color: THEME.accent }}>
                      {index + 1}
                    </AppText>
                  </View>
                  <View className="flex-1">
                    <AppText className="font-semibold text-charcoal">{task.title}</AppText>
                    <AppText className="text-[13px] leading-5 text-muted">
                      {isPoints
                        ? `${task.points} pts${task.proof_required ? ' · proof required' : ''}`
                        : task.once
                          ? 'Once'
                          : task.proof_required
                            ? 'Each day · proof required'
                            : 'On your honor'}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {showComparable ? (
        <Card>
          <View className="flex-row items-start justify-between gap-3">
            <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Scoring method
            </AppText>
            <EditLink onPress={() => onEdit('scoring')} />
          </View>
          <AppText className="mt-2 text-[17px] font-semibold leading-6 text-charcoal">
            Comparable Points
          </AppText>
          <AppText className="mt-1 text-[13px] leading-5 text-muted">
            {comparablePointsHeadline(comparable)}
          </AppText>
          <View className="mt-3 gap-1.5">
            {comparable.activities
              .filter((item) => item.name.trim().length > 0)
              .map((item) => (
                <AppText key={item.id} className="text-[14px] leading-5 text-charcoal">
                  {item.name.trim()} · {activityQtyLabel(item)}
                  {item.multiplier.enabled ? ' · Multiplier' : ''}
                  {item.qualifiers.enabled ? ' · Qualifiers' : ''}
                </AppText>
              ))}
          </View>
        </Card>
      ) : null}

      <Card>
        <View className="flex-row items-start justify-between gap-3">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Task
          </AppText>
          <EditLink onPress={() => onEdit('task')} />
        </View>
        <AppText className="mt-2 text-[17px] font-semibold leading-6 text-charcoal">
          {ruleCopy.toFinish || values.task?.trim() || values.rule_activity}
        </AppText>
      </Card>

      <Card>
        <View className="flex-row items-start justify-between gap-3">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Rules
          </AppText>
          <EditLink onPress={() => onEdit('task')} />
        </View>
        {ruleCopy.primary ? (
          <AppText className="mt-2 leading-6 text-ink">{ruleCopy.primary}</AppText>
        ) : null}
        {ruleCopy.extras.length > 0 ? (
          <View className="mt-3 gap-2">
            {ruleCopy.extras.map((line, index) => (
              <AppText key={`${index}-${line}`} className="leading-6 text-ink">
                {line}
              </AppText>
            ))}
          </View>
        ) : null}
        {nobodyFinishedRuleCopy(challenge) ? (
          <AppText className="mt-2 text-sm leading-5 text-muted">
            {nobodyFinishedRuleCopy(challenge)}
          </AppText>
        ) : null}
      </Card>

      <Card>
        <View className="flex-row items-start justify-between gap-3">
          <FieldNoteLabel
            note={prizeFieldNote(challenge)}
            textClassName="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Prize
          </FieldNoteLabel>
          <EditLink onPress={() => onEdit('prize')} />
        </View>
        <View className="mt-2">
          <ChallengePrizeLine challenge={challenge} />
        </View>
      </Card>

      <Card>
        <FieldNoteLabel
          note={entryFieldNote(challenge)}
          textClassName="text-[11px] font-semibold uppercase tracking-widest text-muted">
          {challenge.buy_in_amount > 0 ? 'Entry fee' : 'Entry'}
        </FieldNoteLabel>
        <View className="mt-2">
          <StakeAmount
            amount={challenge.buy_in_amount}
            currency={challenge.currency}
            size={18}
            freeLabel="Free"
            textClassName="text-[17px] font-semibold leading-6 text-charcoal"
          />
        </View>
      </Card>

      <ChallengeLeaderboard challenge={challenge} roster={[]} completedUserIds={new Set()} />

      {startNeeded ? (
        <Card>
          <FieldNoteLabel
            note="startNeeded"
            textClassName="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Start
          </FieldNoteLabel>
          <AppText className="mt-1 leading-6 text-charcoal">{startNeeded}</AppText>
        </Card>
      ) : null}

      <Card>
        <View className="flex-row items-start justify-between gap-3">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Duration
          </AppText>
          <EditLink onPress={() => onEdit('duration')} />
        </View>
        <AppText className="mt-2 leading-6 text-charcoal">
          {values.duration_type === 'unlimited'
            ? 'Unlimited'
            : `${Math.max(Number(values.duration_days) || 7, 1)} days`}
        </AppText>
        <Pressable
          accessibilityRole="button"
          onPress={() => onEdit('visibility')}
          className="mt-3 flex-row items-center justify-between"
          style={{ minHeight: 32 }}>
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Visibility
          </AppText>
          <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
            {copy('create.edit')}
          </AppText>
        </Pressable>
        <AppText className="mt-1 leading-6 text-charcoal">
          {values.privacy_mode === 'private_corporate'
            ? copy('create.privateCorporate')
            : values.visibility === 'friends'
              ? copy('create.friends')
              : values.visibility === 'invite' || values.visibility === 'private'
                ? copy('create.invite')
                : copy('create.public')}
        </AppText>
        {values.privacy_mode === 'private_corporate' ? (
          <AppText className="mt-1 text-sm leading-5 text-muted">
            {copy('create.privateCorporateHelp')}
          </AppText>
        ) : null}
      </Card>
    </View>
  );
}
