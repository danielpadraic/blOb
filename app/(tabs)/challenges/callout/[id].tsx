import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { CalloutWatchers } from '@/components/challenge/CalloutWatchers';
import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { MascotState } from '@/components/mascot/MascotState';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import {
  profileName,
  useAcceptCallout,
  useCallout,
  useCalloutProfiles,
  useCancelCallout,
  useDeclineCallout,
  useSubmitCalloutResult,
} from '@/hooks/useCallouts';
import {
  calloutActiveChallengeHref,
  calloutStatusLabel,
  calloutTitle,
  isCalloutFighter,
} from '@/lib/callouts';
import { formatWallet, formatWalletWithUsd } from '@/lib/currency';
import { THEME } from '@/lib/theme';
import type { PublicProfile } from '@/lib/types';
import { formatDate } from '@/utils/format';

export default function CalloutDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { user } = useAuth();
  const query = useCallout(id);
  const callout = query.data;
  const people = useCalloutProfiles(callout);
  const accept = useAcceptCallout();
  const decline = useDeclineCallout();
  const submit = useSubmitCalloutResult();
  const cancel = useCancelCallout();

  const [acks, setAcks] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const isFighter = Boolean(callout && isCalloutFighter(callout, user?.id));
  const challengeHref = calloutActiveChallengeHref(callout, {
    tab: isFighter ? 'overview' : 'feed',
  });
  const bounceToChallenge = Boolean(challengeHref);

  useEffect(() => {
    if (bounceToChallenge && challengeHref) {
      router.replace(challengeHref as never);
    }
  }, [bounceToChallenge, challengeHref, router]);

  if (query.isLoading || bounceToChallenge) {
    return (
      <Screen>
        <MascotState
          kind="loading"
          title={bounceToChallenge ? 'Opening your Callout' : 'Loading Callout'}
        />
      </Screen>
    );
  }

  if (query.error || !callout) {
    return (
      <Screen>
        <MascotState
          kind="error"
          title="Couldn’t load that Callout"
          body={query.error instanceof Error ? query.error.message : 'It may have been removed.'}
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const byId = new Map((people.data ?? []).map((row) => [row.id, row]));
  const challenger = byId.get(callout.challenger_id) ?? null;
  const opponent = byId.get(callout.opponent_id) ?? null;
  const me = user?.id;
  const isChallenger = me === callout.challenger_id;
  const isOpponent = me === callout.opponent_id;
  const them = isChallenger ? opponent : challenger;
  const bucks = callout.currency === 'bucks';
  const stakeLabel = bucks
    ? formatWalletWithUsd(callout.stake_amount, 'bucks')
    : formatWallet(callout.stake_amount, 'coins');
  const pot = formatWallet(callout.stake_amount * 2, callout.currency);
  const myPick = isChallenger ? callout.challenger_pick : callout.opponent_pick;
  const theirPick = isChallenger ? callout.opponent_pick : callout.challenger_pick;
  const iAskedCancel = isChallenger
    ? Boolean(callout.challenger_cancel_at)
    : Boolean(callout.opponent_cancel_at);
  const theyAskedCancel = isChallenger
    ? Boolean(callout.opponent_cancel_at)
    : Boolean(callout.challenger_cancel_at);
  const acceptReady = Boolean(acks.amount && acks.immediate && acks.irreversible);
  const busy =
    accept.isPending || decline.isPending || submit.isPending || cancel.isPending;

  async function run(action: () => Promise<unknown>, openChallenge = false) {
    setError(null);
    try {
      const result = await action();
      if (openChallenge && result && typeof result === 'object') {
        const href = calloutActiveChallengeHref(
          result as { challenge_id?: string | null; status?: string },
          { tab: 'overview' },
        );
        if (href) {
          router.replace(href as never);
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That didn’t go through.');
    }
  }

  return (
    <Screen scroll>
      <View className="flex-row flex-wrap gap-2">
        {bucks ? (
          <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: '#1B7A4A' }}>
            <AppText className="text-[11px] font-bold" style={{ color: '#F4FFF6' }}>
              $
            </AppText>
          </View>
        ) : null}
        <Badge label={calloutStatusLabel(callout.status)} tone="charcoal" />
        {me && !isFighter ? <Badge label="Watching" tone="charcoal" /> : null}
      </View>

      <View className="mt-4 flex-row items-center">
        <CurrencyMark currency={callout.currency} size={44} />
        <View className="ml-3 flex-1">
          <AppText className="text-[22px] font-bold text-charcoal">
            {calloutTitle(callout.win_condition)}
          </AppText>
          <AppText className="text-muted">
            {stakeLabel} each · Winner takes {pot}
          </AppText>
        </View>
      </View>

      <View className="mt-5 flex-row gap-3">
        <PersonCard label="Challenger" profile={challenger} highlight={isChallenger} />
        <PersonCard label="Called out" profile={opponent} highlight={isOpponent} />
      </View>

      <CalloutWatchers callout={callout} me={me} isFighter={isFighter} />
      {!isFighter && callout.status !== 'pending' && callout.status !== 'cancelled' ? (
        <AppText className="mt-3 text-sm leading-5 text-muted">
          This Callout is live. Watching — no entry, no prize.
        </AppText>
      ) : null}

      <Card
        className="mt-4"
        style={{ backgroundColor: THEME.calloutSoft, borderColor: THEME.callout }}>
        <AppText className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: THEME.callout }}>
          Callout
        </AppText>
        <AppText className="mt-2 text-[16px] leading-6 text-charcoal">
          {calloutTitle(callout.win_condition)}
        </AppText>
        <AppText className="mt-3 text-sm text-muted">
          Deadline {formatDate(callout.deadline, 'MMM d, yyyy')}
        </AppText>
        {isFighter && callout.held ? (
          <AppText className="mt-2 text-sm text-muted">
            Stakes are held. They release when you both name the same winner, or both cancel.
          </AppText>
        ) : isFighter && callout.status === 'pending' ? (
          <AppText className="mt-2 text-sm text-muted">
            Nothing is held yet. Accepting deducts both stakes immediately.
          </AppText>
        ) : null}
      </Card>

      {callout.status === 'pending' && isOpponent && isFighter ? (
        <View className="mt-5 gap-3">
          {bucks ? (
            <>
              <AppText className="text-sm font-semibold text-charcoal">Real money confirmation</AppText>
              {[
                {
                  id: 'amount',
                  title: `${stakeLabel} is the real-money stake`,
                  body: `1:1 with USD. The prize stays in $.`,
                },
                {
                  id: 'immediate',
                  title: 'Both stakes leave now',
                  body: 'Accepting deducts your $ and theirs immediately. They stay held.',
                },
                {
                  id: 'irreversible',
                  title: 'You cannot reverse this alone',
                  body: 'A refund needs both of you to cancel. A payout needs both of you to name the same winner.',
                },
              ].map((item) => {
                const isOn = Boolean(acks[item.id]);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setAcks((current) => ({ ...current, [item.id]: !current[item.id] }))}
                    className="rounded-blob border px-4 py-3"
                    style={{
                      backgroundColor: THEME.surface,
                      borderColor: isOn ? THEME.primary : THEME.border,
                      borderWidth: 1.5,
                      borderRadius: THEME.radius,
                    }}>
                    <AppText className="font-semibold text-charcoal">{item.title}</AppText>
                    <AppText className="mt-1 text-sm leading-5 text-muted">{item.body}</AppText>
                  </Pressable>
                );
              })}
            </>
          ) : (
            <AppText className="text-sm leading-5 text-muted">
              Accepting holds {stakeLabel} from each of you until you both agree on a winner.
            </AppText>
          )}
          <Button
            title={`Accept for ${stakeLabel}`}
            size="lg"
            loading={accept.isPending}
            disabled={bucks ? !acceptReady : busy}
            onPress={() => void run(() => accept.mutateAsync(callout.id), true)}
          />
          <Button
            title="Decline"
            variant="outline"
            disabled={busy}
            onPress={() => void run(() => decline.mutateAsync(callout.id))}
          />
        </View>
      ) : null}

      {callout.status === 'pending' && isChallenger && isFighter ? (
        <View className="mt-5 gap-3">
          <AppText className="text-sm leading-5 text-muted">
            Waiting for {profileName(them)} to accept. You can cancel before they do — nothing is held yet.
          </AppText>
          <Button
            title="Cancel Callout"
            variant="outline"
            loading={cancel.isPending}
            onPress={() => void run(() => cancel.mutateAsync(callout.id))}
          />
        </View>
      ) : null}

      {isFighter &&
      (callout.status === 'active' || callout.status === 'resolving' || callout.status === 'disputed') ? (
        <View className="mt-5 gap-3">
          {callout.status === 'disputed' ? (
            <AppText className="text-sm leading-5 text-coral-dark">
              You named different winners. Pick again if you now agree, or cancel together to refund the stakes.
            </AppText>
          ) : myPick && !theirPick ? (
            <AppText className="text-sm leading-5 text-muted">
              You picked {pickName(myPick, challenger, opponent)}. Waiting for {profileName(them)}.
            </AppText>
          ) : (
            <AppText className="text-sm leading-5 text-muted">
              Who won? You both have to name the same person before the prize is released.
            </AppText>
          )}
          <Button
            title={`I won · ${pot}`}
            size="lg"
            disabled={busy || !me}
            loading={submit.isPending}
            onPress={() => me && void run(() => submit.mutateAsync({ id: callout.id, winnerId: me }))}
          />
          <Button
            title={`${profileName(them)} won`}
            variant="outline"
            disabled={busy || !them}
            onPress={() =>
              them && void run(() => submit.mutateAsync({ id: callout.id, winnerId: them.id }))
            }
          />
          <Button
            title={
              iAskedCancel
                ? theyAskedCancel
                  ? 'Cancelled'
                  : 'Waiting for them to cancel'
                : theyAskedCancel
                  ? 'Agree to cancel and refund'
                  : 'Request cancel / refund'
            }
            variant="ghost"
            disabled={busy || iAskedCancel}
            onPress={() => void run(() => cancel.mutateAsync(callout.id))}
          />
        </View>
      ) : null}

      {callout.status === 'settled' ? (
        <Card className="mt-5">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Result
          </AppText>
          <AppText className="mt-2 text-[18px] font-bold text-charcoal">
            {callout.winner_id === me ? 'You won' : `${pickName(callout.winner_id, challenger, opponent)} won`}
          </AppText>
          <AppText className="mt-1 text-muted">{pot} released.</AppText>
        </Card>
      ) : null}

      {callout.status === 'cancelled' ? (
        <AppText className="mt-5 text-sm leading-5 text-muted">
          This Callout was cancelled.{callout.held ? '' : ' No stakes were kept.'}
        </AppText>
      ) : null}

      {error ? (
        <AppText className="mt-4 text-sm leading-5 text-coral-dark">{error}</AppText>
      ) : null}
    </Screen>
  );
}

function pickName(
  id: string | null,
  challenger: PublicProfile | null,
  opponent: PublicProfile | null,
): string {
  if (!id) {
    return 'Someone';
  }
  if (challenger?.id === id) {
    return profileName(challenger);
  }
  if (opponent?.id === id) {
    return profileName(opponent);
  }
  return 'Someone';
}

function PersonCard({
  label,
  profile,
  highlight,
}: {
  label: string;
  profile: PublicProfile | null;
  highlight?: boolean;
}) {
  return (
    <Card className="flex-1" style={highlight ? { borderColor: THEME.callout } : undefined}>
      <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
        {label}
      </AppText>
      <View className="mt-2 flex-row items-center">
        <Avatar uri={profile?.avatar_url} name={profileName(profile)} size={36} />
        <AppText className="ml-2 flex-1 font-semibold text-charcoal" numberOfLines={1}>
          {profileName(profile)}
        </AppText>
      </View>
    </Card>
  );
}

