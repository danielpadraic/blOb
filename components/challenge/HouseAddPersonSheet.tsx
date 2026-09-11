import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { useFriends, usePeopleSearch } from '@/hooks/useSocial';
import { copy } from '@/lib/copy';
import {
  houseBuyInLabel,
  officialOpsAddError,
  type OfficialOpsBuyIn,
} from '@/lib/officialOps';
import { detectPeopleSearch } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import { THEME } from '@/lib/theme';
import type { PublicProfile } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

function personName(profile: PublicProfile): string {
  return profile.display_name?.trim() || profile.username;
}

export function HouseAddPersonSheet({
  visible,
  challengeId,
  disabled = false,
  hostMode = false,
  onClose,
}: {
  visible: boolean;
  challengeId: string;
  disabled?: boolean;
  hostMode?: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const friends = useFriends();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<PublicProfile | null>(null);
  const [buyIn, setBuyIn] = useState<OfficialOpsBuyIn>('house');
  const searching = Boolean(detectPeopleSearch(query));
  const peopleSearch = usePeopleSearch(query);
  const friendPeople = useMemo(
    () =>
      (friends.data ?? [])
        .map((row) => row.profile)
        .filter((profile): profile is PublicProfile => Boolean(profile)),
    [friends.data],
  );
  const visiblePeople = useMemo(() => {
    if (searching) {
      return peopleSearch.data ?? [];
    }
    return friendPeople;
  }, [friendPeople, peopleSearch.data, searching]);
  const listLoading = searching ? peopleSearch.isFetching : friends.isLoading;

  const add = useMutation({
    mutationFn: async () => {
      if (!picked) {
        throw new Error(copy('house.addFailed'));
      }
      const { error } = hostMode
        ? await supabase.rpc('host_add_participant', {
            p_challenge_id: challengeId,
            p_user_id: picked.id,
          })
        : await supabase.rpc('official_add_participant', {
            p_challenge_id: challengeId,
            p_user_id: picked.id,
            p_buy_in: buyIn,
          });
      if (error) {
        throw new Error(officialOpsAddError(getErrorMessage(error)));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['challenge-participants', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['feed', challengeId] });
      close();
    },
  });

  function close() {
    if (add.isPending) {
      return;
    }
    setQuery('');
    setPicked(null);
    setBuyIn('house');
    add.reset();
    onClose();
  }

  function send() {
    if (disabled || !picked || add.isPending) {
      return;
    }
    add.mutate();
  }

  return (
    <ChromeOverlay visible={visible} onClose={add.isPending ? undefined : close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          className="px-5 pb-8 pt-5"
          style={{
            backgroundColor: THEME.background,
            borderTopLeftRadius: THEME.radiusLg,
            borderTopRightRadius: THEME.radiusLg,
            maxHeight: 640,
          }}
          onPress={(event) => event.stopPropagation()}>
          <AppText className="text-2xl font-bold text-charcoal">
            {hostMode ? copy('create.addPerson') : copy('house.addPerson')}
          </AppText>
          {disabled ? (
            <AppText className="mt-3 text-sm text-coral-dark">{copy('house.settled')}</AppText>
          ) : null}
          {add.error ? (
            <AppText className="mt-3 text-sm text-coral-dark">
              {officialOpsAddError(getErrorMessage(add.error))}
            </AppText>
          ) : null}

          {!picked ? (
            <>
              <AppText className="mt-2 text-muted">{copy('house.searchHint')}</AppText>
              <View className="mt-3">
                <Input
                  value={query}
                  onChangeText={setQuery}
                  placeholder={copy('house.searchPlaceholder')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="search"
                />
              </View>
              {listLoading ? (
                <ActivityIndicator className="mt-4" color={THEME.accent} />
              ) : (
                <ScrollView
                  className="mt-3"
                  style={{ maxHeight: 280 }}
                  keyboardShouldPersistTaps="handled">
                  {visiblePeople.length === 0 ? (
                    <AppText className="py-4 text-muted">
                      {query.trim() ? 'No one matches that.' : 'Search for the person to add.'}
                    </AppText>
                  ) : (
                    visiblePeople.map((person) => (
                      <Pressable
                        key={person.id}
                        accessibilityRole="button"
                        accessibilityLabel={personName(person)}
                        onPress={() => {
                          setPicked(person);
                          add.reset();
                        }}
                        className="flex-row items-center"
                        style={{ minHeight: 44, gap: 10 }}>
                        <Avatar uri={person.avatar_url} name={personName(person)} size={32} />
                        <View className="min-w-0 flex-1">
                          <AppText className="text-[15px] font-semibold text-charcoal" numberOfLines={1}>
                            {personName(person)}
                          </AppText>
                          {person.username ? (
                            <AppText className="text-[12px] text-muted" numberOfLines={1}>
                              @{person.username}
                            </AppText>
                          ) : null}
                        </View>
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              )}
              <View className="mt-3">
                <Button title="Close" variant="ghost" onPress={close} />
              </View>
            </>
          ) : (
            <>
              <AppText className="mt-3 text-[16px] font-semibold text-charcoal">
                {personName(picked)}
              </AppText>
              <View className="mt-4 gap-1">
                {(hostMode ? (['charge'] as const) : (['charge', 'house', 'none'] as const)).map((mode) => (
                  <Pressable
                    key={mode}
                    accessibilityRole="button"
                    accessibilityState={{ selected: buyIn === mode }}
                    accessibilityLabel={houseBuyInLabel(mode)}
                    onPress={() => setBuyIn(mode)}
                    className="justify-center px-3"
                    style={{
                      minHeight: 44,
                      borderRadius: 14,
                      backgroundColor: buyIn === mode ? THEME.accentSoft : THEME.surface,
                      borderWidth: 1,
                      borderColor: buyIn === mode ? THEME.accent : THEME.border,
                    }}>
                    <AppText className="text-[15px] font-semibold text-charcoal">
                      {copy(
                        mode === 'charge' ? 'house.charge' : mode === 'house' ? 'house.covers' : 'house.none',
                      )}
                    </AppText>
                  </Pressable>
                ))}
              </View>
              <View className="mt-4 gap-2">
                <Button
                  title={copy('house.send')}
                  size="lg"
                  loading={add.isPending}
                  disabled={disabled}
                  onPress={send}
                />
                <Button
                  title="Back"
                  variant="ghost"
                  disabled={add.isPending}
                  onPress={() => setPicked(null)}
                />
              </View>
            </>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </ChromeOverlay>
  );
}
