import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ProofUploader } from '@/components/challenge/ProofUploader';
import { OfficialDayClock } from '@/components/challenge/OfficialDayClock';
import { MascotState } from '@/components/mascot/MascotState';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useChallenge, useMyParticipation } from '@/hooks/useChallenge';
import { useAuth } from '@/hooks/useAuth';
import { useSubmitHealthWorkout, useSubmitWorkout, useTodaySubmission } from '@/hooks/useWorkoutSubmission';
import type { HealthWorkout } from '@/services/health/types';
import { requiredChallengeProofs } from '@/lib/challenges';
import {
  captureTypeForMethod,
  partSatisfies,
  proofDisplayName,
  type ChallengeProof,
  type ChallengeProofPart,
} from '@/lib/challengeProofs';
import { isOfficialSeriesChallenge } from '@/lib/officialSeries';
import { copy } from '@/lib/copy';
import { upsertHealthWorkout } from '@/lib/health/remote';
import { getHealthProvider } from '@/services/health';
import { hasChallengeStarted, isClosedForLogs, loggingOpensHelper } from '@/lib/settlement';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

type SlotDraft = {
  uri?: string;
  mimeType?: string | null;
  text?: string;
};

function LoggedState({ onBack }: { onBack: () => void }) {
  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Checked in' }} />
      <View className="flex-1 px-5 pt-6">
        <View
          className="rounded-blob px-4 py-4"
          style={{ backgroundColor: THEME.accentSoft }}>
          <AppText className="text-center text-[18px] font-bold" style={{ color: THEME.accent }}>
            Checked in today
          </AppText>
          <AppText className="mt-2 text-center text-sm leading-5 text-muted">
            Come back tomorrow for the next proof set. One check-in per UTC day.
          </AppText>
        </View>
        <View className="mt-6">
          <Button title="Back to challenge" size="lg" onPress={onBack} />
        </View>
      </View>
    </Screen>
  );
}

function slotPart(proof: ChallengeProof, draft: SlotDraft | undefined): ChallengeProofPart {
  if (proof.method === 'honor') {
    return { method: 'honor' };
  }
  if (proof.method === 'checkin') {
    return { method: 'checkin', text: draft?.text ?? draft?.uri ?? '' };
  }
  const healthWorkoutId = draft?.uri?.startsWith('health:') ? draft.uri.slice('health:'.length) : undefined;
  return { method: proof.method, url: healthWorkoutId ? '' : draft?.uri ?? '', healthWorkoutId };
}

export default function SubmitWorkoutScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const challengeQuery = useChallenge(id);
  const { participation, isLoading: participationLoading } = useMyParticipation(id);
  const { user } = useAuth();
  const today = useTodaySubmission(id, challengeQuery.data);
  const submit = useSubmitWorkout();
  const submitHealth = useSubmitHealthWorkout();

  const [drafts, setDrafts] = useState<Record<string, SlotDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [skippedAuto, setSkippedAuto] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const challenge = challengeQuery.data;
  const proofSteps = requiredChallengeProofs(challenge);

  useEffect(() => {
    if (!challenge || !isOfficialSeriesChallenge(challenge) || challenge.status !== 'live') {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  const filledCount = proofSteps.filter((proof) => partSatisfies(proof, slotPart(proof, drafts[proof.id]))).length;
  const allReady = proofSteps.length > 0 && filledCount === proofSteps.length;
  const busy = submit.isPending || submitHealth.isPending;
  const proofCountLabel =
    proofSteps.length === 1 ? '1 proof' : `${proofSteps.length} proofs`;

  function onMedia(proofId: string, uri: string, mimeType?: string | null) {
    if (busy) {
      return;
    }
    setDrafts((current) => ({ ...current, [proofId]: { ...current[proofId], uri, mimeType } }));
    setError(null);
  }

  function onText(proofId: string, text: string) {
    if (busy) {
      return;
    }
    setDrafts((current) => ({ ...current, [proofId]: { ...current[proofId], text } }));
    setError(null);
  }

  async function onConfirm() {
    if (!id || !allReady || busy) {
      return;
    }
    setError(null);
    try {
      const images: Array<{
        type: ReturnType<typeof captureTypeForMethod>;
        uri: string;
        mimeType?: string | null;
        proofId: string;
        text?: string | null;
      }> = [];
      for (const proof of proofSteps) {
        if (proof.method === 'honor') {
          continue;
        }
        if (proof.method === 'checkin') {
          const text = drafts[proof.id]?.text?.trim() ?? '';
          if (!text) {
            continue;
          }
          images.push({ type: captureTypeForMethod(proof.method), uri: text, text, proofId: proof.id });
          continue;
        }
        const draft = drafts[proof.id];
        if (!draft?.uri?.trim()) {
          continue;
        }
        images.push({
          type: captureTypeForMethod(proof.method),
          uri: draft.uri.trim(),
          mimeType: draft.mimeType,
          proofId: proof.id,
        });
      }
      if (!allReady) {
        setError(`Add all ${proofCountLabel} to check in today.`);
        return;
      }
      await submit.mutateAsync({
        challengeId: id,
        images,
        required: proofSteps,
      });
      router.back();
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }

  async function onAttachHealth(workout: HealthWorkout) {
    if (!id || busy) {
      return;
    }
    if (today.data) {
      router.replace(`/challenges/${id}?logged=1`);
      return;
    }
    setError(null);
    const hrProof = proofSteps.find((proof) => proof.method === 'hr');
    if (hrProof && user?.id) {
      try {
        const provider = getHealthProvider();
        const enriched = provider?.enrichHeartRate
          ? await provider.enrichHeartRate(workout)
          : workout;
        const healthWorkoutId = await upsertHealthWorkout(user.id, enriched);
        onMedia(hrProof.id, `health:${healthWorkoutId}`);
        setCaptureId(null);
        setSkippedAuto(true);
      } catch (caught) {
        setError(getErrorMessage(caught));
      }
      return;
    }
    await submitHealth.mutateAsync({ challengeId: id, workout });
    router.replace(`/challenges/${id}?logged=1`);
  }

  if (challengeQuery.isLoading || participationLoading || today.isLoading) {
    return (
      <Screen padded={false} edges={['left', 'right', 'bottom']}>
        <MascotState kind="loading" title="Opening today’s check-in" body="Checking what you still owe." />
      </Screen>
    );
  }

  if (!challenge || !participation) {
    return (
      <Screen padded={false} edges={['left', 'right', 'bottom']}>
        <MascotState
          kind="error"
          title={copy('challenge.joinFirst')}
          body="Join this challenge before you check in."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  if (today.data && !busy) {
    return <LoggedState onBack={() => router.back()} />;
  }

  if (Boolean(participation.eliminated_at)) {
    return (
      <Screen padded={false} edges={['left', 'right', 'bottom']}>
        <Stack.Screen options={{ title: 'Eliminated' }} />
        <MascotState
          kind="empty"
          title={copy('challenge.eliminated')}
          body="New check-ins are not accepted."
          actionLabel="Back to challenge"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  if (!hasChallengeStarted(challenge)) {
    return (
      <Screen padded={false} edges={['left', 'right', 'bottom']}>
        <Stack.Screen options={{ title: 'Not started' }} />
        <MascotState
          kind="empty"
          title={copy('challenge.notStarted')}
          body={loggingOpensHelper(challenge)}
          actionLabel="Back to challenge"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  if (isClosedForLogs({ ...challenge, eliminated: Boolean(participation.eliminated_at) })) {
    return (
      <Screen padded={false} edges={['left', 'right', 'bottom']}>
        <Stack.Screen options={{ title: 'Check-in closed' }} />
        <MascotState
          kind="empty"
          title={copy('challenge.logClosed')}
          body="This challenge has ended. New check-ins are not accepted."
          actionLabel="Back to challenge"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const missing = proofSteps.filter((proof) => !partSatisfies(proof, slotPart(proof, drafts[proof.id])));
  const firstCamera = proofSteps.find(
    (proof) =>
      (proof.method === 'photo' || proof.method === 'video' || proof.method === 'hr') &&
      !drafts[proof.id]?.uri?.trim(),
  );
  const activeCaptureId =
    captureId ?? (!skippedAuto && filledCount === proofSteps.filter((proof) => proof.method === 'honor').length
      ? firstCamera?.id ?? null
      : null);
  const activeProof = proofSteps.find((proof) => proof.id === activeCaptureId) ?? null;

  if (activeProof && (activeProof.method === 'photo' || activeProof.method === 'video' || activeProof.method === 'hr')) {
    return (
      <Screen padded={false} edges={TAB_ROOT_EDGES}>
        <Stack.Screen options={{ headerShown: false }} />
        <ProofUploader
          type={captureTypeForMethod(activeProof.method)}
          fill
          autoOpen
          locked={busy}
          health={{
            challengeId: id ?? challenge.id,
            challengeTitle: challenge.title,
            minMinutes: challenge.min_minutes,
            frequency: challenge.frequency,
            startsAt: challenge.starts_at,
            userId: user?.id,
            attaching: submitHealth.isPending,
            challenge,
            onAttach: onAttachHealth,
          }}
          onPicked={(uri, mimeType) => {
            onMedia(activeProof.id, uri, mimeType);
            setCaptureId(null);
            setSkippedAuto(true);
          }}
          onCancel={() => {
            setCaptureId(null);
            setSkippedAuto(true);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES}>
      <Stack.Screen options={{ title: 'Check in' }} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-10 pt-2"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {challenge && isOfficialSeriesChallenge(challenge) ? (
          <View className="mb-4">
            <OfficialDayClock challenge={challenge} now={new Date(nowMs)} variant="page" />
          </View>
        ) : null}
        <AppText className="text-center text-sm text-muted">
          {challenge && isOfficialSeriesChallenge(challenge)
            ? 'Add every required proof for this Official day. One proof fills one day.'
            : `Add ${proofCountLabel}, then confirm. One check-in per UTC day.`}
        </AppText>
        <AppText className="mt-1 text-center text-[12px] text-muted">{copy('create.proofsHelper')}</AppText>

        <View className="mt-5 gap-6">
          {proofSteps.map((proof) => (
            <View key={proof.id}>
              <AppText className="mb-2 text-[15px] font-bold text-charcoal">
                {proofDisplayName(proof)}
              </AppText>
              {proof.method === 'honor' ? (
                <AppText className="text-sm text-muted">Honor. Confirm to check in.</AppText>
              ) : proof.method === 'checkin' ? (
                <Input
                  placeholder="What did you do?"
                  value={drafts[proof.id]?.text ?? ''}
                  onChangeText={(value) => onText(proof.id, value)}
                  editable={!busy}
                />
              ) : (
                <ProofUploader
                  type={captureTypeForMethod(proof.method)}
                  uri={drafts[proof.id]?.uri}
                  compact
                  locked={busy}
                  health={{
                    challengeId: id ?? challenge.id,
                    challengeTitle: challenge.title,
                    minMinutes: challenge.min_minutes,
                    frequency: challenge.frequency,
                    startsAt: challenge.starts_at,
                    userId: user?.id,
                    attaching: submitHealth.isPending,
                    challenge,
                    onAttach: onAttachHealth,
                  }}
                  onRequestOpen={() => setCaptureId(proof.id)}
                  onPicked={(uri, mimeType) => onMedia(proof.id, uri, mimeType)}
                />
              )}
            </View>
          ))}
        </View>

        {missing.length > 0 && filledCount > 0 ? (
          <AppText className="mt-4 text-sm leading-5 text-muted">
            Still needed: {missing.map((proof) => proofDisplayName(proof)).join(', ')}.
          </AppText>
        ) : null}

        {error ? (
          <AppText className="mt-4 text-sm leading-5 text-coral-dark">{error}</AppText>
        ) : null}

        <View className="mt-6">
          <Button
            title={allReady ? 'Confirm' : `Add ${proofCountLabel}`}
            size="lg"
            loading={busy}
            disabled={!allReady || busy}
            onPress={() => void onConfirm()}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
