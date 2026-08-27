import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardOverlap } from '@/components/ui/KeyboardFormShell';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ChallengeNotesProvider } from '@/components/challenge/FieldNote';
import { CreateActionsFooter } from '@/components/challenge/create/wizardUi';
import { ChallengePhotoField } from '@/components/challenge/create/ChallengePhotoField';
import { CreateReviewPreview, type CreateReviewEditKey } from '@/components/challenge/create/CreateReviewPreview';
import { DateTimeField } from '@/components/challenge/create/DateTimeField';
import { DistanceMilesRow, ExtraTasksEditor, HeartRateMinutesRow } from '@/components/challenge/create/ExtraTasksEditor';
import { LocationPlacePicker } from '@/components/challenge/LocationPlacePicker';
import { PrivacyModePicker } from '@/components/challenge/create/PrivacyModePicker';
import { StackBackButton, useDismissTo } from '@/components/navigation/StackBackButton';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { useTourOptional } from '@/components/tour/TourContext';
import { Button } from '@/components/ui/Button';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Glyph, GLYPH, type GlyphId } from '@/components/ui/Glyph';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { StepperField } from '@/components/ui/Stepper';
import { AppText } from '@/components/ui/AppText';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { dismissKeyboard } from '@/utils/keyboard';
import { useCreateChallenge, useChallenge, useUpdateUserChallenge } from '@/hooks/useChallenge';
import { useCreateChallengeTour } from '@/hooks/useCreateChallengeTour';
import { useAuth } from '@/hooks/useAuth';
import { useChallengeDrafts, useSaveChallengeDraft } from '@/hooks/useChallengeDraft';
import { useMyProfile } from '@/hooks/useProfile';
import { useWalletOptional } from '@/hooks/useWallet';
import { wizardStepIndex } from '@/lib/challengeTemplates';
import {
  createHrefForDraft,
  isSimpleCreateDraft,
  pickSimpleDraft,
} from '@/lib/challengeDraft';
import {
  SIMPLE_CUMULATIVE_WINDOWS,
  SIMPLE_CUSTOM_PERIODS,
  SIMPLE_DURATION_CHIPS,
  SIMPLE_FREQUENCY_CHIPS,
  SIMPLE_PROOF_METHODS,
  SIMPLE_SCORING,
  SIMPLE_TYPES,
  addSimpleProof,
  applyBeforeAfterHrPreset,
  clearPersistedSimpleDraft,
  customFrequencyCopy,
  defaultSimpleDraft,
  endsAtOf,
  frequencyHintOf,
  isLeftoverSimplePointsDraft,
  removeSimpleProof,
  simpleDraftFromChallenge,
  simpleDraftToCreateValues,
  simpleHowYouWin,
  syncProofNameWithTask,
  validateSimpleDraft,
  type SimpleChallengeDraft,
  type SimpleChallengeType,
  type SimpleCurrency,
  type SimpleCustomPeriod,
  type SimpleDurationPreset,
  type SimpleFrequency,
} from '@/lib/simpleChallenge';
import { milesToMeters } from '@/lib/distance';
import { usesAdvancedCreateEdit } from '@/lib/challengeExperience';
import { canHostQuickEdit } from '@/lib/challengeStart';
import {
  formatChallengeEndLine,
  inOneHour,
  resolveStartForPublish,
  tomorrowMorning,
  type StartPreset,
} from '@/lib/challengeSchedule';
import {
  SIMPLE_PROOF_CAP,
  defaultSentenceForMethod,
  ensureProofSentence,
  makeProof,
  proofDistanceMeters,
  proofNameForMethodChange,
  type ChallengeProofMethod,
} from '@/lib/challengeProofs';
import { formatCash, formatWallet, walletBalance } from '@/lib/currency';
import { copy } from '@/lib/copy';
import { LOBBY_HREF, TABS_HREF } from '@/lib/routes';
import { tabBarLift, THEME } from '@/lib/theme';
import { getCreateChallengeMessage } from '@/utils/errors';

function IconChip({
  icon,
  glyph,
  label,
  selected,
  onPress,
}: {
  icon: string;
  glyph?: GlyphId;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const color = selected ? THEME.accent : THEME.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="flex-row items-center rounded-full px-3"
      style={{
        backgroundColor: selected ? THEME.accentSoft : THEME.surface,
        borderWidth: 1,
        borderColor: selected ? THEME.accent : THEME.border,
        minHeight: 44,
        gap: 6,
      }}>
      {glyph ? <Glyph name={glyph} color={color} size={14} /> : icon ? <AppText className="text-[14px]">{icon}</AppText> : null}
      <AppText className="text-sm font-semibold" style={{ color }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Pressable accessible={false} onPress={dismissKeyboard}>
      <AppText className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        {children}
      </AppText>
    </Pressable>
  );
}

export function SimpleCreateForm() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    returnTo?: string;
    funded?: string;
    editId?: string;
    resume?: string;
    draftId?: string;
  }>();
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const funded = Array.isArray(params.funded) ? params.funded[0] : params.funded;
  const editId = Array.isArray(params.editId) ? params.editId[0] : params.editId;
  const resumeDraftId = Array.isArray(params.draftId) ? params.draftId[0] : params.draftId;
  const { user } = useAuth();
  const { profile, refetch, isFetched } = useMyProfile();
  const walletSheet = useWalletOptional();
  const create = useCreateChallenge();
  const update = useUpdateUserChallenge();
  const saveDraft = useSaveChallengeDraft();
  const draftsQuery = useChallengeDrafts();
  const editing = useChallenge(editId);
  const originalStart = editing.data?.starts_at ?? null;
  const simpleDraftIdRef = useRef<string | null>(null);
  const draftRef = useRef<SimpleChallengeDraft>(defaultSimpleDraft());
  const hydratedRemote = useRef(false);
  const editedRef = useRef(false);
  const draftFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftFlash, setDraftFlash] = useState(false);
  const [footerH, setFooterH] = useState(88);
  const [draft, setDraft] = useState<SimpleChallengeDraft>(() => defaultSimpleDraft());
  draftRef.current = draft;
  const [error, setError] = useState<string | null>(null);
  const [leftoverPointsNotice, setLeftoverPointsNotice] = useState(false);
  const [view, setView] = useState<'form' | 'review'>('form');
  const [focusSection, setFocusSection] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, View | null>>({});
  const contentRef = useRef<View>(null);
  const hydratedEdit = useRef(false);
  const coinBuyInRef = useRef(0);
  useDismissTo(returnTo === 'feed' ? TABS_HREF : LOBBY_HREF);
  useCreateChallengeTour('simple');
  const tour = useTourOptional();
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const keyboardOverlap = useKeyboardOverlap();

  useEffect(() => {
    tour?.setCreateCurrency(draft.currency);
  }, [draft.currency, tour]);

  function flashDraftSaved() {
    setDraftFlash(true);
    if (draftFlashTimerRef.current) {
      clearTimeout(draftFlashTimerRef.current);
    }
    draftFlashTimerRef.current = setTimeout(() => {
      setDraftFlash(false);
    }, 1600);
  }

  async function onSaveDraft() {
    if (editId || !user || saveDraft.isPending) {
      return;
    }
    try {
      const saved = await saveDraft.mutateAsync({
        id: simpleDraftIdRef.current ?? draftsQuery.data?.[0]?.id ?? null,
        step: wizardStepIndex('goal'),
        startPath: 'scratch',
        templateId: null,
        sourceChallengeId: null,
        createMode: 'simple',
        startPreset: draft.start_preset,
        simple: draft,
        values: simpleDraftToCreateValues(draft),
      });
      if (saved.id) {
        simpleDraftIdRef.current = saved.id;
      }
      flashDraftSaved();
    } catch (err) {
      setError(getCreateChallengeMessage(err));
    }
  }

  function patch(partial: Partial<SimpleChallengeDraft>) {
    setDraft((current) => {
      const next = { ...current, ...partial };
      if (!editId) {
        editedRef.current = true;
      }
      return next;
    });
    setError(null);
  }

  useEffect(() => {
    if (editId || hydratedRemote.current || editedRef.current || draftsQuery.isLoading) {
      return;
    }
    const remote = pickSimpleDraft(draftsQuery.data ?? [], resumeDraftId);
    if (remote && !isSimpleCreateDraft(remote)) {
      router.replace(createHrefForDraft(remote, returnTo === 'feed' ? { returnTo: 'feed' } : undefined));
      return;
    }
    if (remote && isSimpleCreateDraft(remote)) {
      hydratedRemote.current = true;
      simpleDraftIdRef.current = remote.id;
      const next = remote.simple ?? draftRef.current;
      if (isLeftoverSimplePointsDraft(next)) {
        setLeftoverPointsNotice(true);
        setDraft({ ...next, scoring: 'consistency' });
        return;
      }
      setDraft(next);
      return;
    }
    if ((draftsQuery.data ?? []).some((item) => item.id === resumeDraftId && !isSimpleCreateDraft(item))) {
      const advanced = (draftsQuery.data ?? []).find((item) => item.id === resumeDraftId);
      if (advanced) {
        router.replace(createHrefForDraft(advanced, returnTo === 'feed' ? { returnTo: 'feed' } : undefined));
      }
    }
  }, [draftsQuery.data, draftsQuery.isLoading, editId, resumeDraftId, returnTo, router]);

  useEffect(() => {
    if (!editId || !editing.data) {
      return;
    }
    if (usesAdvancedCreateEdit(editing.data)) {
      router.replace({
        pathname: '/challenges/create',
        params: returnTo === 'feed' ? { editId, mode: 'advanced', returnTo: 'feed' } : { editId, mode: 'advanced' },
      });
      return;
    }
    if (hydratedEdit.current) {
      return;
    }
    if (!canHostQuickEdit({ challenge: editing.data, viewerId: user?.id })) {
      setError(copy('challenge.notStarted'));
      return;
    }
    hydratedEdit.current = true;
    setDraft(simpleDraftFromChallenge(editing.data));
  }, [editId, editing.data, returnTo, router, user?.id]);

  useEffect(() => {
    if (funded !== '1' && draft.currency !== 'bucks') {
      return;
    }
    void refetch();
  }, [draft.currency, funded, refetch]);

  const endLine = formatChallengeEndLine(endsAtOf(draft));
  const wallet = walletBalance(profile, draft.currency);
  const hostCost = Math.max(draft.host_budget, 0);
  const cash = draft.currency === 'bucks';
  const corporate = draft.privacy_mode === 'private_corporate';
  const creatorBuyIn = cash || corporate ? 0 : Math.max(draft.buy_in, 0);
  const needed = hostCost + creatorBuyIn;
  const poolShortfall =
    isFetched && draft.currency === 'bucks' && needed > 0 ? Math.max(needed - wallet, 0) : 0;

  const costHint = useMemo(() => {
    if (draft.currency === 'bucks') {
      return null;
    }
    if (needed <= 0) {
      return null;
    }
    if (wallet < needed) {
      return `You need ${formatWallet(needed, draft.currency)}. You have ${formatWallet(wallet, draft.currency)}.`;
    }
    return null;
  }, [draft.currency, needed, wallet]);

  function scrollToSection(id: string) {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const node = sectionRefs.current[id];
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!node || !scroll) {
      return;
    }
    const run = (y: number) => scroll.scrollTo({ y: Math.max(y - 16, 0), animated: true });
    if (content && typeof node.measureLayout === 'function') {
      node.measureLayout(content as never, (_x, y) => run(y), () => run(0));
      return;
    }
    run(0);
  }

  useEffect(() => {
    if (view !== 'form' || !focusSection) {
      return;
    }
    const handle = requestAnimationFrame(() => scrollToSection(focusSection));
    return () => cancelAnimationFrame(handle);
  }, [view, focusSection]);

  function formIssue(): string | null {
    return validateSimpleDraft(draft, { allowStart: originalStart }) ?? (editId ? null : costHint);
  }

  function onReview() {
    const issue = formIssue();
    if (issue) {
      setError(issue);
      return;
    }
    if (!editId && poolShortfall > 0) {
      setError(`Add ${formatCash(poolShortfall)}`);
      return;
    }
    setError(null);
    setFocusSection(null);
    setView('review');
  }

  function onEditFromReview(key: CreateReviewEditKey) {
    const section =
      key === 'title'
        ? 'create-simple-title'
        : key === 'task'
          ? 'create-simple-task'
          : key === 'proofs'
            ? 'create-simple-proof'
            : key === 'duration'
              ? 'create-simple-duration'
              : key === 'frequency'
                ? 'create-simple-frequency'
                : key === 'visibility'
                  ? 'create-simple-visibility'
                  : key === 'prize'
                    ? 'create-simple-buyin'
                    : 'create-simple-start';
    setFocusSection(section);
    setView('form');
  }

  async function onCreate() {
    const issue = validateSimpleDraft(draft, { allowStart: originalStart }) ?? (editId ? null : costHint);
    if (issue) {
      setError(issue);
      return;
    }
    if (!editId && poolShortfall > 0) {
      setError(`Add ${formatCash(poolShortfall)}`);
      return;
    }
    if (!user) {
      setError(copy('create.signIn'));
      return;
    }
    try {
      if (editId) {
        const challenge = await update.mutateAsync({
          challengeId: editId,
          values: simpleDraftToCreateValues(draft),
        });
        router.replace(`/challenges/${challenge.id}`);
        return;
      }
      const schedule = resolveStartForPublish({
        preset: draft.start_preset,
        starts_at: draft.starts_at,
        duration_days: draft.duration_preset === 'custom' ? draft.duration_days : draft.duration_preset,
      });
      const toPublish = { ...draft, starts_at: schedule.starts_at };
      if (toPublish.start_preset === 'custom') {
        const start = Date.parse(toPublish.starts_at);
        if (Number.isFinite(start) && start <= Date.now()) {
          setError(copy('create.startFuture'));
          return;
        }
      }
      const challenge = await create.mutateAsync({
        ...simpleDraftToCreateValues(toPublish),
        draft_id: simpleDraftIdRef.current,
      });
      clearPersistedSimpleDraft();
      router.replace(`/challenges/${challenge.id}`);
    } catch (err) {
      setError(getCreateChallengeMessage(err));
    }
  }

  function closeSimple() {
    router.dismissTo(returnTo === 'feed' ? TABS_HREF : LOBBY_HREF);
  }

  return (
    <ChallengeNotesProvider>
    <View style={{ flex: 1, backgroundColor: THEME.background }}>
    <Screen
      scroll
      padded
      edges={TAB_ROOT_EDGES}
      scrollRef={(node) => {
        scrollRef.current = node;
        tour?.setCreateScroll(node);
      }}
      onScroll={(event) => tour?.setCreateScrollY(event.nativeEvent.contentOffset.y)}
      contentPaddingBottom={
        (tour?.createActive ? 220 : 24) + keyboardOverlap + footerH
      }>
      <View ref={contentRef} className="gap-5 pt-1" pointerEvents={tour?.createActive ? 'none' : 'auto'} collapsable={false}>
        <View className="flex-row items-center" style={{ marginHorizontal: -8 }}>
          <StackBackButton fallback={returnTo === 'feed' ? TABS_HREF : LOBBY_HREF} />
          <AppText className="flex-1 text-[22px] font-extrabold text-charcoal">
            {editId ? copy('create.editTitle') : copy('create.screenTitle')}
          </AppText>
        </View>

        {view === 'review' ? (
          <>
            <CreateReviewPreview values={simpleDraftToCreateValues(draft)} onEdit={onEditFromReview} />
            {error ? <AppText className="text-sm text-coral-dark">{error}</AppText> : null}
            {!editId && needed > 0 ? (
              <View className="gap-1">
                {cash ? (
                  <AppText className="text-[13px] text-muted">{copy('money.realUsd')}</AppText>
                ) : null}
                {cash ? (
                  <AppText className="text-[13px] text-muted">{copy('create.youFundPrize')}</AppText>
                ) : (
                  <AppText className="text-[13px] text-muted">{copy('create.realMoneyFund')}</AppText>
                )}
                {!cash && creatorBuyIn > 0 ? (
                  <AppText className="text-[13px] text-muted">{copy('note.buyIn')}</AppText>
                ) : null}
                {cash ? (
                  <AppText className="text-[13px] text-muted">{copy('money.leavesNow')}</AppText>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}

        {view === 'form' ? (
        <>

        <TourAnchor id="create-simple-currency">
        <View className="gap-2">
          <SectionLabel>{copy('create.currency')}</SectionLabel>
          <SegmentedControl
            accessibilityLabel={copy('create.currency')}
            value={draft.currency}
            options={[
              { value: 'coins' as SimpleCurrency, label: copy('create.coins') },
              { value: 'bucks' as SimpleCurrency, label: '$' },
            ]}
            onChange={(value) => {
              if (value === 'bucks') {
                if (draft.currency === 'coins') {
                  coinBuyInRef.current = draft.buy_in;
                }
                patch({
                  currency: value,
                  buy_in: 0,
                  friends_of_friends:
                    draft.privacy_mode === 'private_corporate'
                      ? false
                      : draft.visibility === 'invite' && value === 'coins',
                });
                return;
              }
              patch({
                currency: value,
                buy_in: draft.currency === 'bucks' ? coinBuyInRef.current : draft.buy_in,
                friends_of_friends:
                  draft.privacy_mode === 'private_corporate'
                    ? false
                    : draft.visibility === 'invite' && value === 'coins',
              });
            }}
          />
          <TourAnchor id="create-simple-buyin">
          <View
            className="gap-3"
            collapsable={false}
            nativeID="create-simple-buyin"
            ref={(node) => {
              sectionRefs.current['create-simple-buyin'] = node;
            }}>
            {corporate ? (
              <AppText className="text-[13px] leading-5 text-muted">
                Private / Corporate Skill Tournaments do not charge an entry fee. The host funds the prize.
              </AppText>
            ) : cash ? null : (
              <StepperField
                label={copy('create.buyIn')}
                value={draft.buy_in}
                min={0}
                max={10_000}
                onChange={(buy_in) => patch({ buy_in })}
              />
            )}
            <StepperField
              label={copy('create.hostPrize')}
              value={draft.host_budget}
              min={0}
              max={10_000}
              formatValue={draft.currency === 'bucks' ? formatCash : undefined}
              onChange={(host_budget) => patch({ host_budget })}
            />
            <AppText className="text-[13px] leading-5 text-muted">
              {cash ? copy('create.youFundPrize') : copy('create.realMoneyFund')}
            </AppText>
            <AppText className="text-[13px] leading-5 text-muted">{copy('create.hostContributionHelp')}</AppText>
            {draft.currency === 'bucks' ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: draft.guarantee_enabled === true }}
                accessibilityLabel={copy('create.guaranteePrize')}
                onPress={() => patch({ guarantee_enabled: draft.guarantee_enabled !== true })}
                className="flex-row items-center justify-between"
                style={{ minHeight: 44 }}>
                <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 120 }} className="mr-3">
                  <AppText className="text-sm font-semibold text-charcoal">
                    {copy('create.guaranteePrize')}
                  </AppText>
                  <AppText className="mt-0.5 text-[13px] leading-5 text-muted">
                    {draft.privacy_mode === 'private_corporate'
                      ? 'Off for Private Corporate unless you turn it on.'
                      : copy('create.guaranteePrizeHelp')}
                  </AppText>
                </View>
                <Switch
                  value={draft.guarantee_enabled === true}
                  onValueChange={(guarantee_enabled) => patch({ guarantee_enabled })}
                  trackColor={{ true: THEME.accent, false: THEME.border }}
                  thumbColor={THEME.surface}
                  ios_backgroundColor={THEME.border}
                />
              </Pressable>
            ) : null}
            {poolShortfall > 0 ? (
              <View className="gap-2">
                <AppText className="text-sm text-coral-dark">
                  Add {formatCash(poolShortfall)}
                </AppText>
                <Button
                  title={`Add ${formatCash(poolShortfall)}`}
                  onPress={() => {
                    walletSheet?.openTopUp({ amount: poolShortfall, returnCreate: true });
                  }}
                />
              </View>
            ) : null}
          </View>
          </TourAnchor>
        </View>
        </TourAnchor>

        <TourAnchor id="create-simple-type">
        <View className="gap-2">
          <SectionLabel>{copy('create.type')}</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {SIMPLE_TYPES.map((item) => (
              <IconChip
                key={item.value}
                icon={item.icon}
                glyph={item.value === 'any_exercise' ? GLYPH.anyExercise : undefined}
                label={item.label}
                selected={draft.type === item.value}
                onPress={() =>
                  patch({
                    type: item.value as SimpleChallengeType,
                    task: draft.task || defaultTask(item.value),
                    proofs: draft.task
                      ? draft.proofs
                      : syncProofNameWithTask(draft.proofs, draft.task, defaultTask(item.value)),
                  })
                }
              />
            ))}
          </View>
        </View>
        </TourAnchor>

        <View className="gap-2">
          <SectionLabel>{copy('create.howYouWin')}</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {SIMPLE_SCORING.map((item) => (
              <IconChip
                key={item.value}
                icon=""
                label={item.label}
                selected={simpleHowYouWin(draft) === item.value}
                onPress={() => {
                  const nextProofs =
                    item.value === 'cumulative' && !draft.proofs.some((proof) => proof.method === 'distance')
                      ? [
                          makeProof(
                            defaultSentenceForMethod('distance', 30, { unit: draft.distance_unit }),
                            'distance',
                            undefined,
                            milesToMeters(1),
                          ),
                          ...draft.proofs,
                        ].slice(0, 4)
                      : draft.proofs;
                  patch({
                    scoring: item.value,
                    proofs: nextProofs,
                    cumulative_window: draft.cumulative_window ?? 'challenge',
                    cumulative_target_meters: draft.cumulative_target_meters || milesToMeters(100),
                  });
                }}
              />
            ))}
          </View>
          {leftoverPointsNotice ? (
            <AppText className="text-[12px] leading-5 text-muted">{copy('create.pointsInAdvanced')}</AppText>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.replace({
                pathname: '/challenges/create',
                params:
                  returnTo === 'feed'
                    ? { mode: 'advanced', type: 'points', returnTo: 'feed' }
                    : { mode: 'advanced', type: 'points' },
              })
            }
            hitSlop={8}>
            <AppText className="text-[12px] font-semibold leading-5" style={{ color: THEME.accent }}>
              {copy('create.needScoreboard')}
            </AppText>
          </Pressable>
          {simpleHowYouWin(draft) === 'cumulative' ? (
            <View className="gap-2">
              <DistanceMilesRow
                meters={draft.cumulative_target_meters || milesToMeters(100)}
                unit={draft.distance_unit ?? 'mi'}
                onChangeMeters={(cumulative_target_meters) => patch({ cumulative_target_meters })}
                onChangeUnit={(distance_unit) => patch({ distance_unit })}
              />
              <SectionLabel>{copy('create.cumulativeWindow')}</SectionLabel>
              <View className="flex-row flex-wrap gap-2">
                {SIMPLE_CUMULATIVE_WINDOWS.map((item) => (
                  <IconChip
                    key={item.value}
                    icon=""
                    label={item.label}
                    selected={(draft.cumulative_window ?? 'challenge') === item.value}
                    onPress={() => patch({ cumulative_window: item.value })}
                  />
                ))}
              </View>
              <AppText className="text-[12px] leading-5 text-muted">
                Everyone who hits the total splits the prize.
              </AppText>
            </View>
          ) : null}
        </View>

        <TourAnchor id="create-simple-title">
        <View
          collapsable={false}
          nativeID="create-simple-title"
          ref={(node) => {
            sectionRefs.current['create-simple-title'] = node;
          }}>
        <Input
          label={copy('create.titleLabel')}
          placeholder={copy('create.titlePlaceholder')}
          value={draft.title}
          onChangeText={(title) => patch({ title })}
          maxLength={80}
        />
        </View>
        </TourAnchor>

        <Input
          label={copy('create.descriptionLabel')}
          placeholder={copy('create.descriptionPlaceholder')}
          value={draft.description}
          onChangeText={(description) => patch({ description })}
          maxLength={120}
          numberOfLines={1}
        />

        <ChallengePhotoField
          uri={draft.cover_image_url}
          onChange={(cover_image_url) => patch({ cover_image_url })}
          onClear={() => patch({ cover_image_url: '' })}
        />

        <TourAnchor id="create-simple-start">
        <View
          className="gap-2"
          collapsable={false}
          nativeID="create-simple-start"
          ref={(node) => {
            sectionRefs.current['create-simple-start'] = node;
          }}>
          <SectionLabel>{copy('create.start')}</SectionLabel>
          <ChipRow>
            <Chip
              label="In 1 hour"
              selected={draft.start_preset === 'hour'}
              onPress={() =>
                patch({ start_preset: 'hour' as StartPreset, starts_at: inOneHour().toISOString() })
              }
            />
            <Chip
              label="Tomorrow morning"
              selected={draft.start_preset === 'tomorrow'}
              onPress={() =>
                patch({ start_preset: 'tomorrow' as StartPreset, starts_at: tomorrowMorning().toISOString() })
              }
            />
            <Chip
              label="Custom"
              selected={draft.start_preset === 'custom'}
              onPress={() => patch({ start_preset: 'custom' })}
            />
          </ChipRow>
          <DateTimeField
            value={draft.starts_at}
            minimumDate={editId ? undefined : new Date()}
            onChange={(starts_at) => patch({ starts_at, start_preset: 'custom' })}
          />
          <StepperField
            label={copy('create.minToStart')}
            hint={copy('create.minToStartHint')}
            value={Math.max(draft.min_participants || 2, 2)}
            min={2}
            max={99}
            onChange={(min_participants) => patch({ min_participants })}
          />
        </View>
        </TourAnchor>

        <TourAnchor id="create-simple-duration">
        <View
          className="gap-2"
          collapsable={false}
          nativeID="create-simple-duration"
          ref={(node) => {
            sectionRefs.current['create-simple-duration'] = node;
          }}>
          <SectionLabel>{copy('create.duration')}</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {SIMPLE_DURATION_CHIPS.map((item) => (
              <IconChip
                key={String(item.value)}
                icon=""
                label={item.label}
                selected={draft.duration_preset === item.value}
                onPress={() =>
                  patch({
                    duration_preset: item.value,
                    duration_days: item.value === 'custom' ? draft.duration_days : (item.value as number),
                  })
                }
              />
            ))}
          </View>
          {draft.duration_preset === 'custom' ? (
            <StepperField
              label={copy('create.days')}
              value={draft.duration_days}
              min={1}
              max={365}
              onChange={(duration_days) => patch({ duration_days })}
            />
          ) : null}
          {endLine ? (
            <AppText className="text-[13px] leading-5 text-muted">{endLine}</AppText>
          ) : null}
        </View>
        </TourAnchor>

        <TourAnchor id="create-simple-task">
        <View
          className="gap-3"
          collapsable={false}
          nativeID="create-simple-task"
          ref={(node) => {
            sectionRefs.current['create-simple-task'] = node;
          }}>
        <Input
          label={copy('create.taskLabel')}
          placeholder={copy('create.taskPlaceholder')}
          value={draft.task}
          onChangeText={(task) =>
            patch({
              task,
              proofs: syncProofNameWithTask(draft.proofs, draft.task, task),
            })
          }
          maxLength={80}
        />
        <ExtraTasksEditor
          tasks={draft.extra_tasks ?? []}
          onChange={(extra_tasks) => patch({ extra_tasks })}
        />
        </View>
        </TourAnchor>

        {simpleHowYouWin(draft) === 'cumulative' ? null : (
        <TourAnchor id="create-simple-frequency">
        <View
          className="gap-2"
          collapsable={false}
          nativeID="create-simple-frequency"
          ref={(node) => {
            sectionRefs.current['create-simple-frequency'] = node;
          }}>
          <SectionLabel>{copy('create.frequency')}</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {SIMPLE_FREQUENCY_CHIPS.map((item) => (
              <IconChip
                key={item.value}
                icon=""
                label={item.label}
                selected={draft.frequency === item.value}
                onPress={() => patch({ frequency: item.value as SimpleFrequency })}
              />
            ))}
          </View>
          {draft.frequency === 'custom' ? (
            <View className="gap-2">
              <StepperField
                label={customFrequencyCopy(draft.custom_checkins, draft.custom_period)}
                value={draft.custom_checkins}
                min={1}
                max={100}
                onChange={(custom_checkins) => patch({ custom_checkins })}
              />
              <View className="flex-row flex-wrap gap-2">
                {SIMPLE_CUSTOM_PERIODS.map((item) => (
                  <IconChip
                    key={item.value}
                    icon=""
                    label={item.label}
                    selected={draft.custom_period === item.value}
                    onPress={() => patch({ custom_period: item.value as SimpleCustomPeriod })}
                  />
                ))}
              </View>
            </View>
          ) : (
            <AppText className="text-[12px] leading-5 text-muted">{frequencyHintOf(draft)}</AppText>
          )}
        </View>
        </TourAnchor>
        )}

        <TourAnchor id="create-simple-proof">
        <View
          className="gap-2"
          collapsable={false}
          nativeID="create-simple-proof"
          ref={(node) => {
            sectionRefs.current['create-simple-proof'] = node;
          }}>
          <SectionLabel>{copy('create.proofs')}</SectionLabel>
          <View className="gap-3">
            {draft.proofs.map((proof) => (
              <View key={proof.id} className="gap-2">
                <View className="flex-row items-center gap-2">
                  <View className="flex-1">
                    <Input
                      placeholder={copy('create.proofFallback')}
                      value={proof.name}
                      onChangeText={(name) =>
                        patch({
                          proofs: draft.proofs.map((item) =>
                            item.id === proof.id ? { ...item, name } : item,
                          ),
                        })
                      }
                      maxLength={90}
                    />
                  </View>
                  {draft.proofs.length > 1 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove proof"
                      onPress={() => patch({ proofs: removeSimpleProof(draft.proofs, proof.id) })}
                      className="h-[52px] w-[52px] items-center justify-center rounded-xl"
                      style={{ borderWidth: 1, borderColor: THEME.border, backgroundColor: THEME.surface }}>
                      <AppText className="text-[18px] font-semibold text-muted">×</AppText>
                    </Pressable>
                  ) : null}
                </View>
                <View className="flex-row flex-wrap gap-2">
                  {SIMPLE_PROOF_METHODS.map((item) => (
                    <IconChip
                      key={item.value}
                      icon={item.icon}
                      label={item.label}
                      selected={proof.method === item.value}
                      onPress={() =>
                        patch({
                          proofs: draft.proofs.map((row) =>
                            row.id === proof.id
                              ? ensureProofSentence(
                                  {
                                    ...row,
                                    method: item.value as ChallengeProofMethod,
                                    minutes:
                                      item.value === 'hr' ? Math.max(row.minutes || 30, 1) : row.minutes,
                                    distance_meters:
                                      item.value === 'distance'
                                        ? proofDistanceMeters(row)
                                        : row.distance_meters,
                                    name: proofNameForMethodChange(
                                      row,
                                      item.value as ChallengeProofMethod,
                                      item.value === 'hr' ? Math.max(row.minutes || 30, 1) : 30,
                                    ),
                                  },
                                  item.value === 'hr' ? Math.max(row.minutes || 30, 1) : 30,
                                )
                              : row,
                          ),
                        })
                      }
                    />
                  ))}
                </View>
                {proof.method === 'hr' ? (
                  <HeartRateMinutesRow
                    value={proof.minutes || 30}
                    onChange={(minutes) =>
                      patch({
                        proofs: draft.proofs.map((row) =>
                          row.id === proof.id
                            ? ensureProofSentence({ ...row, method: 'hr', minutes }, minutes)
                            : row,
                        ),
                      })
                    }
                  />
                ) : null}
                {proof.method === 'distance' ? (
                  <DistanceMilesRow
                    meters={proofDistanceMeters(proof)}
                    unit={draft.distance_unit ?? 'mi'}
                    onChangeMeters={(distance_meters) =>
                      patch({
                        proofs: draft.proofs.map((row) =>
                          row.id === proof.id
                            ? ensureProofSentence({ ...row, method: 'distance', distance_meters })
                            : row,
                        ),
                      })
                    }
                    onChangeUnit={(distance_unit) => patch({ distance_unit })}
                  />
                ) : null}
                {proof.method === 'location' ? (
                  <LocationPlacePicker
                    place={proof.place}
                    onChange={(place) =>
                      patch({
                        proofs: draft.proofs.map((row) =>
                          row.id === proof.id
                            ? ensureProofSentence({ ...row, method: 'location', place })
                            : row,
                        ),
                      })
                    }
                  />
                ) : null}
              </View>
            ))}
          </View>
          <View className="flex-row flex-wrap gap-2">
            {draft.proofs.length < SIMPLE_PROOF_CAP ? (
              <IconChip
                icon=""
                label={copy('create.addProof')}
                selected={false}
                onPress={() => patch({ proofs: addSimpleProof(draft.proofs) })}
              />
            ) : null}
            <IconChip
              icon=""
              label={copy('create.proofPreset')}
              selected={false}
              onPress={() => patch({ proofs: applyBeforeAfterHrPreset() })}
            />
          </View>
          <AppText className="text-[12px] text-muted">{copy('create.proofsHelper')}</AppText>
        </View>
        </TourAnchor>

        <TourAnchor id="create-simple-visibility">
        <View
          className="gap-2"
          collapsable={false}
          nativeID="create-simple-visibility"
          ref={(node) => {
            sectionRefs.current['create-simple-visibility'] = node;
          }}>
          <PrivacyModePicker
            showFieldLabel={false}
            privacyMode={draft.privacy_mode}
            visibility={draft.visibility === 'invite' ? 'invite' : draft.visibility}
            challengeLane="coins"
            participantCount={editId ? editing.data?.participant_count ?? 0 : 0}
            onChange={(next) =>
              patch({
                privacy_mode: next.privacy_mode,
                visibility: next.visibility === 'private' ? 'invite' : next.visibility,
                guarantee_enabled:
                  next.privacy_mode === 'private_corporate' ? false : draft.guarantee_enabled !== false,
                friends_of_friends:
                  next.privacy_mode === 'private_corporate'
                    ? false
                    : next.visibility === 'invite' && draft.currency === 'coins',
              })
            }
            onLockedAttempt={setError}
          />
          {draft.visibility === 'invite' && draft.privacy_mode !== 'private_corporate' ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: draft.friends_of_friends }}
              accessibilityLabel={copy('create.friendsOfFriends')}
              onPress={() => patch({ friends_of_friends: !draft.friends_of_friends })}
              className="flex-row items-center justify-between"
              style={{ minHeight: 44 }}>
              <AppText
                className="mr-3 text-[14px] leading-5 text-charcoal"
                style={{ flexGrow: 1, flexShrink: 1, minWidth: 120 }}>
                {copy('create.friendsOfFriends')}
              </AppText>
              <View
                style={{
                  width: 48,
                  height: 28,
                  borderRadius: 14,
                  padding: 2,
                  backgroundColor: draft.friends_of_friends ? THEME.accent : THEME.border,
                  justifyContent: 'center',
                }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: THEME.surface,
                    alignSelf: draft.friends_of_friends ? 'flex-end' : 'flex-start',
                  }}
                />
              </View>
            </Pressable>
          ) : null}
        </View>
        </TourAnchor>

        {needed > 0 ? (
          <View className="gap-1">
            {draft.currency === 'bucks' ? (
              <AppText className="text-[13px] text-muted">{copy('money.realUsd')}</AppText>
            ) : null}
            <AppText className="text-[13px] text-muted">{copy('money.leavesNow')}</AppText>
            <AppText className="text-[13px] text-muted">{copy('money.irreversible')}</AppText>
          </View>
        ) : null}

        {error ? (
          <AppText className="text-sm text-coral-dark">{error}</AppText>
        ) : costHint ? (
          <AppText className="text-sm text-coral-dark">{costHint}</AppText>
        ) : null}

        <TourAnchor id="create-simple-advanced">
        {editId ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: '/challenges/create',
              params: returnTo === 'feed' ? { mode: 'advanced', returnTo: 'feed' } : { mode: 'advanced' },
            })
          }
          className="items-center py-2">
          <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
            {copy('create.advanced')}
          </AppText>
        </Pressable>
        )}
        </TourAnchor>
        </>
        ) : null}
      </View>
    </Screen>
    <View
      onLayout={(event) => {
        setFooterH(Math.max(88, event.nativeEvent.layout.height));
      }}
      className="gap-2 px-4 pt-2"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 4,
        backgroundColor: THEME.surface,
        borderTopWidth: 1,
        borderTopColor: THEME.border,
        paddingBottom: keyboardOverlap > 0 ? Math.max(keyboardOverlap, 8) : tabBarLift(insets.bottom, 'sticky') + 8,
      }}>
      <CreateActionsFooter
        onBack={view === 'review' ? () => setView('form') : closeSimple}
        onSaveDraft={() => void onSaveDraft()}
        onNext={() => {
          if (view === 'review') {
            void onCreate();
            return;
          }
          onReview();
        }}
        nextTitle={
          view === 'review'
            ? editId
              ? copy('create.save')
              : copy('create.publish')
            : error
              ? 'Try again'
              : focusSection
                ? copy('create.backToReview')
                : copy('create.review')
        }
        nextLoading={view === 'review' && (editId ? update.isPending : create.isPending)}
        savePending={saveDraft.isPending}
        showSave={!editId}
        draftFlash={draftFlash}
      />
    </View>
    </View>
    </ChallengeNotesProvider>
  );
}

function defaultTask(type: SimpleChallengeType): string {
  if (type === 'any_exercise') {
    return '';
  }
  if (type === 'running') {
    return 'Run 1 mile';
  }
  if (type === 'lifting') {
    return 'Lift';
  }
  if (type === 'steps') {
    return 'Hit your step count';
  }
  if (type === 'cycling') {
    return 'Ride';
  }
  if (type === 'hiit') {
    return 'HIIT session';
  }
  return '';
}
