import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddExerciseSheet, type AddExerciseResult } from '@/components/lift/AddExerciseSheet';
import { ExerciseCard } from '@/components/lift/ExerciseCard';
import { LiftShareSheet, type LiftShareChoice } from '@/components/lift/LiftShareSheet';
import { OverloadSheet } from '@/components/lift/OverloadSheet';
import { MascotState } from '@/components/mascot/MascotState';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import {
  useAttachLiftToCheckin,
  useCreateCustomExercise,
  useCustomExercises,
  useDeleteLiftSession,
  useLiftingChallenges,
  useLiftSession,
  useSaveLiftSession,
  useShareLiftSession,
} from '@/hooks/useLift';
import { bumpSessionInPlace, canOverloadSession, overloadChipLabel } from '@/lib/lift/overload';
import { hasShareableWork } from '@/lib/lift/recap';
import { fetchChallengeShareLocks } from '@/lib/lift/share';
import { challengeDetailHref } from '@/lib/routes';
import { muscleLabel, type MuscleKey } from '@/lib/lift/muscles';
import {
  addExercise,
  addSet,
  countWorkSets,
  removeExercise,
  removeSet,
  renameSession,
  repeatSession,
  sessionSections,
  sessionTitle,
  shortDate,
  supersetLabels,
  supersetPartner,
  toggleSetComplete,
  updateSet,
} from '@/lib/lift/session';
import type { LiftOverloadPlan, LiftSessionDraft, LiftSetKind } from '@/lib/lift/types';
import { firstRouteParam } from '@/lib/challengeLoad';
import { LIFT_START_HREF, LIFTS_HISTORY_HREF, liftSessionHref } from '@/lib/routes';
import { tabBarLift, THEME, themeShadow } from '@/lib/theme';

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
  const params = useLocalSearchParams<{ id?: string }>();
  const id = firstRouteParam(params.id);
  // Keying on the id remounts on "Start this again", which lands on the same route with a new id.
  // Without it the screen would keep rendering the session that was just copied.
  return <LiftSessionInner key={id || 'lift'} id={id} />;
}

function LiftSessionInner({ id }: { id: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const loaded = useLiftSession(id);
  const customs = useCustomExercises();
  const save = useSaveLiftSession();
  const createCustom = useCreateCustomExercise();
  const remove = useDeleteLiftSession();
  const share = useShareLiftSession();
  const attach = useAttachLiftToCheckin();
  const liftingChallenges = useLiftingChallenges();

  const [draft, setDraft] = useState<LiftSessionDraft | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharedPostId, setSharedPostId] = useState<string | null>(null);
  const [overloadOpen, setOverloadOpen] = useState(false);
  const [lockedChallengeIds, setLockedChallengeIds] = useState<string[]>([]);
  const [collapsedMuscles, setCollapsedMuscles] = useState<Set<string>>(new Set());
  const [collapsedExercises, setCollapsedExercises] = useState<Set<string>>(new Set());
  const [sheetMuscle, setSheetMuscle] = useState<MuscleKey | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [titleText, setTitleText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  useEffect(
    () => () => {
      const pending = draftRef.current;
      if (pending && dirty.current && !pending.completedAt) {
        dirty.current = false;
        void saveRef.current.mutateAsync({ draft: pending }).catch(() => undefined);
      }
    },
    [],
  );

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
      if (result.createName) {
        const created = await createCustom.mutateAsync({
          name: result.createName,
          muscle: result.muscle,
        });
        edit((current) =>
          addExercise(current, {
            customExerciseId: created.id,
            name: created.name,
            muscleKey: result.muscle,
            superset: result.superset,
          }),
        );
      } else if (result.option) {
        edit((current) =>
          addExercise(current, {
            exerciseId: result.option?.official ? result.option.id : null,
            customExerciseId: result.option?.official ? null : (result.option?.id ?? null),
            name: result.option?.name ?? 'Exercise',
            muscleKey: result.muscle,
            superset: result.superset,
          }),
        );
      }
      setSheetMuscle(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add that exercise.');
    }
  }

  async function onSave() {
    if (!draft) {
      return;
    }
    dirty.current = false;
    const ok = await persist(draft, true);
    if (!ok) {
      return;
    }
    // Mark it complete locally first: this route is already `draft.id`, so navigating here would
    // not remount, and the unmount autosave would otherwise write the session back as unfinished.
    const done = { ...draft, completedAt: new Date().toISOString() };
    setDraft(done);

    // A session with no finished working sets has nothing to put on a card, so it goes straight to
    // History rather than opening a share sheet with an empty brag in it.
    if (hasShareableWork(done)) {
      setShareOpen(true);
      return;
    }
    router.replace(LIFTS_HISTORY_HREF);
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
      const posted = await share.mutateAsync({
        draft,
        caption: choice.caption,
        challengeId: null,
        home: true,
        audience: choice.audience,
      });
      setSharedPostId(posted.postId);
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
      router.replace(liftSessionHref(next.id));
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

  const sections = useMemo(() => (draft ? sessionSections(draft) : []), [draft]);
  const labels = useMemo(() => (draft ? supersetLabels(draft) : {}), [draft]);
  const title = draft ? sessionTitle(draft) : 'Lift';

  if (loaded.isLoading || (!draft && !loaded.isFetched)) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <Stack.Screen options={{ headerShown: true, title: 'Lift' }} />
        <MascotState kind="loading" title="Loading your lift…" />
      </Screen>
    );
  }

  if (!draft) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <Stack.Screen options={{ headerShown: true, title: 'Lift' }} />
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

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} keyboardAvoiding={false}>
      <Stack.Screen options={{ headerShown: true, title: readOnly ? 'Lift' : 'Logging' }} />
      <View style={{ flex: 1, minHeight: 0 }}>
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <View style={{ paddingTop: 4, paddingBottom: 12 }}>
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

          {sections.map((section) => {
            const collapsed = collapsedMuscles.has(section.muscle);
            return (
              <View key={section.muscle} style={{ marginBottom: 18 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    marginBottom: 8,
                  }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${muscleLabel(section.muscle)}`}
                    accessibilityState={{ expanded: !collapsed }}
                    onPress={() => toggleMuscle(section.muscle)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      minHeight: 44,
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
                      {muscleLabel(section.muscle).toUpperCase()}
                    </AppText>
                    <AppText style={{ fontSize: 12, color: THEME.textMuted }}>
                      {section.exercises.length}
                    </AppText>
                  </Pressable>
                  {readOnly ? null : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${muscleLabel(section.muscle)} exercise`}
                      onPress={() => setSheetMuscle(section.muscle)}
                      style={({ pressed }) => ({
                        minHeight: 44,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 5,
                        backgroundColor: pressed ? THEME.accentSoft : 'transparent',
                      })}>
                      <Glyph name={GLYPH.plus} color={THEME.accent} size={13} />
                      <AppText style={{ fontSize: 14, fontWeight: '700', color: THEME.accent }}>
                        Add
                      </AppText>
                    </Pressable>
                  )}
                </View>

                {collapsed ? null : (
                  <View style={{ gap: 10 }}>
                    {section.exercises.length === 0 ? (
                      <View
                        style={{
                          padding: 16,
                          borderRadius: 16,
                          borderWidth: 1,
                          borderStyle: 'dashed',
                          borderColor: THEME.border,
                          backgroundColor: THEME.surface,
                        }}>
                        <AppText style={{ fontSize: 13, color: THEME.textMuted }}>
                          {readOnly
                            ? 'Nothing logged for this one.'
                            : `No ${muscleLabel(section.muscle)} exercises yet. Tap Add to search the catalog.`}
                        </AppText>
                      </View>
                    ) : null}
                    {section.exercises.map((exercise, index) => {
                      const previous = section.exercises[index - 1];
                      const next = section.exercises[index + 1];
                      const grouped = exercise.supersetGroup;
                      return (
                        <View
                          key={exercise.key}
                          style={{
                            marginTop:
                              grouped != null && previous?.supersetGroup === grouped ? -8 : 0,
                          }}>
                          <ExerciseCard
                            exercise={exercise}
                            unit={draft.unit}
                            readOnly={readOnly}
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
                          />
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 10,
            gap: 8,
            backgroundColor: THEME.surface,
            borderTopWidth: 1,
            borderTopColor: THEME.border,
            paddingBottom: tabBarLift(insets.bottom, 'sticky') + 12,
            ...themeShadow('bar'),
          }}>
          {error ? (
            <AppText style={{ fontSize: 13, fontWeight: '600', color: THEME.danger }}>
              {error}
            </AppText>
          ) : null}

          {readOnly ? (
            <>
              {hasShareableWork(draft) ? (
                <Button
                  title={draft.sharedPostId ? 'Share again' : 'Share this lift'}
                  onPress={() => {
                    setSharedPostId(null);
                    setShareOpen(true);
                  }}
                />
              ) : null}
              <Button
                title="Start this again"
                variant={hasShareableWork(draft) ? 'outline' : 'primary'}
                loading={save.isPending}
                onPress={() => void onStartAgain()}
              />
              {confirmDelete ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <AppText style={{ flex: 1, fontSize: 13, color: THEME.textMuted }}>
                    Delete this lift for good?
                  </AppText>
                  <Button title="Keep" variant="outline" size="sm" onPress={() => setConfirmDelete(false)} />
                  <Button
                    title="Delete"
                    variant="danger"
                    size="sm"
                    loading={remove.isPending}
                    onPress={() => void onDelete()}
                  />
                </View>
              ) : (
                <Button
                  title="Delete lift"
                  variant="ghost"
                  size="sm"
                  onPress={() => setConfirmDelete(true)}
                />
              )}
            </>
          ) : (
            <Button
              title={save.isPending ? 'Saving…' : 'Save session'}
              loading={save.isPending}
              onPress={() => void onSave()}
            />
          )}
        </View>
      </View>

      <AddExerciseSheet
        visible={sheetMuscle != null}
        muscle={sheetMuscle ?? draft.muscleKeys[0] ?? 'chest'}
        muscles={draft.muscleKeys.length ? draft.muscleKeys : [sheetMuscle ?? 'chest']}
        customs={customs.data ?? []}
        supersetPartnerName={
          sheetMuscle ? (supersetPartner(draft, sheetMuscle)?.name ?? null) : null
        }
        busy={createCustom.isPending}
        onClose={() => setSheetMuscle(null)}
        onSubmit={(result) => void onAddExercise(result)}
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
        onSkip={() => {
          setShareOpen(false);
          router.replace(LIFTS_HISTORY_HREF);
        }}
      />
    </Screen>
  );
}
