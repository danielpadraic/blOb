import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddExerciseSheet, type AddExerciseResult } from '@/components/lift/AddExerciseSheet';
import { AddTimedRowSheet, type TimedRowResult } from '@/components/lift/AddTimedRowSheet';
import { ExerciseCard } from '@/components/lift/ExerciseCard';
import { LiftDoneSheet } from '@/components/lift/LiftDoneSheet';
import { LiftDraftFooter, LiftSavedFooter } from '@/components/lift/LiftLoggingFooter';
import { rowPlaySpec, useLiftPlay } from '@/components/lift/LiftPlayHost';
import { TimedRowCard } from '@/components/lift/TimedRowCard';
import { LiftHealthKitSheet } from '@/components/lift/LiftHealthKitSheet';
import { LiftShareSheet, type LiftShareChoice } from '@/components/lift/LiftShareSheet';
import { OverloadSheet } from '@/components/lift/OverloadSheet';
import { KeyboardFormShell, useKeyboardForm } from '@/components/ui/KeyboardFormShell';
import { MascotState } from '@/components/mascot/MascotState';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { useContextualTour } from '@/components/tour/useContextualTour';
import { useAuth } from '@/hooks/useAuth';
import { liftSessionTourSteps } from '@/lib/contextualTour';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import {
  useAttachLiftToCheckin,
  useCardioMethods,
  useCreateCustomExercise,
  useCustomExercises,
  useDeleteLiftSession,
  useLiftingChallenges,
  useLiftSession,
  useSaveLiftSession,
  useShareLiftSession,
} from '@/hooks/useLift';
import { canCompleteSession, firstLeftoverTarget, sessionWeightMoved } from '@/lib/lift/complete';
import { rankHealthKitWorkouts } from '@/lib/lift/healthkit';
import { bumpSessionInPlace, canOverloadSession, overloadChipLabel } from '@/lib/lift/overload';
import { hasShareableWork, sessionCardioSeconds } from '@/lib/lift/recap';
import { canPlay } from '@/lib/lift/rounds';
import {
  fetchChallengeShareLocks,
  linkSessionToPost,
  sendLiftToRecipients,
} from '@/lib/lift/share';
import type { ComposeInput } from '@/lib/types';
import { useCreatePost } from '@/hooks/useFeed';
import {
  useCreateGroupConversation,
  useGetOrCreateConversation,
  useSendMessage,
} from '@/hooks/useSocial';
import { challengeDetailHref, checkinSubmitHref, circleDetailHref } from '@/lib/routes';
import { muscleLabel, type MuscleKey } from '@/lib/lift/muscles';
import { recentExerciseOptions, rememberRecentExercise } from '@/lib/lift/recents';
import {
  addExercise,
  addSet,
  addTimedRow,
  countWorkSets,
  canMoveExercise,
  duplicateExercise,
  isTimedRow,
  moveExercise,
  removeExercise,
  swapExercise,
  removeSet,
  renameSession,
  repeatSession,
  sessionTitle,
  shortDate,
  supersetLabels,
  supersetPartner,
  toggleSetComplete,
  updateSet,
  updateTimedRow,
} from '@/lib/lift/session';
import { linkLiftSessionHealthKit } from '@/lib/lift/api';
import { appleHealth } from '@/services/health/apple';
import type { HealthWorkout } from '@/services/health/types';
import type { LiftOverloadPlan, LiftSessionDraft, LiftSetKind } from '@/lib/lift/types';
import { firstRouteParam } from '@/lib/challengeLoad';
import { copy } from '@/lib/copy';
import { LIFT_START_HREF, LIFTS_HISTORY_HREF, liftSessionHref } from '@/lib/routes';
import { tabBarLift, THEME } from '@/lib/theme';

/**
 * The session screen.
 *
 * Muscles are sections, exercises sit under a muscle, sets sit under an exercise, and every level
 * collapses. Edits land in local state so a stepper tap is instant; a debounced autosave writes the
 * whole session so nothing is lost if the app is closed mid-workout.
 */

const AUTOSAVE_MS = 900;

/** Collapse state belongs to this session only, so it survives navigation but not a new session. */
const collapseMemory = new Map<string, { muscles: string[]; exercises: string[] }>();

function readCollapse(sessionId: string) {
  const stored = collapseMemory.get(sessionId);
  return {
    muscles: new Set(stored?.muscles ?? []),
    exercises: new Set(stored?.exercises ?? []),
  };
}

function writeCollapse(sessionId: string, muscles: Set<string>, exercises: Set<string>) {
  collapseMemory.set(sessionId, { muscles: [...muscles], exercises: [...exercises] });
}

export default function LiftSessionScreen() {
  const params = useLocalSearchParams<{ id?: string; from?: string }>();
  const id = firstRouteParam(params.id);
  const fromHistory = firstRouteParam(params.from) === 'history';
  // Keying on the id remounts on "Start this again", which lands on the same route with a new id.
  // Without it the screen would keep rendering the session that was just copied.
  return <LiftSessionInner key={id || 'lift'} id={id} fromHistory={fromHistory} />;
}

function LiftSessionInner({ id, fromHistory }: { id: string; fromHistory: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const loaded = useLiftSession(id);
  const customs = useCustomExercises();
  const save = useSaveLiftSession();
  const createCustom = useCreateCustomExercise();
  const remove = useDeleteLiftSession();
  const share = useShareLiftSession();
  const attach = useAttachLiftToCheckin();
  const liftingChallenges = useLiftingChallenges();
  const cardioMethods = useCardioMethods();
  const startChat = useGetOrCreateConversation();
  const startGroup = useCreateGroupConversation();
  const createPost = useCreatePost();
  const sendMessage = useSendMessage();
  // The timer renders from the root of the tab layout, above the header and the tab bar.
  const { startPlay } = useLiftPlay();

  const [draft, setDraft] = useState<LiftSessionDraft | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharedPostId, setSharedPostId] = useState<string | null>(null);
  const [overloadOpen, setOverloadOpen] = useState(false);
  const [lockedChallengeIds, setLockedChallengeIds] = useState<string[]>([]);
  const [collapsedMuscles, setCollapsedMuscles] = useState<Set<string>>(new Set());
  const [collapsedExercises, setCollapsedExercises] = useState<Set<string>>(new Set());
  const [pulseKey, setPulseKey] = useState<string | null>(null);
  const [pulseToken, setPulseToken] = useState(0);
  const [rosterScroll, setRosterScroll] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [focusExerciseKey, setFocusExerciseKey] = useState<string | null>(null);
  const [sheetMuscle, setSheetMuscle] = useState<MuscleKey | null>(null);
  /** The exercise being pointed at a different movement, keeping its sets. */
  const [swapFor, setSwapFor] = useState<string | null>(null);
  const [timedSheet, setTimedSheet] = useState<{
    kind: 'cardio' | 'rest';
    muscle: MuscleKey;
    methodId?: string | null;
  } | null>(null);
  // True only for the explicit Save press. Autosave must never touch the button, or it blinks
  // between "Save session" and "Saving…" on every keystroke.
  const [finishing, setFinishing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [hkOpen, setHkOpen] = useState(false);
  const [hkWorkouts, setHkWorkouts] = useState<HealthWorkout[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [titleText, setTitleText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneSheet, setDoneSheet] = useState(false);

  const dirty = useRef(false);
  const draftRef = useRef<LiftSessionDraft | null>(null);
  draftRef.current = draft;

  // Load once. After that the screen owns the draft — refetches must not stomp on live edits.
  useEffect(() => {
    if (loaded.data && !draftRef.current) {
      setDraft(loaded.data);
      const stored = readCollapse(loaded.data.id);
      setCollapsedMuscles(stored.muscles);
      setCollapsedExercises(stored.exercises);
    }
  }, [loaded.data]);

  const readOnly = Boolean(draft?.completedAt);
  const swapRow = swapFor ? (draft?.exercises.find((row) => row.key === swapFor) ?? null) : null;

  // Which of those challenges keep check-ins inside their own lobby. Asked for once, because
  // `LoggableChallenge` does not carry `privacy_mode`.
  useEffect(() => {
    const ids = liftingChallenges.map((challenge) => challenge.id);
    if (!ids.length) {
      setLockedChallengeIds([]);
      return;
    }
    let live = true;
    void fetchChallengeShareLocks(ids).then((locked) => {
      if (live) {
        setLockedChallengeIds(locked);
      }
    });
    return () => {
      live = false;
    };
  }, [liftingChallenges]);

  const persist = useCallback(
    async (next: LiftSessionDraft, completed?: boolean) => {
      try {
        await save.mutateAsync({ draft: next, completed });
        setError(null);
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not save that lift.');
        return false;
      }
    },
    [save],
  );

  // Debounced autosave.
  useEffect(() => {
    if (!draft || readOnly || !dirty.current) {
      return undefined;
    }
    const snapshot = draft;
    const handle = setTimeout(() => {
      dirty.current = false;
      void persist(snapshot);
    }, AUTOSAVE_MS);
    return () => clearTimeout(handle);
  }, [draft, persist, readOnly]);

  // Anything still pending when they leave gets written on the way out. The mutation is read
  // through a ref because its identity changes on every state tick, and this must run only on
  // unmount — not every time a save starts or finishes.
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(() => {
    const pending = draftRef.current;
    if (pending && dirty.current && !pending.completedAt) {
      dirty.current = false;
      void saveRef.current.mutateAsync({ draft: pending }).catch(() => undefined);
    }
  }, []);

  useEffect(() => () => flush(), [flush]);

  // Switching apps is not leaving the screen, so nothing unmounts and the debounce may still be
  // counting. Writing on the way out is what makes the set still be there on the way back in.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        flush();
      }
    });
    return () => subscription.remove();
  }, [flush]);

  function edit(update: (current: LiftSessionDraft) => LiftSessionDraft) {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      dirty.current = true;
      return update(current);
    });
  }

  function toggleMuscle(muscle: string) {
    setCollapsedMuscles((current) => {
      const next = new Set(current);
      if (next.has(muscle)) {
        next.delete(muscle);
      } else {
        next.add(muscle);
      }
      if (draft) {
        writeCollapse(draft.id, next, collapsedExercises);
      }
      return next;
    });
  }

  function toggleExercise(key: string) {
    setCollapsedExercises((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      if (draft) {
        writeCollapse(draft.id, collapsedMuscles, next);
      }
      return next;
    });
  }

  async function onAddExercise(result: AddExerciseResult) {
    if (!draft) {
      return;
    }
    try {
      // The same picker does double duty. Swapping keeps the sets and only changes what the row
      // is called, which is what makes "incline today, flat next time" a two-tap edit.
      const swapKey = swapFor;
      let identity: {
        exerciseId?: string | null;
        customExerciseId?: string | null;
        name: string;
      } | null = null;

      if (result.createName) {
        const created = await createCustom.mutateAsync({
          name: result.createName,
          muscle: result.muscle,
        });
        identity = { customExerciseId: created.id, name: created.name };
      } else if (result.option) {
        identity = {
          exerciseId: result.option.official ? result.option.id : null,
          customExerciseId: result.option.official ? null : result.option.id,
          name: result.option.name,
        };
      }

      if (identity) {
        rememberRecentExercise(identity.exerciseId);
        const prevKeys = new Set((draft.exercises ?? []).map((row) => row.key));
        edit((current) => {
          const next = swapKey
            ? swapExercise(current, swapKey, { ...identity, muscleKey: result.muscle })
            : addExercise(current, {
                ...identity,
                muscleKey: result.muscle,
                superset: result.superset,
              });
          const added = next.exercises.find((row) => !prevKeys.has(row.key));
          if (added) {
            setCollapsedMuscles((muscles) => {
              const open = new Set(muscles);
              open.delete(added.muscleKey);
              return open;
            });
            setCollapsedExercises((exercises) => {
              const open = new Set(exercises);
              open.delete(added.key);
              return open;
            });
            setFocusExerciseKey(added.key);
            setRosterScroll((tick) => tick + 1);
            setTimeout(() => setFocusExerciseKey((key) => (key === added.key ? null : key)), 1200);
          } else if (swapKey) {
            setFocusExerciseKey(swapKey);
            setTimeout(() => setFocusExerciseKey((key) => (key === swapKey ? null : key)), 1200);
          }
          return next;
        });
      }
      setPickerOpen(false);
      setSheetMuscle(null);
      setSwapFor(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add that exercise.');
    }
  }

  function onAddTimedRow(result: TimedRowResult) {
    setTimedSheet(null);
    setRosterScroll((tick) => tick + 1);
    edit((current) =>
      addTimedRow(current, {
        kind: result.kind,
        muscleKey: result.muscle,
        // The catalog name is snapshotted onto the row so the card still reads "Air Bike" if the
        // shared list is ever renamed underneath it.
        name:
          result.kind === 'rest'
            ? 'Rest'
            : ((cardioMethods.data ?? []).find((row) => row.id === result.cardioMethod)?.name ??
              'Cardio'),
        cardioMethod: result.cardioMethod,
        cardioCustomName: result.cardioCustomName,
        cardioType: result.cardioType,
        durationSeconds: result.durationSeconds,
        intensity: result.intensity,
      }),
    );
  }

  async function onSave() {
    if (!draft) {
      return;
    }
    dirty.current = false;
    setFinishing(true);
    const ok = await persist(draft, false);
    setFinishing(false);
    if (!ok) {
      return;
    }
    setError(null);
  }

  function revealLeftover() {
    if (!draft) {
      return;
    }
    const target = firstLeftoverTarget(draft);
    if (!target) {
      return;
    }
    setError(null);
    const nextMuscles = new Set(collapsedMuscles);
    nextMuscles.delete(target.muscleKey);
    const nextExercises = new Set(collapsedExercises);
    nextExercises.delete(target.exerciseKey);
    setCollapsedMuscles(nextMuscles);
    setCollapsedExercises(nextExercises);
    writeCollapse(draft.id, nextMuscles, nextExercises);
    setPulseKey(target.setKey ?? target.exerciseKey);
    setPulseToken((tick) => tick + 1);
  }

  async function onComplete() {
    if (!draft) {
      return;
    }
    if (!canCompleteSession(draft)) {
      revealLeftover();
      return;
    }
    dirty.current = false;
    setCompleting(true);
    const done: LiftSessionDraft = {
      ...draft,
      completedAt: new Date().toISOString(),
      status: 'completed',
      weightMoved: sessionWeightMoved(draft),
    };
    const ok = await persist(done, true);
    setCompleting(false);
    if (!ok) {
      return;
    }
    setDraft(done);
    setDoneSheet(true);
    void offerHealthKitLink(done);
  }

  function onAddToCheckin(challengeId: string) {
    if (!draft) {
      return;
    }
    try {
      setDoneSheet(false);
      router.push(checkinSubmitHref(challengeId, { lift: draft.id }));
    } catch {
      setError("Couldn't add that to the check-in.");
    }
  }

  async function offerHealthKitLink(session: LiftSessionDraft) {
    if (Platform.OS !== 'ios') {
      return;
    }
    try {
      if (!appleHealth.isAvailable()) {
        return;
      }
      const access = await appleHealth.getAuthStatus();
      if (access === 'denied') {
        return;
      }
      if (access !== 'connected') {
        const result = await appleHealth.requestAccess();
        if (result !== 'connected') {
          return;
        }
      }
      const day = new Date(session.performedAt);
      if (Number.isNaN(day.getTime())) {
        return;
      }
      const from = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
      const workouts = rankHealthKitWorkouts(
        await appleHealth.fetchWorkouts({ from, to }),
        session.performedAt,
        sessionCardioSeconds(session),
      );
      if (!workouts.length) {
        return;
      }
      setHkWorkouts(workouts);
      setHkOpen(true);
    } catch {
      // Complete already succeeded. Missing HealthKit is not an error banner.
    }
  }

  async function onShare(choice: LiftShareChoice) {
    if (!draft) {
      return;
    }
    setError(null);
    try {
      if (choice.challengeId) {
        const result = await attach.mutateAsync({
          draft,
          challengeId: choice.challengeId,
          caption: choice.caption,
          // A locked lobby never announces to Home, and the sheet hides the toggle in that case.
          home: choice.home && !lockedChallengeIds.includes(choice.challengeId),
        });
        setShareOpen(false);
        router.replace(
          challengeDetailHref(choice.challengeId, 'lobby', result.postId ?? undefined, {
            tab: 'feed',
          }),
        );
        return;
      }
      // Message addresses the card to named people and keeps it off Home, then puts the link in
      // their DM. The card is what makes the session readable to them — a bare link would open to
      // nothing, because a session is only visible through a post the viewer can already see.
      const toMessage = choice.destination === 'message';
      const posted = await share.mutateAsync({
        draft,
        caption: choice.caption,
        challengeId: null,
        circleId: choice.circleId,
        home: !toMessage,
        audience: toMessage ? 'specific' : choice.circleId ? 'friends' : choice.audience,
        audienceUserIds: toMessage ? choice.recipientIds : undefined,
      });
      if (toMessage) {
        await sendLiftToRecipients({
          postId: posted.postId,
          recipientIds: choice.recipientIds,
          caption: choice.caption,
          startChat: (friendId: string) => startChat.mutateAsync(friendId),
          startGroup: (friendIds: string[]) => startGroup.mutateAsync(friendIds),
          send: (input) => sendMessage.mutateAsync(input).then(() => undefined),
        });
      }
      if (choice.circleId) {
        setShareOpen(false);
        router.replace(circleDetailHref(choice.circleId, { tab: 'chat' }));
        return;
      }
      setSharedPostId(posted.postId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not share that lift.');
    }
  }

  /**
   * Home shares go through the ordinary post path, so a lift post gets mentions, photos, and GIFs
   * for free and lands in the feed the same way everything else does.
   */
  async function onComposeHome(input: ComposeInput) {
    setError(null);
    try {
      const post = await createPost.mutateAsync(input);
      if (post?.id) {
        await linkSessionToPost(String(input.liftSessionId ?? ''), String(post.id));
        setSharedPostId(String(post.id));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not share that lift.');
    }
  }

  function closeShare() {
    setShareOpen(false);
    if (readOnly) {
      router.replace(LIFTS_HISTORY_HREF);
    }
  }

  async function onApplyOverload(plan: LiftOverloadPlan) {
    if (!draft) {
      return;
    }
    setOverloadOpen(false);
    // They are already looking at last time's numbers, so the bump lands on this session rather
    // than opening a second one.
    const bumped = bumpSessionInPlace(draft, plan);
    setDraft(bumped);
    dirty.current = false;
    await persist(bumped);
  }

  async function onStartAgain() {
    if (!draft) {
      return;
    }
    const next = repeatSession(draft);
    const ok = await persist(next);
    if (ok) {
      router.replace(liftSessionHref(next.id, fromHistory ? { from: 'history' } : undefined));
    }
  }

  async function onDelete() {
    if (!draft) {
      return;
    }
    try {
      await remove.mutateAsync(draft.id);
      router.replace(LIFT_START_HREF);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete that lift.');
    }
  }

  function goBackToBuilder() {
    if (fromHistory) {
      router.navigate(LIFTS_HISTORY_HREF);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(readOnly ? LIFTS_HISTORY_HREF : LIFT_START_HREF);
  }

  const backHeader = {
    headerShown: true as const,
    presentation: 'card' as const,
    animation: 'slide_from_right' as const,
    gestureEnabled: true,
    headerBackVisible: false,
    headerLeft: () => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={goBackToBuilder}
        hitSlop={8}
        style={{
          minWidth: 44,
          minHeight: 44,
          paddingRight: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        }}>
        <Glyph name={GLYPH.chevronLeft} color={THEME.textPrimary} size={18} />
        <AppText style={{ fontSize: 17, fontWeight: '600', color: THEME.textPrimary }}>Back</AppText>
      </Pressable>
    ),
  };

  const labels = useMemo(() => (draft ? supersetLabels(draft) : {}), [draft]);
  const title = draft ? sessionTitle(draft) : 'Lift';

  /**
   * What the footer's Play would run.
   *
   * The first cardio row with time on it, in session order. Rounds belong to one exercise, so a
   * session with two cardio rows is genuinely ambiguous from the footer — each card carries its
   * own Play for that case, and this one covers the overwhelmingly common single-cardio session.
   */
  const playableRow = useMemo(
    () => draft?.exercises.find((row) => canPlay(row)) ?? null,
    [draft],
  );
  const sessionTourSteps = useMemo(() => liftSessionTourSteps(draft), [draft]);
  useContextualTour('lift', sessionTourSteps, Boolean(user?.id && draft && !readOnly), user?.id);

  if (loaded.isLoading || (!draft && !loaded.isFetched)) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <Stack.Screen options={{ ...backHeader, title: 'Lift' }} />
        <MascotState kind="loading" title="Loading your lift…" />
      </Screen>
    );
  }

  if (!draft) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <Stack.Screen options={{ ...backHeader, title: 'Lift' }} />
        <MascotState
          kind="empty"
          title="That lift isn’t here"
          body="It may have been deleted."
          actionLabel="Start a lift"
          onAction={() => router.replace(LIFT_START_HREF)}
        />
      </Screen>
    );
  }

  const workSets = countWorkSets(draft);
  const doneSets = draft.exercises.reduce(
    (total, row) => total + row.sets.filter((set) => set.completedAt).length,
    0,
  );

  const leftover = firstLeftoverTarget(draft);
  const canFinish = canCompleteSession(draft);

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} keyboardAvoiding={false}>
      <Stack.Screen options={{ ...backHeader, title: readOnly ? 'Lift' : 'Logging' }} />
      <KeyboardFormShell
        padded
        protectFieldFocus
        closedFooterPad={tabBarLift(insets.bottom, 'sticky')}
        footer={
          readOnly ? (
            <LiftSavedFooter
              canShare={hasShareableWork(draft)}
              confirmingDelete={confirmDelete}
              busy={save.isPending || remove.isPending}
              onShare={() => {
                setSharedPostId(null);
                setShareOpen(true);
              }}
              onStartAgain={() => void onStartAgain()}
              onAskDelete={() => setConfirmDelete(true)}
              onKeep={() => setConfirmDelete(false)}
              onDelete={() => void onDelete()}
            />
          ) : (
            <TourAnchor id="tour-lift-log">
              <LiftDraftFooter
                canPlay={Boolean(playableRow)}
                canComplete={canFinish}
                leftoverLine={leftover?.line ?? null}
                saving={finishing}
                completing={completing}
                statusLine={error}
                onPlay={() => {
                  if (playableRow) {
                    startPlay(rowPlaySpec(playableRow));
                  }
                }}
                onSave={() => void onSave()}
                onComplete={() => void onComplete()}
                onLeftover={revealLeftover}
              />
            </TourAnchor>
          )
        }>
          <View style={{ paddingTop: 4, paddingBottom: 12, flexGrow: 1 }}>
            {renaming ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  autoFocus
                  value={titleText}
                  onChangeText={setTitleText}
                  placeholder={title}
                  placeholderTextColor={THEME.textMuted}
                  accessibilityLabel="Session name"
                  selectionColor={THEME.accent}
                  onSubmitEditing={() => {
                    edit((current) => renameSession(current, titleText));
                    setRenaming(false);
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 48,
                    paddingHorizontal: 14,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: THEME.accent,
                    backgroundColor: THEME.surface,
                    fontSize: 18,
                    fontWeight: '700',
                    color: THEME.textPrimary,
                  }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Save name"
                  hitSlop={8}
                  onPress={() => {
                    edit((current) => renameSession(current, titleText));
                    setRenaming(false);
                  }}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Glyph name={GLYPH.checkmark} color={THEME.accent} size={18} />
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppText
                  numberOfLines={2}
                  style={{ flex: 1, fontSize: 22, fontWeight: '800', color: THEME.textPrimary }}>
                  {title}
                </AppText>
                {readOnly ? null : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Rename this session"
                    hitSlop={8}
                    onPress={() => {
                      setTitleText(draft.title ?? '');
                      setRenaming(true);
                    }}
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Glyph name={GLYPH.pencil} color={THEME.textMuted} size={16} />
                  </Pressable>
                )}
              </View>
            )}
            {draft.sourceUserName ? (
              <AppText style={{ fontSize: 13, fontWeight: '700', color: THEME.accent }}>
                {copy('lift.createdBy', 'gentle', { name: draft.sourceUserName })}
              </AppText>
            ) : null}
            <AppText style={{ fontSize: 13, color: THEME.textMuted }}>
              {shortDate(draft.performedAt)} · {draft.exercises.length}{' '}
              {draft.exercises.length === 1 ? 'exercise' : 'exercises'} · {workSets}{' '}
              {workSets === 1 ? 'set' : 'sets'}
              {doneSets ? ` · ${doneSets} done` : ''}
              {readOnly ? ' · Saved' : ''}
            </AppText>
          </View>

          {/* Only on a session copied from an earlier one, and only before the first working set is
              checked off — after that, bumping would rewrite numbers they already lifted. */}
          {!readOnly && draft.sourceSessionId && canOverloadSession(draft) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go heavier than last time"
              onPress={() => setOverloadOpen(true)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                minHeight: 52,
                paddingHorizontal: 14,
                marginBottom: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: THEME.accentBright,
                backgroundColor: pressed ? THEME.surface : THEME.accentSoft,
              })}>
              <Glyph name={GLYPH.trendUp} color={THEME.accent} size={16} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText style={{ fontSize: 14, fontWeight: '800', color: THEME.accent }}>
                  Go heavier than last time
                </AppText>
                <AppText numberOfLines={1} style={{ fontSize: 12, color: THEME.textMuted }}>
                  {draft.overloadSummary
                    ? `Bumped ${overloadChipLabel(draft.overloadSummary)} — tap to change`
                    : 'Add weight or reps to every working set'}
                </AppText>
              </View>
              <Glyph name={GLYPH.chevronRight} color={THEME.accent} size={13} />
            </Pressable>
          ) : null}

          <View style={{ gap: 10 }}>
            {draft.exercises.map((exercise, index) => {
              const previous = draft.exercises[index - 1];
              const next = draft.exercises[index + 1];
              const grouped = exercise.supersetGroup;
              const showHeader = !previous || previous.muscleKey !== exercise.muscleKey;
              const collapsed = collapsedMuscles.has(exercise.muscleKey);
              const header = showHeader ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${muscleLabel(exercise.muscleKey)}`}
                  accessibilityState={{ expanded: !collapsed }}
                  onPress={() => toggleMuscle(exercise.muscleKey)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    minHeight: 44,
                    marginTop: index === 0 ? 0 : 8,
                  }}>
                  <Glyph
                    name={collapsed ? GLYPH.chevronRight : GLYPH.chevronDown}
                    color={THEME.accent}
                    size={14}
                  />
                  <AppText
                    style={{
                      fontSize: 13,
                      fontWeight: '800',
                      letterSpacing: 0.8,
                      color: THEME.accent,
                    }}>
                    {muscleLabel(exercise.muscleKey).toUpperCase()}
                  </AppText>
                </Pressable>
              ) : null;

              if (collapsed) {
                return showHeader ? <View key={exercise.key}>{header}</View> : null;
              }

              if (isTimedRow(exercise)) {
                return (
                  <View key={exercise.key}>
                    {header}
                    <TimedRowCard
                      row={exercise}
                      pulseToken={pulseKey === exercise.key ? pulseToken : 0}
                      readOnly={readOnly}
                      onChangeDuration={(seconds) =>
                        edit((current) =>
                          updateTimedRow(current, exercise.key, { durationSeconds: seconds }),
                        )
                      }
                      onChangeType={(type) =>
                        edit((current) => updateTimedRow(current, exercise.key, { cardioType: type }))
                      }
                      onChangeIntensity={(value) =>
                        edit((current) => updateTimedRow(current, exercise.key, { intensity: value }))
                      }
                      onChangeMethod={() =>
                        setTimedSheet({ kind: 'cardio', muscle: exercise.muscleKey })
                      }
                      onChangeRounds={(rounds) =>
                        edit((current) => updateTimedRow(current, exercise.key, { rounds }))
                      }
                      onToggleComplete={() =>
                        edit((current) =>
                          updateTimedRow(current, exercise.key, {
                            completedAt: exercise.completedAt ? null : new Date().toISOString(),
                          }),
                        )
                      }
                      onPlay={() => startPlay(rowPlaySpec(exercise))}
                      onRemove={() => edit((current) => removeExercise(current, exercise.key))}
                      onDuplicate={() =>
                        edit((current) => duplicateExercise(current, exercise.key))
                      }
                      onMove={(direction) =>
                        edit((current) => moveExercise(current, exercise.key, direction))
                      }
                      canMoveUp={canMoveExercise(draft, exercise.key, -1)}
                      canMoveDown={canMoveExercise(draft, exercise.key, 1)}
                    />
                  </View>
                );
              }

              return (
                <View
                  key={exercise.key}
                  style={{
                    marginTop: grouped != null && previous?.supersetGroup === grouped ? -8 : 0,
                  }}>
                  {header}
                  <ExerciseCard
                    exercise={exercise}
                    unit={draft.unit}
                    readOnly={readOnly}
                    autoFocusSet={focusExerciseKey === exercise.key}
                    pulseKey={pulseKey}
                    pulseToken={pulseToken}
                    collapsed={collapsedExercises.has(exercise.key)}
                    supersetLabel={labels[exercise.key] ?? null}
                    supersetAbove={grouped != null && previous?.supersetGroup === grouped}
                    supersetBelow={grouped != null && next?.supersetGroup === grouped}
                    onToggleCollapsed={() => toggleExercise(exercise.key)}
                    onChangeSet={(setKey, patch) =>
                      edit((current) => updateSet(current, exercise.key, setKey, patch))
                    }
                    onToggleSet={(setKey) =>
                      edit((current) => toggleSetComplete(current, exercise.key, setKey))
                    }
                    onRemoveSet={(setKey) =>
                      edit((current) => removeSet(current, exercise.key, setKey))
                    }
                    onAddSet={(kind: LiftSetKind) =>
                      edit((current) => addSet(current, exercise.key, kind))
                    }
                    onRemove={() => edit((current) => removeExercise(current, exercise.key))}
                    onDuplicate={() =>
                      edit((current) => duplicateExercise(current, exercise.key))
                    }
                    onSwap={() => setSwapFor(exercise.key)}
                    onMove={(direction) =>
                      edit((current) => moveExercise(current, exercise.key, direction))
                    }
                    canMoveUp={canMoveExercise(draft, exercise.key, -1)}
                    canMoveDown={canMoveExercise(draft, exercise.key, 1)}
                  />
                </View>
              );
            })}
          </View>

          {readOnly ? null : (
            <RosterAddCluster
              empty={draft.exercises.length === 0}
              scrollToken={rosterScroll}
              onAddExercise={() => {
                setSheetMuscle(null);
                setPickerOpen(true);
              }}
              onCardio={() =>
                setTimedSheet({
                  kind: 'cardio',
                  muscle: draft.exercises[draft.exercises.length - 1]?.muscleKey ?? 'cardio',
                })
              }
              onRest={() =>
                setTimedSheet({
                  kind: 'rest',
                  muscle: draft.exercises[draft.exercises.length - 1]?.muscleKey ?? 'rest',
                })
              }
            />
          )}
      </KeyboardFormShell>

      <AddExerciseSheet
        visible={pickerOpen || swapFor != null}
        swapping={swapFor ? (swapRow?.name ?? null) : null}
        muscle={swapRow?.muscleKey ?? sheetMuscle ?? null}
        customs={customs.data ?? []}
        recents={recentExerciseOptions()}
        supersetPartnerName={swapFor ? null : (supersetPartner(draft)?.name ?? null)}
        methods={cardioMethods.data ?? []}
        busy={createCustom.isPending}
        onClose={() => {
          setPickerOpen(false);
          setSheetMuscle(null);
          setSwapFor(null);
        }}
        onSubmit={(result) => void onAddExercise(result)}
        onPickTimed={(result) => {
          setPickerOpen(false);
          setSheetMuscle(null);
          setSwapFor(null);
          setTimedSheet(result);
        }}
      />

      <AddTimedRowSheet
        visible={timedSheet != null}
        kind={timedSheet?.kind ?? 'cardio'}
        muscle={timedSheet?.muscle ?? draft.muscleKeys[0] ?? 'cardio'}
        methods={cardioMethods.data ?? []}
        initialMethodId={timedSheet?.methodId ?? null}
        onClose={() => setTimedSheet(null)}
        onSubmit={onAddTimedRow}
      />

      <OverloadSheet
        visible={overloadOpen}
        source={draft}
        busy={save.isPending}
        onClose={() => setOverloadOpen(false)}
        onApply={(plan) => void onApplyOverload(plan)}
      />

      <LiftShareSheet
        visible={shareOpen}
        draft={draft}
        challenges={liftingChallenges}
        lockedChallengeIds={lockedChallengeIds}
        busy={share.isPending || attach.isPending}
        error={error}
        sharedPostId={sharedPostId}
        onClose={closeShare}
        onShare={(choice) => void onShare(choice)}
        onComposeHome={(input) => onComposeHome(input)}
        onSkip={() => {
          setShareOpen(false);
          router.replace(LIFTS_HISTORY_HREF);
        }}
      />

      <LiftDoneSheet
        visible={doneSheet}
        challenges={liftingChallenges}
        busy={attach.isPending}
        error={error}
        onDone={() => setDoneSheet(false)}
        onShare={() => {
          setDoneSheet(false);
          setSharedPostId(null);
          setShareOpen(true);
        }}
        onAddToCheckin={onAddToCheckin}
      />

      {Platform.OS === 'ios' ? (
        <LiftHealthKitSheet
          visible={hkOpen}
          workouts={hkWorkouts}
          busy={save.isPending}
          onClose={() => setHkOpen(false)}
          onPick={(workout) => {
            void linkLiftSessionHealthKit(draft.id, workout.providerWorkoutId)
              .catch(() => undefined)
              .finally(() => setHkOpen(false));
          }}
        />
      ) : null}
    </Screen>
  );
}

/**
 * Under the last card. Add Exercise opens the full catalog. Cardio and Rest insert a row.
 * Not part of the Play / Save / Complete footer.
 */
function RosterAddCluster({
  empty,
  scrollToken,
  onAddExercise,
  onCardio,
  onRest,
}: {
  empty: boolean;
  scrollToken: number;
  onAddExercise: () => void;
  onCardio: () => void;
  onRest: () => void;
}) {
  const ref = useRef<View>(null);
  const form = useKeyboardForm();
  useEffect(() => {
    if (!scrollToken || !ref.current) {
      return undefined;
    }
    const node = ref.current;
    const handle = setTimeout(() => {
      form?.scrollFieldIntoView(node);
    }, 280);
    return () => clearTimeout(handle);
  }, [form, scrollToken]);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={{ gap: 8, marginTop: empty ? 0 : 12, flexGrow: empty ? 1 : 0, justifyContent: empty ? 'flex-end' : 'flex-start' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add exercise"
        onPress={onAddExercise}
        style={({ pressed }) => ({
          minHeight: 52,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: THEME.border,
          backgroundColor: pressed ? THEME.accentSoft : THEME.surface,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 6,
        })}>
        <Glyph name={GLYPH.plus} color={THEME.accent} size={14} />
        <AppText style={{ fontSize: 16, fontWeight: '800', color: THEME.accent }}>Add Exercise</AppText>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <InsertButton label="Cardio" glyph={GLYPH.anyExercise} onPress={onCardio} />
        <InsertButton label="Rest" glyph={GLYPH.clock} onPress={onRest} />
      </View>
    </View>
  );
}

/** The quiet "+ Cardio" / "+ Rest" pair under Add Exercise. */
function InsertButton({
  label,
  glyph,
  onPress,
}: {
  label: string;
  glyph: Parameters<typeof Glyph>[0]['name'];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add ${label.toLowerCase()} here`}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: THEME.border,
        backgroundColor: pressed ? THEME.accentSoft : 'transparent',
      })}>
      <Glyph name={glyph} color={THEME.textMuted} size={13} />
      <AppText style={{ fontSize: 13, fontWeight: '700', color: THEME.textMuted }}>{label}</AppText>
    </Pressable>
  );
}
