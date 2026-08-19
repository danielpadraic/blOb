import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { useCoinRecipientSearch, useCoinRecipientSuggestions } from '@/hooks/useCoins';
import { useInviteToChallenge } from '@/hooks/useNotifications';
import { useFriends } from '@/hooks/useSocial';
import { THEME } from '@/lib/theme';
import type { PublicProfile } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { copy } from '@/lib/copy';

type InviteToChallengeModalProps = {
  visible: boolean;
  challengeId: string;
  challengeTitle: string;
  onClose: () => void;
  friendsFirst?: boolean;
  onShareLink?: () => void;
  shareBusy?: boolean;
};

function personName(profile: PublicProfile): string {
  return profile.display_name?.trim() || profile.username;
}

export function InviteToChallengeModal({
  visible,
  challengeId,
  challengeTitle,
  onClose,
  friendsFirst = false,
  onShareLink,
  shareBusy = false,
}: InviteToChallengeModalProps) {
  const invite = useInviteToChallenge(challengeId);
  const suggestions = useCoinRecipientSuggestions();
  const friends = useFriends();
  const [query, setQuery] = useState('');
  const search = useCoinRecipientSearch(query);
  const results = useMemo(
    () => (query.trim().length >= 2 ? (search.data ?? []) : []),
    [query, search.data],
  );
  const friendPeople = useMemo(
    () =>
      (friends.data ?? [])
        .map((row) => row.profile)
        .filter((profile): profile is PublicProfile => Boolean(profile)),
    [friends.data],
  );
  const defaultPeople = friendsFirst
    ? friendPeople
    : (suggestions.data?.following ?? []);

  function close() {
    if (invite.isPending) {
      return;
    }
    setQuery('');
    onClose();
  }

  async function pick(person: PublicProfile) {
    try {
      await invite.mutateAsync(person.id);
      Alert.alert('Invite sent', `${personName(person)} will see this in Notifications.`);
      setQuery('');
      onClose();
    } catch (error) {
      Alert.alert('Couldn’t invite', getErrorMessage(error));
    }
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
          <AppText className="text-xl font-bold text-charcoal">Invite to {challengeTitle}</AppText>
          <AppText className="mt-1 mb-4 text-muted">
            {friendsFirst
              ? 'Pick a friend, or share the link. A small promise. Then you move.'
              : 'Search a username. They’ll get a notification with a link to this challenge.'}
          </AppText>
          {onShareLink ? (
            <View className="mb-4">
              <Button
                title="Share link"
                size="lg"
                variant="outline"
                loading={shareBusy}
                onPress={onShareLink}
              />
            </View>
          ) : null}
          <Input
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
          <View className="mt-3">
            {query.trim().length >= 2 ? (
              <PeopleList people={results} empty={copy('friends.noneMatch')} onPick={pick} />
            ) : (
              <PeopleList
                people={defaultPeople}
                empty={friendsFirst ? 'No friends yet. Share the link instead.' : undefined}
                onPick={pick}
              />
            )}
          </View>
          <View className="mt-4">
            <Button title="Close" variant="ghost" onPress={close} disabled={invite.isPending} />
          </View>
      </Pressable>
    </ChromeOverlay>
  );
}

function PeopleList({
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
  );
}
