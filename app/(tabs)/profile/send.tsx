import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { WalletBalances } from '@/components/currency/WalletBalances';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AppText } from '@/components/ui/AppText';
import {
  useCoinRecipientSearch,
  useCoinRecipientSuggestions,
  useTransferCoins,
} from '@/hooks/useCoins';
import { useMyProfile } from '@/hooks/useProfile';
import { useWallet } from '@/hooks/useWallet';
import { normalizeCoinAmount, transferAmountError } from '@/lib/coins';
import { copy } from '@/lib/copy';
import { currencyNoun, formatWallet, formatWalletWithUsd, walletBalance } from '@/lib/currency';
import { isOfficialAccount } from '@/lib/official';
import { THEME } from '@/lib/theme';
import type { PublicProfile, WalletCurrency } from '@/lib/types';
import { formatUsd } from '@/utils/format';

type Step = 'pick' | 'amount' | 'confirm';

const CURRENCY_OPTIONS = [
  { value: 'coins', label: 'Coins' },
  { value: 'bucks', label: 'Bucks $' },
] as const;

function personName(profile: PublicProfile): string {
  return profile.display_name?.trim() || profile.username;
}

export function SendCoinsPanel({ onClose }: { onClose: () => void }) {
  const { profile } = useMyProfile();
  const transfer = useTransferCoins();
  const suggestions = useCoinRecipientSuggestions();

  const [step, setStep] = useState<Step>('pick');
  const [currency, setCurrency] = useState<WalletCurrency>('coins');
  const [query, setQuery] = useState('');
  const [recipient, setRecipient] = useState<PublicProfile | null>(null);
  const [amountDraft, setAmountDraft] = useState('');
  const [note, setNote] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const search = useCoinRecipientSearch(query);
  const wallet = walletBalance(profile, currency);
  const amount = normalizeCoinAmount(amountDraft);
  const officialCoins = isOfficialAccount(profile) && currency === 'coins';
  const amountLabel =
    currency === 'bucks' ? formatWalletWithUsd(amount, 'bucks') : formatWallet(amount, 'coins');
  const amountIssue = transferAmountError(amount, wallet, currency, { unlimited: officialCoins });
  const recipientName = recipient ? personName(recipient) : '';
  const noun = currencyNoun(currency);
  const acks = currency === 'bucks' ? BUCKS_ACKS : COIN_ACKS;
  const allChecked = acks.every((item) => checked[item.id]);

  const results = useMemo(() => {
    if (query.trim().length >= 2) {
      return search.data ?? [];
    }
    return [];
  }, [query, search.data]);

  function pickRecipient(next: PublicProfile) {
    setRecipient(next);
    setQuery('');
    setError(null);
    setStep('amount');
  }

  function resetAcks() {
    setChecked({});
  }

  async function confirm() {
    if (!recipient || !allChecked || amountIssue || transfer.isPending) {
      return;
    }
    setError(null);
    try {
      await transfer.mutateAsync({
        recipientId: recipient.id,
        amount,
        currency,
        note: currency === 'coins' ? note : null,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Couldn’t send those ${noun}.`);
    }
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-5 pb-6 pt-4"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View className="mb-3 flex-row items-start">
        <View className="min-w-0 flex-1 pr-3">
          <AppText className="mb-1 text-[22px] font-bold text-charcoal">Send</AppText>
          <AppText className="mb-1 text-muted">
            Choose Coins or Bucks, then pick a recipient. Transfers are final.
          </AppText>
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close send"
          className="h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: THEME.surface, borderWidth: 1, borderColor: THEME.border }}>
          <AppText className="text-[18px] font-semibold text-muted">×</AppText>
        </Pressable>
      </View>

      {profile ? <WalletBalances profile={profile} /> : null}

      <View className="mt-4">
        <AppText className="mb-2 text-sm font-semibold text-charcoal">Currency</AppText>
        <SegmentedControl
          value={currency}
          options={CURRENCY_OPTIONS}
          onChange={(next) => {
            setCurrency(next);
            resetAcks();
            setError(null);
          }}
          accessibilityLabel="Send currency"
        />
      </View>

      {step !== 'pick' && recipient ? (
        <Pressable
          onPress={() => {
            setStep('pick');
            resetAcks();
            setError(null);
          }}
          className="mt-4 flex-row items-center rounded-blob border px-3 py-3"
          style={{
            backgroundColor: THEME.surface,
            borderColor: THEME.border,
            borderRadius: THEME.radius,
          }}>
          <Avatar uri={recipient.avatar_url} name={recipientName} size={40} />
          <View className="ml-3 flex-1">
            <AppText className="font-semibold text-charcoal">{recipientName}</AppText>
            <AppText className="text-sm text-muted">@{recipient.username}</AppText>
          </View>
          <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
            Change
          </AppText>
        </Pressable>
      ) : null}

      {step === 'pick' ? (
        <View className="mt-4">
          <Input
            label="Find someone"
            value={query}
            onChangeText={setQuery}
            placeholder="Search by username"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {search.isFetching && query.trim().length >= 2 ? (
            <ActivityIndicator className="mt-4" color={THEME.accent} />
          ) : null}
          {query.trim().length >= 2 ? (
            <PeopleList
              title="Search results"
              people={results}
              empty={copy('friends.noneMatch')}
              onPick={pickRecipient}
            />
          ) : (
            <>
              <PeopleList
                title="Recent"
                people={suggestions.data?.recent ?? []}
                onPick={pickRecipient}
              />
              <PeopleList
                title="People you follow"
                people={suggestions.data?.following ?? []}
                onPick={pickRecipient}
              />
            </>
          )}
        </View>
      ) : null}

      {step === 'amount' ? (
        <View className="mt-5 gap-4">
          <Input
            label={`Amount in ${noun}`}
            value={amountDraft}
            onChangeText={(value) => {
              setAmountDraft(value);
              setError(null);
            }}
            placeholder="0.00"
            keyboardType="decimal-pad"
            autoFocus
            hint={
              officialCoins
                ? copy('official.badge')
                : `You have ${formatWallet(wallet, currency)}${
                    currency === 'bucks' ? ` · 1 Buck = ${formatUsd(1)}` : ''
                  }`
            }
            error={amountDraft.trim() && amountIssue ? amountIssue : undefined}
          />
          <Button
            title="Continue"
            size="lg"
            disabled={Boolean(amountIssue) || amount <= 0}
            onPress={() => {
              resetAcks();
              setStep('confirm');
            }}
          />
          <Button title="Back" variant="ghost" onPress={() => setStep('pick')} />
        </View>
      ) : null}

      {step === 'confirm' && recipient ? (
        <View className="mt-5">
          <Card>
            <AppText className="text-sm font-semibold uppercase tracking-widest text-muted">
              You are sending
            </AppText>
            <View className="mt-2 flex-row items-center">
              <CurrencyMark currency={currency} size={36} />
              <AppText className="ml-2 text-[28px] font-bold text-charcoal">{amountLabel}</AppText>
            </View>
            <AppText className="mt-1 text-muted">
              to {recipientName} (@{recipient.username})
            </AppText>
          </Card>

          {currency === 'coins' ? (
            <View className="mt-4">
              <Input
                label="Note (optional)"
                value={note}
                onChangeText={setNote}
                placeholder="What’s this for?"
                autoCorrect
              />
            </View>
          ) : null}

          <AppText className="mt-5 mb-3 text-muted">
            {currency === 'bucks'
              ? `Check all three. ${amountLabel} leaves immediately. This cannot be reversed.`
              : officialCoins
                ? copy('official.sendConfirm')
                : `Check all three. ${noun} leave your wallet the moment you confirm. There is no undo.`}
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
                  <View className="flex-row items-start gap-3">
                    <View
                      className="mt-0.5 h-5 w-5 items-center justify-center rounded-md border"
                      style={{
                        backgroundColor: isOn ? THEME.primary : THEME.background,
                        borderColor: isOn ? THEME.primary : THEME.border,
                      }}>
                      {isOn ? (
                        <AppText
                          className="text-[11px] font-bold"
                          style={{ color: THEME.primaryForeground }}>
                          ✓
                        </AppText>
                      ) : null}
                    </View>
                    <View className="flex-1">
                      <AppText className="font-semibold text-charcoal">{item.title}</AppText>
                      <AppText className="mt-1 text-sm leading-5 text-muted">
                        {item.body(amountLabel, recipientName)}
                      </AppText>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {error ? (
            <AppText className="mt-4 text-sm leading-5 text-coral-dark">{error}</AppText>
          ) : null}

          <View className="mt-6 gap-3">
            <Button
              title={`Send ${amountLabel}`}
              size="lg"
              loading={transfer.isPending}
              disabled={!allChecked}
              onPress={() => void confirm()}
            />
            <Button
              title="Back"
              variant="ghost"
              disabled={transfer.isPending}
              onPress={() => {
                resetAcks();
                setStep('amount');
              }}
            />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

export default function SendFundsScreen() {
  const router = useRouter();
  const { openSend } = useWallet();

  useEffect(() => {
    openSend();
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/profile');
  }, [openSend, router]);

  return null;
}

const COIN_ACKS = [
  {
    id: 'amount',
    title: copy('money.leavesNow'),
    body: (amount: string, name: string) =>
      `${amount} will be deducted from your wallet and credited to ${name} the moment you confirm.`,
  },
  {
    id: 'immediate',
    title: copy('money.immediate'),
    body: () => 'There is no hold, delay, or pending state. Coins move as soon as you confirm.',
  },
  {
    id: 'irreversible',
    title: copy('money.irreversible'),
    body: () => 'Peer Coin sends cannot be undone. Double-check the recipient and amount.',
  },
] as const;

const BUCKS_ACKS = [
  {
    id: 'amount',
    title: copy('money.realUsd'),
    body: (amount: string, name: string) =>
      `${amount} will go to ${name}. 1 Blob Buck equals ${formatUsd(1)}.`,
  },
  {
    id: 'immediate',
    title: 'The amount is deducted immediately',
    body: () => 'There is no hold. Bucks leave your wallet the moment you confirm.',
  },
  {
    id: 'irreversible',
    title: copy('money.irreversible'),
    body: () => 'Peer Bucks sends cannot be undone. Double-check the recipient and amount.',
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
    <View className="mt-5">
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
            const name = personName(person);
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
