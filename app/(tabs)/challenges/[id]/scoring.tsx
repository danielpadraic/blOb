import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComparablePointsEditor } from '@/components/challenge/create/comparablePoints/ComparablePointsEditor';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { useComparablePointsForm } from '@/hooks/useComparablePointsForm';
import { useAuth } from '@/hooks/useAuth';
import { useChallenge, usePublishScoringChange } from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import {
  comparablePointsFromChallenge,
  diffComparablePoints,
  nextScoringVersion,
} from '@/lib/comparablePoints';
import { canEditOfficialScoring, scoringChangeEffectiveLine } from '@/lib/officialScoring';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

const AMBER_BG = '#FBF4DE';
const AMBER_INK = '#8A6414';
const LIVE_COPY =
  'This change starts on the next challenge day. Earlier check-ins keep the scoring rules that were active when they were submitted.';
const BANNER_COPY =
  'Active challenge. Changes begin with the next challenge day. Earlier check-ins keep their original scoring rules.';

export default function OfficialScoringScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const challengeQuery = useChallenge(id);
  const publish = usePublishScoringChange(id);
  const challenge = challengeQuery.data;
  const saved = comparablePointsFromChallenge(challenge);
  const form = useComparablePointsForm(saved);
  const [confirm, setConfirm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const hydratedKey = useRef<string | null>(null);

  const allowed = canEditOfficialScoring({
    challenge,
    viewerId: user?.id,
    profile,
  });
  const nextVersion = nextScoringVersion(challenge);
  const diffs = useMemo(() => diffComparablePoints(saved, form.draft), [saved, form.draft]);
  const effective = scoringChangeEffectiveLine(challenge);

  useEffect(() => {
    if (!challenge?.id || !saved) {
      return;
    }
    const key = `${challenge.id}:${saved.version}:${saved.parity_points}:${saved.activities
      .map((activity) => activity.id)
      .join(',')}`;
    if (hydratedKey.current === key) {
      return;
    }
    hydratedKey.current = key;
    form.resetFrom(saved);
  }, [challenge?.id, form, saved]);

  function onPublishPress() {
    const result = form.validate();
    if (!result.ok) {
      setFormError(result.message);
      setConfirm(false);
      return;
    }
    if (diffs.length === 1 && diffs[0] === 'No scoring rule changes.') {
      setFormError('Change a scoring rule before you publish.');
      return;
    }
    setFormError(null);
    setConfirm(true);
  }

  async function confirmPublish() {
    const result = form.validate();
    if (!result.ok) {
      setFormError(result.message);
      setConfirm(false);
      return;
    }
    try {
      const published = await publish.mutateAsync({
        config: result.config,
        summary: diffs.join(' · '),
      });
      router.replace(`/challenges/${id}/official?published=${published.version}`);
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  }

  if (!allowed) {
    return (
      <View className="flex-1 px-4 pt-6" style={{ backgroundColor: THEME.background }}>
        <AppText className="text-sm leading-5 text-muted">
          Only the host, a moderator, or Official can change scoring.
        </AppText>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: THEME.background }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View
          className="mb-4 px-4 py-3"
          style={{ backgroundColor: AMBER_BG, borderRadius: THEME.radius }}>
          <AppText className="text-[14px] font-semibold leading-5" style={{ color: AMBER_INK }}>
            {BANNER_COPY}
          </AppText>
        </View>

        {challengeQuery.isLoading && !challenge ? (
          <AppText className="text-sm leading-5 text-muted">Loading scoring rules…</AppText>
        ) : confirm ? (
          <Card>
            <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Confirm version {nextVersion}
            </AppText>
            <AppText className="mt-2 text-[17px] font-semibold leading-6 text-charcoal">
              Publish scoring change
            </AppText>
            <AppText className="mt-2 text-[13px] leading-5 text-muted">{LIVE_COPY}</AppText>
            <AppText className="mt-2 text-[13px] leading-5 text-muted">{effective}</AppText>
            {saved ? (
              <AppText className="mt-3 text-[13px] leading-5 text-muted">
                Current ACTIVE version {saved.version}. New version {nextVersion} starts next challenge
                day.
              </AppText>
            ) : null}
            <View className="mt-4 gap-2">
              {diffs.map((line) => (
                <AppText key={line} className="text-[14px] leading-5 text-charcoal">
                  {line}
                </AppText>
              ))}
            </View>
          </Card>
        ) : (
          <ComparablePointsEditor form={form} />
        )}
      </ScrollView>

      <View
        className="gap-2 px-4 pt-2"
        style={{
          borderTopWidth: 1,
          borderTopColor: THEME.border,
          paddingBottom: Math.max(insets.bottom, 12),
          backgroundColor: THEME.background,
        }}>
        {formError || form.error ? (
          <AppText className="text-sm leading-5 text-coral-dark">{formError ?? form.error}</AppText>
        ) : null}
        {confirm ? (
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button title="Back to edit" variant="outline" onPress={() => setConfirm(false)} />
            </View>
            <View className="flex-1">
              <Button
                title={`Publish version ${nextVersion}`}
                loading={publish.isPending}
                onPress={() => void confirmPublish()}
              />
            </View>
          </View>
        ) : (
          <Button title="Publish scoring change" onPress={onPublishPress} />
        )}
      </View>
    </View>
  );
}
