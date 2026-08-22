import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { CaptureSourceBadge, HealthProofCaption } from '@/components/challenge/HealthProofCaption';
import { ProofUploader } from '@/components/challenge/ProofUploader';
import { OfficialDayClock } from '@/components/challenge/OfficialDayClock';
import { MascotState } from '@/components/mascot/MascotState';
import { Button } from '@/components/ui/Button';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useChallenge, useMyParticipation } from '@/hooks/useChallenge';
import { useAuth } from '@/hooks/useAuth';
import { usePeriodCheckin, useSaveCheckinProof, useSubmitCheckin } from '@/hooks/useChallengeCheckin';
import type { HealthWorkout } from '@/services/health/types';
import { requiredChallengeProofs } from '@/lib/challenges';
import {
  beginCameraProof,
  captureTypeForMethod,
  legacyTypeForProof,
  partSatisfies,
  proofDisplayName,
  proofsAreHonorOnly,
  type ChallengeProof,
  type ChallengeProofPart,
} from '@/lib/challengeProofs';
import { isOfficialSeriesChallenge } from '@/lib/officialSeries';
import { copy } from '@/lib/copy';
import { upsertHealthWorkout } from '@/lib/health/remote';
import { getHealthProvider } from '@/services/health';
import { hasChallengeStarted, isClosedForLogs, loggingOpensHelper } from '@/lib/settlement';
import { THEME } from '@/lib/theme';
import { getCheckinSubmitMessage, getErrorMessage } from '@/utils/errors';

type SlotDraft = {
  uri?: string;
  mimeType?: string | null;
  text?: string;
  fromLibrary?: boolean;
};

function LoggedState({ onBack }: { onBack: () => void }) {
  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: copy('checkin.checkedIn') }} />
      <View className="flex-1 px-5 pt-6">
        <View
          className="rounded-blob px-4 py-4"
          style={{ backgroundColor: THEME.accentSoft }}>
          <AppText className="text-center text-[18px] font-bold" style={{ color: THEME.accent }}>
            Checked in today
          </AppText>
          <AppText className="mt-2 text-center text-sm leading-5 text-muted">
            Come back tomorrow for the next proof set.
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
  const checkinQuery = usePeriodCheckin(id, challengeQuery.data);
  const saveProof = useSaveCheckinProof(id);
  const submitCheckin = useSubmitCheckin(id);

  const [drafts, setDrafts] = useState<Record<string, SlotDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [skippedAuto, setSkippedAuto] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const challenge = challengeQuery.data;
  const proofSteps = requiredChallengeProofs(challenge);
  const phase = checkinQuery.data?.phase ?? 'none';
  const honorOnly = proofsAreHonorOnly(proofSteps);

  useEffect(() => {
    if (!challenge || !isOfficialSeriesChallenge(challenge) || challenge.status !== 'live') {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  useEffect(() => {
    const parts = checkinQuery.data?.proof_parts;
    if (!parts) {
      return;
    }
    const steps = requiredChallengeProofs(challenge);
    setDrafts((current) => {
      const next = { ...current };
      for (const proof of steps) {
        const part = parts[proof.id];
        if (!part) {
          continue;
        }
        next[proof.id] = {
          uri: part.healthWorkoutId ? `health:${part.healthWorkoutId}` : part.url ?? current[proof.id]?.uri,
          mimeType: current[proof.id]?.mimeType,
          text: part.text ?? current[proof.id]?.text,
          fromLibrary: part.fromLibrary ?? current[proof.id]?.fromLibrary,
        };
      }
      return next;
    });
  }, [challenge, checkinQuery.data?.id, checkinQuery.data?.proof_parts, checkinQuery.data?.updated_at]);

  const filledCount = proofSteps.filter((proof) => partSatisfies(proof, slotPart(proof, drafts[proof.id]))).length;
  const allReady = proofSteps.length > 0 && filledCount === proofSteps.length;
  const busy = saveProof.isPending || submitCheckin.isPending;
  const firstCamera = beginCameraProof(proofSteps);

  function onMedia(proofId: string, uri: string, mimeType?: string | null, fromLibrary?: boolean) {
    if (busy) {
      return;
    }
    setDrafts((current) => ({ ...current, [proofId]: { ...current[proofId], uri, mimeType, fromLibrary } }));
    setError(null);
  }

  function onText(proofId: string, text: string) {
    if (busy) {
      return;
    }
    setDrafts((current) => ({ ...current, [proofId]: { ...current[proofId], text } }));
    setError(null);
  }

  async function persistProof(proof: ChallengeProof, draft?: SlotDraft) {
    if (!id) {
      return;
    }
    setError(null);
    try {
      await saveProof.mutateAsync({
        challengeId: id,
        proof,
        uri: draft?.uri,
        mimeType: draft?.mimeType,
        text: draft?.text,
        fromLibrary: draft?.fromLibrary,
      });
    } catch (caught) {
      setError(getErrorMessage(caught));
      throw caught;
    }
  }

  async function onCaptured(
    proof: ChallengeProof,
    uri: string,
    mimeType?: string | null,
    fromLibrary?: boolean,
  ) {
    onMedia(proof.id, uri, mimeType, fromLibrary);
    setCaptureId(null);
    setSkippedAuto(true);
    try {
      await persistProof(proof, { uri, mimeType, fromLibrary });
    } catch (caught) {
      Alert.alert('Couldn’t save that proof', getErrorMessage(caught));
    }
  }

  async function onBeginHonor() {
    if (!id || busy) {
      return;
    }
    setError(null);
    try {
      await saveProof.mutateAsync({ challengeId: id });
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }

  async function onSubmit() {
    if (!id || !allReady || busy || phase === 'submitted') {
      return;
    }
    setError(null);
    try {
      const savedParts = checkinQuery.data?.proof_parts ?? {};
      for (const proof of proofSteps) {
        if (partSatisfies(proof, savedParts[proof.id])) {
          continue;
        }
        if (proof.method === 'honor') {
          continue;
        }
        await persistProof(proof, drafts[proof.id]);
      }
      if (phase === 'none' && honorOnly) {
        await saveProof.mutateAsync({ challengeId: id });
      }
      await submitCheckin.mutateAsync();
      router.back();
    } catch (caught) {
      setError(getCheckinSubmitMessage(caught));
    }
  }

  async function onAttachHealth(workout: HealthWorkout) {
    if (!id || busy) {
      return;
    }
    if (phase === 'submitted') {
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
        await onCaptured(hrProof, `health:${healthWorkoutId}`);
      } catch (caught) {
        setError(getErrorMessage(caught));
      }
    }
  }

  if (challengeQuery.isLoading || participationLoading || checkinQuery.isLoading) {
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

  if (phase === 'submitted' && !busy) {
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
  const shouldAutoOpen =
    phase === 'none' && !skippedAuto && !honorOnly && Boolean(firstCamera) && !drafts[firstCamera?.id ?? '']?.uri;
  const activeCaptureId = captureId ?? (shouldAutoOpen ? firstCamera?.id ?? null : null);
  const activeProof = proofSteps.find((proof) => proof.id === activeCaptureId) ?? null;

  if (activeProof && (activeProof.method === 'photo' || activeProof.method === 'video' || activeProof.method === 'hr')) {
    return (
      <Screen padded={false} edges={TAB_ROOT_EDGES}>
        <Stack.Screen options={{ headerShown: false }} />
        <ProofUploader
          type={legacyTypeForProof(activeProof) ?? captureTypeForMethod(activeProof.method)}
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
            attaching: saveProof.isPending,
            challenge,
            onAttach: onAttachHealth,
          }}
          onPicked={(uri, mimeType, meta) => {
            void onCaptured(activeProof, uri, mimeType, meta?.fromLibrary);
          }}
          onCancel={() => {
            setCaptureId(null);
            setSkippedAuto(true);
            if (phase === 'none') {
              router.back();
            }
          }}
        />
      </Screen>
    );
  }

  const screenTitle =
    phase === 'ready' ? copy('checkin.submit') : phase === 'in_progress' ? copy('checkin.continue') : copy('checkin.begin');

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES}>
      <Stack.Screen options={{ title: screenTitle }} />
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
        <AppText className="text-center text-sm text-muted">{copy('checkin.emptyBob')}</AppText>
        {isOfficialSeriesChallenge(challenge) && (phase === 'in_progress' || phase === 'ready') ? (
          <AppText className="mt-2 text-center text-[13px] font-semibold" style={{ color: THEME.accent }}>
            {copy('checkin.submitBanner')}
          </AppText>
        ) : null}

        {honorOnly && phase === 'none' ? (
          <View className="mt-8">
            <Button
              title={copy('checkin.imStarting')}
              size="lg"
              loading={busy}
              disabled={busy}
              onPress={() => void onBeginHonor()}
            />
          </View>
        ) : (
          <View className="mt-5 gap-4">
            {proofSteps.map((proof) => {
              const done = partSatisfies(proof, slotPart(proof, drafts[proof.id]));
              return (
                <View
                  key={proof.id}
                  className="rounded-blob border px-3 py-3"
                  style={{ borderColor: THEME.border, backgroundColor: THEME.surface }}>
                  <View className="mb-2 flex-row items-center" style={{ gap: 8 }}>
                    <View
                      className="h-6 w-6 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: done ? THEME.accentSoft : THEME.surface2,
                        borderWidth: 1,
                        borderColor: done ? THEME.accent : THEME.border,
                      }}>
                      {done ? <Glyph name={GLYPH.check} color={THEME.accent} size={14} /> : null}
                    </View>
                    <AppText className="flex-1 text-[15px] font-bold text-charcoal">
                      {proofDisplayName(proof)}
                    </AppText>
                  </View>
                  {proof.method === 'honor' ? (
                    <AppText className="text-sm text-muted">Honor. Confirm to check in.</AppText>
                  ) : proof.method === 'checkin' ? (
                    <Input
                      placeholder="What did you do?"
                      value={drafts[proof.id]?.text ?? ''}
                      onChangeText={(value) => onText(proof.id, value)}
                      onBlur={() => {
                        const text = drafts[proof.id]?.text?.trim() ?? '';
                        if (text && !done) {
                          void persistProof(proof, { text });
                        }
                      }}
                      editable={!busy && phase !== 'submitted'}
                    />
                  ) : done ? (
                    drafts[proof.id]?.uri?.startsWith('health:') ||
                    checkinQuery.data?.proof_parts?.[proof.id]?.healthWorkoutId ? (
                      <HealthProofCaption
                        healthWorkoutId={
                          checkinQuery.data?.proof_parts?.[proof.id]?.healthWorkoutId ??
                          drafts[proof.id]?.uri?.replace(/^health:/, '')
                        }
                      />
                    ) : (
                      <CaptureSourceBadge fromLibrary={drafts[proof.id]?.fromLibrary} />
                    )
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${proofDisplayName(proof)}`}
                      onPress={() => setCaptureId(proof.id)}
                      style={{ minHeight: 44, justifyContent: 'center' }}>
                      <AppText className="text-[15px] font-semibold" style={{ color: THEME.accent }}>
                        Add this proof
                      </AppText>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {missing.length > 0 && filledCount > 0 ? (
          <AppText className="mt-4 text-sm leading-5 text-muted">
            Still needed: {missing.map((proof) => proofDisplayName(proof)).join(', ')}.
          </AppText>
        ) : null}

        {error ? (
          <AppText className="mt-4 text-sm leading-5 text-coral-dark">{error}</AppText>
        ) : null}

        <View className="mt-6">
          {allReady && phase !== 'submitted' && phase !== 'none' ? (
            <Button
              title={copy('checkin.submit')}
              size="lg"
              loading={busy}
              disabled={busy}
              onPress={() => void onSubmit()}
            />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
