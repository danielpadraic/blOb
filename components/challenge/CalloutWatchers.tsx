import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import {
  profileName,
  useCalloutObserverCandidates,
  useCalloutObservers,
  useInviteCalloutObserver,
  useLeaveCalloutWatch,
} from '@/hooks/useCallouts';
import {
  CALLOUT_WATCHING_LINE,
  calloutWatchingCountLabel,
  fetchCalloutProfiles,
  filterCalloutPeople,
} from '@/lib/callouts';
import { THEME } from '@/lib/theme';
import type { Callout, PublicProfile } from '@/lib/types';

const FACE = 28;

export function CalloutLiveWatchChip({
  watching,
  count,
}: {
  watching: boolean;
  count: number;
}) {
  const countLabel = calloutWatchingCountLabel(count);
  if (!watching && !countLabel) {
    return null;
  }
  return (
    <View className="flex-row flex-wrap items-center" style={{ gap: 8, paddingTop: 8, paddingHorizontal: 16 }}>
      {watching ? (
        <View
          style={{
            backgroundColor: THEME.calloutSoft,
            borderColor: THEME.callout,
            borderWidth: 1,
            borderRadius: 14,
            minHeight: 28,
            paddingHorizontal: 10,
            justifyContent: 'center',
          }}>
          <AppText className="text-[12px] font-extrabold" style={{ color: THEME.callout }}>
            {CALLOUT_WATCHING_LINE}
          </AppText>
        </View>
      ) : null}
      {countLabel ? (
        <AppText className="text-[12px] font-semibold text-muted">{countLabel}</AppText>
      ) : null}
    </View>
  );
}

export function CalloutWatchers({
  callout,
  me,
  isFighter,
}: {
  callout: Callout;
  me?: string | null;
  isFighter: boolean;
}) {
  const observers = useCalloutObservers(callout.id);
  const rows = observers.data ?? [];
  const watchingIds = rows.map((row) => row.user_id);
  const faces = useObserverFaces(watchingIds);
  const isWatching = Boolean(me && watchingIds.includes(me));
  const [inviteOpen, setInviteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const candidates = useCalloutObserverCandidates(inviteOpen ? callout : null, watchingIds);
  const invite = useInviteCalloutObserver();
  const leave = useLeaveCalloutWatch();
  const visible = filterCalloutPeople(candidates.data ?? [], query);

  async function onInvite(person: PublicProfile) {
    setError(null);
    try {
      await invite.mutateAsync({ calloutId: callout.id, userId: person.id });
      setQuery('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Couldn’t invite that watcher.');
    }
  }

  async function onLeave() {
    setError(null);
    try {
      await leave.mutateAsync(callout.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Couldn’t leave.');
    }
  }

  return (
    <View className="mt-4">
      <View className="flex-row items-center" style={{ gap: 10, minHeight: 44 }}>
        <FacePile faces={faces} />
        <View className="min-w-0 flex-1">
          <AppText className="text-[13px] font-extrabold text-charcoal">
            Watching{watchingIds.length > 0 ? ` · ${watchingIds.length}` : ''}
          </AppText>
          <AppText className="text-[12px] text-muted">{CALLOUT_WATCHING_LINE}</AppText>
        </View>
        {isFighter ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Invite watchers"
            onPress={() => {
              setInviteOpen((open) => !open);
              setError(null);
              setQuery('');
            }}
            style={{
              minHeight: 36,
              paddingHorizontal: 12,
              borderRadius: 14,
              justifyContent: 'center',
              backgroundColor: THEME.surface2,
              borderWidth: 1,
              borderColor: THEME.border,
            }}>
            <AppText className="text-[13px] font-extrabold text-charcoal">
              {inviteOpen ? 'Done' : 'Invite watchers'}
            </AppText>
          </Pressable>
        ) : isWatching ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop watching"
            disabled={leave.isPending}
            onPress={() => void onLeave()}
            style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 }}>
            <AppText className="text-[13px] font-semibold text-muted">Stop</AppText>
          </Pressable>
        ) : null}
      </View>

      {inviteOpen && isFighter ? (
        <View className="mt-3">
          <Input
            label="Invite a friend"
            value={query}
            onChangeText={setQuery}
            placeholder="Name or username"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {candidates.isFetching ? (
            <ActivityIndicator className="mt-3" color={THEME.textMuted} />
          ) : visible.length === 0 ? (
            <AppText className="mt-3 text-sm text-muted">
              No one left to invite from your friends or live challenges.
            </AppText>
          ) : (
            <View
              className="mt-3 overflow-hidden"
              style={{
                borderRadius: THEME.radius,
                borderWidth: 1,
                borderColor: THEME.border,
                backgroundColor: THEME.surface,
              }}>
              {visible.map((person, index) => (
                <Pressable
                  key={person.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Invite ${profileName(person)} to watch`}
                  disabled={invite.isPending}
                  onPress={() => void onInvite(person)}
                  className="flex-row items-center px-3 py-3"
                  style={{
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: THEME.border,
                    minHeight: 56,
                    opacity: invite.isPending ? 0.55 : 1,
                  }}>
                  <Avatar uri={person.avatar_url} name={profileName(person)} size={36} />
                  <View className="ml-3 flex-1">
                    <AppText className="font-semibold text-charcoal">{profileName(person)}</AppText>
                    <AppText className="text-sm text-muted">@{person.username}</AppText>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : null}

      {error ? <AppText className="mt-2 text-sm text-coral-dark">{error}</AppText> : null}
    </View>
  );
}

function useObserverFaces(ids: string[]): PublicProfile[] {
  const key = [...ids].sort().join(',');
  const query = useQuery({
    queryKey: ['callout-profiles', 'watch', key],
    enabled: ids.length > 0,
    queryFn: () => fetchCalloutProfiles(ids),
  });
  return query.data ?? [];
}

function FacePile({ faces }: { faces: PublicProfile[] }) {
  if (faces.length === 0) {
    return (
      <View
        style={{
          width: FACE,
          height: FACE,
          borderRadius: FACE / 2,
          backgroundColor: THEME.surface2,
          borderWidth: 1,
          borderColor: THEME.border,
        }}
      />
    );
  }
  const shown = faces.slice(0, 5);
  return (
    <View style={{ flexDirection: 'row', width: FACE + (shown.length - 1) * 16 }}>
      {shown.map((face, index) => (
        <View
          key={face.id}
          style={{
            marginLeft: index === 0 ? 0 : -12,
            zIndex: shown.length - index,
            borderWidth: 1.5,
            borderColor: THEME.surface,
            borderRadius: FACE / 2,
          }}>
          <Avatar uri={face.avatar_url} name={profileName(face)} size={FACE} />
        </View>
      ))}
    </View>
  );
}
