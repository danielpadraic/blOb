import { Pressable, View } from 'react-native';

import { ChallengeHeroCard } from '@/components/challenge/ChallengeHeroCard';
import { ChallengePrizeLine } from '@/components/challenge/ChallengePrizeLine';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { signupProofLines } from '@/lib/challengeProofs';
import { challengeRuleCopy } from '@/lib/challengeRuleCopy';
import { challengeGoalLabel } from '@/lib/challengeGoal';
import { isPointsChallenge } from '@/lib/challenges';
import { copy } from '@/lib/copy';
import { previewFromValues } from '@/lib/challengeTemplates';
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
  const challenge = previewFromValues(values);
  const ruleCopy = challengeRuleCopy(challenge);
  const signupLines = signupProofLines(challenge);
  const isPoints = isPointsChallenge(challenge);
  const extraTasks = (challenge.tasks ?? []).filter((task) => task.id !== 'primary');
  const showTasks = isPoints || extraTasks.length > 0 || (challenge.tasks?.length ?? 0) > 1;

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
      </Card>

      <Card>
        <View className="flex-row items-start justify-between gap-3">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Prize
          </AppText>
          <EditLink onPress={() => onEdit('prize')} />
        </View>
        <View className="mt-2">
          <ChallengePrizeLine challenge={challenge} />
        </View>
      </Card>

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
          {values.visibility === 'friends'
            ? copy('create.friends')
            : values.visibility === 'invite' || values.visibility === 'private'
              ? copy('create.invite')
              : copy('create.public')}
        </AppText>
      </Card>
    </View>
  );
}
