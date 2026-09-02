import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import {
  profileName,
  useCalloutForChallenge,
  useCalloutProfiles,
  useCancelCallout,
  useSubmitCalloutResult,
} from '@/hooks/useCallouts';
import { calloutHonorNeeded, calloutRankedWinner, isCalloutFighter } from '@/lib/callouts';
import { formatWallet } from '@/lib/currency';
import { THEME } from '@/lib/theme';
import { useChallengeParticipants } from '@/hooks/useChallenge';

export function CalloutHonorCard({ challengeId }: { challengeId?: string | null }) {
  const { user } = useAuth();
  const query = useCalloutForChallenge(challengeId ?? undefined, Boolean(challengeId));
  const callout = query.data;
  const people = useCalloutProfiles(callout ?? null);
  const roster = useChallengeParticipants(challengeId ?? undefined);
  const submit = useSubmitCalloutResult();
  const cancel = useCancelCallout();

  if (!callout || !isCalloutFighter(callout, user?.id)) {
    return null;
  }
  if (!['active', 'resolving', 'disputed'].includes(callout.status)) {
    return null;
  }

  const seat = (userId: string) => {
    const row = (roster.data ?? []).find((item) => item.user_id === userId);
    return {
      id: userId,
      complete: (Number(row?.days_completed) || 0) > 0 || (Number(row?.points) || 0) > 0,
      days: Number(row?.days_completed) || 0,
      points: Number(row?.points) || 0,
    };
  };
  const rankInput = {
    format: callout.format,
    disputed: callout.status === 'disputed',
    challenger: seat(callout.challenger_id),
    opponent: seat(callout.opponent_id),
  };
  const rankedId = calloutRankedWinner(rankInput);
  const honorOpen = calloutHonorNeeded(rankInput);

  const byId = new Map((people.data ?? []).map((row) => [row.id, row]));
  const challenger = byId.get(callout.challenger_id) ?? null;
  const opponent = byId.get(callout.opponent_id) ?? null;
  const me = user?.id;
  const isChallenger = me === callout.challenger_id;
  const them = isChallenger ? opponent : challenger;
  const pot = formatWallet(callout.stake_amount * 2, callout.currency);
  const myPick = isChallenger ? callout.challenger_pick : callout.opponent_pick;
  const theirPick = isChallenger ? callout.opponent_pick : callout.challenger_pick;
  const iAskedCancel = isChallenger
    ? Boolean(callout.challenger_cancel_at)
    : Boolean(callout.opponent_cancel_at);
  const theyAskedCancel = isChallenger
    ? Boolean(callout.opponent_cancel_at)
    : Boolean(callout.challenger_cancel_at);
  const busy = submit.isPending || cancel.isPending;
  const themName = profileName(them);

  return (
    <Card
      className="mt-3"
      style={{ backgroundColor: THEME.calloutSoft, borderColor: THEME.callout }}>
      <AppText className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: THEME.callout }}>
        Callout
      </AppText>
      {callout.status === 'disputed' ? (
        <AppText className="mt-2 text-sm leading-5 text-coral-dark">
          You named different winners. Pick again if you now agree, or cancel together to refund the stakes.
        </AppText>
      ) : rankedId ? (
        <AppText className="mt-2 text-sm leading-5 text-muted">
          You both submitted proof. The board already has a winner.
        </AppText>
      ) : myPick && !theirPick ? (
        <AppText className="mt-2 text-sm leading-5 text-muted">
          You picked. Waiting for {themName}.
        </AppText>
      ) : (
        <AppText className="mt-2 text-sm leading-5 text-muted">
          Who won? You both have to name the same person before the prize is released.
        </AppText>
      )}
      <View className="mt-3 gap-2">
        {rankedId && honorOpen === false ? (
          <Button
            title={`Release prize · ${pot}`}
            size="lg"
            disabled={busy}
            loading={submit.isPending}
            onPress={() => void submit.mutateAsync({ id: callout.id, winnerId: rankedId })}
          />
        ) : null}
        {honorOpen ? (
          <>
        <Button
          title={`I won · ${pot}`}
          size="lg"
          disabled={busy || !me}
          loading={submit.isPending}
          onPress={() => me && void submit.mutateAsync({ id: callout.id, winnerId: me })}
        />
        <Button
          title={`${themName} won`}
          variant="outline"
          disabled={busy || !them}
          onPress={() =>
            them && void submit.mutateAsync({ id: callout.id, winnerId: them.id })
          }
        />
          </>
        ) : null}
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
          onPress={() => void cancel.mutateAsync(callout.id)}
        />
      </View>
    </Card>
  );
}
