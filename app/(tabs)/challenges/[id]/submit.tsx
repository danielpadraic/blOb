import { useIsFocused, useLocalSearchParams, usePathname, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { CheckinComposer, type CheckinExtra } from '@/components/challenge/CheckinComposer';
import { PeriodCheckinDue } from '@/components/challenge/PeriodCheckinDue';
import {
  CheckinRouteErrorBoundary,
  CheckinSafeBoundary,
} from '@/components/challenge/CheckinSafeBoundary';
import { LocationProofRow } from '@/components/challenge/LocationProofRow';
import { HealthWorkoutPicker } from '@/components/challenge/HealthWorkoutPicker';
import { ProofUploader } from '@/components/challenge/ProofUploader';
import { MascotState } from '@/components/mascot/MascotState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useChallenge, useChallengeParticipants, useMyParticipation } from '@/hooks/useChallenge';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useQueryClient } from '@tanstack/react-query';
import { usePeriodCheckin, useSaveCheckinProof, useSubmitCheckin } from '@/hooks/useChallengeCheckin';
import { submitLocationProof } from '@/lib/challenges/stagedCheckin';
import { readLocationFix, locationPermissionGrantedThisSession } from '@/lib/locationDevice';
import { parseLocationPlace } from '@/lib/locationProof';
import type { HealthWorkout } from '@/services/health/types';
import {
  CHECKIN_BOB,
  canSendCheckin,
  shouldAutoOpenCheckinCamera,
  checkinAutoNotes,
  checkinSendWhyNot,
  checkinTaskLabel,
  checkinUploadStayCopy,
  classifyCheckinError,
  isLikelyOffline,
  saveCapturedProofLocally,
} from '@/lib/checkin';
import { requiredChallengeProofs } from '@/lib/challenges';
import {
  beginCameraProof,
  captureTypeForMethod,
  extraProofImageUrls,
  legacyTypeForProof,
  partSatisfies,
  proofDisplayName,
  proofSlotNeedsRewrite,
  proofsAreHonorOnly,
  uniqueProofUrls,
  partDistanceMeters,
  proofDistanceMeters,
  type ChallengeProof,
  type ChallengeProofPart,
} from '@/lib/challengeProofs';
import {
  athleteDistanceUnit,
  distanceShortHint,
  parseSessionDistanceText,
  type DistanceUnit,
} from '@/lib/distance';
import { successHaptic } from '@/lib/haptics';
import { safeUserId } from '@/lib/safeIds';
import { createStory, personDisplayName } from '@/lib/social';
import {
  canWaveProof,
  clampProofCaption,
  mediaCaptionsForUrls,
  applyCheckinShareLock,
  prefsFromProfile,
  readLocalSharePrefs,
  writeLocalSharePrefs,
  type CheckinSharePrefs,
} from '@/lib/checkinShare';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { mediaDurationMs, resolveMediaDurationMs, WAVE_CLIP_MS } from '@/lib/waveClips';
import {
  ensureLibraryPermission,
  openAppSettings,
  permissionCopy,
} from '@/lib/mediaPermissions';
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
import {
  distanceProofIsSessionLog,
  isCorporateChallenge,
  usesTotalCountCheckins,
} from '@/lib/challengeExperience';
import { hasChallengeStarted, isClosedForLogs, loggingOpensHelper } from '@/lib/settlement';
import { supabase } from '@/lib/supabase';
import type { MentionDoc } from '@/lib/mentions';
import { stopAllLiveMedia } from '@/lib/cameraSession';
import { challengeDetailHref, checkinSubmitHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import { getCheckinSubmitMessage, getErrorMessage } from '@/utils/errors';
import { localUriFromPickerAsset } from '@/utils/media';
import { uploadPostAttachment } from '@/utils/upload';

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <CheckinRouteErrorBoundary {...props} />;
}

type SlotDraft = {
  uri?: string;
  mimeType?: string | null;
  text?: string;
  fromLibrary?: boolean;
  health?: CheckinHealthProof | null;
  inFence?: boolean;
  durationMs?: number | null;
  caption?: string | null;
};

function slotPart(
  proof: ChallengeProof,
  draft: SlotDraft | undefined,
  unit: DistanceUnit = 'mi',
): ChallengeProofPart {
  if (proof.method === 'honor') {
    return { method: 'honor' };
  }
  if (proof.method === 'checkin') {
    return { method: 'checkin', text: draft?.text ?? '' };
  }
  if (proof.method === 'location') {
    const place = parseLocationPlace(proof.place);
    return {
      method: 'location',
      in_fence: draft?.inFence === true,
      label: place?.label ?? null,
      place_id: place?.place_id ?? null,
      radius_m: place?.radius_m ?? null,
    };
  }
  if (proof.method === 'distance') {
    const healthWorkoutId = draft?.uri?.startsWith('health:') ? draft.uri.slice('health:'.length) : undefined;
    return {
      method: 'distance',
      text: draft?.text ?? '',
      url: healthWorkoutId ? '' : draft?.uri ?? '',
      healthWorkoutId,
      health: draft?.health ?? null,
      distanceMeters: draft?.health?.distanceMeters ?? parseSessionDistanceText(draft?.text, unit) ?? undefined,
    };
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
  const router = useRouter();
  return (
    <CheckinSafeBoundary onBack={() => router.back()}>
      <SubmitWorkoutInner />
    </CheckinSafeBoundary>
  );
}

function SubmitWorkoutInner() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const pathname = usePathname();
  const navFocused = useIsFocused();
  const checkinLogRef = useRef(false);
  const challengeQuery = useChallenge(id);
  const roster = useChallengeParticipants(id);
  const { participation, isLoading: participationLoading } = useMyParticipation(id);
  const { user } = useAuth();
  const uid = safeUserId(user);
  const { profile } = useMyProfile();
  const updateProfile = useUpdateProfile();
  const distanceUnit = athleteDistanceUnit(profile?.weight_unit);
  const sessionDistance = distanceProofIsSessionLog(challengeQuery.data);
  const checkinQuery = usePeriodCheckin(id, challengeQuery.data);
  const saveProof = useSaveCheckinProof(id);
  const submitCheckin = useSubmitCheckin(id);
  const queryClient = useQueryClient();

  const [drafts, setDrafts] = useState<Record<string, SlotDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [failKind, setFailKind] = useState<'offline' | 'permission' | 'upload' | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [skippedAuto, setSkippedAuto] = useState(false);
  const [preferCamera, setPreferCamera] = useState(false);
  const [extras, setExtras] = useState<CheckinExtra[]>([]);
  const [caption, setCaption] = useState<MentionDoc>({ text: '', chips: [] });
  const [proofCaptions, setProofCaptions] = useState<Record<string, string>>({});
  const [sharePrefs, setSharePrefs] = useState<CheckinSharePrefs>({ home: false, wave: false });
  const lobbyLocked = isCorporateChallenge(challengeQuery.data);
  const lockedShare = applyCheckinShareLock(sharePrefs, lobbyLocked);
  const shareHome = lockedShare.home;
  const shareWave = lockedShare.wave;

  useEffect(() => {
    return () => {
      stopAllLiveMedia();
    };
  }, []);

  const challenge = challengeQuery.data;
  const proofSteps = requiredChallengeProofs(challenge);
  const totalCount = usesTotalCountCheckins(challenge);
  const rawPhase = checkinQuery.data?.phase ?? 'none';
  const phase = totalCount && rawPhase === 'submitted' ? 'none' : rawPhase;
  const honorOnly = proofsAreHonorOnly(proofSteps);
  const mentionAudienceIds = useMemo(() => {
    const ids = new Set<string>();
    if (challenge?.created_by) {
      ids.add(challenge.created_by);
    }
    for (const row of roster.data ?? []) {
      if (row.user_id) {
        ids.add(row.user_id);
      }
    }
    return [...ids];
  }, [challenge?.created_by, roster.data]);

  useEffect(() => {
    if (!uid) {
      return;
    }
    if (profile && (profile.checkin_share_home != null || profile.checkin_share_wave != null)) {
      setSharePrefs(prefsFromProfile(profile));
      return;
    }
    let live = true;
    void readLocalSharePrefs(uid).then((local) => {
      if (live && local) {
        setSharePrefs(local);
      }
    });
    return () => {
      live = false;
    };
  }, [uid, profile?.checkin_share_home, profile?.checkin_share_wave]);

  useEffect(() => {
    if (!id || checkinLogRef.current) {
      return;
    }
    if (challengeQuery.isLoading) {
      return;
    }
    checkinLogRef.current = true;
    const next = proofSteps.find(
      (proof) => proof.method === 'photo' || proof.method === 'video' || proof.method === 'hr',
    );
    const nextPhotoEmpty = Boolean(next) && !drafts[next?.id ?? '']?.uri;
    const hasExistingFrames =
      extras.length > 0 ||
      proofSteps.some((proof) => {
        const uri = drafts[proof.id]?.uri;
        return Boolean(uri && !uri.startsWith('health:'));
      });
    console.log('[blob:checkin]', {
      href: String(checkinSubmitHref(id)),
      id,
      focused: navFocused,
      ask: null,
      shouldAutoOpen: shouldAutoOpenCheckinCamera({
        skippedAuto,
        honorOnly,
        hasExistingFrames,
        nextPhotoEmpty,
        preferHealth: false,
      }),
      nextPhotoId: next?.id ?? null,
      pathname,
    });
  }, [
    challengeQuery.isLoading,
    drafts,
    extras.length,
    honorOnly,
    id,
    navFocused,
    pathname,
    proofSteps,
    skippedAuto,
  ]);

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
        const localUri = current[proof.id]?.uri;
        const remoteUrl = String(part.url ?? '').trim();
        next[proof.id] = {
          uri: part.healthWorkoutId
            ? `health:${part.healthWorkoutId}`
            : remoteUrl || localUri,
          mimeType: current[proof.id]?.mimeType,
          text: part.text ?? current[proof.id]?.text,
          fromLibrary: part.fromLibrary ?? current[proof.id]?.fromLibrary,
          health: part.health ?? current[proof.id]?.health ?? null,
          inFence: part.in_fence ?? current[proof.id]?.inFence,
          durationMs: current[proof.id]?.durationMs,
          caption: part.caption ?? current[proof.id]?.caption,
        };
      }
      return next;
    });
    setProofCaptions((current) => {
      const next = { ...current };
      for (const proof of steps) {
        const saved = clampProofCaption(parts[proof.id]?.caption ?? '');
        if (saved && !next[proof.id]?.trim()) {
          next[proof.id] = saved;
        }
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

  const filledCount = proofSteps.filter((proof) =>
    partSatisfies(proof, slotPart(proof, drafts[proof.id], distanceUnit), { sessionDistance }),
  ).length;
  const allReady = proofSteps.length > 0 && filledCount === proofSteps.length;
  const busy = saveProof.isPending || submitCheckin.isPending;
  const hasRequiredAttached = honorOnly || filledCount > 0;
  const canSend = canSendCheckin(honorOnly, hasRequiredAttached, phase, busy);
  const firstCamera = beginCameraProof(proofSteps);
  const hasReviewDraft = proofSteps.some(
    (proof) => drafts[proof.id]?.uri || drafts[proof.id]?.text || drafts[proof.id]?.inFence,
  );

  function reviewPhotoProof(preferred?: ChallengeProof | null): ChallengeProof | null {
    if (preferred) {
      return preferred;
    }
    const filled = [...proofSteps].reverse().find((proof) => {
      const uri = drafts[proof.id]?.uri;
      return (
        Boolean(uri && !uri.startsWith('health:')) &&
        (proof.method === 'photo' || proof.method === 'video' || proof.method === 'hr')
      );
    });
    return filled ?? firstCamera ?? null;
  }

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

  async function persistLocation(proof: ChallengeProof) {
    if (!id) {
      return;
    }
    setError(null);
    setFailKind(null);
    const place = parseLocationPlace(proof.place);
    const fix = await readLocationFix(place?.radius_m ?? 100);
    const row = await submitLocationProof({
      challengeId: id,
      proofId: proof.id,
      lat: fix.lat,
      lng: fix.lng,
      accuracy_m: fix.accuracy_m,
    });
    setDrafts((current) => ({ ...current, [proof.id]: { ...current[proof.id], inFence: true } }));
    void checkinQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
    return row;
  }

  async function persistProof(proof: ChallengeProof, draft?: SlotDraft, notes?: string | null) {
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
        caption: clampProofCaption(proofCaptions[proof.id] ?? draft?.caption ?? ''),
        notes,
        extraMedia: uniqueProofUrls(
          extras.map((item) => item.remoteUrl ?? (item.kind === 'gif' ? item.uri : null)),
        ),
      });
    } catch (caught) {
      const kind = classifyCheckinError(caught);
      if (kind === 'reused') {
        setFailKind(null);
        setError(getErrorMessage(caught));
        throw caught;
      }
      setFailKind(kind === 'offline' || kind === 'permission' || kind === 'upload' ? kind : kind === 'generic' ? 'upload' : null);
      setError(getErrorMessage(caught));
      throw caught;
    }
  }

  function onCaptured(
    proof: ChallengeProof,
    uri: string,
    mimeType?: string | null,
    fromLibrary?: boolean,
  ) {
    if (!proof?.id || !uri.trim()) {
      return;
    }
    onMedia(proof.id, uri, mimeType, fromLibrary === true);
    setCaptureId(null);
    setSkippedAuto(true);
    setPreferCamera(false);
    if (!fromLibrary) {
      void saveCapturedProofLocally({ uri, fromLibrary: false }).catch(() => undefined);
    }
  }

  function onRetakeCurrent(proof?: ChallengeProof) {
    const target = reviewPhotoProof(proof);
    if (!target) {
      return;
    }
    setPreferCamera(true);
    setCaptureId(target.id);
  }

  async function pickCurrentFromGallery(proof?: ChallengeProof) {
    const target = reviewPhotoProof(proof);
    if (!target || busy) {
      return;
    }
    const permission = await ensureLibraryPermission();
    if (!permission.ok) {
      const copyBlock = permissionCopy('library');
      Alert.alert(copyBlock.title, copyBlock.body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settings', onPress: () => void openAppSettings() },
      ]);
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || !result.assets[0]) {
        return;
      }
      const asset = result.assets[0];
      const uri = localUriFromPickerAsset(asset);
      if (!uri) {
        Alert.alert('Couldn’t attach that', 'Pick a photo from the gallery.');
        return;
      }
      onCaptured(target, uri, asset.mimeType ?? asset.file?.type, true);
    } catch (caught) {
      Alert.alert('Couldn’t attach that', getErrorMessage(caught));
    }
  }

  async function persistExtraMedia(items: CheckinExtra[]) {
    if (!id) {
      return;
    }
    const remote = uniqueProofUrls(
      items.map((item) => item.remoteUrl ?? (item.kind === 'gif' ? item.uri : null)),
    );
    await saveProof.mutateAsync({
      challengeId: id,
      extraMedia: remote,
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

  function explainSendBlocked() {
    const remaining = proofSteps
      .filter((proof) => !partSatisfies(proof, slotPart(proof, drafts[proof.id], distanceUnit), { sessionDistance }))
      .map((proof) => proofDisplayName(proof));
    const names = checkinSendWhyNot(remaining);
    Alert.alert('Still needed', names ? `${names}.` : copy('checkin.emptyBob'));
  }

  async function onSubmit() {
    if (!id) {
      return;
    }
    if (busy) {
      return;
    }
    for (const proof of proofSteps.filter((item) => item.method === 'location')) {
      if (partSatisfies(proof, slotPart(proof, drafts[proof.id], distanceUnit))) {
        continue;
      }
      if (await locationPermissionGrantedThisSession()) {
        try {
          await persistLocation(proof);
        } catch (caught) {
          Alert.alert('Couldn’t check in here', getErrorMessage(caught));
          return;
        }
      }
    }
    const readyNow =
      honorOnly ||
      proofSteps.every((proof) =>
        partSatisfies(proof, slotPart(proof, drafts[proof.id], distanceUnit), { sessionDistance }),
      );
    const attachedNow =
      honorOnly ||
      proofSteps.some((proof) =>
        partSatisfies(proof, slotPart(proof, drafts[proof.id], distanceUnit), { sessionDistance }),
      );
    if (!honorOnly && !attachedNow) {
      explainSendBlocked();
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
      const notes = composeCheckinNotes(
        checkinAutoNotes({
          complete: readyNow,
          caption: caption.text,
          name: personDisplayName(profile),
          task: checkinTaskLabel(challenge),
          challengeTitle: challengeDisplayTitle(challenge),
        }),
        attachedHealth(),
      );
      let savedParts = { ...(checkinQuery.data?.proof_parts ?? {}) };
      for (const proof of proofSteps) {
        if (proof.method === 'honor') {
          continue;
        }
        const draft = drafts[proof.id];
        const nextCaption = clampProofCaption(proofCaptions[proof.id] ?? '');
        const savedCaption = clampProofCaption(savedParts[proof.id]?.caption ?? '');
        if (
          partSatisfies(proof, savedParts[proof.id], { sessionDistance }) &&
          partSatisfies(proof, slotPart(proof, draft, distanceUnit), { sessionDistance }) &&
          !proofSlotNeedsRewrite(draft?.uri, savedParts[proof.id]?.url) &&
          nextCaption === savedCaption
        ) {
          continue;
        }
        if (!partSatisfies(proof, slotPart(proof, draft, distanceUnit), { sessionDistance })) {
          continue;
        }
        const row = await persistProof(proof, draft, notes);
        if (row?.proof_parts) {
          savedParts = row.proof_parts;
        }
      }
      const uploadedExtras: CheckinExtra[] = [];
      const extraUrls: string[] = [];
      const failedExtras: string[] = [];
      if (uid) {
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
              userId: uid,
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
      const saved = await saveProof.mutateAsync({
        challengeId: id,
        notes,
        extraMedia: extraUrls,
      });
      if (failedExtras.length > 0) {
        setError(
          failedExtras.length === 1
            ? 'One photo didn’t upload. The rest are ready to send.'
            : `${failedExtras.length} photos didn’t upload. The rest are ready to send.`,
        );
      }
      const checkinId = honorOnly || readyNow ? (await submitCheckin.mutateAsync())?.id : saved?.id;
      let postId: string | undefined;
      if (checkinId) {
        try {
          const post = await supabase
            .from('posts')
            .select('id, media_urls')
            .eq('checkin_id', checkinId)
            .is('deleted_at', null)
            .maybeSingle();
          postId = (post.data as { id?: string } | null)?.id;
          const mediaUrls = (post.data as { media_urls?: string[] } | null)?.media_urls ?? [];
          const mentionIds = [
            ...new Set(caption.chips.map((chip) => chip.userId).filter((chipId) => chipId && chipId !== user?.id)),
          ];
          if (postId && mentionIds.length > 0 && uid) {
            await supabase.from('post_mentions').insert(
              mentionIds.map((mentioned_user_id) => ({
                post_id: postId,
                mentioned_user_id,
                author_id: uid,
              })),
            );
          }
          if (postId) {
            const captions = mediaCaptionsForUrls(mediaUrls, proofSteps, savedParts, proofCaptions);
            await supabase
              .from('posts')
              .update({
                hidden_from_home: !shareHome,
                media_captions: captions,
              })
              .eq('id', postId);
          }
        } catch {
          // Social line already saved; Home hide / mentions are best-effort.
        }
      }
      if (shareWave && uid) {
        for (const proof of proofSteps) {
          const part = savedParts[proof.id];
          const draft = drafts[proof.id];
          const url = String(part?.url ?? '').trim();
          if (!url) {
            continue;
          }
          const durationMs =
            draft?.durationMs ?? (await resolveMediaDurationMs(draft?.uri ?? url, draft?.durationMs));
          if (!canWaveProof({ method: proof.method, uri: url, durationMs })) {
            continue;
          }
          if (proof.method === 'video') {
            const ms = mediaDurationMs(durationMs);
            if (ms != null && ms > WAVE_CLIP_MS) {
              continue;
            }
          }
          try {
            await createStory(uid, {
              media_url: url,
              media_type: proof.method === 'video' ? 'video' : 'image',
              caption: clampProofCaption(proofCaptions[proof.id] ?? part?.caption ?? ''),
              challenge_id: id,
            });
          } catch {
            // Wave is extra; lobby check-in already landed.
          }
        }
        void queryClient.invalidateQueries({ queryKey: ['stories'] });
      }
      if (!lobbyLocked && uid) {
        const nextPrefs = { home: shareHome, wave: shareWave };
        await writeLocalSharePrefs(uid, nextPrefs);
        try {
          await updateProfile.mutateAsync({
            checkin_share_home: nextPrefs.home,
            checkin_share_wave: nextPrefs.wave,
          });
        } catch {
          // Local row still remembers the last Share to choice.
        }
      }
      await successHaptic();
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      router.replace(challengeDetailHref(id, 'lobby', postId, { tab: 'feed' }));
    } catch (caught) {
      const kind = classifyCheckinError(caught);
      if (kind === 'reused') {
        setFailKind(null);
        setError(getCheckinSubmitMessage(caught));
        return;
      }
      if (kind === 'missing') {
        explainSendBlocked();
        return;
      }
      if (kind === 'upload' || kind === 'offline') {
        setFailKind(null);
        setError(checkinUploadStayCopy());
        return;
      }
      setFailKind(kind === 'permission' ? kind : null);
      setError(getCheckinSubmitMessage(caught));
    }
  }

  async function onAttachHealth(workout: HealthWorkout, proof?: ChallengeProof | null) {
    if (!id || busy) {
      return;
    }
    setError(null);
    const target =
      proof ??
      proofSteps.find((item) => item.method === 'distance' || item.method === 'hr') ??
      proofSteps.find((item) => item.method === 'photo' || item.method === 'video');
    if (!target || !uid) {
      return;
    }
    try {
      const provider = getHealthProvider();
      const enriched = provider?.enrichHeartRate
        ? await provider.enrichHeartRate(workout)
        : workout;
      const snapshot = toCheckinHealthProof(enriched);
      const healthWorkoutId = await upsertHealthWorkout(uid, enriched);
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

  if (!id) {
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

  if (challengeQuery.isLoading || participationLoading || checkinQuery.isLoading) {
    return (
      <Screen padded={false} edges={['left', 'right', 'bottom']}>
        <MascotState kind="loading" title="Opening today’s check-in" body={CHECKIN_BOB.loading} />
      </Screen>
    );
  }

  if (
    (failKind === 'offline' || failKind === 'upload') &&
    !hasReviewDraft &&
    extras.length === 0
  ) {
    return (
      <Screen padded={false} edges={['left', 'right', 'bottom']}>
        <MascotState
          kind="error"
          title={
            failKind === 'offline' ? copy('checkin.offlineBob') : copy('checkin.uploadFailBob')
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

  if (Boolean(participation.eliminated_at)) {
    return (
      <Screen padded={false} edges={['left', 'right', 'bottom']}>
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

  const missing = proofSteps.filter(
    (proof) => !partSatisfies(proof, slotPart(proof, drafts[proof.id], distanceUnit), { sessionDistance }),
  );
  const iosHealthReady = Platform.OS === 'ios' && Boolean(getHealthProvider()?.isAvailable());
  const firstEmptyMedia =
    missing.find(
      (proof) =>
        proof.method === 'photo' ||
        proof.method === 'video' ||
        proof.method === 'hr' ||
        proof.method === 'distance',
    ) ?? null;
  const firstHealth = firstEmptyMedia && proofPrefersHealthAttach(firstEmptyMedia, challenge) ? firstEmptyMedia : null;
  const serverPart = (proofId: string) => checkinQuery.data?.proof_parts?.[proofId];
  const serverHasProof = (proofId: string) => {
    const part = serverPart(proofId);
    return Boolean(part && partSatisfies(proofSteps.find((item) => item.id === proofId) ?? { id: proofId, name: '', method: 'photo' }, part, { sessionDistance }));
  };
  const shouldAutoHealth =
    !skippedAuto &&
    !preferCamera &&
    iosHealthReady &&
    Boolean(firstHealth) &&
    !drafts[firstHealth?.id ?? '']?.uri &&
    !serverHasProof(firstHealth?.id ?? '');
  const nextPhoto = missing.find(
    (proof) => proof.method === 'photo' || proof.method === 'video' || proof.method === 'hr',
  );
  const hasExistingFrames =
    extras.length > 0 ||
    proofSteps.some((proof) => {
      const uri = drafts[proof.id]?.uri;
      return Boolean((uri && !uri.startsWith('health:')) || serverHasProof(proof.id));
    });
  const shouldAutoOpen = shouldAutoOpenCheckinCamera({
    skippedAuto,
    honorOnly,
    hasExistingFrames,
    nextPhotoEmpty: Boolean(nextPhoto) && !drafts[nextPhoto?.id ?? '']?.uri && !serverHasProof(nextPhoto?.id ?? ''),
    preferHealth: shouldAutoHealth,
  });
  const activeCaptureId =
    captureId ?? (shouldAutoHealth ? firstHealth?.id ?? null : shouldAutoOpen ? nextPhoto?.id ?? null : null);
  const activeProof = proofSteps.find((proof) => proof.id === activeCaptureId) ?? null;
  const showHealthFirst =
    Boolean(activeProof) &&
    iosHealthReady &&
    !preferCamera &&
    proofPrefersHealthAttach(activeProof, challenge);

  if (showHealthFirst && activeProof) {
    return (
      <Screen padded={false} edges={TAB_ROOT_EDGES}>
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
            if (!hasReviewDraft && !captureId) {
              router.back();
            }
          }}
        />
      </Screen>
    );
  }

  if (activeProof && (activeProof.method === 'photo' || activeProof.method === 'video' || activeProof.method === 'hr' || activeProof.method === 'distance')) {
    return (
      <Screen padded={false} edges={TAB_ROOT_EDGES}>
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
            onCaptured(activeProof, uri, mimeType, meta?.fromLibrary);
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
            if (!hasReviewDraft) {
              router.back();
            }
          }}
        />
      </Screen>
    );
  }

  const composerProofs = proofSteps.filter(
    (proof) =>
      proof.method !== 'honor' &&
      proof.method !== 'checkin' &&
      proof.method !== 'distance' &&
      proof.method !== 'location',
  );
  const textProofs = proofSteps.filter((proof) => proof.method === 'checkin');
  const distanceProofs = proofSteps.filter((proof) => proof.method === 'distance');
  const locationProofs = proofSteps.filter((proof) => proof.method === 'location');
  const stillNeeded = allReady ? undefined : checkinSendWhyNot(missing.map((proof) => proofDisplayName(proof)));

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} keyboardAvoiding>
      <CheckinComposer
        proofs={composerProofs}
        drafts={drafts}
        extras={extras}
        audienceUserIds={mentionAudienceIds}
        initialCaption={stripHealthSummaryFromNotes(checkinQuery.data?.notes ?? '', attachedHealth())}
        allReady={allReady}
        busy={busy}
        canSend={canSend}
        blockedHint={checkinSendWhyNot(missing.map((proof) => proofDisplayName(proof)))}
        stillNeeded={stillNeeded}
        onClose={() => router.back()}
        onRetake={(proof) => onRetakeCurrent(proof)}
        onOpenGallery={(proof) => void pickCurrentFromGallery(proof)}
        onAddProof={(proof) => {
          if (proof.method === 'photo' || proof.method === 'video' || proof.method === 'hr') {
            setPreferCamera(Platform.OS !== 'ios' || !proofPrefersHealthAttach(proof, challenge));
            setCaptureId(proof.id);
          }
        }}
        onRemoveProof={(proof) => void onRemoveProof(proof)}
        onExtrasChange={handleExtrasChange}
        onCaptionChange={setCaption}
        proofCaptions={proofCaptions}
        onProofCaptionChange={(proofId, text) =>
          setProofCaptions((current) => ({ ...current, [proofId]: text }))
        }
        lobbyName={challengeDisplayTitle(challenge)}
        lobbyLocked={lobbyLocked}
        shareHome={shareHome}
        shareWave={shareWave}
        onShareHomeChange={(home) => setSharePrefs((current) => ({ ...current, home }))}
        onShareWaveChange={(wave) => setSharePrefs((current) => ({ ...current, wave }))}
        waveSkipHint={
          shareWave &&
          proofSteps.some((proof) => {
            const ms = mediaDurationMs(drafts[proof.id]?.durationMs);
            return proof.method === 'video' && ms != null && ms > WAVE_CLIP_MS;
          })
            ? copy('checkin.waveSkipLong')
            : null
        }
        onSend={() => void onSubmit()}
        dueLine={
          <PeriodCheckinDue
            challenge={challenge}
            submitted={rawPhase === 'submitted' && !totalCount}
            compact
          />
        }
        accessory={
          locationProofs.length || textProofs.length || distanceProofs.length || error ? (
            <>
              {locationProofs.map((proof) => (
                <View key={proof.id} className="mb-2">
                  <LocationProofRow
                    place={parseLocationPlace(proof.place)}
                    ready={partSatisfies(proof, slotPart(proof, drafts[proof.id], distanceUnit))}
                    busy={busy}
                    onImHere={() => {
                      void persistLocation(proof).catch((caught) => {
                        Alert.alert('Couldn’t check in here', getErrorMessage(caught));
                      });
                    }}
                  />
                </View>
              ))}
              {textProofs.map((proof) => (
                <View key={proof.id} className="mb-2">
                  <Input
                    label="Note"
                    placeholder="Write a short note that you did the work."
                    value={drafts[proof.id]?.text ?? ''}
                    onChangeText={(value) => onText(proof.id, value)}
                    editable={!busy && phase !== 'submitted'}
                    grow
                  />
                </View>
              ))}
              {distanceProofs.map((proof) => {
                const draft = drafts[proof.id];
                const part = slotPart(proof, draft, distanceUnit);
                const attached = partDistanceMeters(part, distanceUnit);
                const required = proofDistanceMeters(proof);
                const short = !sessionDistance && attached != null && attached < required;
                const healthReady = Platform.OS !== 'web' && Boolean(getHealthProvider()?.isAvailable());
                return (
                  <View key={proof.id} className="mb-2" style={{ gap: 6 }}>
                    <View className="flex-row items-end" style={{ gap: 8 }}>
                      <View className="min-w-0 flex-1">
                        <Input
                          label="Distance"
                          placeholder="How far this session?"
                          keyboardType="decimal-pad"
                          value={draft?.text ?? ''}
                          onChangeText={(value) => onText(proof.id, value)}
                          editable={!busy && phase !== 'submitted'}
                        />
                      </View>
                      <AppText className="mb-3 text-[15px] font-semibold" style={{ color: THEME.textMuted, minWidth: 28 }}>
                        {distanceUnit}
                      </AppText>
                    </View>
                    {healthReady ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Attach from Health"
                        onPress={() => {
                          setPreferCamera(false);
                          setCaptureId(proof.id);
                        }}
                        style={{ minHeight: 36, justifyContent: 'center' }}>
                        <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
                          Attach from Health
                        </AppText>
                      </Pressable>
                    ) : null}
                    {short ? (
                      <AppText className="text-[12px] leading-4 text-coral-dark">
                        {distanceShortHint(attached ?? 0, required, distanceUnit)}
                      </AppText>
                    ) : null}
                  </View>
                );
              })}
              {error ? <AppText className="text-sm leading-5 text-coral-dark">{error}</AppText> : null}
            </>
          ) : null
        }
      />
    </Screen>
  );
}
