import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { useInviteToCircle } from '@/hooks/useCircles';
import { useFriends } from '@/hooks/useSocial';
import { copy } from '@/lib/copy';
import { personDisplayName } from '@/lib/social';
import { THEME } from '@/lib/theme';
import type { PublicProfile } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

export function CircleInviteSheet({
  visible,
  circleId,
  circleName,
  onClose,
  onSent,
}: {
  visible: boolean;
  circleId: string;
  circleName: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const friends = useFriends();
  const invite = useInviteToCircle(circleId, circleName);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [postToFeed, setPostToFeed] = useState(false);

  const people = useMemo(
    () =>
      (friends.data ?? [])
        .map((row) => row.profile)
        .filter((profile): profile is PublicProfile => Boolean(profile)),
    [friends.data],
  );
  const visiblePeople = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return people;
    }
    return people.filter((person) => {
      const name = personDisplayName(person).toLowerCase();
      return name.includes(needle) || person.username.toLowerCase().includes(needle);
    });
  }, [people, query]);

  function close() {
    if (invite.isPending) {
      return;
    }
    setQuery('');
    setSelected(new Set());
    setPostToFeed(false);
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

  async function send() {
    if (selected.size === 0) {
      Alert.alert('Pick a friend', 'Select at least one friend to invite.');
      return;
    }
    try {
      await invite.mutateAsync({
        inviteeIds: [...selected],
        postToFeed,
      });
      close();
      onSent?.();
    } catch (error) {
      Alert.alert('Couldn’t invite', getErrorMessage(error));
    }
  }

  return (
    <ChromeOverlay visible={visible} onClose={close} align="end">
      <View
        className="px-4 pt-4"
        style={{
          backgroundColor: THEME.background,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
          maxHeight: '80%',
          paddingBottom: 16,
        }}>
        <View className="mb-3 items-center">
          <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
        </View>
        <AppText className="text-[18px] font-extrabold text-charcoal">
          {copy('circles.inviteTitle')}
        </AppText>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder={copy('friends.searchPlaceholder')}
          autoCapitalize="none"
          style={{ marginTop: 12 }}
        />
        {friends.isLoading ? (
          <ActivityIndicator className="mt-4" color={THEME.circle} />
        ) : (
          <ScrollView style={{ marginTop: 12, maxHeight: 280 }} keyboardShouldPersistTaps="handled">
            {visiblePeople.length === 0 ? (
              <AppText className="py-6 text-center text-[13px] text-muted">
                Add a friend first, then invite them here.
              </AppText>
            ) : (
              visiblePeople.map((person) => {
                const on = selected.has(person.id);
                return (
                  <Pressable
                    key={person.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => toggle(person)}
                    className="flex-row items-center"
                    style={{ minHeight: 44, gap: 10, paddingVertical: 6 }}>
                    <Avatar uri={person.avatar_url} name={personDisplayName(person)} size={36} />
                    <AppText className="flex-1 text-[15px] font-semibold text-charcoal" numberOfLines={1}>
                      {personDisplayName(person)}
                    </AppText>
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        borderWidth: 2,
                        borderColor: on ? THEME.circle : THEME.border,
                        backgroundColor: on ? THEME.circle : THEME.surface,
                      }}
                    />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        )}
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: postToFeed }}
          onPress={() => setPostToFeed((current) => !current)}
          className="mt-3 flex-row items-center"
          style={{ minHeight: 44, gap: 10 }}>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: postToFeed ? THEME.circle : THEME.border,
              backgroundColor: postToFeed ? THEME.circle : THEME.surface,
            }}
          />
          <AppText className="text-[14px] font-semibold text-charcoal">
            {copy('circles.postToFriendsFeed')}
          </AppText>
        </Pressable>
        <View className="mt-3 gap-2">
          <Button
            title={copy('circles.sendInvites')}
            loading={invite.isPending}
            onPress={() => void send()}
          />
          <Button title="Close" variant="ghost" onPress={close} />
        </View>
      </View>
    </ChromeOverlay>
  );
}
