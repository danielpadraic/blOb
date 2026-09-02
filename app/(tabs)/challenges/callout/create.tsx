import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { CreateIconChip } from '@/components/challenge/create/CreateIconChip';
import { SimpleProofsEditor } from '@/components/challenge/create/SimpleProofsEditor';
import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { WalletBalances } from '@/components/currency/WalletBalances';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AppText } from '@/components/ui/AppText';
import {
  profileName,
  useCallout,
  useCalloutOpponents,
  useCalloutProfiles,
  useCreateCallout,
  useMyCallouts,
} from '@/hooks/useCallouts';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import {
  CALLOUT_FORMATS,
  CALLOUT_PENDING_CAP_COPY,
  CALLOUT_TASK_PLACEHOLDER,
  CALLOUT_TITLE_PREFIX,
  calloutCreateBlocked,
  calloutFormatOf,
  calloutProofsForCreate,
  calloutRulesLine,
  calloutStatusLabel,
  calloutTask,
  calloutTaskOk,
  calloutTitle,
  deadlineFromPreset,
  filterCalloutPeople,
  type CalloutDeadlinePreset,
} from '@/lib/callouts';
import { CALLOUT_PROOF_CAP, defaultChallengeProofs, type ChallengeProof } from '@/lib/challengeProofs';
import { athleteDistanceUnit } from '@/lib/distance';
import type { CalloutFormat } from '@/lib/types';
import { normalizeCoinAmount, transferAmountError } from '@/lib/coins';
import { currencyNoun, formatWallet, formatWalletWithUsd, walletBalance } from '@/lib/currency';
import { THEME, themeShadow } from '@/lib/theme';
import type { PublicProfile, WalletCurrency } from '@/lib/types';
import { copy } from '@/lib/copy';

const CURRENCY_OPTIONS = [
  { value: 'coins', label: 'Coins' },
  { value: 'bucks', label: '$' },
] as const;

const DEADLINES: { id: CalloutDeadlinePreset; label: string }[] = [
  { id: '24h', label: '24 hours' },
  { id: '3d', label: '3 days' },
  { id: '7d', label: '7 days' },
];

export default function CreateCalloutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ username?: string; rematch?: string }>();
  const handle = Array.isArray(params.username) ? params.username[0] : params.username;
  const rematchId = Array.isArray(params.rematch) ? params.rematch[0] : params.rematch;
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const create = useCreateCallout();
  const mine = useMyCallouts();
  const rematch = useCallout(rematchId);
  const rematchPeople = useCalloutProfiles(rematch.data ?? null);
  const opponents = useCalloutOpponents();

  const [currency, setCurrency] = useState<WalletCurrency>('coins');
  const [query, setQuery] = useState('');
  const [opponent, setOpponent] = useState<PublicProfile | null>(null);
  const [task, setTask] = useState('');
  const [amountDraft, setAmountDraft] = useState('10');
  const [deadline, setDeadline] = useState<CalloutDeadlinePreset>('3d');
  const [format, setFormat] = useState<CalloutFormat>('consistency');
  const [proofs, setProofs] = useState<ChallengeProof[]>(() => defaultChallengeProofs());
  const [distanceUnit, setDistanceUnit] = useState(athleteDistanceUnit());
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [rematchReady, setRematchReady] = useState(false);

  const people = opponents.data ?? [];
  const visiblePeople = useMemo(() => filterCalloutPeople(people, query), [people, query]);
  const wallet = walletBalance(profile, currency);
  const amount = normalizeCoinAmount(amountDraft, currency);
  const amountIssue = transferAmountError(amount, wallet, currency);
  const noun = currencyNoun(currency);
  const amountLabel =
    currency === 'bucks' ? formatWalletWithUsd(amount, 'bucks') : formatWallet(amount, 'coins');
  const acks = currency === 'bucks' ? BUCKS_ACKS : COIN_ACKS;
  const allChecked = acks.every((item) => checked[item.id]);
  const title = calloutTitle(task);
  const winOk = calloutTaskOk(task);
  const capBlocked = calloutCreateBlocked(mine.data, user?.id);

  useEffect(() => {
    const row = rematch.data;
    if (!row || rematchReady) {
      return;
    }
    const otherId = user?.id === row.challenger_id ? row.opponent_id : row.challenger_id;
    const other = (rematchPeople.data ?? []).find((person) => person.id === otherId) ?? null;
    setTask(calloutTask(row.win_condition));
    setAmountDraft(String(row.stake_amount));
    setCurrency(row.currency === 'bucks' ? 'bucks' : 'coins');
    setFormat(calloutFormatOf(row.format));
    setProofs(calloutProofsForCreate(row.proofs));
    if (other) {
      setOpponent(other);
      setRematchReady(true);
      return;
    }
    if (rematchPeople.isFetched) {
      setRematchReady(true);
    }
  }, [rematch.data, rematchPeople.data, rematchPeople.isFetched, rematchReady, user?.id]);

  useEffect(() => {
    if (!handle || opponent) {
      return;
    }
    const found = people.find(
      (person) => person.username.toLowerCase() === handle.replace(/^@/, '').toLowerCase(),
    );
    if (found) {
      setOpponent(found);
    }
  }, [handle, opponent, people]);

  async function submit() {
    if (!opponent || amountIssue || !winOk || !allChecked || capBlocked || create.isPending) {
      return;
    }
    setError(null);
    try {
      const row = await create.mutateAsync({
        opponentId: opponent.id,
        amount,
        currency,
        winCondition: title,
        deadline: deadlineFromPreset(deadline),
        proofs: calloutProofsForCreate(proofs),
        format: calloutFormatOf(format),
      });
      router.replace(`/challenges/callout/${row.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Couldn’t send that Callout.');
    }
  }

  return (
    <Screen scroll>
      <AppText className="mb-1 text-[22px] font-bold text-charcoal">Call someone out</AppText>
      <AppText className="mb-4 text-muted">
        1-on-1. You’re in. Pick one person. Nothing leaves your wallet until they accept.
      </AppText>

      {profile ? <WalletBalances profile={profile} /> : null}

      <View className="mt-5">
        <AppText className="mb-2 text-sm font-semibold text-charcoal">You</AppText>
        <View
          className="flex-row items-center px-3 py-3"
          style={{
            backgroundColor: THEME.calloutSoft,
            borderColor: THEME.callout,
            borderWidth: 1,
            borderRadius: THEME.radius,
          }}>
          <Avatar uri={profile?.avatar_url} name={profileName(profile)} size={40} />
          <View className="ml-3 flex-1">
            <AppText className="font-semibold text-charcoal">{profileName(profile)}</AppText>
            <AppText className="text-sm text-muted">Challenger — always in</AppText>
          </View>
        </View>
      </View>

      <View className="mt-5">
        <AppText className="mb-2 text-sm font-semibold text-charcoal">Who</AppText>
        {opponent ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Change ${profileName(opponent)}`}
            onPress={() => setOpponent(null)}
            className="flex-row items-center px-3 py-3"
            style={{
              backgroundColor: THEME.surface,
              borderColor: THEME.border,
              borderWidth: 1,
              borderRadius: THEME.radius,
            }}>
            <Avatar uri={opponent.avatar_url} name={profileName(opponent)} size={40} />
            <View className="ml-3 flex-1">
              <AppText className="font-semibold text-charcoal">{profileName(opponent)}</AppText>
              <AppText className="text-sm text-muted">@{opponent.username}</AppText>
            </View>
            <AppText className="text-sm font-semibold" style={{ color: THEME.callout }}>
              Change
            </AppText>
          </Pressable>
        ) : (
          <>
            <Input
              label="Search"
              value={query}
              onChangeText={setQuery}
              placeholder="Name or username"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {opponents.isFetching ? (
              <ActivityIndicator className="mt-4" color={THEME.callout} />
            ) : (
              <PeopleList
                people={visiblePeople}
                empty={
                  people.length === 0
                    ? 'Add a friend or join a live challenge with them first.'
                    : copy('friends.noneMatch')
                }
                onPick={(person) => {
                  setOpponent(person);
                  setQuery('');
                }}
              />
            )}
          </>
        )}
      </View>

      <View className="mt-5">
        <AppText className="mb-2 text-sm font-semibold text-charcoal">Title</AppText>
        <View
          className="flex-row items-center px-3"
          style={{
            minHeight: 52,
            backgroundColor: THEME.surface,
            borderWidth: 1,
            borderColor: THEME.border,
            borderRadius: 12,
          }}>
          <AppText className="text-[16px] font-extrabold" style={{ color: THEME.callout }}>
            {CALLOUT_TITLE_PREFIX}
          </AppText>
          <TextInput
            value={task}
            onChangeText={setTask}
            placeholder={CALLOUT_TASK_PLACEHOLDER}
            placeholderTextColor={THEME.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              flex: 1,
              minWidth: 0,
              marginLeft: 8,
              minHeight: 44,
              fontSize: 16,
              color: THEME.textPrimary,
            }}
          />
        </View>
        <AppText className="mt-1.5 text-xs text-muted">Shows as {title}</AppText>
      </View>

      <View className="mt-5">
        <AppText className="mb-2 text-sm font-semibold text-charcoal">Stake currency</AppText>
        <SegmentedControl
          value={currency}
          options={CURRENCY_OPTIONS}
          onChange={(next) => {
            setCurrency(next);
            setChecked({});
            setError(null);
          }}
          accessibilityLabel="Callout currency"
        />
      </View>

      <View className="mt-5 gap-4">
        <Input
          label={`Stake each (${noun})`}
          value={amountDraft}
          onChangeText={setAmountDraft}
          placeholder="10"
          keyboardType="decimal-pad"
          hint={`Each of you puts in this amount. Prize is ${formatWallet(amount * 2, currency)}. You have ${formatWallet(wallet, currency)}. Held only after they accept.`}
          error={amountDraft.trim() && amountIssue ? amountIssue : undefined}
        />
        <View>
          <AppText className="mb-2 text-sm font-semibold text-charcoal">Duration</AppText>
          <ChipRow>
            {DEADLINES.map((item) => (
              <Chip
                key={item.id}
                label={item.label}
                selected={deadline === item.id}
                onPress={() => setDeadline(item.id)}
              />
            ))}
          </ChipRow>
        </View>
        <View>
          <AppText className="mb-2 text-sm font-semibold text-charcoal">Format</AppText>
          <View className="flex-row flex-wrap gap-2">
            {CALLOUT_FORMATS.map((item) => (
              <CreateIconChip
                key={item.value}
                icon=""
                label={item.label}
                selected={format === item.value}
                onPress={() => setFormat(item.value)}
              />
            ))}
          </View>
        </View>
        <SimpleProofsEditor
          proofs={proofs}
          onChange={setProofs}
          cap={CALLOUT_PROOF_CAP}
          distanceUnit={distanceUnit}
          onDistanceUnitChange={setDistanceUnit}
        />
      </View>

      {opponent && amount > 0 && winOk ? (
        <View className="mt-6">
          <View
            style={{
              backgroundColor: THEME.calloutSoft,
              borderColor: THEME.callout,
              borderWidth: 1.5,
              borderRadius: THEME.radius,
              padding: 16,
              ...themeShadow('card'),
            }}>
            <View
              style={{
                width: 4,
                position: 'absolute',
                left: 0,
                top: 14,
                bottom: 14,
                borderRadius: 2,
                backgroundColor: THEME.callout,
              }}
            />
            <AppText className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: THEME.callout }}>
              Callout
            </AppText>
            <AppText className="mt-1 text-[20px] font-extrabold text-charcoal">{title}</AppText>
            <View className="mt-3 flex-row items-center">
              <CurrencyMark currency={currency} size={32} />
              <View className="ml-2 flex-1">
                <AppText className="text-[16px] font-bold text-charcoal">{amountLabel} each</AppText>
                <AppText className="text-sm text-muted">
                  vs {profileName(opponent)}. Winner takes {formatWallet(amount * 2, currency)}.
                </AppText>
                <AppText className="mt-1 text-sm text-muted">
                  {calloutRulesLine({ proofs, format })}
                </AppText>
              </View>
            </View>
          </View>

          <AppText className="mt-5 mb-3 text-muted">
            {currency === 'bucks'
              ? 'Check all three. Real money. 1:1 with USD.'
              : 'Check all three before you send the Callout.'}
          </AppText>
          <View className="gap-3">
            {acks.map((item) => {
              const isOn = Boolean(checked[item.id]);
              return (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    setChecked((current) => ({ ...current, [item.id]: !current[item.id] }))
                  }
                  className="rounded-blob border px-4 py-3"
                  style={{
                    backgroundColor: THEME.surface,
                    borderColor: isOn ? THEME.callout : THEME.border,
                    borderWidth: 1.5,
                    borderRadius: THEME.radius,
                  }}>
                  <AppText className="font-semibold text-charcoal">{item.title}</AppText>
                  <AppText className="mt-1 text-sm leading-5 text-muted">
                    {item.body(amountLabel, profileName(opponent))}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {capBlocked ? (
        <AppText className="mt-4 text-sm leading-5 text-coral-dark">{CALLOUT_PENDING_CAP_COPY}</AppText>
      ) : error ? (
        <AppText className="mt-4 text-sm leading-5 text-coral-dark">{error}</AppText>
      ) : null}

      <View className="mt-6 gap-3">
        <Button
          title="Send Callout"
          size="lg"
          loading={create.isPending}
          disabled={!opponent || Boolean(amountIssue) || !winOk || !allChecked || capBlocked}
          onPress={() => void submit()}
        />
        <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
      </View>

      {(mine.data ?? []).length > 0 ? (
        <View className="mt-8">
          <AppText className="mb-2 text-[13px] font-semibold uppercase tracking-widest text-muted">
            Your Callouts
          </AppText>
          <View className="gap-2">
            {mine.data!.slice(0, 8).map((row) => (
              <Pressable
                key={row.id}
                onPress={() => router.push(`/challenges/callout/${row.id}`)}
                className="rounded-blob border px-4 py-3"
                style={{
                  backgroundColor: THEME.calloutSoft,
                  borderColor: THEME.border,
                  borderRadius: THEME.radius,
                }}>
                <AppText className="font-semibold text-charcoal">{calloutTitle(row.win_condition)}</AppText>
                <AppText className="mt-1 text-sm text-muted">
                  {formatWallet(row.stake_amount, row.currency)} each · {calloutStatusLabel(row.status)}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const COIN_ACKS = [
  {
    id: 'terms',
    title: 'You both have to accept these terms',
    body: (amount: string, name: string) =>
      `${name} must accept ${amount} each and the title before anything is held.`,
  },
  {
    id: 'hold',
    title: 'Stakes are held after they accept',
    body: () => 'Nothing leaves your wallet until they accept. Then both stakes are locked.',
  },
  {
    id: 'agree',
    title: 'Payout needs both of you',
    body: () => 'The prize pays only when you both name the same winner. Disagree and it stays disputed.',
  },
] as const;

const BUCKS_ACKS = [
  {
    id: 'amount',
    title: copy('money.realUsd'),
    body: (amount: string) => `${amount} each. 1:1 with USD.`,
  },
  {
    id: 'hold',
    title: '$ is deducted when they accept',
    body: () =>
      'When they accept, both stakes leave immediately and stay held until you both agree on a winner or both cancel.',
  },
  {
    id: 'irreversible',
    title: 'You cannot reverse a held stake alone',
    body: () =>
      'After accept, a refund needs both of you to cancel. A payout needs both of you to name the same winner.',
  },
] as const;

function PeopleList({
  people,
  empty,
  onPick,
}: {
  people: PublicProfile[];
  empty?: string;
  onPick: (profile: PublicProfile) => void;
}) {
  return (
    <View className="mt-4">
      {people.length === 0 ? (
        <AppText className="text-sm text-muted">{empty}</AppText>
      ) : (
        <View
          className="overflow-hidden"
          style={{
            borderRadius: THEME.radius,
            borderWidth: 1,
            borderColor: THEME.border,
            backgroundColor: THEME.surface,
          }}>
          {people.map((person, index) => {
            const name = profileName(person);
            return (
              <Pressable
                key={person.id}
                accessibilityRole="button"
                accessibilityLabel={`Call out ${name}`}
                onPress={() => onPick(person)}
                className="flex-row items-center px-3 py-3"
                style={{
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: THEME.border,
                  minHeight: 56,
                }}>
                <Avatar uri={person.avatar_url} name={name} size={40} />
                <View className="ml-3 flex-1">
                  <AppText className="font-semibold text-charcoal">{name}</AppText>
                  <AppText className="text-sm text-muted">@{person.username}</AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
