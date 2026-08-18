import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ProofUploader } from '@/components/challenge/ProofUploader';
import { MascotState } from '@/components/mascot/MascotState';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useChallenge, useMyParticipation } from '@/hooks/useChallenge';
import { useSubmitWorkout, useTodaySubmission } from '@/hooks/useWorkoutSubmission';
import { requiredProofTypes } from '@/lib/challenges';
import { hasChallengeStarted, isClosedForLogs, loggingOpensHelper } from '@/lib/settlement';
import { isImageProof, isVideoProof, proofMeta } from '@/lib/constants';
import { THEME } from '@/lib/theme';
import type { ProofType } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

type ProofDraft = Partial<Record<ProofType, { uri?: string; mimeType?: string | null }>>;

function LoggedState({ onBack }: { onBack: () => void }) {
  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Logged' }} />
      <View className="flex-1 px-5 pt-6">
        <View
          className="rounded-blob px-4 py-4"
          style={{ backgroundColor: THEME.accentSoft }}>
          <AppText className="text-center text-[18px] font-bold" style={{ color: THEME.accent }}>
            Today’s workout is logged
          </AppText>
          <AppText className="mt-2 text-center text-sm leading-5 text-muted">
            Come back tomorrow for the next proof set. One log per UTC day.
          </AppText>
        </View>
        <View className="mt-6">
          <Button title="Back to challenge" size="lg" onPress={onBack} />
        </View>
      </View>
    </Screen>
  );
}

export default function SubmitWorkoutScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const challengeQuery = useChallenge(id);
  const { participation, isLoading: participationLoading } = useMyParticipation(id);
  const today = useTodaySubmission(id);
  const submit = useSubmitWorkout();

  const [drafts, setDrafts] = useState<ProofDraft>({});
  const [error, setError] = useState<string | null>(null);

  const challenge = challengeQuery.data;
  const proofSteps = requiredProofTypes(challenge);
  const filledCount = proofSteps.filter((type) => Boolean(drafts[type]?.uri?.trim())).length;
  const allReady = proofSteps.length > 0 && filledCount === proofSteps.length;
  const busy = submit.isPending;
  const proofCountLabel =
    proofSteps.length === 1 ? '1 proof' : `${proofSteps.length} proofs`;

  function onPicked(type: ProofType, uri: string, mimeType?: string | null) {
    if (busy) {
      return;
    }
    setDrafts((current) => ({ ...current, [type]: { uri, mimeType } }));
    setError(null);
  }

  async function onConfirm() {
    if (!id || !allReady || busy) {
      return;
    }
    setError(null);
    try {
      const images = proofSteps.flatMap((type) => {
        const draft = drafts[type];
        if (!draft?.uri?.trim()) {
          return [];
        }
        return [{ type, uri: draft.uri.trim(), mimeType: draft.mimeType }];
      });
      if (images.length < proofSteps.length) {
        setError(`Add all ${proofCountLabel} to log today.`);
        return;
      }
      await submit.mutateAsync({
        challengeId: id,
        images,
      });
      router.back();
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }

  if (challengeQuery.isLoading || participationLoading || today.isLoading) {
    return (
      <Screen padded={false} edges={['left', 'right', 'bottom']}>
        <MascotState kind="loading" title="Opening today’s log" body="Checking what you still owe." />
      </Screen>
    );
  }

  if (!challenge || !participation) {
    return (
      <Screen padded={false} edges={['left', 'right', 'bottom']}>
        <MascotState
          kind="error"
          title="Join first"
          body="Join this challenge before logging."
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
          title="You have been eliminated"
          body="New logs are not accepted."
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
          title="This challenge hasn’t started yet."
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
        <Stack.Screen options={{ title: 'Logging closed' }} />
        <MascotState
          kind="empty"
          title="Logging is closed"
          body="This challenge has ended. New logs are not accepted."
          actionLabel="Back to challenge"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const missing = proofSteps.filter((type) => !drafts[type]?.uri?.trim());

  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Log workout' }} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-10 pt-2"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <AppText className="text-center text-sm text-muted">
          Add {proofCountLabel}, then confirm. One log per UTC day.
        </AppText>

        <View className="mt-5 gap-6">
          {proofSteps.map((type) => (
            <View key={type}>
              <AppText className="mb-2 text-[15px] font-bold text-charcoal">
                {proofMeta(type).label}
              </AppText>
              {isImageProof(type) || isVideoProof(type) ? (
                <ProofUploader
                  type={type}
                  uri={drafts[type]?.uri}
                  compact
                  locked={busy}
                  onPicked={(uri, mimeType) => onPicked(type, uri, mimeType)}
                />
              ) : (
                <Input
                  placeholder={type === 'link' ? 'https://' : proofMeta(type).helper}
                  value={drafts[type]?.uri ?? ''}
                  onChangeText={(value) => onPicked(type, value)}
                  autoCapitalize={type === 'link' ? 'none' : 'sentences'}
                  keyboardType={type === 'link' ? 'url' : 'default'}
                  editable={!busy}
                />
              )}
            </View>
          ))}
        </View>

        {missing.length > 0 && filledCount > 0 ? (
          <AppText className="mt-4 text-sm leading-5 text-muted">
            Still needed: {missing.map((type) => proofMeta(type).short).join(', ')}.
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
