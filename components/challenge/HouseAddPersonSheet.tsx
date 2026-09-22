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
import { useAuth } from '@/hooks/useAuth';
import { seedChallengeLivePost } from '@/hooks/useFeed';
import { useMyProfile } from '@/hooks/useProfile';
import { usePeopleSearch } from '@/hooks/useSocial';
import { copy } from '@/lib/copy';
import {
  houseAddLiveNote,
  houseAddLivePostRow,
  houseAddPeopleLabel,
  houseAddUnknownLine,
  personDisplayName,
  resolvePastedUsernames,
  seatOneHouseAdd,
} from '@/lib/houseAdd';
import { hostAdjustActorName } from '@/lib/hostAdjust';
import {
  houseBuyInLabel,
  officialOpsAddError,
  type OfficialOpsBuyIn,
} from '@/lib/officialOps';
import { sessionAuthor } from '@/lib/safeIds';
import { detectPeopleSearch } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import { THEME } from '@/lib/theme';
import type { PostWithMeta, PublicProfile } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

function togglePerson(list: PublicProfile[], person: PublicProfile): PublicProfile[] {
  if (list.some((row) => row.id === person.id)) {
    return list.filter((row) => row.id !== person.id);
  }
  return [...list, person];
}

export function HouseAddPersonSheet({
  visible,
  challengeId,
  challengeTitle,
  disabled = false,
  hostMode = false,
  onClose,
}: {
  visible: boolean;
  challengeId: string;
  challengeTitle?: string | null;
  disabled?: boolean;
  hostMode?: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const [query, setQuery] = useState('');
  const [paste, setPaste] = useState('');
  const [picked, setPicked] = useState<PublicProfile[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [alreadyNote, setAlreadyNote] = useState<string | null>(null);
  const [buyIn, setBuyIn] = useState<OfficialOpsBuyIn>('house');
  const searching = Boolean(detectPeopleSearch(query));
  const peopleSearch = usePeopleSearch(query);
  const visiblePeople = searching ? (peopleSearch.data ?? []) : [];
  const listLoading = searching && peopleSearch.isFetching;
  const title = challengeTitle?.trim() || 'this challenge';

  const add = useMutation({
    mutationFn: async () => {
      if (picked.length === 0) {
        throw new Error(copy('house.addFailed'));
      }
      const added: PublicProfile[] = [];
      let already = 0;
      for (const person of picked) {
        const result = await seatOneHouseAdd({
          challengeId,
          userId: person.id,
          hostMode,
          buyIn,
        });
        if (result === 'already') {
          already += 1;
          continue;
        }
        added.push(person);
      }
      return { added, already };
    },
    onSuccess: async ({ added, already }) => {
      if (already > 0) {
        setAlreadyNote(copy('house.alreadyIn'));
      } else {
        setAlreadyNote(null);
      }
      if (added.length > 0 && user?.id) {
        const content = houseAddLiveNote(
          hostAdjustActorName(profile),
          added.map((row) => personDisplayName(row)),
        );
        const payload = houseAddLivePostRow({
          authorId: user.id,
          challengeId,
          content,
        });
        const { data, error } = await supabase
          .from('posts')
          .insert(payload)
          .select('id, author_id, challenge_id, content, media_urls, created_at')
          .single();
        if (error) {
          console.warn('[blob:house-add] live note', error.message);
        }
        const row = (data ?? {
          id: `optimistic-house-add-${Date.now()}`,
          author_id: user.id,
          challenge_id: challengeId,
          content,
          media_urls: [],
          created_at: new Date().toISOString(),
        }) as PostWithMeta;
        seedChallengeLivePost(queryClient, challengeId, user.id, {
          ...row,
          author: sessionAuthor(profile, user.id) ?? undefined,
          comments: [],
          reactions: [],
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['challenge-participants', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['my-participation', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['feed', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-completions', challengeId] });
      if (added.length > 0) {
        close();
      }
    },
  });

  const pasteLookup = useMutation({
    mutationFn: async () => {
      if (!user?.id) {
        throw new Error(copy('house.addFailed'));
      }
      return resolvePastedUsernames(paste, user.id);
    },
    onSuccess: ({ found, unknown: missing }) => {
      setPicked((current) => {
        const next = [...current];
        for (const person of found) {
          if (!next.some((row) => row.id === person.id)) {
            next.push(person);
          }
        }
        return next;
      });
      setUnknown(missing);
      if (found.length > 0) {
        setPaste('');
      }
    },
  });

  const pickedIds = useMemo(() => new Set(picked.map((row) => row.id)), [picked]);

  function close() {
    if (add.isPending || pasteLookup.isPending) {
      return;
    }
    setQuery('');
    setPaste('');
    setPicked([]);
    setUnknown([]);
    setAlreadyNote(null);
    setBuyIn('house');
    add.reset();
    pasteLookup.reset();
    onClose();
  }

  function send() {
    if (disabled || picked.length === 0 || add.isPending) {
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
            maxHeight: 680,
          }}
          onPress={(event) => event.stopPropagation()}>
          <AppText className="text-2xl font-bold text-charcoal">{copy('house.addPeople')}</AppText>
          {disabled ? (
            <AppText className="mt-3 text-sm text-coral-dark">{copy('house.settled')}</AppText>
          ) : null}
          {add.error ? (
            <AppText className="mt-3 text-sm text-coral-dark">
              {officialOpsAddError(getErrorMessage(add.error))}
            </AppText>
          ) : null}
          {alreadyNote ? (
            <AppText className="mt-3 text-sm text-coral-dark">{alreadyNote}</AppText>
          ) : null}
          {unknown.length > 0 ? (
            <AppText className="mt-3 text-sm text-coral-dark">{houseAddUnknownLine(unknown)}</AppText>
          ) : null}

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
              style={{ maxHeight: 180 }}
              keyboardShouldPersistTaps="handled">
              {visiblePeople.length === 0 ? (
                <AppText className="py-4 text-muted">
                  {query.trim() ? 'No one matches that.' : 'Search for the person to add.'}
                </AppText>
              ) : (
                visiblePeople.map((person) => {
                  const selected = pickedIds.has(person.id);
                  return (
                    <Pressable
                      key={person.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={personDisplayName(person)}
                      onPress={() => {
                        setPicked((current) => togglePerson(current, person));
                        add.reset();
                        setAlreadyNote(null);
                      }}
                      className="flex-row items-center"
                      style={{ minHeight: 44, gap: 10 }}>
                      <Avatar uri={person.avatar_url} name={personDisplayName(person)} size={32} />
                      <View className="min-w-0 flex-1">
                        <AppText className="text-[15px] font-semibold text-charcoal" numberOfLines={1}>
                          {personDisplayName(person)}
                        </AppText>
                        {person.username ? (
                          <AppText className="text-[12px] text-muted" numberOfLines={1}>
                            @{person.username}
                          </AppText>
                        ) : null}
                      </View>
                      {selected ? (
                        <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
                          Added
                        </AppText>
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          )}

          <AppText className="mt-3 text-muted">{copy('house.pasteHint')}</AppText>
          <View className="mt-2">
            <Input
              value={paste}
              onChangeText={setPaste}
              placeholder={copy('house.pastePlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              grow
              growMaxLines={6}
            />
          </View>
          {paste.trim() ? (
            <View className="mt-2">
              <Button
                title={copy('house.pasteApply')}
                variant="ghost"
                loading={pasteLookup.isPending}
                disabled={add.isPending}
                onPress={() => pasteLookup.mutate()}
              />
            </View>
          ) : null}

          {picked.length > 0 ? (
            <View className="mt-3" style={{ gap: 6 }}>
              {picked.map((person) => (
                <Pressable
                  key={person.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${personDisplayName(person)}`}
                  onPress={() => setPicked((current) => current.filter((row) => row.id !== person.id))}
                  className="flex-row items-center"
                  style={{ minHeight: 36, gap: 8 }}>
                  <AppText className="flex-1 text-[14px] font-semibold text-charcoal" numberOfLines={1}>
                    {personDisplayName(person)}
                    {person.username ? `  @${person.username}` : ''}
                  </AppText>
                  <AppText className="text-[13px]" style={{ color: THEME.textMuted }}>
                    Remove
                  </AppText>
                </Pressable>
              ))}
            </View>
          ) : null}

          {!hostMode ? (
            <View className="mt-4 gap-1">
              {(['charge', 'house', 'none'] as const).map((mode) => (
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
          ) : null}

          <View className="mt-4 gap-2">
            <Button
              title={houseAddPeopleLabel(picked.length, title)}
              size="lg"
              loading={add.isPending}
              disabled={disabled || picked.length === 0}
              onPress={send}
            />
            <Button title="Close" variant="ghost" disabled={add.isPending} onPress={close} />
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </ChromeOverlay>
  );
}
