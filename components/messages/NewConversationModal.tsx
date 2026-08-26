import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import {
  useBlockedPeerIds,
  useCreateGroupConversation,
  useFriends,
  usePeopleSearch,
} from '@/hooks/useSocial';
import { copy } from '@/lib/copy';
import { canStartDirectChat } from '@/lib/dmOpen';
import { detectPeopleSearch } from '@/lib/social';
import { conversationHref, directMessageHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import type { PublicProfile } from '@/lib/types';
import { getDmOpenMessage, getErrorMessage } from '@/utils/errors';

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
  const blocked = useBlockedPeerIds();
  const createGroup = useCreateGroupConversation();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Map<string, PublicProfile>>(new Map());
  const searching = Boolean(detectPeopleSearch(query));
  const peopleSearch = usePeopleSearch(query);
  const blockedIds = blocked.data ?? new Set<string>();
  const friendPeople = useMemo(
    () =>
      (friends.data ?? [])
        .map((row) => row.profile)
        .filter((profile): profile is PublicProfile => Boolean(profile)),
    [friends.data],
  );
  const friendIds = useMemo(() => new Set(friendPeople.map((person) => person.id)), [friendPeople]);
  const visiblePeople = useMemo(() => {
    if (searching) {
      return peopleSearch.data ?? [];
    }
    return friendPeople;
  }, [friendPeople, peopleSearch.data, searching]);
  const selected = useMemo(() => new Set(picked.keys()), [picked]);
  const selectedPeople = useMemo(() => [...picked.values()], [picked]);
  const selectedBlocked = selectedPeople.some((person) => blockedIds.has(person.id));
  const groupReady =
    selectedPeople.length > 1 && selectedPeople.every((person) => friendIds.has(person.id));
  const directReady =
    selectedPeople.length === 1 &&
    canStartDirectChat({ blocked: blockedIds.has(selectedPeople[0].id) });
  const canConfirm = directReady || groupReady;
  const busy = createGroup.isPending;
  const listLoading = searching ? peopleSearch.isFetching : friends.isLoading;

  function close() {
    if (busy) {
      return;
    }
    setQuery('');
    setPicked(new Map());
    onClose();
  }

  function toggle(person: PublicProfile) {
    if (blockedIds.has(person.id)) {
      return;
    }
    setPicked((current) => {
      const next = new Map(current);
      if (next.has(person.id)) {
        next.delete(person.id);
      } else {
        next.set(person.id, person);
      }
      return next;
    });
  }

  async function confirm() {
    if (selectedBlocked || selectedPeople.length === 0) {
      return;
    }
    if (selectedPeople.length === 1 && !directReady) {
      return;
    }
    if (selectedPeople.length > 1 && !groupReady) {
      Alert.alert('Groups stay with friends', 'Pick accepted friends for a group, or one person for a chat.');
      return;
    }
    try {
      if (selectedPeople.length === 1) {
        const peerId = selectedPeople[0].id;
        setQuery('');
        setPicked(new Map());
        onClose();
        router.push(directMessageHref(peerId));
        return;
      }
      const conversation = await createGroup.mutateAsync(selectedPeople.map((person) => person.id));
      setQuery('');
      setPicked(new Map());
      onClose();
      router.push(conversationHref(conversation.id, { focus: true }));
    } catch (error) {
      Alert.alert(
        'Couldn’t start that chat',
        selectedPeople.length === 1 ? getDmOpenMessage(error) : getErrorMessage(error),
      );
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
        <AppText className="text-xl font-bold text-charcoal">New message</AppText>
        <AppText className="mt-1 mb-4 text-muted">{copy('messages.newHint')}</AppText>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder={copy('messages.searchPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {listLoading ? (
          <ActivityIndicator className="mt-4" color={THEME.accent} />
        ) : (
          <ScrollView
            className="mt-3"
            style={{ maxHeight: 320 }}
            keyboardShouldPersistTaps="handled">
            <PeopleList
              people={visiblePeople}
              selected={selected}
              blockedIds={blockedIds}
              empty={
                searching
                  ? query.trim()
                    ? 'Nobody matches that.'
                    : copy('messages.searchPlaceholder')
                  : 'Search by name or @username to start a chat.'
              }
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
            disabled={!canConfirm}
            onPress={() => void confirm()}
          />
        </View>
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
  blockedIds,
  empty,
  onToggle,
}: {
  people: PublicProfile[];
  selected: Set<string>;
  blockedIds: Set<string>;
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
        const isBlocked = blockedIds.has(person.id);
        const on = selected.has(person.id);
        return (
          <Pressable
            key={person.id}
            onPress={() => onToggle(person)}
            disabled={isBlocked}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled: isBlocked }}
            className="flex-row items-center px-3 py-3"
            style={{
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: THEME.border,
              backgroundColor: on ? THEME.accentSoft : THEME.surface,
              opacity: isBlocked ? 0.72 : 1,
            }}>
            <Avatar uri={person.avatar_url} name={name} size={40} />
            <View className="ml-3 flex-1">
              <AppText className="font-semibold text-charcoal">{name}</AppText>
              <AppText className="text-sm text-muted">
                @{person.username}
                {isBlocked ? ` · ${copy('messages.blockedState')}` : ''}
              </AppText>
            </View>
            {isBlocked ? (
              <AppText className="text-[12px] font-semibold" style={{ color: THEME.muted }}>
                {copy('messages.blockedState')}
              </AppText>
            ) : (
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
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
