import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { DateTimeField } from '@/components/challenge/create/DateTimeField';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Stepper } from '@/components/ui/Stepper';
import { AppText } from '@/components/ui/AppText';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useCreateChallenge } from '@/hooks/useChallenge';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import {
  SIMPLE_DURATION_CHIPS,
  SIMPLE_FREQUENCY_CHIPS,
  SIMPLE_PROOF_CHIPS,
  SIMPLE_TYPES,
  defaultSimpleDraft,
  durationDaysOf,
  requiredCheckinsOf,
  simpleDraftToCreateValues,
  validateSimpleDraft,
  type SimpleChallengeDraft,
  type SimpleChallengeType,
  type SimpleCurrency,
  type SimpleDurationPreset,
  type SimpleFrequency,
  type SimpleProof,
  type SimpleVisibility,
} from '@/lib/simpleChallenge';
import { formatWallet, walletBalance } from '@/lib/currency';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

function IconChip({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
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
      {icon ? <AppText className="text-[14px]">{icon}</AppText> : null}
      <AppText
        className="text-sm font-semibold"
        style={{ color: selected ? THEME.accent : THEME.textPrimary }}>
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
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const create = useCreateChallenge();
  const [draft, setDraft] = useState<SimpleChallengeDraft>(() => defaultSimpleDraft());
  const [error, setError] = useState<string | null>(null);

  function patch(partial: Partial<SimpleChallengeDraft>) {
    setDraft((current) => ({ ...current, ...partial }));
    setError(null);
  }

  const days = durationDaysOf(draft);
  const checkins = requiredCheckinsOf(draft);
  const wallet = walletBalance(profile, draft.currency);
  const hostCost = draft.currency === 'bucks' ? Math.max(draft.host_budget, 0) : 0;
  const creatorBuyIn = draft.currency === 'coins' ? Math.max(draft.buy_in, 0) : 0;
  const needed = hostCost + creatorBuyIn;

  const costHint = useMemo(() => {
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
    if (!user) {
      setError('Sign in to create.');
      return;
    }
    try {
      const challenge = await create.mutateAsync(simpleDraftToCreateValues(draft));
      router.replace(`/challenges/${challenge.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <Screen scroll padded edges={TAB_ROOT_EDGES}>
      <View className="gap-5 pt-3">
        <AppText className="text-[22px] font-extrabold text-charcoal">New Challenge</AppText>

        <View className="gap-2">
          <SectionLabel>Currency</SectionLabel>
          <SegmentedControl
            accessibilityLabel="Currency"
            value={draft.currency}
            options={[
              { value: 'coins' as SimpleCurrency, label: 'Coins' },
              { value: 'bucks' as SimpleCurrency, label: 'Bucks' },
            ]}
            onChange={(value) =>
              patch({
                currency: value,
                buy_in: value === 'bucks' ? 0 : draft.buy_in,
                host_budget: value === 'coins' ? 0 : draft.host_budget || 10,
              })
            }
          />
          {draft.currency === 'bucks' ? (
            <View className="gap-2">
              <AppText className="text-sm text-muted">You fund the prize.</AppText>
              <View className="flex-row items-center justify-between">
                <AppText className="text-sm font-semibold text-charcoal">Host prize</AppText>
                <Stepper
                  accessibilityLabel="Host prize"
                  value={draft.host_budget}
                  min={1}
                  max={10_000}
                  onChange={(host_budget) => patch({ host_budget })}
                />
              </View>
            </View>
          ) : null}
        </View>

        <View className="gap-2">
          <SectionLabel>Type</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {SIMPLE_TYPES.map((item) => (
              <IconChip
                key={item.value}
                icon={item.icon}
                label={item.label}
                selected={draft.type === item.value}
                onPress={() =>
                  patch({
                    type: item.value as SimpleChallengeType,
                    task: draft.task || defaultTask(item.value),
                  })
                }
              />
            ))}
          </View>
        </View>

        <Input
          label="Title"
          placeholder="Morning miles"
          value={draft.title}
          onChangeText={(title) => patch({ title })}
          maxLength={80}
        />

        <Input
          label="Description"
          placeholder="Optional"
          value={draft.description}
          onChangeText={(description) => patch({ description })}
          maxLength={120}
        />

        <View className="gap-2">
          <SectionLabel>Start</SectionLabel>
          <DateTimeField
            value={draft.starts_at}
            minimumDate={new Date()}
            onChange={(starts_at) => patch({ starts_at })}
          />
        </View>

        <View className="gap-2">
          <SectionLabel>Duration</SectionLabel>
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
              <AppText className="text-sm font-semibold text-charcoal">Days</AppText>
              <Stepper
                accessibilityLabel="Duration days"
                value={draft.duration_days}
                min={1}
                max={365}
                onChange={(duration_days) => patch({ duration_days })}
              />
            </View>
          ) : null}
        </View>

        {draft.currency === 'coins' ? (
          <View className="gap-2">
            <SectionLabel>Buy-in</SectionLabel>
            <View className="flex-row items-center justify-between">
              <AppText className="text-sm font-semibold text-charcoal">Coins</AppText>
              <Stepper
                accessibilityLabel="Buy-in"
                value={draft.buy_in}
                min={0}
                max={10_000}
                step={5}
                onChange={(buy_in) => patch({ buy_in })}
              />
            </View>
          </View>
        ) : null}

        <Input
          label="Task"
          placeholder="Run 1 mile"
          value={draft.task}
          onChangeText={(task) => patch({ task })}
          maxLength={80}
        />

        <View className="gap-2">
          <SectionLabel>Frequency</SectionLabel>
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
            <View className="flex-row items-center justify-between">
              <AppText className="text-sm font-semibold text-charcoal">Check-ins</AppText>
              <Stepper
                accessibilityLabel="Custom check-ins"
                value={draft.custom_checkins}
                min={1}
                max={100}
                onChange={(custom_checkins) => patch({ custom_checkins })}
              />
            </View>
          ) : (
            <AppText className="text-[12px] text-muted">
              {checkins} check-in{checkins === 1 ? '' : 's'} · {days} day{days === 1 ? '' : 's'}
            </AppText>
          )}
        </View>

        <View className="gap-2">
          <SectionLabel>Proof</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {SIMPLE_PROOF_CHIPS.map((item) => (
              <IconChip
                key={item.value}
                icon={item.icon}
                label={item.label}
                selected={draft.proof_type === item.value}
                onPress={() => patch({ proof_type: item.value as SimpleProof })}
              />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <SectionLabel>Visibility</SectionLabel>
          <SegmentedControl
            accessibilityLabel="Visibility"
            value={draft.visibility}
            options={[
              { value: 'public' as SimpleVisibility, label: 'Public' },
              { value: 'friends' as SimpleVisibility, label: 'Friends' },
              { value: 'invite' as SimpleVisibility, label: 'Invite' },
            ]}
            onChange={(visibility) => patch({ visibility })}
          />
        </View>

        {error ? (
          <AppText className="text-sm text-coral-dark">{error}</AppText>
        ) : costHint ? (
          <AppText className="text-sm text-coral-dark">{costHint}</AppText>
        ) : null}

        <Button title="Create" loading={create.isPending} onPress={() => void onCreate()} />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/challenges/create?mode=advanced')}
          className="items-center py-2">
          <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
            Advanced
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

function defaultTask(type: SimpleChallengeType): string {
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
