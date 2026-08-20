import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { WalletBalances } from '@/components/currency/WalletBalances';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AppText } from '@/components/ui/AppText';
import { useCreateCallout, useMyCallouts, profileName } from '@/hooks/useCallouts';
import {
  useCoinRecipientSearch,
  useCoinRecipientSuggestions,
} from '@/hooks/useCoins';
import { useMyProfile } from '@/hooks/useProfile';
import {
  calloutStatusLabel,
  deadlineFromPreset,
  findProfileByUsername,
  type CalloutDeadlinePreset,
} from '@/lib/callouts';
import { normalizeCoinAmount, transferAmountError } from '@/lib/coins';
import { currencyNoun, formatWallet, formatWalletWithUsd, walletBalance } from '@/lib/currency';
import { THEME } from '@/lib/theme';
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
  const params = useLocalSearchParams<{ username?: string }>();
  const handle = Array.isArray(params.username) ? params.username[0] : params.username;
  const { profile } = useMyProfile();
  const create = useCreateCallout();
  const mine = useMyCallouts();
  const suggestions = useCoinRecipientSuggestions();

  const [currency, setCurrency] = useState<WalletCurrency>('coins');
  const [query, setQuery] = useState('');
  const [opponent, setOpponent] = useState<PublicProfile | null>(null);
  const [amountDraft, setAmountDraft] = useState('10');
  const [winCondition, setWinCondition] = useState('');
  const [deadline, setDeadline] = useState<CalloutDeadlinePreset>('3d');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const search = useCoinRecipientSearch(query);
  const wallet = walletBalance(profile, currency);
  const amount = normalizeCoinAmount(amountDraft);
  const amountIssue = transferAmountError(amount, wallet, currency);
  const noun = currencyNoun(currency);
  const amountLabel =
    currency === 'bucks' ? formatWalletWithUsd(amount, 'bucks') : formatWallet(amount, 'coins');
  const acks = currency === 'bucks' ? BUCKS_ACKS : COIN_ACKS;
  const allChecked = acks.every((item) => checked[item.id]);
  const winOk = winCondition.trim().length >= 3;

  useEffect(() => {
    if (!handle) {
      return;
    }
    void findProfileByUsername(handle)
      .then((found) => {
        if (found) {
          setOpponent(found);
        }
      })
      .catch(() => undefined);
  }, [handle]);

  const results = useMemo(() => {
    if (query.trim().length >= 2) {
      return search.data ?? [];
    }
    return [];
  }, [query, search.data]);

  async function submit() {
    if (!opponent || amountIssue || !winOk || !allChecked || create.isPending) {
      return;
    }
    setError(null);
    try {
      const row = await create.mutateAsync({
        opponentId: opponent.id,
        amount,
        currency,
        winCondition: winCondition.trim(),
        deadline: deadlineFromPreset(deadline),
      });
      router.replace(`/challenges/callout/${row.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Couldn’t send that call-out.');
    }
  }

  return (
    <Screen scroll>
      <AppText className="mb-1 text-[22px] font-bold text-charcoal">Call someone out</AppText>
      <AppText className="mb-4 text-muted">
        1-on-1. Both of you accept the terms. The prize pays only when you both name the same winner.
      </AppText>

      {profile ? <WalletBalances profile={profile} /> : null}

      <View className="mt-4">
        <AppText className="mb-2 text-sm font-semibold text-charcoal">Stake currency</AppText>
        <SegmentedControl
          value={currency}
          options={CURRENCY_OPTIONS}
          onChange={(next) => {
            setCurrency(next);
            setChecked({});
            setError(null);
          }}
          accessibilityLabel="Call-out currency"
        />
      </View>

      <View className="mt-5">
        {opponent ? (
          <Pressable
            onPress={() => setOpponent(null)}
            className="flex-row items-center rounded-blob border px-3 py-3"
            style={{
              backgroundColor: THEME.surface,
              borderColor: THEME.border,
              borderRadius: THEME.radius,
            }}>
            <Avatar uri={opponent.avatar_url} name={profileName(opponent)} size={40} />
            <View className="ml-3 flex-1">
              <AppText className="font-semibold text-charcoal">{profileName(opponent)}</AppText>
              <AppText className="text-sm text-muted">@{opponent.username}</AppText>
            </View>
            <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
              Change
            </AppText>
          </Pressable>
        ) : (
          <>
            <Input
              label="Who"
              value={query}
              onChangeText={setQuery}
              placeholder="Search a username"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.isFetching && query.trim().length >= 2 ? (
              <ActivityIndicator className="mt-4" color={THEME.accent} />
            ) : null}
            {query.trim().length >= 2 ? (
              <PeopleList
                title="Search"
                people={results}
                empty={copy('friends.noneMatch')}
                onPick={(person) => {
                  setOpponent(person);
                  setQuery('');
                }}
              />
            ) : (
              <PeopleList
                title="People you follow"
                people={suggestions.data?.following ?? []}
                onPick={setOpponent}
              />
            )}
          </>
        )}
      </View>

      <View className="mt-5 gap-4">
        <Input
          label={`Stake each (${noun})`}
          value={amountDraft}
          onChangeText={setAmountDraft}
          placeholder="10"
          keyboardType="decimal-pad"
          hint={`Each of you puts in this amount. Prize is ${formatWallet(amount * 2, currency)}. You have ${formatWallet(wallet, currency)}.`}
          error={amountDraft.trim() && amountIssue ? amountIssue : undefined}
        />
        <Input
          label="Win condition"
          value={winCondition}
          onChangeText={setWinCondition}
          placeholder="First to 5 miles, most points, etc."
          multiline
          hint="Both of you must later agree who met this."
        />
        <View>
          <AppText className="mb-2 text-sm font-semibold text-charcoal">Deadline</AppText>
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
      </View>

      {opponent && amount > 0 && winOk ? (
        <View className="mt-6">
          <Card>
            <View className="flex-row items-center">
              <CurrencyMark currency={currency} size={36} />
              <View className="ml-2 flex-1">
                <AppText className="text-sm font-semibold uppercase tracking-widest text-muted">
                  Terms
                </AppText>
                <AppText className="mt-1 text-[20px] font-bold text-charcoal">{amountLabel} each</AppText>
              </View>
            </View>
            <AppText className="mt-2 text-muted">
              vs {profileName(opponent)}. Winner takes {formatWallet(amount * 2, currency)}.
            </AppText>
          </Card>

          <AppText className="mt-5 mb-3 text-muted">
            {currency === 'bucks'
              ? 'Check all three. Real money. 1:1 with USD.'
              : 'Check all three before you send the call-out.'}
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
                    borderColor: isOn ? THEME.primary : THEME.border,
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

      {error ? (
        <AppText className="mt-4 text-sm leading-5 text-coral-dark">{error}</AppText>
      ) : null}

      <View className="mt-6 gap-3">
        <Button
          title="Send call-out"
          size="lg"
          loading={create.isPending}
          disabled={!opponent || Boolean(amountIssue) || !winOk || !allChecked}
          onPress={() => void submit()}
        />
        <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
      </View>

      {(mine.data ?? []).length > 0 ? (
        <View className="mt-8">
          <AppText className="mb-2 text-[13px] font-semibold uppercase tracking-widest text-muted">
            Your call-outs
          </AppText>
          <View className="gap-2">
            {mine.data!.slice(0, 8).map((row) => (
              <Pressable
                key={row.id}
                onPress={() => router.push(`/challenges/callout/${row.id}`)}
                className="rounded-blob border px-4 py-3"
                style={{
                  backgroundColor: THEME.surface,
                  borderColor: THEME.border,
                  borderRadius: THEME.radius,
                }}>
                <AppText className="font-semibold text-charcoal">
                  {formatWallet(row.stake_amount, row.currency)} each · {calloutStatusLabel(row.status)}
                </AppText>
                <AppText className="mt-1 text-sm text-muted" numberOfLines={2}>
                  {row.win_condition}
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
      `${name} must accept ${amount} each and the win condition before anything is held.`,
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
  title,
  people,
  empty,
  onPick,
}: {
  title: string;
  people: PublicProfile[];
  empty?: string;
  onPick: (profile: PublicProfile) => void;
}) {
  if (people.length === 0 && !empty) {
    return null;
  }
  return (
    <View className="mt-4">
      <AppText className="mb-2 text-[13px] font-semibold uppercase tracking-widest text-muted">
        {title}
      </AppText>
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
                onPress={() => onPick(person)}
                className="flex-row items-center px-3 py-3"
                style={{
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: THEME.border,
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
