import { zodResolver } from '@hookform/resolvers/zod';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, type FieldPath } from 'react-hook-form';
import { BackHandler, Dimensions, Keyboard, Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChallengePhotoField } from '@/components/challenge/create/ChallengePhotoField';
import { DateTimeField } from '@/components/challenge/create/DateTimeField';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { useTourOptional } from '@/components/tour/TourContext';
import {
  ChoiceCard,
  ContinueDraftCard,
  CreateActionsFooter,
  FieldAnchor,
  FieldLabel,
  useWizardFieldFocus,
  WizardFocusContext,
  WizardModalShell,
  WizardProgress,
  type WizardFocusApi,
} from '@/components/challenge/create/wizardUi';
import { RulesSlide } from '@/components/challenge/create/RulesSlide';
import { CreateReviewPreview, type CreateReviewEditKey } from '@/components/challenge/create/CreateReviewPreview';
import { ExtraTasksEditor } from '@/components/challenge/create/ExtraTasksEditor';
import { PrivacyModePicker } from '@/components/challenge/create/PrivacyModePicker';
import { ComparablePointsEditor } from '@/components/challenge/create/comparablePoints/ComparablePointsEditor';
import { ComparablePointsMethodCard } from '@/components/challenge/create/comparablePoints/ComparablePointsMethodCard';
import { ChallengeNotesProvider } from '@/components/challenge/FieldNote';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { StepperField } from '@/components/ui/Stepper';
import { AppText } from '@/components/ui/AppText';
import { useChallenge, useCreateChallenge, useUpdateUserChallenge } from '@/hooks/useChallenge';
import { useCreateChallengeTour } from '@/hooks/useCreateChallengeTour';
import {
  useChallengeDrafts,
  useDiscardChallengeDraft,
  useReusableChallenges,
  useSaveChallengeDraft,
} from '@/hooks/useChallengeDraft';
import { useMyProfile } from '@/hooks/useProfile';
import {
  clampDraftStep,
  createHrefForDraft,
  hydrateDraftValues,
  isSimpleCreateDraft,
  isVisibleDraft,
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
  isCumulativeDraft,
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
import { composeChallengeRules } from '@/lib/consistencyRules';
import {
  defaultRulesTargetCount,
  nextCreateWizardStep,
  prevCreateWizardStep,
  rulesStepBlockingIssue,
  rulesStepIsReady,
  seedPointsTasksFromGoal,
  stripBlankExtraRules as dropBlankExtraRules,
  stripBlankExtraTasks as dropBlankExtraTasks,
} from '@/lib/createWizardFlow';
import { subscribeVisualViewport } from '@/lib/visualViewport';
import { applyLaneToFormValues, normalizeUserChallengeLane, type UserChallengeLane } from '@/lib/challengeLane';
import { asPrivacyMode, type PrivacyMode } from '@/lib/privacyMode';
import {
  endsAtFromStartAndDays,
  ensureSchedule,
  formatChallengeEndLine,
  inOneHour,
  MAX_CHALLENGE_DURATION_DAYS,
  resolveStartForPublish,
  startPresetFromValues,
  tomorrowMorning,
  withFreshSchedule,
  type StartPreset,
} from '@/lib/challengeSchedule';
import {
  COMPARABLE_POINTS_METHOD,
  parseComparablePointsConfig,
} from '@/lib/comparablePoints';
import { useComparablePointsForm } from '@/hooks/useComparablePointsForm';
import { tabBarLift, THEME } from '@/lib/theme';
import { LOBBY_HREF, TABS_HREF } from '@/lib/routes';
import { copy } from '@/lib/copy';
import type { ChallengeFrequency, FundingModel, PrizeStructure, ProofType } from '@/lib/types';
import { authStorage } from '@/lib/utils/secureStore';
import { getCreateChallengeMessage, getErrorMessage } from '@/utils/errors';
import { formatWallet, walletBalance } from '@/lib/currency';
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
const STEP_SCORING = wizardStepIndex('scoring');
const STEP_FUNDING = wizardStepIndex('funding');
const STEP_ENTRY = wizardStepIndex('entry');
const STEP_RULES = wizardStepIndex('rules');
const STEP_REVIEW = wizardStepIndex('review');

const TUTORIAL_KEY = 'blob:create-tutorial';

type BobIssue = { field: string; step: number };

const FOCUSABLE_FIELDS = new Set([
  'title',
  'description',
  'task',
  'duration_days',
  'duration_value',
  'target_count',
  'top_places_value',
  'creator_contribution',
  'buy_in',
  'max_participants',
  'min_minutes',
  'rules',
  'extra_rules',
  'cover_image_url',
  'rules_video_url',
  'tasks',
]);

export function CreateWizard({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const params = useLocalSearchParams<{
    resume?: string | string[];
    draftId?: string | string[];
    returnTo?: string | string[];
    editId?: string | string[];
  }>();
  const resumeOnOpen = (Array.isArray(params.resume) ? params.resume[0] : params.resume) === '1';
  const resumeDraftId = Array.isArray(params.draftId) ? params.draftId[0] : params.draftId;
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const editId = Array.isArray(params.editId) ? params.editId[0] : params.editId;
  const dismissFallback = returnTo === 'feed' ? TABS_HREF : LOBBY_HREF;
  const { profile } = useMyProfile();
  const create = useCreateChallenge();
  const update = useUpdateUserChallenge();
  const editing = useChallenge(editId);
  const isEditing = Boolean(editId);
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
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [bucksAcks, setBucksAcks] = useState<Record<string, boolean>>({});
  const [liveChallengeId, setLiveChallengeId] = useState<string | null>(null);
  const [tutorialOn, setTutorialOn] = useState(false);
  const [bobTipOpen, setBobTipOpen] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [entryTab, setEntryTab] = useState<EntryTab>('coins');
  const [skillAck, setSkillAck] = useState(false);
  const [scoringEditorOpen, setScoringEditorOpen] = useState(false);
  const [scoringToast, setScoringToast] = useState<string | null>(null);
  const [laneChosen, setLaneChosen] = useState(true);
  const [startPreset, setStartPreset] = useState<StartPreset>(() =>
    startPresetFromValues(DEFAULT_CREATE_VALUES.starts_at),
  );
  const [bobError, setBobError] = useState<{ field: string; line: string } | null>(null);
  const tour = useTourOptional();
  const setCreatePeek = tour?.setCreatePeek;
  const hydratedEdit = useRef(false);
  useCreateChallengeTour(
    'advanced',
    !liveChallengeId && !isEditing && !resumeOnOpen && !restoredDraft,
  );

  useEffect(() => {
    if (!setCreatePeek) {
      return;
    }
    setCreatePeek((index) => {
      if (restoredDraftRef.current) {
        return;
      }
      setStep(index);
    });
    return () => setCreatePeek(null);
  }, [setCreatePeek]);

  const {
    control,
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
  const comparableConfig = parseComparablePointsConfig(values.scoring_config);
  const scoringForm = useComparablePointsForm(comparableConfig);
  const isPoints = isPointsDraft(values);
  const isCumulative = isCumulativeDraft(values);
  const usesComparablePoints = values.scoring_method === COMPARABLE_POINTS_METHOD && comparableConfig != null;
  const isUnlimited = isUnlimitedDraft(values);
  const isCreatorFunded = values.funding_model === 'creator' || values.funding_model === 'hybrid';
  const contributionAmount = isCreatorFunded ? Math.max(Number(values.creator_contribution) || 0, 0) : 0;
  const walletCredits = walletBalance(profile, values.currency);
  const alreadyFunded =
    isEditing && editing.data?.currency === values.currency
      ? Math.max(Number(editing.data.creator_contribution) || 0, 0)
      : 0;
  const extraNeeded = isEditing ? Math.max(contributionAmount - alreadyFunded, 0) : contributionAmount;
  const contributionShort =
    isCreatorFunded && extraNeeded > walletCredits
      ? `You need ${formatWallet(extraNeeded, values.currency)} to fund this pool. You have ${formatWallet(walletCredits, values.currency)}.`
      : null;
  const publishing = isSubmitting || create.isPending || update.isPending;

  useEffect(() => {
    if (!editId || !editing.data || hydratedEdit.current) {
      return;
    }
    hydratedEdit.current = true;
    const next = valuesFromChallenge(editing.data);
    skipSaveRef.current = true;
    reset(next);
    setLaneChosen(true);
    setStartPath('previous');
    setRestoredDraft(true);
    setEntryTab(entryTabFromValues(next));
    captureBaseline(next, STEP_GOAL);
    setStep(STEP_GOAL);
    queueMicrotask(() => {
      skipSaveRef.current = false;
    });
  }, [editId, editing.data, reset]);
  const lastStep = step === CREATE_WIZARD_STEPS.length - 1;
  const insets = useSafeAreaInsets();
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
  const scrollY = useRef(0);
  const footerDockHeight = useRef(72);
  const keyboardHeightRef = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [footerH, setFooterH] = useState(72);
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
    startPreset: StartPreset;
  } | null>(null);
  const flushRulesDraftRef = useRef<() => void>(() => {});
  const draftFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftFlash, setDraftFlash] = useState(false);
  draftIdRef.current = draftId;
  footerDockHeight.current = footerH;
  keyboardHeightRef.current = keyboardHeight;

  useEffect(() => {
    function apply(height: number) {
      setKeyboardHeight(Math.max(0, height));
    }
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => apply(event.endCoordinates.height),
    );
    const change = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidChangeFrame',
      (event) => apply(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => apply(0),
    );
    const unsubViewport = Platform.OS === 'web' ? subscribeVisualViewport(apply) : () => undefined;
    return () => {
      show.remove();
      change.remove();
      hide.remove();
      unsubViewport();
    };
  }, []);

  useEffect(() => {
    if (keyboardHeight <= 0 || !pendingAnchor.current) {
      return;
    }
    const name = pendingAnchor.current;
    requestAnimationFrame(() => {
      setTimeout(() => scrollToAnchorRef.current(name), Platform.OS === 'android' ? 80 : 40);
    });
  }, [keyboardHeight]);

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
    startPreset: StartPreset;
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
    setValue('privacy_mode', asPrivacyMode(next.privacy_mode, next.visibility, next.challenge_lane), {
      shouldValidate: true,
    });
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
    restoredDraftRef.current = true;
    tour?.stopCreate?.();
    try {
      if (draft.corrupt) {
        setRestoredDraft(false);
        setStep(0);
        setFormError('This draft is damaged. Discard it and start again.');
        return false;
      }
      const hydrated = hydrateDraftValues(draft.values);
      const preset = draft.startPreset ?? startPresetFromValues(hydrated.starts_at);
      const opened = cloneTemplateValues(hydrated);
      const nextStep = jumpToSavedStep ? clampDraftStep(draft.step) : STEP_GOAL;
      const nextPath = draft.startPath ?? 'scratch';
      if (__DEV__) {
        console.log('[blob:draft] continue', { id: draft.id, savedStep: draft.step, nextStep, title: opened.title });
      }
      discardedRef.current = false;
      restoredDraftRef.current = true;
      draftIdRef.current = draft.id;
      setDraftId(draft.id);
      setStartPath(nextPath);
      setTemplateId(draft.templateId);
      setSourceChallengeId(draft.sourceChallengeId);
      setStartPreset(preset);
      setRestoredDraft(true);
      setLaneChosen(true);
      setFormError(null);
      setBobError(null);
      reset(cloneTemplateValues(opened));
      setEntryTab(entryTabFromValues(opened));
      captureBaseline(opened, nextStep);
      rememberPersisted({
        id: draft.id,
        step: nextStep,
        startPath: nextPath,
        templateId: draft.templateId,
        sourceChallengeId: draft.sourceChallengeId,
        values: opened,
        startPreset: preset,
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
    if (isSimpleCreateDraft(next)) {
      router.replace(createHrefForDraft(next, returnTo === 'feed' ? { returnTo: 'feed' } : undefined));
      return;
    }
    skipSaveRef.current = true;
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
    if (isEditing || liveChallengeId || saveDraft.isPending) {
      return;
    }
    flushRulesDraftRef.current();
    const live = getValues();
    const snapshot = {
      id: draftIdRef.current ?? draftsQuery.data?.[0]?.id ?? null,
      step,
      startPath,
      templateId,
      sourceChallengeId,
      values: live,
      createMode: 'advanced' as const,
      startPreset,
      title: live.title.trim() || 'Untitled draft',
    };
    try {
      const saved = await saveDraft.mutateAsync(snapshot);
      if (saved.id) {
        draftIdRef.current = saved.id;
        setDraftId(saved.id);
      }
      restoredDraftRef.current = true;
      rememberPersisted({ ...snapshot, id: saved.id ?? snapshot.id });
      flashDraftSaved();
    } catch (error) {
      console.log('[blob:draft] save failed', getErrorMessage(error));
      setFormError(getErrorMessage(error) || 'Couldn’t save the draft.');
    }
  }

  useLayoutEffect(() => {
    if (draftsQuery.isLoading) {
      return;
    }
    if (!resumeOnOpen || didResumeRef.current) {
      return;
    }
    const existing = resumeDraftId
      ? draftsQuery.data?.find((item) => item.id === resumeDraftId)
      : draftsQuery.data?.[0];
    if (!existing) {
      return;
    }
    didResumeRef.current = true;
    if (isSimpleCreateDraft(existing)) {
      router.replace(createHrefForDraft(existing, returnTo === 'feed' ? { returnTo: 'feed' } : undefined));
      return;
    }
    applyDraft(existing, true);
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
  }, [step]);

  useEffect(() => {
    if (!bobError) {
      return;
    }
    const next = snapshotField(bobError.field);
    if (next !== errorSnapshotRef.current) {
      const field = bobError.field;
      setBobError(null);
      setFormError(null);
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
    if ((getValues('rules') ?? '') !== next) {
      setValue('rules', next, { shouldDirty: false, shouldValidate: false });
    }
  }, [
    values.target_count,
    values.rule_activity,
    values.frequency,
    values.duration_type,
    values.extra_rules,
    values.challenge_type,
    values.task,
    values.extra_tasks,
    getValues,
    setValue,
  ]);

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
      if (values.privacy_mode === 'public') {
        setValue('privacy_mode', 'private', { shouldValidate: true });
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

  function syncRuleActivityFromTask() {
    if (getValues('challenge_type') === 'points') {
      return;
    }
    const task = (getValues('task') ?? '').trim();
    if (task.length < 2) {
      return;
    }
    if (getValues('rule_activity') !== task) {
      setValue('rule_activity', task, { shouldDirty: false, shouldValidate: false });
    }
  }

  function seedPointsTaskFromGoal() {
    const next = seedPointsTasksFromGoal(getValues());
    if (!next) {
      return;
    }
    setValue('tasks', next, { shouldDirty: false, shouldValidate: false });
  }

  function stripBlankExtraRules() {
    const extras = getValues('extra_rules') ?? [];
    const next = dropBlankExtraRules(extras);
    if (next.length !== extras.length) {
      setValue('extra_rules', next, { shouldDirty: false, shouldValidate: false });
    }
  }

  function stripBlankExtraTasks() {
    const extras = getValues('extra_tasks') ?? [];
    const next = dropBlankExtraTasks(extras);
    if (next.length !== extras.length) {
      setValue('extra_tasks', next, { shouldDirty: false, shouldValidate: false });
    }
  }

  function onTypeChange(next: CreateChallengeValues['challenge_type']) {
    if (getValues('duration_type') === 'unlimited' && (next === 'points' || next === 'cumulative')) {
      return;
    }
    setValue('challenge_type', next, { shouldValidate: true });
    setValue('format', next === 'cumulative' ? 'cumulative' : next === 'points' ? 'points' : 'consistency', {
      shouldValidate: false,
    });
    if (next === 'cumulative') {
      setValue('misses_allowed', '0', { shouldDirty: false, shouldValidate: false });
      setValue('cumulative_metric', 'distance_m', { shouldDirty: false, shouldValidate: false });
      setValue('cumulative_window', getValues('cumulative_window') || 'challenge', { shouldDirty: false });
      if (!Number(getValues('cumulative_target'))) {
        setValue('cumulative_target', String(160934), { shouldDirty: false });
      }
      return;
    }
    if (next !== 'points') {
      return;
    }
    const tasks = getValues('tasks');
    if (tasks.length === 0) {
      setValue('tasks', [emptyChallengeTask()], { shouldValidate: false });
    }
    seedPointsTaskFromGoal();
    setValue('misses_allowed', '0', { shouldDirty: false, shouldValidate: false });
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

  function openScoringEditor() {
    scoringForm.resetFrom(getValues('scoring_config'));
    setScoringEditorOpen(true);
  }

  function closeScoringEditor() {
    scoringForm.resetFrom(getValues('scoring_config'));
    setScoringEditorOpen(false);
  }

  function saveScoringMethod() {
    const result = scoringForm.validate();
    if (!result.ok) {
      showBobIssue({ field: 'scoring_config', step: STEP_SCORING }, result.message);
      return false;
    }
    setValue('scoring_method', COMPARABLE_POINTS_METHOD, { shouldDirty: true, shouldValidate: true });
    setValue('scoring_config', result.config, { shouldDirty: true, shouldValidate: true });
    setScoringEditorOpen(false);
    setScoringToast('Scoring method saved');
    setTimeout(() => setScoringToast((current) => (current === 'Scoring method saved' ? null : current)), 1800);
    return true;
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
          first = { field: name, step: targetStep };
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
    syncComposedRules();
    if (rulesStepIsReady(formValues)) {
      return null;
    }
    const field = isPointsDraft(formValues) ? 'tasks.0.title' : 'task';
    setError(isPointsDraft(formValues) ? 'tasks.0.title' : 'task', {
      type: 'validate',
      message: isPointsDraft(formValues) ? 'Give this task a short name' : 'Add a task',
    });
    return { field, step: STEP_RULES };
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
    const run = () => {
      node.measureInWindow((_x, y, _w, h) => {
        const windowH = Dimensions.get('window').height;
        const reserved = footerDockHeight.current + keyboardHeightRef.current + 16;
        const visibleBottom = windowH - reserved;
        const fieldBottom = y + h;
        const topGuard = 24;
        let delta = 0;
        if (fieldBottom > visibleBottom) {
          delta = fieldBottom - visibleBottom;
        } else if (y < topGuard) {
          delta = y - topGuard;
        }
        if (delta !== 0) {
          scroll.scrollTo({
            y: Math.max(0, scrollY.current + delta),
            animated: true,
          });
        }
      });
    };
    if (content && typeof node.measureLayout === 'function') {
      requestAnimationFrame(() => {
        setTimeout(run, Platform.OS === 'android' ? 80 : 40);
      });
    } else {
      run();
    }
    const focusName = name.split('.')[0];
    if (FOCUSABLE_FIELDS.has(focusName) || focusName === 'tasks' || focusName === 'extra_rules') {
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
    if (index !== STEP_SCORING && scoringEditorOpen) {
      closeScoringEditor();
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
      scoring: { step: STEP_SCORING, field: 'scoring_method' },
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
    if (step === STEP_SCORING && scoringEditorOpen) {
      saveScoringMethod();
      return;
    }
    if (step === STEP_RULES) {
      flushRulesDraftRef.current();
      stripBlankExtraRules();
      stripBlankExtraTasks();
      seedPointsTaskFromGoal();
      syncRuleActivityFromTask();
      if (!String(getValues('target_count') ?? '').trim()) {
        setValue('target_count', defaultRulesTargetCount(getValues('target_count')), {
          shouldDirty: false,
          shouldValidate: false,
        });
      }
      syncComposedRules();
      const rulesIssue = rulesStepBlockingIssue(getValues());
      if (rulesIssue) {
        setError(rulesIssue.field as FieldPath<CreateChallengeValues>, {
          type: 'validate',
          message: rulesIssue.message,
        });
        setFormError(rulesIssue.message);
        showBobIssue({ field: rulesIssue.field, step: STEP_RULES }, rulesIssue.message);
        return;
      }
      setReviewReturn(false);
      setStep(STEP_REVIEW);
      return;
    }
    if (reviewReturn && !lastStep) {
      if (step === STEP_GOAL) {
        stripBlankExtraTasks();
        syncRuleActivityFromTask();
      }
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
      if (step === STEP_GOAL) {
        stripBlankExtraTasks();
        syncRuleActivityFromTask();
      }
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
        const message = wizardBobOops('skill');
        setFormError(message);
        showBobIssue({ field: 'skill', step: STEP_REVIEW }, message);
        return;
      }
      await onPublish();
      return;
    }
    setStep((current) => nextCreateWizardStep(current, getValues(), scoringEditorOpen));
  }

  function goBack() {
    setFormError(null);
    clearBobError();
    if (step === STEP_SCORING && scoringEditorOpen) {
      closeScoringEditor();
      return;
    }
    if (reviewReturn && step !== STEP_REVIEW) {
      setReviewReturn(false);
      setStep(STEP_REVIEW);
      return;
    }
    if (step <= STEP_GOAL) {
      leaveWizard();
      return;
    }
    setStep((current) => prevCreateWizardStep(current, getValues(), scoringEditorOpen));
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
    skipSaveRef.current = true;
    router.dismissTo(dismissFallback);
  }

  function revealPublishIssue(issue: BobIssue, message: string) {
    setFormError(message);
    if (issue.step === STEP_REVIEW) {
      showBobIssue(issue, message);
      return;
    }
    setTimeout(() => {
      showBobIssue(issue, message);
    }, 120);
  }

  async function onPublish() {
    flushRulesDraftRef.current();
    stripBlankExtraRules();
    stripBlankExtraTasks();
    seedPointsTaskFromGoal();
    syncRuleActivityFromTask();
    if (!String(getValues('target_count') ?? '').trim()) {
      setValue('target_count', defaultRulesTargetCount(getValues('target_count')), {
        shouldDirty: false,
        shouldValidate: false,
      });
    }
    const rules = syncComposedRules();
    const formValues = { ...getValues(), rules };
    const parsed = createChallengeSchema.safeParse(formValues);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const message = first?.message || 'Check the red note and try again.';
      const root = typeof first?.path[0] === 'string' ? String(first.path[0]) : 'title';
      const name = (first?.path.join('.') || root) as FieldPath<CreateChallengeValues>;
      setError(name, { type: 'validate', message });
      revealPublishIssue({ field: root, step: wizardStepForField(root, formValues) }, message);
      return;
    }
    try {
      skipSaveRef.current = true;
      if (editId) {
        await update.mutateAsync({ challengeId: editId, values: { ...formValues, rules } });
        setBobError(null);
        router.replace(`/challenges/${editId}`);
        return;
      }
      const schedule = resolveStartForPublish({
        preset: startPreset,
        starts_at: formValues.starts_at,
        duration_days: formValues.duration_days || formValues.duration_value,
      });
      if (startPreset === 'custom') {
        const start = Date.parse(schedule.starts_at);
        if (Number.isFinite(start) && start <= Date.now()) {
          skipSaveRef.current = false;
          revealPublishIssue({ field: 'starts_at', step: STEP_DURATION }, copy('create.startFuture'));
          return;
        }
      }
      const challenge = await create.mutateAsync({
        ...formValues,
        ...schedule,
        rules,
        draft_id: draftId,
      });
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
  }

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
      onFieldFocus: (name) => {
        pendingAnchor.current = name;
        requestAnimationFrame(() => {
          setTimeout(
            () => scrollToAnchorRef.current(name),
            keyboardHeightRef.current > 0 ? 40 : 280,
          );
        });
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
            trailing={
              <View className="flex-row items-center gap-1">
                {isEditing ? null : (
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
                )}
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
          contentContainerStyle={{
            paddingBottom: tour?.createActive ? 220 : 24 + footerH,
          }}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          onScroll={(event) => {
            scrollY.current = event.nativeEvent.contentOffset.y;
            tour?.setCreateScrollY(event.nativeEvent.contentOffset.y);
          }}
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
              privacyMode={asPrivacyMode(values.privacy_mode, values.visibility, values.challenge_lane)}
              challengeLane={values.challenge_lane}
              extraTasks={values.extra_tasks ?? []}
              coverUrl={values.cover_image_url}
              isPoints={isPoints}
              onCategoryChange={onCategoryChange}
              onPrivacyChange={(next) => {
                setValue('privacy_mode', next.privacy_mode, { shouldValidate: true, shouldDirty: true });
                setValue('visibility', next.visibility, { shouldValidate: true, shouldDirty: true });
                setValue('discoverability', next.discoverability, { shouldDirty: true });
                if (next.privacy_mode === 'private_corporate') {
                  setValue('guarantee_enabled', false, { shouldDirty: true });
                }
              }}
              onExtraTasksChange={(extra_tasks) => setValue('extra_tasks', extra_tasks, { shouldDirty: true })}
              onCoverChange={(cover_image_url) =>
                setValue('cover_image_url', cover_image_url, { shouldDirty: true, shouldValidate: true })
              }
              onCoverClear={() => setValue('cover_image_url', '', { shouldDirty: true, shouldValidate: true })}
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
            startPreset={startPreset}
            durationDays={values.duration_value || values.duration_days || '7'}
            frequency={values.frequency}
              onDurationTypeChange={onDurationTypeChange}
              onFrequencyChange={onFrequencyChange}
              onScheduleChange={(patch, preset) => {
                if (preset) {
                  setStartPreset(preset);
                }
                applySchedule(patch);
              }}
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
          {step === STEP_SCORING ? (
            <ScoringMethodSlide
              config={usesComparablePoints ? comparableConfig : null}
              editorOpen={scoringEditorOpen}
              form={scoringForm}
              onConfigure={openScoringEditor}
              onEdit={openScoringEditor}
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
              guaranteeEnabled={values.guarantee_enabled !== false}
              privacyMode={asPrivacyMode(values.privacy_mode, values.visibility, values.challenge_lane)}
              onFundingChange={onFundingChange}
              onGuaranteeChange={(value) =>
                setValue('guarantee_enabled', value, { shouldValidate: true, shouldDirty: true })
              }
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
              isPoints={isPoints}
              isCumulative={isCumulative}
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
              isPoints={isPoints && !usesComparablePoints}
              isCumulative={isCumulative}
              isUnlimited={isUnlimited}
              onFrequencyChange={onFrequencyChange}
              onAddTask={addTask}
              onRemoveTask={removeTask}
              onEditGoal={() => {
                pendingAnchor.current = 'task';
                setReviewReturn(false);
                setStep(STEP_GOAL);
              }}
              registerFlush={(flush) => {
                flushRulesDraftRef.current = flush;
              }}
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

        <View
          onLayout={(event) => {
            const height = event.nativeEvent.layout.height;
            const chrome = Math.max(72, height - (keyboardHeightRef.current > 0 ? keyboardHeightRef.current : 0));
            setFooterH(chrome);
            footerDockHeight.current = chrome;
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
            paddingBottom: keyboardHeight > 0 ? Math.max(keyboardHeight, 8) : tabBarLift(insets.bottom, 'sticky') + 8,
          }}>
          {scoringToast ? (
            <View className="items-center">
              <View
                className="px-4 py-2.5"
                style={{
                  backgroundColor: THEME.primary,
                  borderRadius: 16,
                }}>
                <AppText className="text-[13px] font-semibold" style={{ color: THEME.primaryForeground }}>
                  {scoringToast}
                </AppText>
              </View>
            </View>
          ) : null}
          {formError ? (
            <AppText className="text-sm leading-5 text-coral-dark">{formError}</AppText>
          ) : null}
          <CreateActionsFooter
            onBack={goBack}
            onSaveDraft={() => void onSaveDraft()}
            onNext={() => void goNext()}
            nextTitle={
              step === STEP_SCORING && scoringEditorOpen
                ? 'Save scoring method'
                : lastStep
                  ? isEditing
                    ? copy('create.save')
                    : 'Publish'
                  : reviewReturn
                    ? copy('create.backToReview')
                    : 'Next'
            }
            nextLoading={lastStep && publishing}
            savePending={saveDraft.isPending}
            showSave={!isEditing && step >= STEP_GOAL}
            draftFlash={draftFlash}
          />
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
        <Stack.Screen options={{ headerShown: false, title: isEditing ? copy('create.editTitle') : 'Advanced' }} />
        {wizardBody}
      </View>
    );
  }

  return (
    <WizardModalShell onClose={closeWizard} bob={bob}>
      <Stack.Screen
        options={{
          title: isEditing ? copy('create.editTitle') : 'Advanced',
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
  privacyMode,
  challengeLane,
  extraTasks,
  coverUrl,
  isPoints,
  onCategoryChange,
  onPrivacyChange,
  onExtraTasksChange,
  onCoverChange,
  onCoverClear,
}: {
  control: ReturnType<typeof useForm<CreateChallengeValues>>['control'];
  errors: ReturnType<typeof useForm<CreateChallengeValues>>['formState']['errors'];
  category: CreateChallengeValues['category'];
  visibility: CreateChallengeValues['visibility'];
  privacyMode: PrivacyMode;
  challengeLane: CreateChallengeValues['challenge_lane'];
  extraTasks: CreateChallengeValues['extra_tasks'];
  coverUrl?: string | null;
  isPoints: boolean;
  onCategoryChange: (next: CreateChallengeValues['category']) => void;
  onPrivacyChange: (next: {
    privacy_mode: PrivacyMode;
    visibility: CreateChallengeValues['visibility'];
    discoverability: 'invite_only' | 'friends_of_friends' | null;
  }) => void;
  onExtraTasksChange: (next: NonNullable<CreateChallengeValues['extra_tasks']>) => void;
  onCoverChange: (url: string) => void;
  onCoverClear: () => void;
}) {
  const [privacyLockMessage, setPrivacyLockMessage] = useState<string | null>(null);
  const onTitleFocus = useWizardFieldFocus('title');
  const onDescriptionFocus = useWizardFieldFocus('description');
  const onTaskFocus = useWizardFieldFocus('task');
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
            onFocus={onTitleFocus}
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
            onFocus={onDescriptionFocus}
            error={errors.description?.message}
            multiline
            textAlignVertical="top"
            style={{ minHeight: 96 }}
          />
        )}
      />
      </FieldAnchor>
      <FieldAnchor name="cover_image_url">
        <ChallengePhotoField
          uri={coverUrl}
          error={errors.cover_image_url?.message}
          onChange={onCoverChange}
          onClear={onCoverClear}
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
              onFocus={onTaskFocus}
              error={errors.task?.message}
            />
          )}
        />
        {isPoints ? null : (
          <View className="mt-3">
            <ExtraTasksEditor
              tasks={extraTasks ?? []}
              onChange={onExtraTasksChange}
              onTitleFocus={onTaskFocus}
              hint={copy('create.addTaskHint')}
            />
          </View>
        )}
      </FieldAnchor>
      <FieldAnchor name="visibility">
        <PrivacyModePicker
          privacyMode={privacyMode}
          visibility={visibility}
          challengeLane={normalizeUserChallengeLane(challengeLane)}
          error={errors.visibility?.message ?? errors.privacy_mode?.message ?? privacyLockMessage ?? undefined}
          onChange={(next) => {
            setPrivacyLockMessage(null);
            onPrivacyChange(next);
          }}
          onLockedAttempt={setPrivacyLockMessage}
        />
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
                  pointsLocked || (isUnlimited && item.value === 'cumulative')
                    ? 'Last-man-standing uses Consistency so everyone is judged on staying eligible.'
                    : item.value === 'consistency'
                      ? 'Check in on a schedule. Hit the target to finish.'
                      : item.value === 'cumulative'
                        ? 'Add up distance. Everyone who hits the total splits the prize.'
                      : 'Earn points from a task list. Totals decide ranking.'
                }
                disabled={pointsLocked || (isUnlimited && item.value === 'cumulative')}
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
        <StepperField
          label="Days"
          value={days}
          min={1}
          max={MAX_CHALLENGE_DURATION_DAYS}
          onChange={(next) => onChange(String(next))}
        />
      ) : null}
    </View>
  );
}

function DurationSlide({
  control,
  errors,
  isUnlimited,
  startsAt,
  startPreset,
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
  startPreset: StartPreset;
  durationDays: string;
  frequency: ChallengeFrequency;
  onDurationTypeChange: (next: CreateChallengeValues['duration_type']) => void;
  onFrequencyChange: (next: ChallengeFrequency) => void;
  onScheduleChange: (patch: Partial<CreateChallengeValues>, preset?: StartPreset) => void;
}) {
  const onDurationFocus = useWizardFieldFocus('duration_value');
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
                onPress={() => onScheduleChange({ starts_at: inOneHour().toISOString() }, 'hour')}
              />
              <Chip
                label="Tomorrow morning"
                selected={startPreset === 'tomorrow'}
                onPress={() => onScheduleChange({ starts_at: tomorrowMorning().toISOString() }, 'tomorrow')}
              />
              <Chip
                label="Custom"
                selected={startPreset === 'custom'}
                onPress={() => onScheduleChange({}, 'custom')}
              />
            </ChipRow>
            <DateTimeField
              value={startsAt}
              error={errors.starts_at?.message}
              onChange={(iso) => onScheduleChange({ starts_at: iso }, 'custom')}
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
                label={frequency === 'weekly' ? 'Check-ins required each week' : 'Check-ins required each day'}
                placeholder={frequency === 'weekly' ? '5' : '1'}
                keyboardType="number-pad"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                onFocus={onDurationFocus}
                error={errors.target_count?.message}
                hint={
                  frequency === 'weekly'
                    ? 'Miss this many check-ins in a week and you’re out.'
                    : 'Daily last-man-standing is one successful check-in per day.'
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

function ScoringMethodSlide({
  config,
  editorOpen,
  form,
  onConfigure,
  onEdit,
}: {
  config: ReturnType<typeof parseComparablePointsConfig>;
  editorOpen: boolean;
  form: ReturnType<typeof useComparablePointsForm>;
  onConfigure: () => void;
  onEdit: () => void;
}) {
  return (
    <FieldAnchor name="scoring_method">
      <View className="gap-4">
        <View className="gap-1">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Scoring method
          </AppText>
          {editorOpen ? (
            <AppText className="text-[13px] leading-5 text-muted">
              Activities first, then optional rules, then shared parity.
            </AppText>
          ) : null}
        </View>
        {editorOpen ? (
          <ComparablePointsEditor form={form} />
        ) : (
          <ComparablePointsMethodCard config={config} onPress={config ? onEdit : onConfigure} />
        )}
      </View>
    </FieldAnchor>
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
  guaranteeEnabled,
  privacyMode,
  onFundingChange,
  onGuaranteeChange,
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
  guaranteeEnabled: boolean;
  privacyMode: PrivacyMode;
  onFundingChange: (next: FundingModel) => void;
  onGuaranteeChange: (next: boolean) => void;
  onCurrencyChange: (next: CreateChallengeValues['currency']) => void;
}) {
  const onContributionFocus = useWizardFieldFocus('creator_contribution');
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
              onFocus={onContributionFocus}
              error={errors.creator_contribution?.message ?? contributionShort ?? undefined}
              hint={`Taken from your wallet when you publish. You have ${formatWallet(walletCredits, currency)}.`}
            />
          )}
        />
        </FieldAnchor>
      ) : null}

      {isCreatorFunded ? (
        <FieldAnchor name="guarantee_enabled">
          <View className="flex-row items-center justify-between">
            <View className="mr-4" style={{ flexGrow: 1, flexShrink: 1, minWidth: 120 }}>
              <AppText className="font-semibold text-charcoal">{copy('create.guaranteePrize')}</AppText>
              <AppText className="mt-0.5 text-xs leading-5 text-muted">
                {privacyMode === 'private_corporate'
                  ? 'Off for Private Corporate unless you turn it on.'
                  : copy('create.guaranteePrizeHelp')}
              </AppText>
            </View>
            <Switch
              value={guaranteeEnabled}
              onValueChange={onGuaranteeChange}
              trackColor={{ true: COLORS.mintDark, false: COLORS.line }}
              thumbColor={COLORS.white}
              ios_backgroundColor={COLORS.line}
            />
          </View>
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
  isPoints,
  isCumulative,
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
  isPoints: boolean;
  isCumulative: boolean;
  onEntryTabChange: (next: EntryTab) => void;
  onCapChange: (value: CreateChallengeValues['participant_cap']) => void;
  onCreatorParticipatingChange: (value: boolean) => void;
}) {
  const onBuyInFocus = useWizardFieldFocus('buy_in');
  const onMaxFocus = useWizardFieldFocus('max_participants');
  const onMinFocus = useWizardFieldFocus('min_participants');
  const onMissesFocus = useWizardFieldFocus('misses_allowed');
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
            onFocus={onBuyInFocus}
            error={errors.buy_in?.message}
            hint="Each person pays this to participate. It goes into the prize. Leave before live and it comes back in full."
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
              onFocus={onMaxFocus}
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
              onFocus={onMinFocus}
              error={errors.min_participants?.message}
              hint="If fewer people have joined at start, it waits and the start moves to the next day."
            />
          )}
        />
      </FieldAnchor>
      {isPoints || isCumulative ? null : (
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
              onFocus={onMissesFocus}
              error={errors.misses_allowed?.message}
            />
          )}
        />
      </FieldAnchor>
      )}
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
        <View className="mr-4" style={{ flexGrow: 1, flexShrink: 1, minWidth: 120 }}>
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
          <AppText className="text-[15px] leading-6 text-charcoal" style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
            I confirm this is a contest of personal effort and skill. No gambling or chance-only stakes.
          </AppText>
        </Pressable>
      </FieldAnchor>
    </View>
  );
}
