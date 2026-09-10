import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Composer } from '@/components/feed/Composer';
import { LiftCompletedCard } from '@/components/lift/LiftCompletedCard';
import { LiftRecapCard } from '@/components/lift/LiftRecapCard';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { useKeyboardHeight } from '@/components/ui/KeyboardFormShell';
import { useAuth } from '@/hooks/useAuth';
import { useMyCircles } from '@/hooks/useCircles';
import type { LoggableChallenge } from '@/hooks/useLoggableChallenge';
import {
  useBlockedPeerIds,
  useFriends,
  useGetOrCreateConversation,
  useSendMessage,
} from '@/hooks/useSocial';
import { buildCompletedCard } from '@/lib/lift/complete';
import { buildRecap } from '@/lib/lift/recap';
import { draftSummary } from '@/lib/lift/session';
import { postShareUrl } from '@/lib/postShare';
import { DEFAULT_POST_AUDIENCE, type PostAudience } from '@/lib/postAudience';
import type { LiftSessionDraft } from '@/lib/lift/types';
import type { ComposeInput, PublicProfile } from '@/lib/types';
import {
  liftShareFooterPad,
  liftShareKeyboardOpen,
  liftShareNameMatches,
} from '@/lib/liftShareInset';
import { asIdSet } from '@/lib/ids';
import { searchPeople } from '@/lib/social';
import { THEME } from '@/lib/theme';

/**
 * Where a finished lift goes.
 *
 * This is a destination picker, not an editor — it never reopens the session. The card it publishes
 * is a snapshot plus a session id, and anyone who receives it copies rather than edits.
 *
 * Message sends the card to named people only: a specific-audience card kept off Home, plus the
 * link in a DM. That is what makes the session readable to them without putting it in front of
 * everyone. Live puts it on the check-in a challenge already keeps for this period rather than
 * publishing a second post. Home is a plain card.
 *
 * The caption is whatever they typed. An empty caption stays empty; the app does not write
 * "Daniel crushed chest" on anyone's behalf.
 */

export type LiftShareDestination = 'message' | 'home' | 'live';

export type LiftShareChoice = {
  destination: LiftShareDestination;
  caption: string;
  /** The challenge to attach to, or null for a Home-only card. */
  challengeId: string | null;
  /** The Circle room to post in. Never set alongside a challenge. */
  circleId: string | null;
  home: boolean;
  audience: PostAudience;
  /** Message only: who the card is addressed to. Several people become one group thread. */
  recipientIds: string[];
};

type LiftShareSheetProps = {
  visible: boolean;
  draft: LiftSessionDraft | null;
  /** Active challenges they joined or host. Ended ones never reach here. */
  challenges: LoggableChallenge[];
  /** Challenge ids whose lobby forbids Home and Wave. */
  lockedChallengeIds?: string[];
  busy?: boolean;
  error?: string | null;
  /** Set once published, which flips the sheet to its copy-link / DM state. */
  sharedPostId?: string | null;
  onClose: () => void;
  onShare: (choice: LiftShareChoice) => void;
  /** Home posts go through the ordinary composer, so they arrive as a full ComposeInput. */
  onComposeHome: (input: ComposeInput) => Promise<unknown> | void;
  onSkip: () => void;
};

type SharePerson = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export function LiftShareSheet({
  visible,
  draft,
  challenges,
  lockedChallengeIds,
  busy,
  error,
  sharedPostId,
  onClose,
  onShare,
  onComposeHome,
  onSkip,
}: LiftShareSheetProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const friends = useFriends(user?.id);
  const blockedPeers = useBlockedPeerIds();
  const myCircles = useMyCircles();
  const circles = myCircles.data ?? [];
  const [destination, setDestination] = useState<LiftShareDestination | null>(null);
  const [caption, setCaption] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [circleId, setCircleId] = useState<string | null>(null);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [pickedProfiles, setPickedProfiles] = useState<Record<string, SharePerson>>({});
  const [home, setHome] = useState(true);
  const searchRef = useRef<TextInput>(null);
  const keyboardHeight = useKeyboardHeight();
  const keyboardOpen = liftShareKeyboardOpen(keyboardHeight);
  const footerPad = liftShareFooterPad(keyboardOpen, Math.max(insets.bottom, 12));

  const recap = useMemo(() => (draft ? buildRecap(draft) : null), [draft]);
  const completedCard = useMemo(() => (draft ? buildCompletedCard(draft) : null), [draft]);
  const summary = useMemo(() => (draft ? draftSummary(draft) : null), [draft]);
  const locked = challengeId ? (lockedChallengeIds ?? []).includes(challengeId) : false;
  const hideRecap = searchFocused || recipientQuery.trim().length > 0;

  // A corporate lobby never announces to Home, so the toggle disappears rather than lying.
  useEffect(() => {
    if (locked) {
      setHome(false);
    }
  }, [locked]);

  // Reopening the sheet on a second share starts at the destination list again.
  useEffect(() => {
    if (!visible) {
      setDestination(null);
      setRecipientIds([]);
      setRecipientQuery('');
      setSearchFocused(false);
      setPickedProfiles({});
      setChallengeId(null);
      setCircleId(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || destination !== 'message' || sharedPostId) {
      return;
    }
    const handle = setTimeout(() => searchRef.current?.focus(), 40);
    return () => clearTimeout(handle);
  }, [destination, sharedPostId, visible]);

  const people = (friends.data ?? [])
    .map((edge) => edge.profile)
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile?.id));

  const needle = recipientQuery.trim();
  const friendMatches = people.filter((person) => liftShareNameMatches(person, needle));
  const needPeopleSearch = destination === 'message' && needle.length >= 2 && friendMatches.length === 0;

  const peopleSearch = useQuery({
    queryKey: ['lift-share-people', user?.id, needle.toLowerCase()],
    enabled: Boolean(user?.id && needPeopleSearch),
    staleTime: 30_000,
    queryFn: () => searchPeople(needle, user!.id),
  });

  const blockedIds = asIdSet(blockedPeers.data);
  const extraPeople = ((peopleSearch.data ?? []) as PublicProfile[]).filter((person) => {
    if (!person?.id || person.id === user?.id || blockedIds.has(person.id)) {
      return false;
    }
    return !people.some((friend) => friend.id === person.id);
  });

  const chosen = recipientIds
    .map((id) => {
      return (
        pickedProfiles[id] ??
        people.find((person) => person.id === id) ??
        extraPeople.find((person) => person.id === id) ??
        null
      );
    })
    .filter((person): person is SharePerson => Boolean(person?.id));

  const canSend =
    destination === 'message'
      ? recipientIds.length > 0
      : destination === 'live'
        ? Boolean(challengeId || circleId)
        : destination === 'home';

  const primaryLabel = busy
    ? 'Sharing…'
    : destination === 'message'
      ? recipientIds.length > 1
        ? `Send to ${recipientIds.length} people`
        : 'Send'
      : destination === 'live'
        ? circleId
          ? 'Post to Circle'
          : 'Add to challenge'
        : 'Share to Home';

  function togglePerson(person: SharePerson) {
    setPickedProfiles((current) => ({ ...current, [person.id]: person }));
    setRecipientIds((current) =>
      current.includes(person.id)
        ? current.filter((id) => id !== person.id)
        : [...current, person.id],
    );
  }

  function submitShare() {
    if (!destination) {
      return;
    }
    onShare({
      destination,
      caption: caption.trim(),
      challengeId: destination === 'live' ? challengeId : null,
      circleId: destination === 'live' ? circleId : null,
      home,
      audience: destination === 'message' ? 'specific' : DEFAULT_POST_AUDIENCE,
      recipientIds: destination === 'message' ? recipientIds : [],
    });
  }

  const recapCard = completedCard ? (
    <LiftCompletedCard card={completedCard} />
  ) : recap ? (
    <LiftRecapCard recap={recap} />
  ) : null;

  if (!recap) {
    return null;
  }

  const messageMode = destination === 'message' && !sharedPostId;
  const showFooter =
    Boolean(error) ||
    Boolean(sharedPostId) ||
    destination == null ||
    destination === 'live' ||
    destination === 'message';

  return (
    <ChromeOverlay
      visible={visible}
      onClose={busy ? undefined : onClose}
      align="start"
      dim={false}
      fill
      zIndex={140}>
      <View
        style={{
          flex: 1,
          height: '100%',
          backgroundColor: THEME.surface,
          // Web: sit on visualViewport. iOS Screen already pads. Android resizes the window.
          marginBottom: Platform.OS === 'web' ? keyboardHeight : 0,
        }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: destination && !sharedPostId ? 6 : 18,
            paddingRight: 8,
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: 6,
            backgroundColor: THEME.surface,
          }}>
          {destination && !sharedPostId ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              disabled={busy}
              onPress={() => setDestination(null)}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Glyph name={GLYPH.chevronLeft} color={THEME.textPrimary} size={16} />
            </Pressable>
          ) : null}
          <AppText style={{ flex: 1, fontSize: 19, fontWeight: '800', color: THEME.textPrimary }}>
            {sharedPostId
              ? 'Shared'
              : destination === 'message'
                ? 'Send to'
                : destination === 'live'
                  ? 'Where should it go?'
                  : destination === 'home'
                    ? 'Share to Home'
                    : 'Nice work'}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            onPress={busy ? undefined : onClose}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.close} color={THEME.textMuted} size={16} />
          </Pressable>
        </View>

        {messageMode ? (
          <View style={{ paddingHorizontal: 18, paddingBottom: 8, backgroundColor: THEME.surface }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                height: 46,
                paddingHorizontal: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: THEME.border,
                backgroundColor: THEME.background,
              }}>
              <Glyph name={GLYPH.search} color={THEME.textMuted} size={15} />
              <TextInput
                ref={searchRef}
                value={recipientQuery}
                onChangeText={setRecipientQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Type a name"
                placeholderTextColor={THEME.textMuted}
                autoCorrect={false}
                autoCapitalize="none"
                autoFocus
                accessibilityLabel="Search friends by name"
                selectionColor={THEME.accent}
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 15,
                  color: THEME.textPrimary,
                  paddingVertical: 0,
                }}
              />
              {recipientQuery ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  hitSlop={10}
                  onPress={() => setRecipientQuery('')}
                  style={{ width: 26, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Glyph name={GLYPH.close} color={THEME.textMuted} size={13} />
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {messageMode && chosen.length ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 6,
              paddingHorizontal: 18,
              paddingBottom: 8,
              backgroundColor: THEME.surface,
            }}>
            {chosen.map((person) => (
              <Pressable
                key={person.id}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${person.display_name || person.username}`}
                onPress={() => togglePerson(person)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 34,
                  paddingLeft: 8,
                  paddingRight: 10,
                  borderRadius: 999,
                  backgroundColor: THEME.accentSoft,
                }}>
                <AppText style={{ fontSize: 13, fontWeight: '700', color: THEME.accent }}>
                  {person.display_name || person.username}
                </AppText>
                <Glyph name={GLYPH.close} color={THEME.accent} size={11} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {messageMode ? (
          <FlatList
            style={{ flex: 1, minHeight: 0, backgroundColor: THEME.surface }}
            data={friendMatches}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 10, flexGrow: 1 }}
            ListHeaderComponent={
              <View>
                {people.length ? (
                  <>
                    <SectionLabel text="SEND TO" />
                    <AppText style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 8 }}>
                      {recipientIds.length > 1
                        ? 'Everyone you pick lands in one group chat.'
                        : 'Only the people you pick can open this lift.'}
                    </AppText>
                  </>
                ) : needle.length < 2 ? (
                  <AppText style={{ marginTop: 16, fontSize: 14, color: THEME.textMuted }}>
                    Add a friend first and they will show up here.
                  </AppText>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              needle ? (
                extraPeople.length || peopleSearch.isFetching ? null : (
                  <AppText style={{ fontSize: 14, color: THEME.textMuted, paddingVertical: 8 }}>
                    No one matches “{needle}”.
                  </AppText>
                )
              ) : null
            }
            renderItem={({ item }) => (
              <PersonRow
                person={item}
                picked={recipientIds.includes(item.id)}
                onToggle={() => togglePerson(item)}
              />
            )}
            ListFooterComponent={
              <View>
                {extraPeople.length ? (
                  <>
                    <SectionLabel text="PEOPLE" />
                    <View style={{ gap: 6 }}>
                      {extraPeople.map((person) => (
                        <PersonRow
                          key={person.id}
                          person={person}
                          picked={recipientIds.includes(person.id)}
                          onToggle={() => togglePerson(person)}
                        />
                      ))}
                    </View>
                  </>
                ) : null}
                {!hideRecap && recapCard ? <View style={{ marginTop: 16 }}>{recapCard}</View> : null}
              </View>
            }
          />
        ) : (
          <ScrollView
            style={{ flex: 1, minHeight: 0, backgroundColor: THEME.surface }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 10 }}>
            {recapCard}

            {sharedPostId ? (
              <SharedActions postId={sharedPostId} />
            ) : destination == null ? (
              <View style={{ marginTop: 16, gap: 8 }}>
                <DestinationRow
                  glyph={GLYPH.reply}
                  label="Message"
                  detail="Send it to friends in a DM"
                  onPress={() => setDestination('message')}
                />
                <DestinationRow
                  glyph={GLYPH.people}
                  label="Home"
                  detail="One card on your feed"
                  onPress={() => setDestination('home')}
                />
                <DestinationRow
                  glyph={GLYPH.swords}
                  label="Live"
                  detail={
                    challenges.length && circles.length
                      ? 'A challenge you are in, or one of your Circles'
                      : circles.length
                        ? 'Post it in one of your Circles'
                        : challenges.length
                          ? 'Goes on your check-in for this period'
                          : 'No challenges or Circles to add it to'
                  }
                  disabled={!challenges.length && !circles.length}
                  onPress={() => setDestination('live')}
                />
              </View>
            ) : destination === 'home' ? (
              // Home gets the real composer rather than a caption box, so a lift post can carry
              // @mentions, a photo, or a GIF exactly like any other post. The lift rides along as an
              // attachment; everything else about posting stays the thing people already know.
              <View style={{ marginTop: 12 }}>
                <Composer
                  placeholder="Say something about it"
                  initialLift={summary}
                  submitting={busy}
                  onSubmit={onComposeHome}
                />
              </View>
            ) : (
              <>
                {/* A challenge and a Circle are both "somewhere my people are", so they share one
                    screen. They are mutually exclusive because a post row can only carry one of the
                    two ids. */}
                {destination === 'live' ? (
                  <>
                    {challenges.length ? (
                      <>
                        <SectionLabel text="ACTIVE CHALLENGES" />
                        <AppText style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 8 }}>
                          Goes on your check-in for this period — it never posts twice.
                        </AppText>
                        <View style={{ gap: 8 }}>
                          {challenges.map((challenge) => (
                            <PickRow
                              key={challenge.id}
                              label={challenge.title ?? 'Challenge'}
                              detail={challenge.statusLine ?? challenge.taskLabel ?? undefined}
                              selected={challengeId === challenge.id}
                              onPress={() => {
                                setCircleId(null);
                                setChallengeId((current) =>
                                  current === challenge.id ? null : challenge.id,
                                );
                              }}
                            />
                          ))}
                        </View>
                      </>
                    ) : null}

                    {circles.length ? (
                      <>
                        <SectionLabel text="CIRCLES" />
                        <AppText style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 8 }}>
                          Posts in the Circle&rsquo;s room.
                        </AppText>
                        <View style={{ gap: 8 }}>
                          {circles.map((circle) => (
                            <PickRow
                              key={circle.id}
                              label={circle.name}
                              detail={
                                circle.member_count
                                  ? `${circle.member_count} ${circle.member_count === 1 ? 'member' : 'members'}`
                                  : undefined
                              }
                              selected={circleId === circle.id}
                              onPress={() => {
                                setChallengeId(null);
                                setCircleId((current) => (current === circle.id ? null : circle.id));
                              }}
                            />
                          ))}
                        </View>
                      </>
                    ) : null}

                    {!challenges.length && !circles.length ? (
                      <AppText style={{ marginTop: 16, fontSize: 14, color: THEME.textMuted }}>
                        Join a challenge or a Circle and they will show up here.
                      </AppText>
                    ) : null}

                    {destination === 'live' && (challengeId || circleId) && !locked ? (
                      <Pressable
                        accessibilityRole="switch"
                        accessibilityLabel="Also show on Home"
                        accessibilityState={{ checked: home }}
                        onPress={() => setHome((current) => !current)}
                        style={{
                          marginTop: 12,
                          minHeight: 52,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          paddingHorizontal: 14,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: THEME.border,
                          backgroundColor: THEME.background,
                        }}>
                        <Checkbox checked={home} />
                        <AppText
                          style={{ flex: 1, fontSize: 15, fontWeight: '600', color: THEME.textPrimary }}>
                          Also show on Home
                        </AppText>
                      </Pressable>
                    ) : null}

                    {destination === 'live' && locked ? (
                      <AppText style={{ marginTop: 12, fontSize: 13, color: THEME.textMuted }}>
                        This challenge keeps check-ins inside its own lobby, so this stays off Home.
                      </AppText>
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </ScrollView>
        )}

        {showFooter && destination !== 'home' ? (
          <View
            style={{
              paddingHorizontal: 18,
              paddingTop: 10,
              paddingBottom: footerPad,
              gap: 8,
              backgroundColor: THEME.surface,
              borderTopWidth: 1,
              borderTopColor: THEME.border,
            }}>
            {messageMode || (destination === 'live' && !sharedPostId) ? (
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Say something about it (optional)"
                placeholderTextColor={THEME.textMuted}
                accessibilityLabel="Caption"
                selectionColor={THEME.accent}
                returnKeyType="done"
                style={{
                  height: 46,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: THEME.border,
                  backgroundColor: THEME.background,
                  paddingHorizontal: 14,
                  fontSize: 15,
                  color: THEME.textPrimary,
                }}
              />
            ) : null}
            {error ? (
              <AppText style={{ fontSize: 13, fontWeight: '600', color: THEME.danger }}>
                {error}
              </AppText>
            ) : null}
            {sharedPostId ? (
              <Button title="Done" onPress={onClose} />
            ) : destination == null ? (
              <Button title="Keep it to myself" variant="ghost" size="sm" onPress={onSkip} />
            ) : (
              <Button
                title={primaryLabel}
                loading={busy}
                disabled={!canSend}
                onPress={submitShare}
              />
            )}
          </View>
        ) : destination === 'home' && error ? (
          <View style={{ paddingHorizontal: 18, paddingBottom: footerPad, backgroundColor: THEME.surface }}>
            <AppText style={{ fontSize: 13, fontWeight: '600', color: THEME.danger }}>{error}</AppText>
          </View>
        ) : null}
      </View>
    </ChromeOverlay>
  );
}

function PersonRow({
  person,
  picked,
  onToggle,
}: {
  person: SharePerson;
  picked: boolean;
  onToggle: () => void;
}) {
  const name = person.display_name || person.username;
  const handle = person.username ? `@${person.username.replace(/^@/, '')}` : '';
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={name}
      accessibilityState={{ checked: picked }}
      onPress={onToggle}
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 10,
        borderRadius: 12,
        backgroundColor: picked ? THEME.accentSoft : 'transparent',
      }}>
      <Avatar uri={person.avatar_url} name={name} size={34} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText
          numberOfLines={1}
          style={{ fontSize: 15, fontWeight: '600', color: THEME.textPrimary }}>
          {name}
        </AppText>
        {handle ? (
          <AppText numberOfLines={1} style={{ fontSize: 12, color: THEME.textMuted }}>
            {handle}
          </AppText>
        ) : null}
      </View>
      <Checkbox checked={picked} />
    </Pressable>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <AppText
      style={{
        marginTop: 18,
        marginBottom: 8,
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.7,
        color: THEME.textMuted,
      }}>
      {text}
    </AppText>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: checked ? THEME.accent : THEME.surface,
        borderWidth: 1,
        borderColor: checked ? THEME.accent : THEME.border,
      }}>
      <Glyph name={GLYPH.checkmark} color={checked ? THEME.accentForeground : THEME.border} size={12} />
    </View>
  );
}

function DestinationRow({
  glyph,
  label,
  detail,
  disabled,
  onPress,
}: {
  glyph: Parameters<typeof Glyph>[0]['name'];
  label: string;
  detail: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 62,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: THEME.border,
        backgroundColor: THEME.background,
        opacity: disabled ? 0.5 : 1,
      }}>
      <Glyph name={glyph} color={THEME.accent} size={17} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText style={{ fontSize: 15, fontWeight: '700', color: THEME.textPrimary }}>
          {label}
        </AppText>
        <AppText numberOfLines={1} style={{ fontSize: 12, color: THEME.textMuted }}>
          {detail}
        </AppText>
      </View>
      {disabled ? null : <Glyph name={GLYPH.chevronRight} color={THEME.textMuted} size={13} />}
    </Pressable>
  );
}

function PickRow({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: selected ? THEME.accent : THEME.border,
        backgroundColor: selected ? THEME.accentSoft : THEME.background,
      }}>
      <Checkbox checked={selected} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText
          numberOfLines={1}
          style={{ fontSize: 15, fontWeight: '700', color: THEME.textPrimary }}>
          {label}
        </AppText>
        {detail ? (
          <AppText numberOfLines={1} style={{ fontSize: 12, color: THEME.textMuted }}>
            {detail}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Copy link and a short friend list, once the card exists and has something to point at. */
function SharedActions({ postId }: { postId: string }) {
  const { user } = useAuth();
  const friends = useFriends(user?.id);
  const startChat = useGetOrCreateConversation();
  const send = useSendMessage();
  const [copied, setCopied] = useState(false);
  const [sentTo, setSentTo] = useState<string[]>([]);

  const url = postShareUrl(postId);

  async function copy() {
    await Clipboard.setStringAsync(url);
    setCopied(true);
  }

  async function sendTo(friendId: string) {
    try {
      const conversation = await startChat.mutateAsync(friendId);
      await send.mutateAsync({ conversation_id: conversation.id, body: url });
      setSentTo((current) => [...current, friendId]);
    } catch {
      // The card is already public; a failed DM should not read like the share failed.
    }
  }

  const list = (friends.data ?? [])
    .map((edge) => edge.profile)
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile?.id))
    .slice(0, 12);

  return (
    <View style={{ marginTop: 14 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Copy link"
        onPress={() => void copy()}
        style={{
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: THEME.border,
          backgroundColor: THEME.background,
        }}>
        <Glyph name={copied ? GLYPH.checkmark : GLYPH.link} color={THEME.accent} size={15} />
        <AppText style={{ flex: 1, fontSize: 15, fontWeight: '700', color: THEME.textPrimary }}>
          {copied ? 'Link copied' : 'Copy link'}
        </AppText>
      </Pressable>

      {list.length ? (
        <>
          <SectionLabel text="SEND IN A DM" />
          <View style={{ gap: 6 }}>
            {list.map((friend) => {
              const sent = sentTo.includes(friend.id);
              return (
                <Pressable
                  key={friend.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Send to ${friend.display_name || friend.username}`}
                  disabled={sent}
                  onPress={() => void sendTo(friend.id)}
                  style={{
                    minHeight: 52,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: 10,
                    borderRadius: 12,
                  }}>
                  <Avatar uri={friend.avatar_url} name={friend.display_name || friend.username} size={34} />
                  <AppText
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 15,
                      fontWeight: '600',
                      color: THEME.textPrimary,
                    }}>
                    {friend.display_name || friend.username}
                  </AppText>
                  <AppText
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: sent ? THEME.textMuted : THEME.accent,
                    }}>
                    {sent ? 'Sent' : 'Send'}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}
