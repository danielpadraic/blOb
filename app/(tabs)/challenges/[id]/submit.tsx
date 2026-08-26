import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';

import { CheckinComposer, type CheckinExtra } from '@/components/challenge/CheckinComposer';
import { HealthWorkoutPicker } from '@/components/challenge/HealthWorkoutPicker';
import { ProofUploader } from '@/components/challenge/ProofUploader';
import { OfficialDayClock } from '@/components/challenge/OfficialDayClock';
import { MascotState } from '@/components/mascot/MascotState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useChallenge, useMyParticipation } from '@/hooks/useChallenge';
import { useAuth } from '@/hooks/useAuth';
import { usePeriodCheckin, useSaveCheckinProof, useSubmitCheckin } from '@/hooks/useChallengeCheckin';
import type { HealthWorkout } from '@/services/health/types';
import { CHECKIN_BOB, checkinStageHint, checkinStageLabel, classifyCheckinError, isLikelyOffline } from '@/lib/checkin';
import { requiredChallengeProofs } from '@/lib/challenges';
import {
  beginCameraProof,
  captureTypeForMethod,
  extraProofImageUrls,
  legacyTypeForProof,
  partSatisfies,
  proofDisplayName,
  proofsAreHonorOnly,
  uniqueProofUrls,
  type ChallengeProof,
  type ChallengeProofPart,
} from '@/lib/challengeProofs';
import { successHaptic } from '@/lib/haptics';
import { isOfficialSeriesChallenge } from '@/lib/officialSeries';
import { copy } from '@/lib/copy';
import {
  composeCheckinNotes,
  proofPrefersHealthAttach,
  stripHealthSummaryFromNotes,
  toCheckinHealthProof,
  type CheckinHealthProof,
} from '@/lib/health/attachProof';
import { upsertHealthWorkout } from '@/lib/health/remote';
import { getHealthProvider } from '@/services/health';
import { usesTotalCountCheckins } from '@/lib/challengeExperience';
import { hasChallengeStarted, isClosedForLogs, loggingOpensHelper } from '@/lib/settlement';
import { supabase } from '@/lib/supabase';
import type { MentionDoc } from '@/lib/mentions';
import { getCheckinSubmitMessage, getErrorMessage } from '@/utils/errors';
import { uploadPostAttachment } from '@/utils/upload';

type SlotDraft = {
  uri?: string;
  mimeType?: string | null;
  text?: string;
  fromLibrary?: boolean;
  health?: CheckinHealthProof | null;
};

function LoggedState({ onBack }: { onBack: () => void }) {
  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: copy('checkin.checkedIn') }} />
      <MascotState
        kind="success"
        title={copy('checkin.checkedIn')}
        body={copy('checkin.alreadyBob')}
        actionLabel="Back to challenge"
        onAction={onBack}
      />
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
  return {
    method: proof.method,
    url: healthWorkoutId ? '' : draft?.uri ?? '',
    healthWorkoutId,
    health: draft?.health ?? null,
  };
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
  const [failKind, setFailKind] = useState<'offline' | 'permission' | 'upload' | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [skippedAuto, setSkippedAuto] = useState(false);
  const [preferCamera, setPreferCamera] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [extras, setExtras] = useState<CheckinExtra[]>([]);
  const [caption, setCaption] = useState<MentionDoc>({ text: '', chips: [] });

  const challenge = challengeQuery.data;
  const proofSteps = requiredChallengeProofs(challenge);
  const totalCount = usesTotalCountCheckins(challenge);
  const rawPhase = checkinQuery.data?.phase ?? 'none';
  const phase = totalCount && rawPhase === 'submitted' ? 'none' : rawPhase;
  const honorOnly = proofsAreHonorOnly(proofSteps);

  useEffect(() => {
    if (!challenge || !isOfficialSeriesChallenge(challenge) || challenge.status !== 'live') {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  useEffect(() => {
    if (usesTotalCountCheckins(challenge) && checkinQuery.data?.phase === 'submitted') {
      return;
    }
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
          health: part.health ?? current[proof.id]?.health ?? null,
        };
      }
      return next;
    });
    if (checkinQuery.data?.notes) {
      const snapshot = Object.values(parts).map((part) => part.health).find(Boolean) ?? null;
      const text = stripHealthSummaryFromNotes(String(checkinQuery.data.notes), snapshot);
      setCaption((current) => (current.text.trim() ? current : { text, chips: current.chips }));
    }
    const extraUrls = extraProofImageUrls(steps, parts);
    if (extraUrls.length > 0) {
      setExtras((current) => {
        if (current.some((item) => !item.remoteUrl && item.kind !== 'gif')) {
          return current;
        }
        const known = new Set(current.map((item) => item.remoteUrl ?? item.uri));
        const incoming = extraUrls.filter((url) => !known.has(url));
        if (incoming.length === 0 && current.length > 0) {
          return current;
        }
        return [
          ...current,
          ...incoming.map((url, index) => ({
            id: `saved-${index}-${url.slice(-12)}`,
            uri: url,
            kind: 'photo' as const,
            remoteUrl: url,
            name: 'Photo',
          })),
        ];
      });
    }
  }, [challenge, checkinQuery.data?.id, checkinQuery.data?.notes, checkinQuery.data?.proof_parts, checkinQuery.data?.updated_at]);

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

  function attachedHealth(): CheckinHealthProof | null {
    for (const proof of proofSteps) {
      const health = drafts[proof.id]?.health;
      if (health) {
        return health;
      }
    }
    return null;
  }

  async function persistProof(proof: ChallengeProof, draft?: SlotDraft) {
    if (!id) {
      return;
    }
    setError(null);
    setFailKind(null);
    if (isLikelyOffline()) {
      setFailKind('offline');
      setError(copy('checkin.offlineBob'));
      throw new Error(copy('checkin.offlineBob'));
    }
    try {
      return await saveProof.mutateAsync({
        challengeId: id,
        proof,
        uri: draft?.uri,
        mimeType: draft?.mimeType,
        text: draft?.text,
        fromLibrary: draft?.fromLibrary,
        health: draft?.health ?? null,
      });
    } catch (caught) {
      const kind = classifyCheckinError(caught);
      setFailKind(kind === 'offline' || kind === 'permission' || kind === 'upload' ? kind : kind === 'generic' ? 'upload' : null);
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

  async function persistExtraMedia(items: CheckinExtra[]) {
    if (!id) {
      return;
    }
    const remote = uniqueProofUrls(
      items.map((item) => item.remoteUrl ?? (item.kind === 'gif' ? item.uri : null)),
    );
    const photoProof = proofSteps.find(
      (proof) =>
        (proof.method === 'photo' || proof.method === 'video') &&
        partSatisfies(proof, slotPart(proof, drafts[proof.id])),
    );
    const primaryRemote = photoProof
      ? checkinQuery.data?.proof_parts?.[photoProof.id]?.url ??
        (drafts[photoProof.id]?.uri && /^https?:\/\//i.test(drafts[photoProof.id]?.uri ?? '')
          ? drafts[photoProof.id]?.uri
          : null)
      : null;
    await saveProof.mutateAsync({
      challengeId: id,
      extraMedia: remote,
      ...(photoProof && primaryRemote
        ? {
            proof: photoProof,
            uri: primaryRemote,
            urls: uniqueProofUrls([primaryRemote, ...remote]),
          }
        : {}),
    });
  }

  function handleExtrasChange(next: CheckinExtra[]) {
    const removed = next.length < extras.length;
    setExtras(next);
    if (removed) {
      void persistExtraMedia(next).catch((caught) => {
        setError(getErrorMessage(caught));
      });
    }
  }

  async function onRemoveProof(proof: ChallengeProof) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[proof.id];
      return next;
    });
    if (!id) {
      return;
    }
    try {
      await saveProof.mutateAsync({ challengeId: id, proof, clearProof: true });
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }

  async function onSubmit() {
    if (!id || !allReady || busy || phase === 'submitted') {
      return;
    }
    setError(null);
    setFailKind(null);
    if (isLikelyOffline()) {
      setFailKind('offline');
      setError(copy('checkin.offlineBob'));
      return;
    }
    try {
      let savedParts = { ...(checkinQuery.data?.proof_parts ?? {}) };
      for (const proof of proofSteps) {
        if (proof.method === 'honor') {
          continue;
        }
        const draft = drafts[proof.id];
        if (partSatisfies(proof, savedParts[proof.id]) && partSatisfies(proof, slotPart(proof, draft))) {
          continue;
        }
        if (!partSatisfies(proof, slotPart(proof, draft))) {
          continue;
        }
        const row = await persistProof(proof, draft);
        if (row?.proof_parts) {
          savedParts = row.proof_parts;
        }
      }
      const uploadedExtras: CheckinExtra[] = [];
      const extraUrls: string[] = [];
      const failedExtras: string[] = [];
      if (user?.id) {
        for (const [index, extra] of extras.entries()) {
          if (extra.remoteUrl) {
            extraUrls.push(extra.remoteUrl);
            uploadedExtras.push(extra);
            continue;
          }
          if (extra.kind === 'gif') {
            extraUrls.push(extra.uri);
            uploadedExtras.push({ ...extra, remoteUrl: extra.uri });
            continue;
          }
          try {
            const remoteUrl = await uploadPostAttachment({
              uri: extra.uri,
              userId: user.id,
              fileStem: `checkin-extra-${Date.now()}-${index}`,
              mimeType: extra.mimeType ?? extra.blob?.type,
              blob: extra.blob,
              originalName: extra.name,
            });
            extraUrls.push(remoteUrl);
            uploadedExtras.push({ ...extra, remoteUrl });
          } catch (uploadError) {
            failedExtras.push(extra.name ?? 'Photo');
            console.log('[blob:checkin-extra]', getErrorMessage(uploadError));
          }
        }
        if (uploadedExtras.length) {
          setExtras(uploadedExtras);
        }
      }
      const photoProof = proofSteps.find(
        (proof) =>
          (proof.method === 'photo' || proof.method === 'video') &&
          partSatisfies(proof, slotPart(proof, drafts[proof.id])),
      );
      const primaryRemote = photoProof
        ? savedParts[photoProof.id]?.url ||
          (drafts[photoProof.id]?.uri && /^https?:\/\//i.test(drafts[photoProof.id]?.uri ?? '')
            ? drafts[photoProof.id]?.uri
            : null)
        : null;
      const notes = composeCheckinNotes(caption.text, attachedHealth());
      await saveProof.mutateAsync({
        challengeId: id,
        notes,
        extraMedia: extraUrls,
        ...(photoProof && primaryRemote
          ? {
              proof: photoProof,
              uri: primaryRemote,
              urls: uniqueProofUrls([primaryRemote, ...extraUrls]),
            }
          : {}),
      });
      if (failedExtras.length > 0) {
        setError(
          failedExtras.length === 1
            ? 'One photo didn’t upload. The rest are ready to send.'
            : `${failedExtras.length} photos didn’t upload. The rest are ready to send.`,
        );
      }
      const submitted = await submitCheckin.mutateAsync();
      const mentionIds = [...new Set(caption.chips.map((chip) => chip.userId).filter((chipId) => chipId && chipId !== user?.id))];
      if (mentionIds.length > 0 && submitted?.id && user?.id) {
        try {
          const post = await supabase
            .from('posts')
            .select('id')
            .eq('checkin_id', submitted.id)
            .is('deleted_at', null)
            .maybeSingle();
          const postId = (post.data as { id?: string } | null)?.id;
          if (postId) {
            await supabase.from('post_mentions').insert(
              mentionIds.map((mentioned_user_id) => ({
                post_id: postId,
                mentioned_user_id,
                author_id: user.id,
              })),
            );
          }
        } catch {
          // Caption already saved; mention notify is best-effort.
        }
      }
      await successHaptic();
      setJustSubmitted(true);
    } catch (caught) {
      const kind = classifyCheckinError(caught);
      setFailKind(kind === 'offline' || kind === 'permission' || kind === 'upload' ? kind : null);
      setError(getCheckinSubmitMessage(caught));
    }
  }

  async function onAttachHealth(workout: HealthWorkout, proof?: ChallengeProof | null) {
    if (!id || busy) {
      return;
    }
    if (phase === 'submitted') {
      router.replace(`/challenges/${id}?logged=1`);
      return;
    }
    setError(null);
    const target =
      proof ??
      proofSteps.find((item) => item.method === 'hr') ??
      proofSteps.find((item) => item.method === 'photo' || item.method === 'video');
    if (!target || !user?.id) {
      return;
    }
    try {
      const provider = getHealthProvider();
      const enriched = provider?.enrichHeartRate
        ? await provider.enrichHeartRate(workout)
        : workout;
      const snapshot = toCheckinHealthProof(enriched);
      const healthWorkoutId = await upsertHealthWorkout(user.id, enriched);
      const draft: SlotDraft = { uri: `health:${healthWorkoutId}`, health: snapshot };
      setDrafts((current) => ({ ...current, [target.id]: { ...current[target.id], ...draft } }));
      setCaptureId(null);
      setSkippedAuto(true);
      setPreferCamera(false);
      await persistProof(target, draft);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }

  if (challengeQuery.isLoading || participationLoading || checkinQuery.isLoading) {
    return (
      <Screen padded={false} edges={['left', 'right', 'bottom']}>
        <MascotState kind="loading" title="Opening today’s check-in" body={CHECKIN_BOB.loading} />
      </Screen>
    );
  }

  if (justSubmitted) {
    return (
      <Screen padded={false} edges={['left', 'right', 'bottom']}>
        <Stack.Screen options={{ title: copy('checkin.checkedIn') }} />
        <MascotState
          kind="success"
          title={copy('checkin.checkedIn')}
          body={copy('checkin.successBob')}
          actionLabel="Back to challenge"
          onAction={() => router.replace(`/challenges/${id}`)}
        />
      </Screen>
    );
  }

  if (failKind === 'offline' || failKind === 'permission' || failKind === 'upload') {
    return (
      <Screen padded={false} edges={['left', 'right', 'bottom']}>
        <Stack.Screen options={{ title: checkinStageLabel(phase) }} />
        <MascotState
          kind="error"
          title={
            failKind === 'offline'
              ? copy('checkin.offlineBob')
              : failKind === 'permission'
                ? copy('checkin.permissionBob')
                : copy('checkin.uploadFailBob')
          }
          body={error ?? CHECKIN_BOB[failKind]}
          actionLabel="Try again"
          onAction={() => {
            setFailKind(null);
            setError(null);
          }}
        />
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
          body={loggingOpensHelper(challenge) || copy('checkin.notLiveBob')}
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
  const iosHealthReady = Platform.OS === 'ios' && Boolean(getHealthProvider()?.isAvailable());
  const firstEmptyMedia =
    missing.find((proof) => proof.method === 'photo' || proof.method === 'video' || proof.method === 'hr') ?? null;
  const firstHealth = firstEmptyMedia && proofPrefersHealthAttach(firstEmptyMedia, challenge) ? firstEmptyMedia : null;
  const shouldAutoHealth =
    phase === 'none' &&
    !skippedAuto &&
    !preferCamera &&
    iosHealthReady &&
    Boolean(firstHealth) &&
    !drafts[firstHealth?.id ?? '']?.uri;
  const shouldAutoOpen =
    phase === 'none' &&
    !skippedAuto &&
    !honorOnly &&
    Boolean(firstCamera) &&
    !drafts[firstCamera?.id ?? '']?.uri &&
    !shouldAutoHealth;
  const activeCaptureId =
    captureId ?? (shouldAutoHealth ? firstHealth?.id ?? null : shouldAutoOpen ? firstCamera?.id ?? null : null);
  const activeProof = proofSteps.find((proof) => proof.id === activeCaptureId) ?? null;
  const showHealthFirst =
    Boolean(activeProof) &&
    iosHealthReady &&
    !preferCamera &&
    proofPrefersHealthAttach(activeProof, challenge);

  if (showHealthFirst && activeProof) {
    return (
      <Screen padded={false} edges={TAB_ROOT_EDGES}>
        <Stack.Screen options={{ title: 'Check-in' }} />
        <HealthWorkoutPicker
          challengeTitle={challenge.title}
          challenge={challenge}
          proof={activeProof}
          minMinutes={challenge.min_minutes}
          frequency={challenge.frequency}
          startsAt={challenge.starts_at}
          isOfficial={challenge.is_official}
          seriesId={challenge.series_id}
          timezone={challenge.timezone}
          daysRequired={challenge.days_required}
          dayWindows={challenge.day_windows}
          userId={user?.id}
          attaching={saveProof.isPending}
          onAttach={(workout) => onAttachHealth(workout, activeProof)}
          onAddPhoto={() => setPreferCamera(true)}
          onClose={() => {
            setCaptureId(null);
            setSkippedAuto(true);
            setPreferCamera(false);
            if (phase === 'none' && !captureId) {
              router.back();
            }
          }}
        />
      </Screen>
    );
  }

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
            proof: activeProof,
            challenge,
            onAttach: (workout) => onAttachHealth(workout, activeProof),
          }}
          onPicked={(uri, mimeType, meta) => {
            void onCaptured(activeProof, uri, mimeType, meta?.fromLibrary);
          }}
          onCancel={() => {
            if (iosHealthReady && proofPrefersHealthAttach(activeProof, challenge)) {
              setPreferCamera(false);
              setSkippedAuto(true);
              return;
            }
            setCaptureId(null);
            setSkippedAuto(true);
            setPreferCamera(false);
            if (phase === 'none') {
              router.back();
            }
          }}
        />
      </Screen>
    );
  }

  const composerProofs = proofSteps.filter((proof) => proof.method !== 'honor' && proof.method !== 'checkin');
  const textProofs = proofSteps.filter((proof) => proof.method === 'checkin');

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES}>
      <Stack.Screen options={{ title: 'Check-in' }} />
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
        <AppText className="mb-3 text-center text-sm text-muted">
          {checkinStageHint(
            phase,
            missing.map((proof) => proofDisplayName(proof)),
          ) || copy('checkin.emptyBob')}
        </AppText>

        {textProofs.map((proof) => (
          <View key={proof.id} className="mb-3">
            <Input
              placeholder={proofDisplayName(proof) || 'What did you do?'}
              value={drafts[proof.id]?.text ?? ''}
              onChangeText={(value) => onText(proof.id, value)}
              onBlur={() => {
                const text = drafts[proof.id]?.text?.trim() ?? '';
                if (text) {
                  void persistProof(proof, { text });
                }
              }}
              editable={!busy && phase !== 'submitted'}
            />
          </View>
        ))}

        <CheckinComposer
          proofs={composerProofs}
          drafts={drafts}
          extras={extras}
          initialCaption={stripHealthSummaryFromNotes(checkinQuery.data?.notes ?? '', attachedHealth())}
          allReady={allReady}
          busy={busy}
          canSend={allReady && phase !== 'submitted'}
          onAddProof={(proof) => {
            if (proof.method === 'photo' || proof.method === 'video' || proof.method === 'hr') {
              setPreferCamera(Platform.OS !== 'ios' || !proofPrefersHealthAttach(proof, challenge));
              setCaptureId(proof.id);
            }
          }}
          onRemoveProof={(proof) => void onRemoveProof(proof)}
          onExtrasChange={handleExtrasChange}
          onCaptionChange={setCaption}
          onSend={() => void onSubmit()}
        />

        {error ? (
          <AppText className="mt-4 text-sm leading-5 text-coral-dark">{error}</AppText>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
