import { zodResolver } from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, type FieldPath } from 'react-hook-form';
import { AppState, BackHandler, Platform, Pressable, ScrollView, Switch, View } from 'react-native';

import { DateTimeField } from '@/components/challenge/create/DateTimeField';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { useTourOptional } from '@/components/tour/TourContext';
import {
  ChoiceCard,
  ContinueDraftCard,
  FieldAnchor,
  FieldLabel,
  WizardFocusContext,
  WizardModalShell,
  WizardProgress,
  type WizardFocusApi,
} from '@/components/challenge/create/wizardUi';
import { RulesSlide } from '@/components/challenge/create/RulesSlide';
import { CreateReviewPreview, type CreateReviewEditKey } from '@/components/challenge/create/CreateReviewPreview';
import { ExtraTasksEditor } from '@/components/challenge/create/ExtraTasksEditor';
import { ChallengeNotesProvider } from '@/components/challenge/FieldNote';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Stepper } from '@/components/ui/Stepper';
import { AppText } from '@/components/ui/AppText';
import { useCreateChallenge } from '@/hooks/useChallenge';
import { useCreateChallengeTour } from '@/hooks/useCreateChallengeTour';
import { useAuth } from '@/hooks/useAuth';
import {
  challengeDraftsQueryKey,
  useChallengeDrafts,
  useDiscardChallengeDraft,
  useReusableChallenges,
  useSaveChallengeDraft,
} from '@/hooks/useChallengeDraft';
import { useQueryClient } from '@tanstack/react-query';
import { useMyProfile } from '@/hooks/useProfile';
import {
  hasMeaningfulDraftEdits,
  hydrateDraftValues,
  isDraftDirty,
  isVisibleDraft,
  resumeWizardStep,
  valuesFromChallenge,
  type ChallengeDraft,
  type ReusableChallenge,
} from '@/lib/challengeDraft';
import {
  CHALLENGE_TEMPLATES,
  CREATE_STEP_FIELDS,
  CREATE_WIZARD_STEPS,
  cloneTemplateValues,
  coinFlowLines,
  DEFAULT_CREATE_VALUES,
  isPointsDraft,
  isUnlimitedDraft,
  wizardStepIndex,
  type ChallengeTemplateId,
  type CreateStartPath,
} from '@/lib/challengeTemplates';
import {
  CHALLENGE_CATEGORIES,
  CHALLENGE_CATEGORY_LABEL,
  CHALLENGE_FREQUENCIES,
  CHALLENGE_TYPES,
  COLORS,
  DURATION_PRESETS,
  FUNDING_MODELS,
  PRIZE_STRUCTURES,
  TOP_PLACES_DISTRIBUTIONS,
  TOP_PLACES_MODES,
} from '@/lib/constants';
import { wizardBobOops, wizardBobTips, wizardEntryTabTipIndex, wizardGoalTypeTipIndex, wizardStepForField, entryTabFromValues, type EntryTab } from '@/lib/createBobCopy';
import { composeChallengeRules, hasDefinedRules } from '@/lib/consistencyRules';
import { applyLaneToFormValues, normalizeUserChallengeLane, type UserChallengeLane } from '@/lib/challengeLane';
import {
  endsAtFromStartAndDays,
  ensureSchedule,
  formatChallengeEndLine,
  inOneHour,
  MAX_CHALLENGE_DURATION_DAYS,
  startPresetFor,
  tomorrowMorning,
  withFreshSchedule,
} from '@/lib/challengeSchedule';
import { THEME } from '@/lib/theme';
import { LOBBY_HREF, TABS_HREF } from '@/lib/routes';
import { copy } from '@/lib/copy';
import type { ChallengeFrequency, FundingModel, PrizeStructure, ProofType } from '@/lib/types';
import { authStorage } from '@/lib/utils/secureStore';
import { getCreateChallengeMessage, getErrorMessage } from '@/utils/errors';
import { formatWallet, walletBalance } from '@/lib/currency';
import { uploadChallengeCover } from '@/utils/upload';
import {
  createChallengeSchema,
  emptyChallengeTask,
  type CreateChallengeValues,
} from '@/utils/validators';

const FITNESS_PROOFS: ProofType[] = ['pre_selfie', 'post_selfie', 'hr_monitor'];

const STEP_LANE = wizardStepIndex('lane');
const STEP_START = wizardStepIndex('start');
const STEP_GOAL = wizardStepIndex('goal');
const STEP_TYPE = wizardStepIndex('type');
const STEP_DURATION = wizardStepIndex('duration');
const STEP_PRIZE = wizardStepIndex('prize');
const STEP_FUNDING = wizardStepIndex('funding');
const STEP_ENTRY = wizardStepIndex('entry');
const STEP_RULES = wizardStepIndex('rules');
const STEP_REVIEW = wizardStepIndex('review');

const TUTORIAL_KEY = 'blob:create-tutorial';
const AUTOSAVE_MS = 1100;

type BobIssue = { field: string; step: number };

const FOCUSABLE_FIELDS = new Set([
  'title',
  'description',
  'duration_days',
  'duration_value',
  'target_count',
  'top_places_value',
  'creator_contribution',
  'buy_in',
  'max_participants',
  'min_minutes',
  'rules',
  'cover_image_url',
  'rules_video_url',
]);

export function CreateWizard({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    resume?: string | string[];
    draftId?: string | string[];
    returnTo?: string | string[];
  }>();
  const resumeOnOpen = (Array.isArray(params.resume) ? params.resume[0] : params.resume) === '1';
  const resumeDraftId = Array.isArray(params.draftId) ? params.draftId[0] : params.draftId;
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const dismissFallback = returnTo === 'feed' ? TABS_HREF : LOBBY_HREF;
  const { profile } = useMyProfile();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const create = useCreateChallenge();
  const draftsQuery = useChallengeDrafts();
  const saveDraft = useSaveChallengeDraft();
  const discardDraft = useDiscardChallengeDraft();
  const reusable = useReusableChallenges();
  const [step, setStep] = useState(STEP_GOAL);
  const [reviewReturn, setReviewReturn] = useState(false);
  const [startPath, setStartPath] = useState<CreateStartPath>('scratch');
  const [templateId, setTemplateId] = useState<ChallengeTemplateId | null>(null);
  const [sourceChallengeId, setSourceChallengeId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [bucksAcks, setBucksAcks] = useState<Record<string, boolean>>({});
  const [liveChallengeId, setLiveChallengeId] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [tutorialOn, setTutorialOn] = useState(false);
  const [bobTipOpen, setBobTipOpen] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [entryTab, setEntryTab] = useState<EntryTab>('coins');
  const [skillAck, setSkillAck] = useState(false);
  const [laneChosen, setLaneChosen] = useState(true);
  const [bobError, setBobError] = useState<{ field: string; line: string } | null>(null);
  const tour = useTourOptional();
  const setCreatePeek = tour?.setCreatePeek;
  useCreateChallengeTour('advanced', !liveChallengeId);

  useEffect(() => {
    if (!setCreatePeek) {
      return;
    }
    setCreatePeek((index) => setStep(index));
    return () => setCreatePeek(null);
  }, [setCreatePeek]);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    setError,
    clearErrors,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<CreateChallengeValues>({
    resolver: zodResolver(createChallengeSchema),
    defaultValues: DEFAULT_CREATE_VALUES,
    mode: 'onSubmit',
  });

  const values = watch();
  const isPoints = isPointsDraft(values);
  const isUnlimited = isUnlimitedDraft(values);
  const isCreatorFunded = values.funding_model === 'creator' || values.funding_model === 'hybrid';
  const contributionAmount = isCreatorFunded ? Math.max(Number(values.creator_contribution) || 0, 0) : 0;
  const walletCredits = walletBalance(profile, values.currency);
  const contributionShort =
    isCreatorFunded && contributionAmount > walletCredits
      ? `You need ${formatWallet(contributionAmount, values.currency)} to fund this pool. You have ${formatWallet(walletCredits, values.currency)}.`
      : null;
  const bucksReady =
    values.currency !== 'bucks' ||
    (Boolean(bucksAcks.amount) && Boolean(bucksAcks.immediate) && Boolean(bucksAcks.irreversible));

  const publishing = isSubmitting || create.isPending;
  const lastStep = step === CREATE_WIZARD_STEPS.length - 1;
  const skipSaveRef = useRef(false);
  const didResumeRef = useRef(false);
  const discardedRef = useRef(false);
  const restoredDraftRef = useRef(false);
  const leavingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const anchorRefs = useRef<Record<string, View | null>>({});
  const pendingAnchor = useRef<string | null>(null);
  const scrollToAnchorRef = useRef<(name: string) => void>(() => {});
  const oopsRotateRef = useRef(0);
  const errorSnapshotRef = useRef<unknown>(undefined);
  const baselineRef = useRef(cloneTemplateValues(DEFAULT_CREATE_VALUES));
  const baselineStepRef = useRef(0);
  const draftIdRef = useRef<string | null>(null);
  const lastPersistedRef = useRef<{
    id: string | null;
    step: number;
    startPath: CreateStartPath;
    templateId: ChallengeTemplateId | null;
    sourceChallengeId: string | null;
    values: CreateChallengeValues;
  } | null>(null);
  const persistChainRef = useRef(Promise.resolve());
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistDraftRef = useRef<() => Promise<void>>(async () => {});
  const snapshotRef = useRef({
    step,
    startPath,
    templateId,
    sourceChallengeId,
    values,
    id: draftId,
  });
  snapshotRef.current = { step, startPath, templateId, sourceChallengeId, values, id: draftId };
  draftIdRef.current = draftId;

  function captureBaseline(nextValues: CreateChallengeValues, nextStep: number) {
    baselineRef.current = cloneTemplateValues(nextValues);
    baselineStepRef.current = nextStep;
  }

  function rememberPersisted(snapshot: {
    id: string | null;
    step: number;
    startPath: CreateStartPath;
    templateId: ChallengeTemplateId | null;
    sourceChallengeId: string | null;
    values: CreateChallengeValues;
  }) {
    lastPersistedRef.current = {
      ...snapshot,
      values: cloneTemplateValues(snapshot.values),
    };
  }

  function clearSessionDraft() {
    draftIdRef.current = null;
    lastPersistedRef.current = null;
    setDraftId(null);
  }

  function applyLaneFields(lane: UserChallengeLane, source: CreateChallengeValues = getValues()) {
    const next = applyLaneToFormValues(source, lane);
    setValue('challenge_lane', next.challenge_lane, { shouldValidate: true });
    setValue('visibility', next.visibility, { shouldValidate: true });
    setValue('currency', next.currency, { shouldValidate: true });
    setValue('buy_in', next.buy_in, { shouldValidate: true });
    setValue('funding_model', next.funding_model, { shouldValidate: true });
    setValue('creator_contribution', next.creator_contribution, { shouldValidate: true });
    setEntryTab(entryTabFromValues(next));
    return next;
  }

  function onPickLane(lane: UserChallengeLane) {
    discardedRef.current = false;
    restoredDraftRef.current = false;
    setLaneChosen(true);
    setFormError(null);
    clearBobError();
    const next = applyLaneFields(lane);
    captureBaseline(next, STEP_START);
    setStep(STEP_START);
  }

  function applyTemplate(id: ChallengeTemplateId) {
    const template = CHALLENGE_TEMPLATES.find((item) => item.id === id);
    if (!template) {
      return;
    }
    discardedRef.current = false;
    restoredDraftRef.current = false;
    const lane = laneChosen
      ? normalizeUserChallengeLane(getValues('challenge_lane'))
      : normalizeUserChallengeLane(template.values.challenge_lane);
    const nextValues = applyLaneToFormValues(
      withFreshSchedule({
        ...cloneTemplateValues(template.values),
        duration_type: 'fixed',
      }),
      lane,
    );
    clearSessionDraft();
    setTemplateId(id);
    setSourceChallengeId(null);
    setRestoredDraft(false);
    setStartPath(id === 'custom' ? 'scratch' : 'template');
    setFormError(null);
    setBobError(null);
    reset(nextValues);
    setLaneChosen(true);
    setEntryTab(entryTabFromValues(nextValues));
    const nextStep = STEP_GOAL;
    captureBaseline(nextValues, nextStep);
    setStep(nextStep);
    queueMicrotask(() => {
      captureBaseline(getValues(), nextStep);
    });
  }

  function onStartScratch() {
    applyTemplate('custom');
  }

  function onChooseTemplate() {
    setStartPath('template');
    setSourceChallengeId(null);
    setRestoredDraft(false);
    setFormError(null);
    setBobError(null);
    if (templateId === 'custom') {
      setTemplateId(null);
    }
  }

  function applyPrevious(challenge: ReusableChallenge) {
    discardedRef.current = false;
    restoredDraftRef.current = false;
    setStartPath('previous');
    setTemplateId(null);
    setSourceChallengeId(challenge.id);
    setRestoredDraft(false);
    setFormError(null);
    setBobError(null);
    const lane = normalizeUserChallengeLane(getValues('challenge_lane'));
    const nextValues = applyLaneToFormValues(valuesFromChallenge(challenge), lane);
    reset(nextValues);
    setLaneChosen(true);
    setEntryTab(entryTabFromValues(nextValues));
    captureBaseline(nextValues, STEP_GOAL);
    clearSessionDraft();
    setStep(STEP_GOAL);
    queueMicrotask(() => {
      captureBaseline(getValues(), STEP_GOAL);
    });
  }

  function applyDraft(draft: ChallengeDraft, jumpToSavedStep = true): boolean {
    skipSaveRef.current = true;
    try {
      if (draft.corrupt) {
        setRestoredDraft(false);
        setStep(0);
        setFormError('This draft is damaged. Discard it and start again.');
        return false;
      }
      const hydrated = hydrateDraftValues(draft.values);
      const nextStep = Math.max(
        STEP_GOAL,
        jumpToSavedStep ? resumeWizardStep({ ...draft, values: hydrated }) : STEP_GOAL,
      );
      const nextPath = draft.startPath ?? 'scratch';
      if (__DEV__) {
        console.log('[blob:draft] continue', { id: draft.id, savedStep: draft.step, nextStep, title: hydrated.title });
      }
      discardedRef.current = false;
      restoredDraftRef.current = true;
      draftIdRef.current = draft.id;
      setDraftId(draft.id);
      setStartPath(nextPath);
      setTemplateId(draft.templateId);
      setSourceChallengeId(draft.sourceChallengeId);
      setRestoredDraft(true);
      setLaneChosen(true);
      setFormError(null);
      setBobError(null);
      reset(cloneTemplateValues(hydrated));
      setEntryTab(entryTabFromValues(hydrated));
      captureBaseline(hydrated, nextStep);
      rememberPersisted({
        id: draft.id,
        step: nextStep,
        startPath: nextPath,
        templateId: draft.templateId,
        sourceChallengeId: draft.sourceChallengeId,
        values: hydrated,
      });
      setStep(nextStep);
      return true;
    } catch (error) {
      if (__DEV__) {
        console.log('[blob:draft] apply failed', error);
      }
      setRestoredDraft(false);
      setStep(0);
      setFormError('This draft is damaged. Discard it and start again.');
      return false;
    } finally {
      queueMicrotask(() => {
        skipSaveRef.current = false;
      });
    }
  }

  function handleContinueDraft(draft?: ChallengeDraft) {
    const next = draft ?? draftsQuery.data?.[0];
    if (!next) {
      setFormError('No draft to continue.');
      return;
    }
    applyDraft(next, true);
  }

  function handleDiscardDraft(id?: string | null) {
    const targetId = id ?? draftId ?? draftsQuery.data?.[0]?.id ?? null;
    discardedRef.current = !targetId || targetId === draftId;
    skipSaveRef.current = true;
    if (discardedRef.current) {
      restoredDraftRef.current = false;
      setStep(0);
      setStartPath(null);
      setTemplateId(null);
      setSourceChallengeId(null);
      setDraftId(null);
      setRestoredDraft(false);
      setLaneChosen(false);
      setFormError(null);
      setBobError(null);
      reset(withFreshSchedule(cloneTemplateValues(DEFAULT_CREATE_VALUES)));
      setEntryTab(entryTabFromValues(DEFAULT_CREATE_VALUES));
      setSkillAck(false);
      lastPersistedRef.current = null;
      draftIdRef.current = null;
    }
    void discardDraft.mutateAsync(targetId).catch((error) => {
      discardedRef.current = false;
      setFormError(getErrorMessage(error) || 'Couldn’t discard the draft.');
    }).finally(() => {
      skipSaveRef.current = false;
    });
  }

  function hasLaneChoice(): boolean {
    return laneChosen || restoredDraft;
  }

  function hasStartChoice(): boolean {
    if (restoredDraft) {
      return true;
    }
    if (startPath === 'scratch' || startPath === 'previous') {
      return true;
    }
    return startPath === 'template' && Boolean(templateId && templateId !== 'custom');
  }

  function isPastStartChooser(nextStep = snapshotRef.current.step): boolean {
    return nextStep >= STEP_GOAL;
  }

  function hasUserEdits(nextValues: CreateChallengeValues = snapshotRef.current.values): boolean {
    return isDraftDirty(nextValues, baselineRef.current);
  }

  function shouldPersistDraft(): boolean {
    if (skipSaveRef.current || discardedRef.current || liveChallengeId) {
      return false;
    }
    const snapshot = { ...snapshotRef.current, id: draftIdRef.current };
    const last = lastPersistedRef.current;
    if (
      last &&
      last.id === snapshot.id &&
      last.step === snapshot.step &&
      last.startPath === snapshot.startPath &&
      last.templateId === snapshot.templateId &&
      last.sourceChallengeId === snapshot.sourceChallengeId &&
      !isDraftDirty(snapshot.values, last.values)
    ) {
      return false;
    }
    if (!hasUserEdits(snapshot.values)) {
      return false;
    }
    return isPastStartChooser(snapshot.step) || hasMeaningfulDraftEdits(snapshot.values);
  }

  function shouldSaveOnExit(): boolean {
    if (skipSaveRef.current || discardedRef.current || liveChallengeId) {
      return false;
    }
    const snapshot = { ...snapshotRef.current, id: draftIdRef.current };
    if (!hasUserEdits(snapshot.values)) {
      return false;
    }
    return isPastStartChooser(snapshot.step) || hasMeaningfulDraftEdits(snapshot.values);
  }

  function flashSaved() {
    setSavedFlash(true);
    if (savedFlashTimerRef.current) {
      clearTimeout(savedFlashTimerRef.current);
    }
    savedFlashTimerRef.current = setTimeout(() => {
      setSavedFlash(false);
      savedFlashTimerRef.current = null;
    }, 1600);
  }

  async function persistDraft() {
    const run = persistChainRef.current.then(async () => {
      if (!shouldPersistDraft()) {
        return;
      }
      const snapshot = { ...snapshotRef.current, id: draftIdRef.current };
      try {
        const saved = await saveDraft.mutateAsync(snapshot);
        if (saved.id) {
          draftIdRef.current = saved.id;
          setDraftId(saved.id);
        }
        rememberPersisted({ ...snapshot, id: saved.id ?? snapshot.id });
        flashSaved();
      } catch (error) {
        console.log('[blob:draft] save failed', getErrorMessage(error));
      }
    });
    persistChainRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
  persistDraftRef.current = persistDraft;

  async function abandonSessionDraft() {
    const id = draftIdRef.current;
    if (!id) {
      clearSessionDraft();
      return;
    }
    if (restoredDraftRef.current) {
      return;
    }
    skipSaveRef.current = true;
    try {
      await discardDraft.mutateAsync(id);
    } catch (error) {
      console.log('[blob:draft] abandon skipped', getErrorMessage(error));
    }
    clearSessionDraft();
  }

  async function flushDraftOnLeave() {
    if (shouldSaveOnExit()) {
      await persistDraft();
      return;
    }
    await abandonSessionDraft();
  }

  async function uploadCover() {
    if (!user || coverBusy) {
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFormError('Turn on photo access in Settings to upload a cover.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }
    setCoverBusy(true);
    setFormError(null);
    try {
      const url = await uploadChallengeCover({
        uri: result.assets[0].uri,
        userId: user.id,
        mimeType: result.assets[0].mimeType,
      });
      setValue('cover_image_url', url, { shouldDirty: true, shouldValidate: true });
    } catch (error) {
      setFormError(getErrorMessage(error) || 'Couldn’t upload that cover. Paste a URL instead.');
    } finally {
      setCoverBusy(false);
    }
  }

  useEffect(() => {
    if (draftsQuery.isLoading) {
      return;
    }
    const existing = resumeDraftId
      ? draftsQuery.data?.find((item) => item.id === resumeDraftId) ?? draftsQuery.data?.[0]
      : draftsQuery.data?.[0];
    if (resumeOnOpen && existing && !didResumeRef.current) {
      didResumeRef.current = true;
      applyDraft(existing, true);
    }
  }, [draftsQuery.isLoading, draftsQuery.data, resumeOnOpen, resumeDraftId]);

  useEffect(() => {
    void Promise.resolve(authStorage.getItem(TUTORIAL_KEY)).then((value) => {
      if (value === 'off') {
        setTutorialOn(false);
      }
    });
  }, []);

  useEffect(() => {
    setTipIndex(step === STEP_ENTRY ? wizardEntryTabTipIndex(entryTab) : 0);
    if (!pendingAnchor.current) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      tour?.setCreateScrollY(0);
    }
  }, [step, liveChallengeId]);

  useEffect(() => {
    void persistDraftRef.current();
  }, [step]);

  useEffect(() => {
    if (liveChallengeId || skipSaveRef.current || discardedRef.current) {
      return;
    }
    if (!shouldPersistDraft()) {
      return;
    }
    const handle = setTimeout(() => {
      void persistDraftRef.current();
    }, AUTOSAVE_MS);
    return () => clearTimeout(handle);
  }, [values]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        void persistDraftRef.current();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }
    const flush = () => {
      void persistDraftRef.current();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (savedFlashTimerRef.current) {
        clearTimeout(savedFlashTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!bobError) {
      return;
    }
    const next = snapshotField(bobError.field);
    if (next !== errorSnapshotRef.current) {
      const field = bobError.field;
      setBobError(null);
      if (
        field !== 'start' &&
        field !== 'challenge_lane' &&
        field !== 'bucks' &&
        field !== 'wallet' &&
        field !== 'skill' &&
        field !== 'publish'
      ) {
        clearErrors(field.split('.')[0] as FieldPath<CreateChallengeValues>);
      }
    }
  }, [values, startPath, bucksAcks, contributionShort, skillAck, bobError]);

  useEffect(() => {
    const next = composeChallengeRules(values);
    if ((values.rules ?? '') !== next) {
      setValue('rules', next, { shouldDirty: false, shouldValidate: false });
    }
  }, [
    values.target_count,
    values.rule_activity,
    values.frequency,
    values.duration_type,
    values.extra_rules,
    values.challenge_type,
    values.rules,
    setValue,
  ]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (leavingRef.current || skipSaveRef.current || discardedRef.current || liveChallengeId) {
        return;
      }
      event.preventDefault();
      leavingRef.current = true;
      void flushDraftOnLeave()
        .then(() => queryClient.invalidateQueries({ queryKey: challengeDraftsQueryKey(user?.id) }))
        .finally(() => {
          skipSaveRef.current = true;
          navigation.dispatch(event.data.action);
        });
    });
    return unsubscribe;
  }, [navigation, liveChallengeId]);

  useEffect(() => {
    if (!liveChallengeId) {
      return;
    }
    const handle = setTimeout(() => {
      router.replace(`/challenges/${liveChallengeId}`);
    }, 1600);
    return () => clearTimeout(handle);
  }, [liveChallengeId, router]);

  useEffect(() => {
    setBucksAcks({});
  }, [values.currency]);

  useEffect(() => {
    const lane = normalizeUserChallengeLane(values.challenge_lane);
    if (lane === 'coins' && values.currency === 'bucks') {
      setValue('currency', 'coins', { shouldValidate: true });
      setBucksAcks({});
      setEntryTab((current) => (current === 'bucks' ? (Number(getValues('buy_in')) > 0 ? 'coins' : 'free') : current));
    }
    if (lane === 'private') {
      if (values.visibility !== 'private') {
        setValue('visibility', 'private', { shouldValidate: true });
      }
      if (Number(values.buy_in) > 0 || entryTab !== 'free') {
        setValue('buy_in', '0', { shouldValidate: true });
        setEntryTab('free');
      }
      if (values.funding_model === 'participants') {
        setValue('funding_model', 'creator', { shouldValidate: true });
        if (Number(getValues('creator_contribution')) < 1) {
          setValue('creator_contribution', '10', { shouldValidate: true });
        }
      }
    }
  }, [values.challenge_lane, values.currency, values.visibility, values.buy_in, entryTab]);

  function onCategoryChange(next: CreateChallengeValues['category']) {
    setValue('category', next, { shouldValidate: true });
    setTipIndex(wizardGoalTypeTipIndex(next));
    const current = getValues('proofs');
    const isFitnessSet =
      current.length === FITNESS_PROOFS.length && FITNESS_PROOFS.every((type) => current.includes(type));
    const isPhotoOnly = current.length === 1 && current[0] === 'photo';
    if (next === 'fitness' && isPhotoOnly) {
      setValue('proofs', [...FITNESS_PROOFS], { shouldValidate: true });
    } else if (next !== 'fitness' && isFitnessSet) {
      setValue('proofs', ['photo'], { shouldValidate: true });
    }
  }

  function onTypeChange(next: CreateChallengeValues['challenge_type']) {
    if (getValues('duration_type') === 'unlimited' && next === 'points') {
      return;
    }
    setValue('challenge_type', next, { shouldValidate: true });
    if (next === 'points' && getValues('tasks').length === 0) {
      setValue('tasks', [emptyChallengeTask()], { shouldValidate: false });
    }
  }

  function applySchedule(patch: Partial<CreateChallengeValues>) {
    const current = getValues();
    const merged = {
      ...current,
      ...patch,
      end_mode: 'length' as const,
      duration_unit: 'days' as const,
    };
    const next = ensureSchedule(merged);
    setValue('starts_at', next.starts_at, { shouldValidate: true });
    setValue('ends_at', next.ends_at, { shouldValidate: true });
    setValue('end_mode', next.end_mode, { shouldValidate: true });
    setValue('duration_value', next.duration_value, { shouldValidate: true });
    setValue('duration_unit', next.duration_unit, { shouldValidate: true });
    setValue('duration_days', next.duration_days, { shouldValidate: true });
    if (!isPointsDraft(merged) && merged.frequency === 'daily') {
      const days = Number(next.duration_days);
      const required = Number(merged.target_count) || days;
      if (required > days) {
        setValue('target_count', String(days), { shouldValidate: true });
      }
    }
  }

  function onDurationTypeChange(next: CreateChallengeValues['duration_type']) {
    setValue('duration_type', next, { shouldValidate: true });
    if (next !== 'unlimited') {
      return;
    }
    setValue('challenge_type', 'consistency', { shouldValidate: true });
    setValue('prize_structure', 'winner_take_all', { shouldValidate: true });
    const freq = getValues('frequency');
    if (freq !== 'daily' && freq !== 'weekly') {
      setValue('frequency', 'weekly', { shouldValidate: true });
      setValue('target_count', '5', { shouldValidate: true });
    } else if (freq === 'daily') {
      setValue('target_count', '1', { shouldValidate: true });
    } else if (Number(getValues('target_count')) > 7 || Number(getValues('target_count')) < 1) {
      setValue('target_count', '5', { shouldValidate: true });
    }
  }

  function onFrequencyChange(next: ChallengeFrequency) {
    if (getValues('duration_type') === 'unlimited' && next !== 'daily' && next !== 'weekly') {
      return;
    }
    setValue('frequency', next, { shouldValidate: true });
    if (getValues('duration_type') === 'unlimited' && next === 'daily') {
      setValue('target_count', '1', { shouldValidate: true });
    }
    if (getValues('duration_type') === 'unlimited' && next === 'weekly' && Number(getValues('target_count')) < 1) {
      setValue('target_count', '5', { shouldValidate: true });
    }
  }

  function onEntryTabChange(next: EntryTab) {
    const lane = normalizeUserChallengeLane(getValues('challenge_lane'));
    if (lane === 'private') {
      setEntryTab('free');
      setValue('buy_in', '0', { shouldValidate: true });
      setTipIndex(wizardEntryTabTipIndex('free'));
      return;
    }
    if (next === 'bucks' && lane === 'coins') {
      return;
    }
    const previous = entryTab;
    setEntryTab(next);
    setTipIndex(wizardEntryTabTipIndex(next));
    if (next === 'free') {
      setValue('buy_in', '0', { shouldValidate: true });
      if (lane === 'coins') {
        setValue('currency', 'coins', { shouldValidate: true });
      }
      return;
    }
    setValue('currency', lane === 'coins' ? 'coins' : next, { shouldValidate: true });
    setBucksAcks({});
    if (Number(getValues('buy_in')) <= 0) {
      setValue('buy_in', '10', { shouldValidate: true });
    }
    if (previous === 'free') {
      pendingAnchor.current = 'buy_in';
      requestAnimationFrame(() => scrollToAnchor('buy_in'));
    }
  }

  function onFundingChange(next: FundingModel) {
    if (normalizeUserChallengeLane(getValues('challenge_lane')) === 'private' && next === 'participants') {
      return;
    }
    setValue('funding_model', next, { shouldValidate: true });
    if (next === 'participants') {
      setValue('creator_contribution', '0', { shouldValidate: true });
      return;
    }
    if (Number(getValues('creator_contribution')) < 1) {
      setValue('creator_contribution', '10', { shouldValidate: true });
    }
    if (next === 'hybrid' && Number(getValues('buy_in')) < 1 && entryTab !== 'free') {
      setValue('buy_in', '10', { shouldValidate: true });
    }
  }

  function addTask() {
    setValue('tasks', [...getValues('tasks'), emptyChallengeTask()], {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function removeTask(index: number) {
    const current = getValues('tasks');
    if (current.length <= 1) {
      return;
    }
    setValue(
      'tasks',
      current.filter((_, itemIndex) => itemIndex !== index),
      { shouldDirty: true, shouldValidate: true },
    );
  }

  function applyStepErrors(targetStep: number): BobIssue | null {
    const allowed = new Set(CREATE_STEP_FIELDS[targetStep] ?? []);
    if (allowed.size === 0) {
      return missingRulesIssue(targetStep);
    }
    for (const field of allowed) {
      clearErrors(field);
    }
    const formValues = getValues();
    const parsed = createChallengeSchema.safeParse(formValues);
    let first: BobIssue | null = null;
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const root = issue.path[0];
        if (typeof root !== 'string' || !allowed.has(root as keyof CreateChallengeValues)) {
          continue;
        }
        const name = issue.path.join('.') as FieldPath<CreateChallengeValues>;
        setError(name, { type: 'validate', message: issue.message });
        if (!first) {
          first = { field: root, step: targetStep };
        }
      }
    }
    return first ?? missingRulesIssue(targetStep);
  }

  function syncComposedRules() {
    const formValues = getValues();
    const next = composeChallengeRules(formValues);
    if ((formValues.rules ?? '') !== next) {
      setValue('rules', next, { shouldDirty: false, shouldValidate: false });
    }
    return next;
  }

  function missingRulesIssue(targetStep: number): BobIssue | null {
    if (targetStep !== STEP_RULES && targetStep !== STEP_REVIEW) {
      return null;
    }
    const formValues = getValues();
    const composed = syncComposedRules();
    if (hasDefinedRules({ ...formValues, rules: composed || formValues.rules })) {
      return null;
    }
    const buyIn = Math.max(Number(formValues.buy_in) || 0, 0);
    if (buyIn <= 0 && isPointsDraft(formValues)) {
      return null;
    }
    setError('rules', {
      type: 'validate',
      message: 'Add what competitors must log (count, activity, and how often).',
    });
    return { field: 'rules', step: STEP_RULES };
  }

  function coinEntryIssue(targetStep = STEP_ENTRY): BobIssue | null {
    if (normalizeUserChallengeLane(getValues('challenge_lane')) !== 'coins') {
      return null;
    }
    if (entryTab !== 'coins') {
      return null;
    }
    if (Math.max(Number(getValues('buy_in')) || 0, 0) > 0) {
      return null;
    }
    setError('buy_in', {
      type: 'validate',
      message: 'Set a Coin amount to enter, or pick Free.',
    });
    return { field: 'buy_in', step: targetStep };
  }

  function firstPublishIssue(): BobIssue | null {
    syncComposedRules();
    const entryIssue = coinEntryIssue();
    if (entryIssue) {
      return entryIssue;
    }
    const formValues = getValues();
    const parsed = createChallengeSchema.safeParse(formValues);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const root = issue.path[0];
        if (typeof root !== 'string') {
          continue;
        }
        const name = issue.path.join('.') as FieldPath<CreateChallengeValues>;
        setError(name, { type: 'validate', message: issue.message });
        return { field: root, step: wizardStepForField(root, formValues) };
      }
    }
    if (!skillAck) {
      return { field: 'skill', step: STEP_REVIEW };
    }
    return missingRulesIssue(STEP_REVIEW);
  }

  function snapshotField(field: string): unknown {
    if (field === 'start') {
      return startPath;
    }
    if (field === 'bucks') {
      return `${Boolean(bucksAcks.amount)}:${Boolean(bucksAcks.immediate)}:${Boolean(bucksAcks.irreversible)}`;
    }
    if (field === 'wallet') {
      return contributionShort;
    }
    if (field === 'skill') {
      return skillAck;
    }
    if (field === 'publish') {
      return formError;
    }
    if (field === 'rules' || field === 'rule_activity' || field === 'extra_rules') {
      return composeChallengeRules(getValues());
    }
    const root = field.split('.')[0] as FieldPath<CreateChallengeValues>;
    try {
      return JSON.stringify(getValues(root));
    } catch {
      return null;
    }
  }

  function scrollToAnchor(name: string) {
    const anchor =
      name === 'wallet' ? 'creator_contribution' : name === 'rules' ? 'target_count' : name;
    const node = anchorRefs.current[anchor] ?? anchorRefs.current[name];
    const content = contentRef.current;
    const scroll = scrollRef.current;
    if (!node || !scroll) {
      return;
    }
    const run = (y: number) => {
      scroll.scrollTo({ y: Math.max(y - 16, 0), animated: true });
    };
    if (content && typeof node.measureLayout === 'function') {
      node.measureLayout(
        content as never,
        (_x, y) => run(y),
        () => run(0),
      );
    } else {
      run(0);
    }
    const focusName = name.split('.')[0];
    if (FOCUSABLE_FIELDS.has(focusName) || focusName === 'tasks') {
      requestAnimationFrame(() => {
        try {
          setFocus((name.includes('.') ? name : focusName) as FieldPath<CreateChallengeValues>);
        } catch {
          // Choice fields have no text input.
        }
      });
    }
  }
  scrollToAnchorRef.current = scrollToAnchor;

  function showBobIssue(issue: BobIssue, line?: string) {
    oopsRotateRef.current += 1;
    setBobError({
      field: issue.field,
      line: line ?? wizardBobOops(issue.field, oopsRotateRef.current),
    });
    errorSnapshotRef.current = snapshotField(issue.field);
    pendingAnchor.current =
      issue.field === 'wallet'
        ? 'creator_contribution'
        : issue.field === 'rules'
          ? 'target_count'
          : issue.field;
    if (issue.step !== step) {
      setStep(issue.step);
      return;
    }
    requestAnimationFrame(() => {
      scrollToAnchor(issue.field);
    });
  }

  function clearBobError() {
    setBobError(null);
    pendingAnchor.current = null;
  }

  function goToStep(index: number) {
    if (index === step) {
      return;
    }
    setFormError(null);
    clearBobError();
    if (index > STEP_LANE && !hasLaneChoice()) {
      showBobIssue({ field: 'challenge_lane', step: STEP_LANE });
      return;
    }
    if (index > STEP_START && !hasStartChoice()) {
      showBobIssue({ field: 'start', step: STEP_START });
      return;
    }
    setStep(index);
  }

  function editFromReview(key: CreateReviewEditKey) {
    const mapping: Record<CreateReviewEditKey, { step: number; field: string }> = {
      title: { step: STEP_GOAL, field: 'title' },
      task: { step: STEP_GOAL, field: 'task' },
      proofs: { step: STEP_RULES, field: 'proofs' },
      duration: { step: STEP_DURATION, field: 'duration_days' },
      frequency: { step: STEP_DURATION, field: 'frequency' },
      visibility: { step: STEP_GOAL, field: 'visibility' },
      prize: { step: STEP_PRIZE, field: 'prize_structure' },
      start: { step: STEP_DURATION, field: 'starts_at' },
    };
    const target = mapping[key];
    setReviewReturn(true);
    pendingAnchor.current = target.field;
    if (target.step !== step) {
      setStep(target.step);
      return;
    }
    requestAnimationFrame(() => scrollToAnchor(target.field));
  }

  async function goNext() {
    setFormError(null);
    clearBobError();
    if (step === STEP_LANE && !hasLaneChoice()) {
      showBobIssue({ field: 'challenge_lane', step: STEP_LANE });
      return;
    }
    if (step === STEP_START && !hasStartChoice()) {
      showBobIssue({ field: 'start', step: STEP_START });
      return;
    }
    if (reviewReturn && !lastStep) {
      syncComposedRules();
      const issue = (step === STEP_ENTRY ? coinEntryIssue(step) : null) ?? applyStepErrors(step);
      if (issue) {
        showBobIssue(issue);
        return;
      }
      setReviewReturn(false);
      setStep(STEP_REVIEW);
      return;
    }
    if (!lastStep) {
      syncComposedRules();
      const issue = (step === STEP_ENTRY ? coinEntryIssue(step) : null) ?? applyStepErrors(step);
      if (issue) {
        showBobIssue(issue);
        return;
      }
    }
    if (lastStep) {
      syncComposedRules();
      if (!skillAck) {
        showBobIssue({ field: 'skill', step: STEP_REVIEW });
        return;
      }
      if (!bucksReady) {
        showBobIssue({ field: 'bucks', step: STEP_REVIEW });
        return;
      }
      if (contributionShort) {
        showBobIssue({ field: 'wallet', step: STEP_FUNDING });
        return;
      }
      const issue = firstPublishIssue();
      if (issue) {
        showBobIssue(issue);
        return;
      }
      await onPublish();
      return;
    }
    setStep((current) => current + 1);
  }

  function goBack() {
    setFormError(null);
    clearBobError();
    if (reviewReturn && step !== STEP_REVIEW) {
      setReviewReturn(false);
      setStep(STEP_REVIEW);
      return;
    }
    if (step <= STEP_GOAL) {
      leaveWizard();
      return;
    }
    setStep((current) => current - 1);
  }

  function closeWizard() {
    if (publishing) {
      return;
    }
    leaveWizard();
  }

  const closeWizardRef = useRef(closeWizard);
  closeWizardRef.current = closeWizard;
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        closeWizardRef.current();
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  function leaveWizard() {
    if (leavingRef.current) {
      return;
    }
    leavingRef.current = true;
    void flushDraftOnLeave()
      .then(() => queryClient.invalidateQueries({ queryKey: challengeDraftsQueryKey(user?.id) }))
      .finally(() => {
        skipSaveRef.current = true;
        router.dismissTo(dismissFallback);
      });
  }

  const onPublish = handleSubmit(
    async (formValues) => {
      setFormError(null);
      if (contributionShort) {
        showBobIssue({ field: 'wallet', step: STEP_FUNDING });
        return;
      }
      try {
        skipSaveRef.current = true;
        const rules = syncComposedRules();
        const challenge = await create.mutateAsync({ ...formValues, rules, draft_id: draftId });
        setBobError(null);
        setTutorialOn(true);
        setBobTipOpen(true);
        setTipIndex(0);
        setLiveChallengeId(challenge.id);
        scrollRef.current?.scrollTo({ y: 0 });
      } catch (error) {
        skipSaveRef.current = false;
        const message = getCreateChallengeMessage(error);
        setFormError(message);
        showBobIssue({ field: 'publish', step: STEP_REVIEW }, `Oops — ${message}`);
      }
    },
    (invalid) => {
      const roots = Object.keys(invalid);
      const formValues = getValues();
      let nextStep = STEP_REVIEW;
      let field = roots[0] ?? 'title';
      for (const name of roots) {
        const root = name.split('.')[0] as keyof CreateChallengeValues;
        const candidate = wizardStepForField(root, formValues);
        if (candidate < nextStep) {
          nextStep = candidate;
          field = root;
        }
      }
      const issue = firstPublishIssue() ?? { field, step: nextStep };
      showBobIssue(issue);
    },
  );

  const tips = wizardBobTips(step, Boolean(liveChallengeId), values.challenge_lane);
  const tipCount = Math.max(tips.length, 1);
  const activeTip = tips[Math.min(tipIndex, tipCount - 1)] ?? tips[0];
  const visibleDrafts = (draftsQuery.data ?? []).filter((item) => {
    if (!isVisibleDraft(item)) {
      return false;
    }
    if (item.id && item.id === draftId) {
      return false;
    }
    return true;
  });
  const wizardFocus = useMemo<WizardFocusApi>(
    () => ({
      registerAnchor: (name, node) => {
        anchorRefs.current[name] = node;
      },
      onAnchorLayout: (name) => {
        if (pendingAnchor.current === name) {
          pendingAnchor.current = null;
          scrollToAnchorRef.current(name);
        }
      },
    }),
    [],
  );
  const bob = bobError
    ? {
        pose: 'point' as const,
        tagline: bobError.line,
        kind: 'error' as const,
        onDismissBubble: () => setBobError(null),
      }
    : tutorialOn && bobTipOpen && activeTip
      ? {
          pose: activeTip.pose,
          tagline: activeTip.tagline,
          example: activeTip.example,
          kind: 'tip' as const,
          tipIndex: Math.min(tipIndex, tipCount - 1) + 1,
          tipCount,
          onDismissBubble: () => setBobTipOpen(false),
          onNextTip: () => setTipIndex((current) => (current + 1) % tipCount),
          onPrevTip: () => setTipIndex((current) => (current - 1 + tipCount) % tipCount),
        }
      : null;

  async function showTips() {
    setTutorialOn(true);
    setBobTipOpen(true);
    setTipIndex(0);
    await authStorage.setItem(TUTORIAL_KEY, 'on');
  }

  const wizardBody = (
    <ChallengeNotesProvider>
    <TourAnchor id="tour-create" style={{ flex: 1 }}>
    <View
      className="flex-1"
      pointerEvents={tour?.createActive && !liveChallengeId ? 'none' : 'auto'}
      style={{ backgroundColor: embedded ? THEME.background : undefined }}>
        {liveChallengeId ? (
          <View className="flex-1 items-center justify-center px-6">
            <AppText className="text-center text-2xl font-bold text-charcoal">
              Your challenge is live
            </AppText>
            <AppText className="mt-2 text-center text-sm leading-5 text-muted">
              Competitors can find it in the Lobby.
            </AppText>
            <View className="mt-6 w-full">
              <Button
                title="View challenge"
                onPress={() => router.replace(`/challenges/${liveChallengeId}`)}
              />
            </View>
          </View>
        ) : (
          <WizardFocusContext.Provider value={wizardFocus}>
        <View className="px-4 pt-4">
          <WizardProgress
            step={step}
            onStepPress={goToStep}
            status={savedFlash ? 'Saved' : null}
            trailing={
              <View className="flex-row items-center gap-1">
                <TourAnchor id="create-advanced-simple">
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.replace({
                      pathname: '/challenges/create',
                      params: returnTo === 'feed' ? { returnTo: 'feed' } : {},
                    })
                  }
                  className="h-7 items-center justify-center px-1">
                  <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
                    {copy('create.simple')}
                  </AppText>
                </Pressable>
                </TourAnchor>
                <AppText className="mr-1 text-[13px] font-semibold text-muted">{copy('create.advanced')}</AppText>
                {tutorialOn && bobTipOpen ? null : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Show tips"
                    onPress={() => void showTips()}
                    className="h-7 items-center justify-center rounded-full px-2"
                    style={{ backgroundColor: THEME.background, borderWidth: 1, borderColor: THEME.border }}>
                    <AppText className="text-[11px] font-semibold text-muted">Show tips</AppText>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={closeWizard}
                  className="h-11 w-11 items-center justify-center rounded-full"
                  style={{ backgroundColor: THEME.background, borderWidth: 1, borderColor: THEME.border }}>
                  <AppText className="text-[22px] font-semibold text-muted">×</AppText>
                </Pressable>
              </View>
            }
          />
        </View>

        <ScrollView
          ref={(node) => {
            scrollRef.current = node;
            tour?.setCreateScroll(node);
          }}
          className="mt-3 flex-1 px-4"
          contentContainerClassName="gap-3"
          contentContainerStyle={{ paddingBottom: tour?.createActive ? 220 : 24 }}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          onScroll={(event) => tour?.setCreateScrollY(event.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}>
          <View
            ref={contentRef}
            collapsable={false}
            className="gap-3"
            pointerEvents={tour?.createActive ? 'none' : 'auto'}>
          {step === STEP_LANE ? (
            <LaneSlide
              selected={laneChosen ? normalizeUserChallengeLane(values.challenge_lane) : null}
              onPick={onPickLane}
            />
          ) : null}
          {step === STEP_START ? (
            <StartSlide
              startPath={startPath}
              templateId={templateId}
              sourceChallengeId={sourceChallengeId}
              previousChallenges={reusable.data ?? []}
              drafts={visibleDrafts}
              onScratch={onStartScratch}
              onChooseTemplate={onChooseTemplate}
              onPickTemplate={applyTemplate}
              onPickPrevious={applyPrevious}
              onContinueDraft={handleContinueDraft}
              onDiscardDraft={handleDiscardDraft}
            />
          ) : null}
          {step === STEP_GOAL ? (
            <GoalSlide
              control={control}
              errors={errors}
              category={values.category}
              visibility={values.visibility}
              challengeLane={values.challenge_lane}
              extraTasks={values.extra_tasks ?? []}
              isPoints={isPoints}
              onCategoryChange={onCategoryChange}
              onVisibilityChange={(value) => setValue('visibility', value, { shouldValidate: true })}
              onExtraTasksChange={(extra_tasks) => setValue('extra_tasks', extra_tasks, { shouldDirty: true })}
            />
          ) : null}
          {step === STEP_TYPE ? (
            <TypeSlide
              challengeType={values.challenge_type}
              isUnlimited={isUnlimited}
              error={errors.challenge_type?.message}
              onTypeChange={onTypeChange}
            />
          ) : null}
          {step === STEP_DURATION ? (
          <DurationSlide
            control={control}
            errors={errors}
            isUnlimited={isUnlimited}
            startsAt={values.starts_at}
            durationDays={values.duration_value || values.duration_days || '7'}
            frequency={values.frequency}
              onDurationTypeChange={onDurationTypeChange}
              onFrequencyChange={onFrequencyChange}
              onScheduleChange={applySchedule}
            />
          ) : null}
          {step === STEP_PRIZE ? (
            <PrizeSlide
              control={control}
              errors={errors}
              isUnlimited={isUnlimited}
              prizeStructure={values.prize_structure}
              topPlacesMode={values.top_places_mode}
              topPlacesDistribution={values.top_places_distribution}
              onPrizeChange={(value) => setValue('prize_structure', value, { shouldValidate: true })}
              onModeChange={(value) => setValue('top_places_mode', value, { shouldValidate: true })}
              onDistributionChange={(value) =>
                setValue('top_places_distribution', value, { shouldValidate: true })
              }
            />
          ) : null}
          {step === STEP_FUNDING ? (
            <FundingSlide
              control={control}
              errors={errors}
              fundingModel={values.funding_model}
              currency={values.currency}
              challengeLane={values.challenge_lane}
              isCreatorFunded={isCreatorFunded}
              contributionShort={contributionShort}
              walletCredits={walletCredits}
              flow={coinFlowLines(values)}
              onFundingChange={onFundingChange}
              onCurrencyChange={(value) => {
                if (normalizeUserChallengeLane(values.challenge_lane) !== 'private') {
                  return;
                }
                setValue('currency', value, { shouldValidate: true });
                setBucksAcks({});
              }}
            />
          ) : null}
          {step === STEP_ENTRY ? (
            <EntrySlide
              control={control}
              errors={errors}
              entryTab={entryTab}
              challengeLane={values.challenge_lane}
              participantCap={values.participant_cap}
              creatorParticipating={values.creator_participating}
              onEntryTabChange={onEntryTabChange}
              onCapChange={(value) => setValue('participant_cap', value, { shouldValidate: true })}
              onCreatorParticipatingChange={(value) =>
                setValue('creator_participating', value, { shouldValidate: true })
              }
            />
          ) : null}
          {step === STEP_RULES ? (
            <RulesSlide
              control={control}
              errors={errors}
              setValue={setValue}
              getValues={getValues}
              values={values}
              isPoints={isPoints}
              isUnlimited={isUnlimited}
              coverBusy={coverBusy}
              onFrequencyChange={onFrequencyChange}
              onAddTask={addTask}
              onRemoveTask={removeTask}
              onUploadCover={() => void uploadCover()}
              onClearCover={() => setValue('cover_image_url', '', { shouldDirty: true })}
            />
          ) : null}
          {step === STEP_REVIEW ? (
            <FieldAnchor name="review">
            <ReviewSlide
              values={values}
              contributionAmount={contributionAmount}
              contributionShort={contributionShort}
              skillAck={skillAck}
              onToggleSkillAck={() => setSkillAck((current) => !current)}
              onEdit={editFromReview}
            />
            </FieldAnchor>
          ) : null}
          </View>
        </ScrollView>

        <View className="gap-2 px-4 pb-4 pt-2" style={{ borderTopWidth: 1, borderTopColor: THEME.border }}>
          {formError ? (
            <AppText className="text-sm leading-5 text-coral-dark">{formError}</AppText>
          ) : null}
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button title="Back" variant="outline" onPress={goBack} />
            </View>
            <View className="flex-1">
              <Button
                title={
                  lastStep
                    ? 'Publish'
                    : reviewReturn
                      ? copy('create.backToReview')
                      : 'Next'
                }
                loading={lastStep && publishing}
                onPress={() => void goNext()}
              />
            </View>
          </View>
        </View>
          </WizardFocusContext.Provider>
        )}
      </View>
    </TourAnchor>
    </ChallengeNotesProvider>
  );

  if (embedded) {
    return (
      <View className="flex-1" style={{ backgroundColor: THEME.background }}>
        <Stack.Screen options={{ headerShown: false, title: 'Advanced' }} />
        {wizardBody}
      </View>
    );
  }

  return (
    <WizardModalShell onClose={closeWizard} bob={bob}>
      <Stack.Screen
        options={{
          title: 'Advanced',
          headerShown: false,
          presentation: 'containedTransparentModal',
          animation: 'fade',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      {wizardBody}
    </WizardModalShell>
  );
}

function LaneSlide({
  selected,
  onPick,
}: {
  selected: UserChallengeLane | null;
  onPick: (lane: UserChallengeLane) => void;
}) {
  return (
    <FieldAnchor name="challenge_lane">
      <View className="gap-3">
        <ChoiceCard
          selected={selected === 'coins'}
          title="Coin Challenge"
          body="Practice, reputation, and fun stakes in Coins only."
          bullets={[
            'Entry: free or Coins',
            'Prize: Coins (and status)',
            'Can be public in the Lobby',
          ]}
          footer="No real-money entry fee."
          onPress={() => onPick('coins')}
        />
        <ChoiceCard
          selected={selected === 'private'}
          title="Private Challenge"
          body="Invite-only. You fund the prize."
          bullets={[
            'Competitors do not pay into the prize',
            'You fund Coins or $ (or partner products later)',
            'Only invited people can join',
          ]}
          footer="Not listed in public discovery."
          onPress={() => onPick('private')}
        />
      </View>
    </FieldAnchor>
  );
}

function StartSlide({
  startPath,
  templateId,
  sourceChallengeId,
  previousChallenges,
  drafts,
  onScratch,
  onChooseTemplate,
  onPickTemplate,
  onPickPrevious,
  onContinueDraft,
  onDiscardDraft,
}: {
  startPath: CreateStartPath;
  templateId: ChallengeTemplateId | null;
  sourceChallengeId: string | null;
  previousChallenges: ReusableChallenge[];
  drafts: ChallengeDraft[];
  onScratch: () => void;
  onChooseTemplate: () => void;
  onPickTemplate: (id: ChallengeTemplateId) => void;
  onPickPrevious: (challenge: ReusableChallenge) => void;
  onContinueDraft: (draft: ChallengeDraft) => void;
  onDiscardDraft: (id?: string | null) => void;
}) {
  const presets = CHALLENGE_TEMPLATES.filter((item) => item.id !== 'custom');
  return (
    <FieldAnchor name="start">
    <View className="gap-2">
      <ChoiceCard
        selected={startPath === 'scratch'}
        title="Start from scratch"
        body="Blank challenge. Later slides start with simple defaults you can change."
        onPress={onScratch}
      />
      <ChoiceCard
        selected={startPath === 'template'}
        title="Choose template"
        body="Pre-made setups that fill the later slides. You can still edit anything."
        onPress={onChooseTemplate}
      />
      {drafts.length > 0 ? (
        <View className="gap-2">
          {drafts.map((draft) => (
            <ContinueDraftCard
              key={draft.id ?? draft.updatedAt}
              draft={draft}
              onContinue={() => onContinueDraft(draft)}
              onDiscard={() => onDiscardDraft(draft.id)}
            />
          ))}
        </View>
      ) : null}
      {startPath === 'template' ? (
        <View className="mt-2 gap-2">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Templates
          </AppText>
          {presets.map((template) => (
            <ChoiceCard
              key={template.id}
              selected={templateId === template.id}
              kicker={template.eyebrow}
              title={template.title}
              body={template.blurb}
              onPress={() => onPickTemplate(template.id)}
            />
          ))}
        </View>
      ) : null}
      {previousChallenges.length > 0 ? (
        <View className="mt-2 gap-2">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Start from one you’ve done
          </AppText>
          {previousChallenges.map((challenge) => (
            <ChoiceCard
              key={challenge.id}
              selected={startPath === 'previous' && sourceChallengeId === challenge.id}
              kicker={challenge.relation === 'hosted' ? 'Hosted' : 'Joined'}
              title={challenge.title}
              body={
                challenge.relation === 'hosted'
                  ? 'Copies your setup. New id, empty prize, no competitors.'
                  : 'Copies the setup you joined. New id, empty prize, no competitors.'
              }
              onPress={() => onPickPrevious(challenge)}
            />
          ))}
        </View>
      ) : null}
    </View>
    </FieldAnchor>
  );
}

function GoalSlide({
  control,
  errors,
  category,
  visibility,
  challengeLane,
  extraTasks,
  isPoints,
  onCategoryChange,
  onVisibilityChange,
  onExtraTasksChange,
}: {
  control: ReturnType<typeof useForm<CreateChallengeValues>>['control'];
  errors: ReturnType<typeof useForm<CreateChallengeValues>>['formState']['errors'];
  category: CreateChallengeValues['category'];
  visibility: CreateChallengeValues['visibility'];
  challengeLane: CreateChallengeValues['challenge_lane'];
  extraTasks: CreateChallengeValues['extra_tasks'];
  isPoints: boolean;
  onCategoryChange: (next: CreateChallengeValues['category']) => void;
  onVisibilityChange: (next: CreateChallengeValues['visibility']) => void;
  onExtraTasksChange: (next: NonNullable<CreateChallengeValues['extra_tasks']>) => void;
}) {
  const isPrivateLane = normalizeUserChallengeLane(challengeLane) === 'private';
  return (
    <View className="gap-4">
      <FieldAnchor name="category">
      <FieldLabel label="Type" error={errors.category?.message}>
        <ChipRow>
          {CHALLENGE_CATEGORIES.map((item) => (
            <Chip
              key={item}
              label={CHALLENGE_CATEGORY_LABEL[item]}
              selected={category === item}
              onPress={() => onCategoryChange(item)}
            />
          ))}
        </ChipRow>
        <AppText className="mt-2 text-[13px] leading-5 text-muted">
          Every challenge is a contest of skill and personal effort. Gambling and chance-only stakes aren’t allowed.
        </AppText>
      </FieldLabel>
      </FieldAnchor>
      <FieldAnchor name="title">
      <Controller
        control={control}
        name="title"
        render={({ field: { onChange, onBlur, value, ref } }) => (
          <Input
            ref={ref}
            label="Title"
            placeholder="e.g. 14-day reading streak"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.title?.message}
            maxLength={80}
          />
        )}
      />
      </FieldAnchor>
      <FieldAnchor name="description">
      <Controller
        control={control}
        name="description"
        render={({ field: { onChange, onBlur, value, ref } }) => (
          <Input
            ref={ref}
            label="What a win looks like"
            placeholder="Who should join, and what does finishing mean?"
            value={value ?? ''}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.description?.message}
            multiline
            textAlignVertical="top"
            style={{ minHeight: 96 }}
          />
        )}
      />
      </FieldAnchor>
      <FieldAnchor name="task">
        <Controller
          control={control}
          name="task"
          render={({ field: { onChange, onBlur, value, ref } }) => (
            <Input
              ref={ref}
              label="Task"
              placeholder="Run 1 mile"
              value={value ?? ''}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.task?.message}
            />
          )}
        />
        {isPoints ? null : (
          <View className="mt-3">
            <ExtraTasksEditor tasks={extraTasks ?? []} onChange={onExtraTasksChange} />
          </View>
        )}
      </FieldAnchor>
      <FieldAnchor name="visibility">
      {isPrivateLane ? (
        <FieldLabel label="Visibility">
          <AppText className="text-sm leading-5 text-muted">
            Invite-only. Not listed in public discovery.
          </AppText>
        </FieldLabel>
      ) : (
      <FieldLabel label="Visibility" error={errors.visibility?.message}>
        <SegmentedControl
          accessibilityLabel="Visibility"
          value={visibility === 'private' ? 'invite' : visibility}
          options={[
            { value: 'public', label: 'Public' },
            { value: 'friends', label: 'Friends' },
            { value: 'invite', label: 'Invite' },
          ]}
          onChange={onVisibilityChange}
        />
      </FieldLabel>
      )}
      </FieldAnchor>
    </View>
  );
}

function TypeSlide({
  challengeType,
  isUnlimited,
  error,
  onTypeChange,
}: {
  challengeType: CreateChallengeValues['challenge_type'];
  isUnlimited: boolean;
  error?: string;
  onTypeChange: (next: CreateChallengeValues['challenge_type']) => void;
}) {
  return (
    <View className="gap-3">
      <FieldAnchor name="challenge_type">
      <FieldLabel label="Scoring" error={error}>
        <View className="gap-2">
          {CHALLENGE_TYPES.map((item) => {
            const pointsLocked = isUnlimited && item.value === 'points';
            return (
              <ChoiceCard
                key={item.value}
                selected={challengeType === item.value}
                title={item.label}
                body={
                  pointsLocked
                    ? 'Last-man-standing uses Consistency so everyone is judged on staying eligible.'
                    : item.value === 'consistency'
                      ? 'Log on a schedule. Hit the target to finish.'
                      : 'Earn points from a task list. Totals decide ranking.'
                }
                disabled={pointsLocked}
                onPress={() => onTypeChange(item.value)}
              />
            );
          })}
        </View>
      </FieldLabel>
      </FieldAnchor>
    </View>
  );
}

function isDurationPreset(value: string): boolean {
  const days = Number(value);
  return DURATION_PRESETS.some((preset) => preset === days);
}

function DurationLengthPicker({
  durationDays,
  onChange,
}: {
  durationDays: string;
  onChange: (days: string) => void;
}) {
  const [customPicked, setCustomPicked] = useState(() => !isDurationPreset(durationDays));
  const customSelected = customPicked || !isDurationPreset(durationDays);
  const days = Math.max(Math.floor(Number(durationDays) || 7), 1);

  return (
    <View className="gap-3">
      <ChipRow>
        {DURATION_PRESETS.map((preset) => (
          <Chip
            key={preset}
            label={preset === 1 ? '1 day' : `${preset} days`}
            selected={!customSelected && Number(durationDays) === preset}
            onPress={() => {
              setCustomPicked(false);
              onChange(String(preset));
            }}
          />
        ))}
        <Chip
          label="Custom"
          selected={customSelected}
          onPress={() => setCustomPicked(true)}
        />
      </ChipRow>
      {customSelected ? (
        <View className="flex-row items-center justify-between">
          <AppText className="text-sm font-semibold text-charcoal">Days</AppText>
          <Stepper
            accessibilityLabel="Days"
            value={days}
            min={1}
            max={MAX_CHALLENGE_DURATION_DAYS}
            onChange={(next) => onChange(String(next))}
          />
        </View>
      ) : null}
    </View>
  );
}

function DurationSlide({
  control,
  errors,
  isUnlimited,
  startsAt,
  durationDays,
  frequency,
  onDurationTypeChange,
  onFrequencyChange,
  onScheduleChange,
}: {
  control: ReturnType<typeof useForm<CreateChallengeValues>>['control'];
  errors: ReturnType<typeof useForm<CreateChallengeValues>>['formState']['errors'];
  isUnlimited: boolean;
  startsAt: string;
  durationDays: string;
  frequency: ChallengeFrequency;
  onDurationTypeChange: (next: CreateChallengeValues['duration_type']) => void;
  onFrequencyChange: (next: ChallengeFrequency) => void;
  onScheduleChange: (patch: Partial<CreateChallengeValues>) => void;
}) {
  const startPreset = startPresetFor(startsAt);
  const endLine = formatChallengeEndLine(
    endsAtFromStartAndDays(startsAt, Number(durationDays) || 7),
  );

  return (
    <View className="gap-3">
      <FieldAnchor name="starts_at">
        <FieldLabel
          label="Start"
          error={errors.starts_at?.message}
          hint="Local time. Saved as UTC.">
          <View className="gap-3">
            <ChipRow>
              <Chip
                label="In 1 hour"
                selected={startPreset === 'hour'}
                onPress={() => onScheduleChange({ starts_at: inOneHour().toISOString() })}
              />
              <Chip
                label="Tomorrow morning"
                selected={startPreset === 'tomorrow'}
                onPress={() => onScheduleChange({ starts_at: tomorrowMorning().toISOString() })}
              />
              <Chip
                label="Custom"
                selected={startPreset === 'custom'}
                onPress={() => undefined}
              />
            </ChipRow>
            <DateTimeField
              value={startsAt}
              error={errors.starts_at?.message}
              onChange={(iso) => onScheduleChange({ starts_at: iso })}
            />
          </View>
        </FieldLabel>
      </FieldAnchor>

      {!isUnlimited ? (
        <FieldAnchor name="duration_value">
          <FieldLabel
            label="Duration"
            error={errors.duration_value?.message ?? errors.duration_days?.message}>
            <View className="gap-3">
              <DurationLengthPicker
                durationDays={durationDays}
                onChange={(value) =>
                  onScheduleChange({
                    end_mode: 'length',
                    duration_value: value,
                    duration_days: value,
                    duration_unit: 'days',
                  })
                }
              />
              {endLine ? (
                <AppText className="text-[13px] leading-5 text-muted">{endLine}</AppText>
              ) : null}
            </View>
          </FieldLabel>
        </FieldAnchor>
      ) : null}
      <FieldAnchor name="duration_type">
      <FieldLabel
        label="Schedule"
        error={errors.duration_type?.message}>
        <View className="gap-2">
          <ChoiceCard
            selected={!isUnlimited}
            title="Fixed dates"
            body="Starts and ends at the times above, then judging and payout."
            onPress={() => onDurationTypeChange('fixed')}
          />
          <ChoiceCard
            selected={isUnlimited}
            title="Unlimited (Last Man Standing)  ∞"
            body="Keeps going until only one person is still meeting the goal."
            footer="Coming soon"
            disabled
            onPress={() => undefined}
          />
        </View>
      </FieldLabel>
      </FieldAnchor>

      {isUnlimited ? (
        <>
          <FieldAnchor name="frequency">
          <FieldLabel
            label="Stay-in cadence"
            error={errors.frequency?.message}
            hint="Miss this cadence and you’re eliminated.">
            <ChipRow>
              {CHALLENGE_FREQUENCIES.filter((item) => item.value === 'daily' || item.value === 'weekly').map(
                (item) => (
                  <Chip
                    key={item.value}
                    label={item.label}
                    selected={frequency === item.value}
                    onPress={() => onFrequencyChange(item.value)}
                  />
                ),
              )}
            </ChipRow>
          </FieldLabel>
          </FieldAnchor>
          <FieldAnchor name="target_count">
          <Controller
            control={control}
            name="target_count"
            render={({ field: { onChange, onBlur, value, ref } }) => (
              <Input
                ref={ref}
                label={frequency === 'weekly' ? 'Logs required each week' : 'Logs required each day'}
                placeholder={frequency === 'weekly' ? '5' : '1'}
                keyboardType="number-pad"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.target_count?.message}
                hint={
                  frequency === 'weekly'
                    ? 'Miss this many logs in a week and you’re out.'
                    : 'Daily last-man-standing is one successful log per day.'
                }
              />
            )}
          />
          </FieldAnchor>
        </>
      ) : null}
    </View>
  );
}

function PrizeSlide({
  control,
  errors,
  isUnlimited,
  prizeStructure,
  topPlacesMode,
  topPlacesDistribution,
  onPrizeChange,
  onModeChange,
  onDistributionChange,
}: {
  control: ReturnType<typeof useForm<CreateChallengeValues>>['control'];
  errors: ReturnType<typeof useForm<CreateChallengeValues>>['formState']['errors'];
  isUnlimited: boolean;
  prizeStructure: PrizeStructure;
  topPlacesMode: CreateChallengeValues['top_places_mode'];
  topPlacesDistribution: CreateChallengeValues['top_places_distribution'];
  onPrizeChange: (value: PrizeStructure) => void;
  onModeChange: (value: CreateChallengeValues['top_places_mode']) => void;
  onDistributionChange: (value: CreateChallengeValues['top_places_distribution']) => void;
}) {
  const options = isUnlimited
    ? PRIZE_STRUCTURES.filter((item) => item.value === 'winner_take_all')
    : PRIZE_STRUCTURES;

  return (
    <View className="gap-3">
      <FieldAnchor name="prize_structure">
      <FieldLabel
        label="Payout"
        error={errors.prize_structure?.message}
        hint={isUnlimited ? 'Last-man-standing always pays the last remaining person the entire pool.' : undefined}>
        <View className="gap-2">
          {options.map((item) => (
            <ChoiceCard
              key={item.value}
              selected={isUnlimited || prizeStructure === item.value}
              title={item.label}
              body={
                isUnlimited
                  ? 'The last person still meeting the requirement wins the entire prize.'
                  : item.helper
              }
              onPress={() => onPrizeChange(item.value)}
            />
          ))}
        </View>
      </FieldLabel>
      </FieldAnchor>

      {isUnlimited || prizeStructure !== 'top_places' ? null : (
        <View className="gap-3">
          <FieldAnchor name="top_places_mode">
          <FieldLabel label="Who counts as top places" error={errors.top_places_mode?.message}>
            <SegmentedControl
              accessibilityLabel="Top places mode"
              value={topPlacesMode}
              options={TOP_PLACES_MODES.map((item) => ({ value: item.value, label: item.label }))}
              onChange={onModeChange}
            />
          </FieldLabel>
          </FieldAnchor>
          <FieldAnchor name="top_places_value">
          <Controller
            control={control}
            name="top_places_value"
            render={({ field: { onChange, onBlur, value, ref } }) => (
              <Input
                ref={ref}
                label={topPlacesMode === 'count' ? 'How many people' : 'What percent'}
                placeholder="10"
                keyboardType="number-pad"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.top_places_value?.message}
                hint={
                  topPlacesMode === 'count'
                    ? 'e.g. 3 means 1st, 2nd, and 3rd share the prize.'
                    : 'e.g. 10 means the top 10% of finishers share the prize.'
                }
              />
            )}
          />
          </FieldAnchor>
          <FieldAnchor name="top_places_distribution">
          <FieldLabel label="How those places split it" error={errors.top_places_distribution?.message}>
            <View className="gap-2">
              {TOP_PLACES_DISTRIBUTIONS.map((item) => (
                <ChoiceCard
                  key={item.value}
                  selected={topPlacesDistribution === item.value}
                  title={item.label}
                  body={item.helper}
                  onPress={() => onDistributionChange(item.value)}
                />
              ))}
            </View>
          </FieldLabel>
          </FieldAnchor>
        </View>
      )}
    </View>
  );
}

function FundingSlide({
  control,
  errors,
  fundingModel,
  currency,
  challengeLane,
  isCreatorFunded,
  contributionShort,
  walletCredits,
  flow,
  onFundingChange,
  onCurrencyChange,
}: {
  control: ReturnType<typeof useForm<CreateChallengeValues>>['control'];
  errors: ReturnType<typeof useForm<CreateChallengeValues>>['formState']['errors'];
  fundingModel: FundingModel;
  currency: CreateChallengeValues['currency'];
  challengeLane: CreateChallengeValues['challenge_lane'];
  isCreatorFunded: boolean;
  contributionShort: string | null;
  walletCredits: number;
  flow: { label: string; body: string }[];
  onFundingChange: (next: FundingModel) => void;
  onCurrencyChange: (next: CreateChallengeValues['currency']) => void;
}) {
  const isPrivateLane = normalizeUserChallengeLane(challengeLane) === 'private';
  const noun = currency === 'bucks' ? '$' : 'Coins';
  const models = isPrivateLane
    ? FUNDING_MODELS.filter((item) => item.value === 'creator')
    : FUNDING_MODELS;
  return (
    <View className="gap-3">
      <FieldAnchor name="funding_model">
      <FieldLabel
        label={isPrivateLane ? 'You fund the prize' : 'Funding model'}
        error={errors.funding_model?.message}
        hint={
          isPrivateLane
            ? 'Competitors are not charged an entry fee. Put Coins or $ in from your wallet, or hold for partner products later.'
            : 'Coin challenges pay in Coins only.'
        }>
        <View className="gap-2">
          {models.map((item) => (
            <ChoiceCard
              key={item.value}
              selected={fundingModel === item.value}
              title={item.label}
              body={
                isPrivateLane && item.value === 'creator'
                  ? 'You pay the prize up front. Competitors enter free.'
                  : item.helper
              }
              onPress={() => onFundingChange(item.value)}
            />
          ))}
          {isPrivateLane ? (
            <ChoiceCard
              selected={false}
              disabled
              title="Partner product (soon)"
              body="Catalog prizes land in a later packet. For now, fund Coins or $ yourself."
              onPress={() => {}}
            />
          ) : null}
        </View>
      </FieldLabel>
      </FieldAnchor>

      {isPrivateLane ? (
        <FieldAnchor name="currency">
          <FieldLabel label="Prize currency" error={errors.currency?.message}>
            <SegmentedControl
              accessibilityLabel="Prize currency"
              value={currency === 'bucks' ? 'bucks' : 'coins'}
              options={[
                { value: 'coins', label: 'Coins' },
                { value: 'bucks', label: '$' },
              ]}
              onChange={onCurrencyChange}
            />
          </FieldLabel>
        </FieldAnchor>
      ) : null}

      {isCreatorFunded ? (
        <FieldAnchor name="creator_contribution">
        <Controller
          control={control}
          name="creator_contribution"
          render={({ field: { onChange, onBlur, value, ref } }) => (
            <Input
              ref={ref}
              label={`Your contribution in ${noun}`}
              placeholder="10"
              keyboardType="decimal-pad"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.creator_contribution?.message ?? contributionShort ?? undefined}
              hint={`Taken from your wallet when you publish. You have ${formatWallet(walletCredits, currency)}.`}
            />
          )}
        />
        </FieldAnchor>
      ) : null}

      <Card>
        <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          How {noun} will move
        </AppText>
        <View className="mt-2 gap-3">
          {flow.map((line) => (
            <View key={line.label}>
              <AppText className="text-sm font-semibold text-charcoal">{line.label}</AppText>
              <AppText className="mt-0.5 text-sm leading-5 text-muted">{line.body}</AppText>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

function EntrySlide({
  control,
  errors,
  entryTab,
  challengeLane,
  participantCap,
  creatorParticipating,
  onEntryTabChange,
  onCapChange,
  onCreatorParticipatingChange,
}: {
  control: ReturnType<typeof useForm<CreateChallengeValues>>['control'];
  errors: ReturnType<typeof useForm<CreateChallengeValues>>['formState']['errors'];
  entryTab: EntryTab;
  challengeLane: CreateChallengeValues['challenge_lane'];
  participantCap: CreateChallengeValues['participant_cap'];
  creatorParticipating: boolean;
  onEntryTabChange: (next: EntryTab) => void;
  onCapChange: (value: CreateChallengeValues['participant_cap']) => void;
  onCreatorParticipatingChange: (value: boolean) => void;
}) {
  const lane = normalizeUserChallengeLane(challengeLane);
  const isPrivateLane = lane === 'private';
  const isFree = isPrivateLane || entryTab === 'free';
  const amountLabel = entryTab === 'bucks' ? 'Entry fee ($)' : 'Entry fee (Coins)';
  const buyInOptions =
    isPrivateLane
      ? ([{ value: 'free', label: 'Free' }] as const)
      : ([
          { value: 'free', label: 'Free' },
          { value: 'coins', label: 'Coins' },
        ] as const);
  return (
    <View className="gap-4">
      <FieldAnchor name="currency">
      {isPrivateLane ? (
        <FieldLabel label="Entry">
          <AppText className="text-sm leading-5 text-muted">
            Competitors are not charged an entry fee for the prize. You fund the prize on Funding.
          </AppText>
        </FieldLabel>
      ) : (
      <FieldLabel
        label="Entry"
        error={errors.currency?.message}
        hint={isFree ? 'No Coin charge to enter.' : undefined}>
        <SegmentedControl
          accessibilityLabel="Entry"
          value={entryTab === 'bucks' ? 'coins' : entryTab}
          options={[...buyInOptions]}
          onChange={onEntryTabChange}
        />
      </FieldLabel>
      )}
      </FieldAnchor>
      {isFree ? null : (
      <FieldAnchor name="buy_in">
      <Controller
        control={control}
        name="buy_in"
        render={({ field: { onChange, onBlur, value, ref } }) => (
          <Input
            ref={ref}
            label={amountLabel}
            placeholder="10"
            keyboardType="decimal-pad"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.buy_in?.message}
            hint="Each competitor pays this from their Coin balance when they enter. Not refundable after start."
          />
        )}
      />
      </FieldAnchor>
      )}
      <FieldAnchor name="participant_cap">
      <FieldLabel
        label="How many competitors"
        error={errors.participant_cap?.message}
        hint="A cap stops new competitors once that number is reached.">
        <SegmentedControl
          accessibilityLabel="Competitor limit"
          value={participantCap}
          options={[
            { value: 'unlimited', label: 'Unlimited' },
            { value: 'limited', label: 'Limited' },
          ]}
          onChange={onCapChange}
        />
      </FieldLabel>
      </FieldAnchor>
      {participantCap === 'limited' ? (
        <FieldAnchor name="max_participants">
        <Controller
          control={control}
          name="max_participants"
          render={({ field: { onChange, onBlur, value, ref } }) => (
            <Input
              ref={ref}
              label="Max competitors"
              placeholder="20"
              keyboardType="number-pad"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.max_participants?.message}
            />
          )}
        />
        </FieldAnchor>
      ) : (
        <AppText className="text-sm leading-5 text-muted">
          Unlimited competitors. Anyone can join while the challenge is open.
        </AppText>
      )}
      <FieldAnchor name="min_participants">
        <Controller
          control={control}
          name="min_participants"
          render={({ field: { onChange, onBlur, value, ref } }) => (
            <Input
              ref={ref}
              label="Min to start"
              placeholder="2"
              keyboardType="number-pad"
              value={value ?? '2'}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.min_participants?.message}
              hint="If fewer people have joined at start, it cancels and coin entry fees refund."
            />
          )}
        />
      </FieldAnchor>
      <FieldAnchor name="misses_allowed">
        <Controller
          control={control}
          name="misses_allowed"
          render={({ field: { onChange, onBlur, value, ref } }) => (
            <Input
              ref={ref}
              label="Misses allowed"
              placeholder="0"
              keyboardType="number-pad"
              value={value ?? '0'}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.misses_allowed?.message}
            />
          )}
        />
      </FieldAnchor>
      <FieldAnchor name="proof_review">
        <Controller
          control={control}
          name="proof_review"
          render={({ field: { onChange, value } }) => (
            <FieldLabel label="Proof review">
              <SegmentedControl
                accessibilityLabel="Proof review"
                value={value === 'host' ? 'host' : 'auto'}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'host', label: 'Host' },
                ]}
                onChange={onChange}
              />
            </FieldLabel>
          )}
        />
      </FieldAnchor>
      <FieldAnchor name="creator_participating">
      <View className="flex-row items-center justify-between">
        <View className="mr-4 flex-1">
          <AppText className="font-semibold text-charcoal">I’ll join this challenge</AppText>
          <AppText className="mt-0.5 text-xs leading-5 text-muted">
            On if you want to compete too. Off if you’re hosting only.
          </AppText>
        </View>
        <Switch
          value={creatorParticipating}
          onValueChange={onCreatorParticipatingChange}
          trackColor={{ true: COLORS.mintDark, false: COLORS.line }}
          thumbColor={COLORS.white}
          ios_backgroundColor={COLORS.line}
        />
      </View>
      </FieldAnchor>
    </View>
  );
}

function ReviewSlide({
  values,
  contributionAmount,
  contributionShort,
  skillAck,
  onToggleSkillAck,
  onEdit,
}: {
  values: CreateChallengeValues;
  contributionAmount: number;
  contributionShort: string | null;
  skillAck: boolean;
  onToggleSkillAck: () => void;
  onEdit: (key: CreateReviewEditKey) => void;
}) {
  return (
    <View className="gap-4">
      <CreateReviewPreview values={values} onEdit={onEdit} />
      {contributionShort ? (
        <FieldAnchor name="wallet">
        <AppText className="text-sm leading-5 text-coral-dark">{contributionShort}</AppText>
        </FieldAnchor>
      ) : contributionAmount > 0 ? (
        <AppText className="text-sm leading-5 text-muted">
          Publishing takes {formatWallet(contributionAmount, values.currency)} from your wallet now.
        </AppText>
      ) : null}
      <FieldAnchor name="skill">
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: skillAck }}
          onPress={onToggleSkillAck}
          className="flex-row items-start gap-3 rounded-blob border px-4 py-3"
          style={{
            backgroundColor: skillAck ? THEME.accentSoft : THEME.surface,
            borderColor: skillAck ? THEME.accent : THEME.border,
            borderWidth: 1.5,
            borderRadius: THEME.radius,
          }}>
          <View
            className="mt-0.5 h-5 w-5 items-center justify-center"
            style={{
              borderWidth: 1.5,
              borderColor: skillAck ? THEME.accent : THEME.border,
              backgroundColor: skillAck ? THEME.accent : THEME.surface,
              borderRadius: 4,
            }}>
            {skillAck ? (
              <AppText className="text-[12px] font-bold" style={{ color: THEME.primaryForeground }}>
                ✓
              </AppText>
            ) : null}
          </View>
          <AppText className="flex-1 text-[15px] leading-6 text-charcoal">
            I confirm this is a contest of personal effort and skill. No gambling or chance-only stakes.
          </AppText>
        </Pressable>
      </FieldAnchor>
    </View>
  );
}
