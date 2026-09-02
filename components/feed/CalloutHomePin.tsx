import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { CalloutFacePair } from '@/components/challenge/CalloutWatchers';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import {
  profileName,
  useAcceptCallout,
  useCalloutPinProfiles,
  useCancelCallout,
  useDeclineCallout,
  usePendingHomeCallouts,
} from '@/hooks/useCallouts';
import {
  calloutActiveChallengeHref,
  calloutTitle,
  calloutVsLine,
  isCalloutInviteExpired,
} from '@/lib/callouts';
import { THEME, themeShadow } from '@/lib/theme';
import type { Callout, PublicProfile } from '@/lib/types';

export function CalloutHomePin() {
  const { user } = useAuth();
  const router = useRouter();
  const pending = usePendingHomeCallouts();
  const people = useCalloutPinProfiles(pending.data);
  const accept = useAcceptCallout();
  const decline = useDeclineCallout();
  const cancel = useCancelCallout();
  const rows = pending.data;
  if (!user?.id || rows.length === 0) {
    return null;
  }
  const byId = new Map((people.data ?? []).map((row) => [row.id, row]));
  const busy = accept.isPending || decline.isPending || cancel.isPending;

  async function run(id: string, action: () => Promise<Callout>, openDetail: boolean) {
    try {
      const row = await action();
      if (openDetail) {
        router.push(calloutActiveChallengeHref(row) ?? `/challenges/callout/${id}`);
      }
    } catch {
      router.push(`/challenges/callout/${id}`);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      {rows.map((row) => (
        <CalloutPinRow
          key={row.id}
          callout={row}
          me={user.id}
          challenger={byId.get(row.challenger_id) ?? null}
          opponent={byId.get(row.opponent_id) ?? null}
          busy={busy}
          onOpen={() => router.push(`/challenges/callout/${row.id}`)}
          onAccept={() => void run(row.id, () => accept.mutateAsync(row.id), true)}
          onDecline={() => void run(row.id, () => decline.mutateAsync(row.id), false)}
          onCancel={() => void run(row.id, () => cancel.mutateAsync(row.id), false)}
        />
      ))}
    </View>
  );
}

function CalloutPinRow({
  callout,
  me,
  challenger,
  opponent,
  busy,
  onOpen,
  onAccept,
  onDecline,
  onCancel,
}: {
  callout: Callout;
  me: string;
  challenger: PublicProfile | null;
  opponent: PublicProfile | null;
  busy: boolean;
  onOpen: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
}) {
  const isOpponent = me === callout.opponent_id;
  const other = isOpponent ? challenger : opponent;
  const title = calloutTitle(callout.win_condition);
  const vsLine = calloutVsLine(profileName(other));
  const livePending = callout.status === 'pending' && !isCalloutInviteExpired(callout);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onOpen}
      style={{
        minHeight: 58,
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: THEME.calloutSoft,
        borderWidth: 1,
        borderColor: THEME.callout,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingRight: 8,
        paddingLeft: 10,
        ...themeShadow('card'),
      }}>
      <View
        style={{
          width: 3,
          alignSelf: 'stretch',
          marginVertical: 6,
          marginRight: 8,
          borderRadius: 2,
          backgroundColor: THEME.callout,
        }}
      />
      <CalloutFacePair
        left={{ name: profileName(challenger), avatarUrl: challenger?.avatar_url }}
        right={{ name: profileName(opponent), avatarUrl: opponent?.avatar_url }}
        size={32}
      />
      <View className="min-w-0 flex-1" style={{ paddingHorizontal: 10 }}>
        <AppText className="text-[15px] font-extrabold text-charcoal" numberOfLines={1}>
          {title}
        </AppText>
        <AppText className="text-[12px] text-muted" numberOfLines={1}>
          {vsLine || (isOpponent ? profileName(challenger) : profileName(opponent))}
        </AppText>
      </View>
      {livePending && isOpponent ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <PinButton label="Decline" muted disabled={busy} onPress={onDecline} />
          <PinButton label="Accept" disabled={busy} onPress={onAccept} />
        </View>
      ) : livePending ? (
        <PinButton label="Cancel" muted disabled={busy} onPress={onCancel} />
      ) : null}
    </Pressable>
  );
}

function PinButton({
  label,
  onPress,
  disabled,
  muted,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  muted?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={{
        minHeight: 36,
        minWidth: 64,
        paddingHorizontal: 10,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: muted ? THEME.surface : THEME.callout,
        opacity: disabled ? 0.45 : 1,
      }}>
      <AppText
        className="text-[13px] font-extrabold"
        style={{ color: muted ? THEME.textPrimary : THEME.primary }}>
        {label}
      </AppText>
    </Pressable>
  );
}
