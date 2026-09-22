import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useOfficialOps } from '@/hooks/useOfficialOps';
import { useFriends, usePeopleSearch } from '@/hooks/useSocial';
import {
  appointChallengeModerator,
  fetchChallengeModerators,
  removeChallengeModerator,
  viewerCanAppointModerators,
} from '@/lib/challengeMods';
import { copy } from '@/lib/copy';
import { challengeIsSettledForRigor } from '@/lib/hostRigor';
import { fetchPublicProfilesByIds, personDisplayName } from '@/lib/social';
import { THEME } from '@/lib/theme';
import type { Challenge, PublicProfile } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

type ChallengeModeratorsCardProps = {
  challenge: Challenge;
  participantIds: string[];
};

export function ChallengeModeratorsCard({ challenge, participantIds }: ChallengeModeratorsCardProps) {
  const { user } = useAuth();
  const officialOps = useOfficialOps().data === true;
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const mods = useQuery({
    queryKey: ['challenge-moderators', challenge.id, 'rows'],
    enabled: Boolean(challenge.id && user?.id),
    queryFn: () => fetchChallengeModerators(challenge.id),
  });
  const profiles = useQuery({
    queryKey: ['challenge-moderators', challenge.id, 'profiles', (mods.data ?? []).map((row) => row.user_id).join(',')],
    enabled: Boolean(mods.data && mods.data.length > 0),
    queryFn: () => fetchPublicProfilesByIds((mods.data ?? []).map((row) => row.user_id)),
  });
  const canAppoint = viewerCanAppointModerators({
    challenge,
    viewerId: user?.id,
    officialOps,
  });
  const canManage =
    Boolean(user?.id) &&
    !challengeIsSettledForRigor(challenge.status) &&
    (officialOps || challenge.created_by === user?.id);
  const competing = new Set(participantIds);
  const hostId = String(challenge.created_by ?? '').trim();
  const hostProfile = useQuery({
    queryKey: ['challenge-host-profile', challenge.id, hostId],
    enabled: Boolean(hostId),
    queryFn: async () => {
      const list = await fetchPublicProfilesByIds([hostId]);
      return list[0] ?? null;
    },
  });
  const rows = (mods.data ?? [])
    .filter((row) => row.user_id !== hostId)
    .map((row) => ({
      ...row,
      profile: profiles.data?.find((profile) => profile.id === row.user_id) ?? null,
    }));
  const canDemote =
    canManage || Boolean(user?.id && rows.some((row) => row.user_id === user.id));

  const remove = useMutation({
    mutationFn: (userId: string) => removeChallengeModerator(challenge.id, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['challenge-moderators', challenge.id] });
    },
    onError: (error) => {
      Alert.alert('Couldn’t remove', getErrorMessage(error));
    },
  });

  if (!hostId && !canAppoint && rows.length === 0) {
    return null;
  }

  const hostName = personDisplayName(hostProfile.data);
  return (
    <Card className="mt-4 gap-3">
      <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
        Admins
      </AppText>
      {hostId ? (
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <Avatar uri={hostProfile.data?.avatar_url} name={hostName} size={40} />
          <View className="min-w-0 flex-1">
            <AppText className="font-semibold text-charcoal" numberOfLines={1}>
              {hostName}
            </AppText>
            <AppText className="text-sm text-muted">Admin</AppText>
          </View>
        </View>
      ) : null}

      <AppText className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-muted">
        Moderators
      </AppText>
      {rows.length === 0 ? (
        <AppText className="text-sm leading-5 text-muted">No moderators yet.</AppText>
      ) : (
        <View className="gap-3">
          {rows.map((row) => {
            const name = personDisplayName(row.profile);
            return (
              <View key={row.user_id} className="flex-row items-center" style={{ gap: 10 }}>
                <Avatar uri={row.profile?.avatar_url} name={name} size={40} />
                <View className="min-w-0 flex-1">
                  <AppText className="font-semibold text-charcoal" numberOfLines={1}>
                    {name}
                  </AppText>
                  <AppText className="text-sm text-muted">Moderator</AppText>
                </View>
                {canDemote && row.user_id !== user?.id ? (
                  <Button
                    title={copy('mods.remove')}
                    variant="ghost"
                    size="sm"
                    loading={remove.isPending && remove.variables === row.user_id}
                    onPress={() => remove.mutate(row.user_id)}
                  />
                ) : canManage ? (
                  <Button
                    title={copy('mods.remove')}
                    variant="ghost"
                    size="sm"
                    loading={remove.isPending && remove.variables === row.user_id}
                    onPress={() => remove.mutate(row.user_id)}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      {canAppoint ? (
        <Button title={copy('mods.add')} variant="outline" onPress={() => setPickerOpen(true)} />
      ) : null}
      <AddModeratorSheet
        visible={pickerOpen}
        challengeId={challenge.id}
        excludeIds={[challenge.created_by, ...rows.map((row) => row.user_id)].filter(Boolean) as string[]}
        onClose={() => setPickerOpen(false)}
        onAppointed={() => {
          void queryClient.invalidateQueries({ queryKey: ['challenge-moderators', challenge.id] });
          setPickerOpen(false);
        }}
      />
    </Card>
  );
}

function AddModeratorSheet({
  visible,
  challengeId,
  excludeIds,
  onClose,
  onAppointed,
}: {
  visible: boolean;
  challengeId: string;
  excludeIds: string[];
  onClose: () => void;
  onAppointed: () => void;
}) {
  const { user } = useAuth();
  const friends = useFriends();
  const [query, setQuery] = useState('');
  const search = usePeopleSearch(query);
  const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);
  const friendPeople = useMemo(
    () =>
      (friends.data ?? [])
        .map((row) => row.profile)
        .filter((profile): profile is PublicProfile => Boolean(profile))
        .filter((profile) => profile.id !== user?.id && !exclude.has(profile.id)),
    [exclude, friends.data, user?.id],
  );
  const searched = useMemo(
    () => (search.data ?? []).filter((profile) => profile.id !== user?.id && !exclude.has(profile.id)),
    [exclude, search.data, user?.id],
  );
  const needle = query.trim().toLowerCase();
  const visibleFriends = useMemo(() => {
    if (!needle) {
      return friendPeople;
    }
    return friendPeople.filter((person) => {
      const name = personDisplayName(person).toLowerCase();
      return name.includes(needle) || person.username.toLowerCase().includes(needle);
    });
  }, [friendPeople, needle]);
  const extraSearch = needle.length >= 2 ? searched.filter((person) => !visibleFriends.some((row) => row.id === person.id)) : [];
  const appoint = useMutation({
    mutationFn: (userId: string) => appointChallengeModerator(challengeId, userId),
    onSuccess: onAppointed,
    onError: (error) => {
      Alert.alert('Couldn’t add', getErrorMessage(error));
    },
  });

  function close() {
    if (appoint.isPending) {
      return;
    }
    setQuery('');
    onClose();
  }

  function confirm(person: PublicProfile) {
    const name = personDisplayName(person);
    Alert.alert(copy('mods.add'), copy('mods.confirm', 'gentle', { name }), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Add',
        onPress: () => appoint.mutate(person.id),
      },
    ]);
  }

  return (
    <ChromeOverlay visible={visible} onClose={close}>
      <Pressable
        className="max-h-[88%] px-5 pt-4"
        style={{
          backgroundColor: THEME.background,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
          paddingBottom: 16,
        }}
        onPress={(event) => event.stopPropagation()}>
        <View className="mb-3 items-center">
          <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
        </View>
        <AppText className="text-xl font-bold text-charcoal">{copy('mods.add')}</AppText>
        <AppText className="mt-1 mb-4 text-muted">
          Friends first. Search @username for anyone on blOb. They do not have to Join.
        </AppText>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search friends or @username"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {friends.isLoading || search.isFetching ? (
          <ActivityIndicator className="mt-4" color={THEME.accent} />
        ) : (
          <ScrollView className="mt-3" style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
            <PeoplePickList
              people={visibleFriends}
              empty={needle ? 'No friends match that.' : 'Add a friend, or search @username.'}
              onPick={confirm}
            />
            {extraSearch.length > 0 ? (
              <View className="mt-4">
                <AppText className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
                  Search
                </AppText>
                <PeoplePickList people={extraSearch} onPick={confirm} />
              </View>
            ) : null}
          </ScrollView>
        )}
        <View className="mt-4">
          <Button title="Close" variant="ghost" onPress={close} disabled={appoint.isPending} />
        </View>
      </Pressable>
    </ChromeOverlay>
  );
}

function PeoplePickList({
  people,
  empty,
  onPick,
}: {
  people: PublicProfile[];
  empty?: string;
  onPick: (profile: PublicProfile) => void;
}) {
  if (people.length === 0) {
    return empty ? <AppText className="mt-2 text-sm text-muted">{empty}</AppText> : null;
  }
  return (
    <View
      className="overflow-hidden"
      style={{
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: THEME.border,
        backgroundColor: THEME.surface,
      }}>
      {people.map((person, index) => {
        const name = personDisplayName(person);
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
  );
}
