import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { DateTimeField } from '@/components/challenge/create/DateTimeField';
import { StackBackButton, useDismissTo } from '@/components/navigation/StackBackButton';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { useTourOptional } from '@/components/tour/TourContext';
import { Button } from '@/components/ui/Button';
import { Glyph, GLYPH, type GlyphId } from '@/components/ui/Glyph';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Stepper } from '@/components/ui/Stepper';
import { AppText } from '@/components/ui/AppText';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useCreateChallenge } from '@/hooks/useChallenge';
import { useCreateChallengeTour } from '@/hooks/useCreateChallengeTour';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { useWalletOptional } from '@/hooks/useWallet';
import {
  SIMPLE_CUSTOM_PERIODS,
  SIMPLE_DURATION_CHIPS,
  SIMPLE_FREQUENCY_CHIPS,
  SIMPLE_PROOF_METHODS,
  SIMPLE_TYPES,
  addSimpleProof,
  applyBeforeAfterHrPreset,
  clearPersistedSimpleDraft,
  customFrequencyCopy,
  defaultSimpleDraft,
  durationDaysOf,
  persistSimpleDraft,
  readPersistedSimpleDraft,
  removeSimpleProof,
  requiredCheckinsOf,
  simpleDraftToCreateValues,
  syncProofNameWithTask,
  validateSimpleDraft,
  type SimpleChallengeDraft,
  type SimpleChallengeType,
  type SimpleCurrency,
  type SimpleCustomPeriod,
  type SimpleDurationPreset,
  type SimpleFrequency,
  type SimpleVisibility,
} from '@/lib/simpleChallenge';
import { SIMPLE_PROOF_CAP, proofNameForMethodChange, type ChallengeProofMethod } from '@/lib/challengeProofs';
import { formatCash, formatWallet, walletBalance } from '@/lib/currency';
import { copy } from '@/lib/copy';
import { LOBBY_HREF, TABS_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';
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
        minHeight: 36,
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
    <AppText className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
      {children}
    </AppText>
  );
}

export function SimpleCreateForm() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string; funded?: string }>();
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const funded = Array.isArray(params.funded) ? params.funded[0] : params.funded;
  const { user } = useAuth();
  const { profile, refetch, isFetched } = useMyProfile();
  const walletSheet = useWalletOptional();
  const create = useCreateChallenge();
  const [draft, setDraft] = useState<SimpleChallengeDraft>(() => {
    const stored = readPersistedSimpleDraft();
    if (!stored) {
      return defaultSimpleDraft();
    }
    const base = defaultSimpleDraft();
    const start = new Date(stored.starts_at);
    const starts_at =
      Number.isNaN(start.getTime()) || start.getTime() <= Date.now() ? base.starts_at : stored.starts_at;
    return { ...base, ...stored, starts_at };
  });
  const [error, setError] = useState<string | null>(null);
  useDismissTo(returnTo === 'feed' ? TABS_HREF : LOBBY_HREF);
  useCreateChallengeTour('simple');
  const tour = useTourOptional();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    tour?.setCreateCurrency(draft.currency);
  }, [draft.currency, tour]);

  function patch(partial: Partial<SimpleChallengeDraft>) {
    setDraft((current) => {
      const next = { ...current, ...partial };
      persistSimpleDraft(next);
      return next;
    });
    setError(null);
  }

  useEffect(() => {
    if (funded !== '1' && draft.currency !== 'bucks') {
      return;
    }
    void refetch();
  }, [draft.currency, funded, refetch]);

  const days = durationDaysOf(draft);
  const checkins = requiredCheckinsOf(draft);
  const wallet = walletBalance(profile, draft.currency);
  const hostCost = draft.currency === 'bucks' ? Math.max(draft.host_budget, 0) : 0;
  const creatorBuyIn = draft.currency === 'coins' ? Math.max(draft.buy_in, 0) : 0;
  const needed = hostCost + creatorBuyIn;
  const poolShortfall =
    isFetched && draft.currency === 'bucks' && hostCost > 0 ? Math.max(hostCost - wallet, 0) : 0;

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

  async function onCreate() {
    const issue = validateSimpleDraft(draft) ?? costHint;
    if (issue) {
      setError(issue);
      return;
    }
    if (poolShortfall > 0) {
      setError(`Add ${formatCash(poolShortfall)}`);
      return;
    }
    if (!user) {
      setError(copy('create.signIn'));
      return;
    }
    try {
      const challenge = await create.mutateAsync(simpleDraftToCreateValues(draft));
      clearPersistedSimpleDraft();
      router.replace(`/challenges/${challenge.id}`);
    } catch (err) {
      setError(getCreateChallengeMessage(err));
    }
  }

  return (
    <Screen
      scroll
      padded
      edges={TAB_ROOT_EDGES}
      scrollRef={(node) => {
        scrollRef.current = node;
        tour?.setCreateScroll(node);
      }}
      onScroll={(event) => tour?.setCreateScrollY(event.nativeEvent.contentOffset.y)}
      contentPaddingBottom={tour?.createActive ? 220 : undefined}>
      <View className="gap-5 pt-1" pointerEvents={tour?.createActive ? 'none' : 'auto'}>
        <View className="flex-row items-center" style={{ marginHorizontal: -8 }}>
          <StackBackButton fallback={returnTo === 'feed' ? TABS_HREF : LOBBY_HREF} />
          <AppText className="flex-1 text-[22px] font-extrabold text-charcoal">
            {copy('create.screenTitle')}
          </AppText>
        </View>

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
            onChange={(value) =>
              patch({
                currency: value,
                buy_in: value === 'bucks' ? 0 : draft.buy_in,
                host_budget: value === 'coins' ? 0 : Math.max(draft.host_budget, 1),
                friends_of_friends: draft.visibility === 'invite' && value === 'coins',
              })
            }
          />
          {draft.currency === 'bucks' ? (
            <TourAnchor id="create-simple-buyin">
            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <AppText className="mr-3 flex-1 text-sm font-semibold text-charcoal">
                  {copy('create.totalPrizePool')}
                </AppText>
                <Stepper
                  accessibilityLabel={copy('create.totalPrizePool')}
                  value={draft.host_budget}
                  min={0}
                  max={10_000}
                  formatValue={formatCash}
                  onChange={(host_budget) => patch({ host_budget })}
                />
              </View>
              <AppText className="text-[13px] leading-5 text-muted">{copy('create.realMoneyFund')}</AppText>
              {poolShortfall > 0 ? (
                <View className="gap-2">
                  <AppText className="text-sm text-coral-dark">
                    Add {formatCash(poolShortfall)}
                  </AppText>
                  <Button
                    title={`Add ${formatCash(poolShortfall)}`}
                    onPress={() => {
                      persistSimpleDraft(draft);
                      walletSheet?.openTopUp({ amount: poolShortfall, returnCreate: true });
                    }}
                  />
                </View>
              ) : null}
            </View>
            </TourAnchor>
          ) : (
            <TourAnchor id="create-simple-buyin">
            <View className="flex-row items-center justify-between">
              <AppText className="text-sm font-semibold text-charcoal">{copy('create.buyIn')}</AppText>
              <Stepper
                accessibilityLabel={copy('create.buyIn')}
                value={draft.buy_in}
                min={0}
                max={10_000}
                onChange={(buy_in) => patch({ buy_in })}
              />
            </View>
            </TourAnchor>
          )}
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

        <Input
          label={copy('create.titleLabel')}
          placeholder={copy('create.titlePlaceholder')}
          value={draft.title}
          onChangeText={(title) => patch({ title })}
          maxLength={80}
        />

        <Input
          label={copy('create.descriptionLabel')}
          placeholder={copy('create.descriptionPlaceholder')}
          value={draft.description}
          onChangeText={(description) => patch({ description })}
          maxLength={120}
          numberOfLines={1}
        />

        <TourAnchor id="create-simple-start">
        <View className="gap-2">
          <SectionLabel>{copy('create.start')}</SectionLabel>
          <DateTimeField
            value={draft.starts_at}
            minimumDate={new Date()}
            onChange={(starts_at) => patch({ starts_at })}
          />
        </View>
        </TourAnchor>

        <TourAnchor id="create-simple-duration">
        <View className="gap-2">
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
            <View className="flex-row items-center justify-between">
              <AppText className="text-sm font-semibold text-charcoal">{copy('create.days')}</AppText>
              <Stepper
                accessibilityLabel={copy('create.days')}
                value={draft.duration_days}
                min={1}
                max={365}
                onChange={(duration_days) => patch({ duration_days })}
              />
            </View>
          ) : null}
        </View>
        </TourAnchor>

        <TourAnchor id="create-simple-task">
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
        </TourAnchor>

        <TourAnchor id="create-simple-frequency">
        <View className="gap-2">
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
              <View className="flex-row items-center justify-between">
                <AppText className="mr-3 flex-1 text-sm font-semibold text-charcoal">
                  {customFrequencyCopy(draft.custom_checkins, draft.custom_period)}
                </AppText>
                <Stepper
                  accessibilityLabel={customFrequencyCopy(draft.custom_checkins, draft.custom_period)}
                  value={draft.custom_checkins}
                  min={1}
                  max={100}
                  onChange={(custom_checkins) => patch({ custom_checkins })}
                />
              </View>
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
            <AppText className="text-[12px] text-muted">
              {checkins} · {days}
            </AppText>
          )}
        </View>
        </TourAnchor>

        <TourAnchor id="create-simple-proof">
        <View className="gap-2">
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
                              ? {
                                  ...row,
                                  method: item.value as ChallengeProofMethod,
                                  name: proofNameForMethodChange(row, item.value as ChallengeProofMethod),
                                }
                              : row,
                          ),
                        })
                      }
                    />
                  ))}
                </View>
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
        <View className="gap-2">
          <SectionLabel>{copy('create.visibility')}</SectionLabel>
          <SegmentedControl
            accessibilityLabel={copy('create.visibility')}
            value={draft.visibility}
            options={[
              { value: 'public' as SimpleVisibility, label: copy('create.public') },
              { value: 'friends' as SimpleVisibility, label: copy('create.friends') },
              { value: 'invite' as SimpleVisibility, label: copy('create.invite') },
            ]}
            onChange={(visibility) =>
              patch({
                visibility,
                friends_of_friends: visibility === 'invite' && draft.currency === 'coins',
              })
            }
          />
          {draft.visibility === 'invite' ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: draft.friends_of_friends }}
              accessibilityLabel={copy('create.friendsOfFriends')}
              onPress={() => patch({ friends_of_friends: !draft.friends_of_friends })}
              className="flex-row items-center justify-between"
              style={{ minHeight: 44 }}>
              <AppText className="mr-3 flex-1 text-[14px] leading-5 text-charcoal">
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

        <Button
          title={error ? 'Try again' : copy('create.submit')}
          loading={create.isPending}
          disabled={poolShortfall > 0}
          onPress={() => void onCreate()}
        />
        <TourAnchor id="create-simple-advanced">
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
        </TourAnchor>
      </View>
    </Screen>
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
