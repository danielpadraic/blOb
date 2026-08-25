import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { useCreateGroupConversation, useFriends } from '@/hooks/useSocial';
import { conversationHref, directMessageHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import type { PublicProfile } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

type NewConversationModalProps = {
  visible: boolean;
  onClose: () => void;
};

function personName(profile: PublicProfile): string {
  return profile.display_name?.trim() || profile.username;
}

export function NewConversationModal({ visible, onClose }: NewConversationModalProps) {
  const router = useRouter();
  const friends = useFriends();
  const createGroup = useCreateGroupConversation();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const friendPeople = useMemo(
    () =>
      (friends.data ?? [])
        .map((row) => row.profile)
        .filter((profile): profile is PublicProfile => Boolean(profile)),
    [friends.data],
  );
  const visiblePeople = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return friendPeople;
    }
    return friendPeople.filter((person) => {
      const name = personName(person).toLowerCase();
      return name.includes(needle) || person.username.toLowerCase().includes(needle);
    });
  }, [friendPeople, query]);
  const selectedPeople = friendPeople.filter((person) => selected.has(person.id));
  const busy = createGroup.isPending;

  function close() {
    if (busy) {
      return;
    }
    setQuery('');
    setSelected(new Set());
    onClose();
  }

  function toggle(person: PublicProfile) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(person.id)) {
        next.delete(person.id);
      } else {
        next.add(person.id);
      }
      return next;
    });
  }

  function goFind() {
    close();
    router.push({ pathname: '/friends', params: { segment: 'search' } });
  }

  async function confirm() {
    if (selectedPeople.length === 0) {
      Alert.alert('Pick a friend', 'Select at least one friend to message.');
      return;
    }
    try {
      if (selectedPeople.length === 1) {
        const peerId = selectedPeople[0].id;
        setQuery('');
        setSelected(new Set());
        onClose();
        router.push(directMessageHref(peerId));
        return;
      }
      const conversation = await createGroup.mutateAsync(selectedPeople.map((person) => person.id));
      setQuery('');
      setSelected(new Set());
      onClose();
      router.push(conversationHref(conversation.id, { focus: true }));
    } catch (error) {
      Alert.alert('Couldn’t start that chat', getErrorMessage(error));
    }
  }

  const emptyFriends = !friends.isLoading && friendPeople.length === 0;

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
        <AppText className="text-xl font-bold text-charcoal">New message</AppText>
        <AppText className="mt-1 mb-4 text-muted">
          Pick one friend for a direct chat, or several for a group.
        </AppText>
        {emptyFriends ? (
          <View className="mb-2">
            <AppText className="text-[15px] font-semibold text-charcoal">Add a friend first</AppText>
            <AppText className="mt-1 text-[13px] text-muted">
              Messages go to accepted friends.
            </AppText>
            <View className="mt-3">
              <Button title="Find" onPress={goFind} />
            </View>
          </View>
        ) : (
          <>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search friends"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {friends.isLoading ? (
              <ActivityIndicator className="mt-4" color={THEME.accent} />
            ) : (
              <ScrollView
                className="mt-3"
                style={{ maxHeight: 320 }}
                keyboardShouldPersistTaps="handled">
                <PeopleList
                  people={visiblePeople}
                  selected={selected}
                  empty={query.trim() ? 'No friends match that.' : 'Add a friend first'}
                  onToggle={toggle}
                />
              </ScrollView>
            )}
            <View className="mt-4">
              <Button
                title={
                  selectedPeople.length > 1
                    ? `Start group · ${selectedPeople.length}`
                    : 'Start chat'
                }
                loading={busy}
                disabled={selectedPeople.length === 0}
                onPress={() => void confirm()}
              />
            </View>
          </>
        )}
        <View className="mt-2">
          <Button title="Close" variant="ghost" onPress={close} disabled={busy} />
        </View>
      </Pressable>
    </ChromeOverlay>
  );
}

function PeopleList({
  people,
  selected,
  empty,
  onToggle,
}: {
  people: PublicProfile[];
  selected: Set<string>;
  empty?: string;
  onToggle: (profile: PublicProfile) => void;
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
        const on = selected.has(person.id);
        return (
          <Pressable
            key={person.id}
            onPress={() => onToggle(person)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            className="flex-row items-center px-3 py-3"
            style={{
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: THEME.border,
              backgroundColor: on ? THEME.accentSoft : THEME.surface,
            }}>
            <Avatar uri={person.avatar_url} name={name} size={40} />
            <View className="ml-3 flex-1">
              <AppText className="font-semibold text-charcoal">{name}</AppText>
              <AppText className="text-sm text-muted">@{person.username}</AppText>
            </View>
            <View
              className="h-6 w-6 items-center justify-center rounded-full"
              style={{
                borderWidth: 1,
                borderColor: on ? THEME.accent : THEME.border,
                backgroundColor: on ? THEME.accent : THEME.surface,
              }}>
              {on ? (
                <AppText className="text-[12px] font-extrabold" style={{ color: THEME.primaryForeground }}>
                  ✓
                </AppText>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
