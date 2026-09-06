import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { LiftRecapCard } from '@/components/lift/LiftRecapCard';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { useAuth } from '@/hooks/useAuth';
import { useMyCircles } from '@/hooks/useCircles';
import type { LoggableChallenge } from '@/hooks/useLoggableChallenge';
import { useFriends, useGetOrCreateConversation, useSendMessage } from '@/hooks/useSocial';
import { buildRecap } from '@/lib/lift/recap';
import { postShareUrl } from '@/lib/postShare';
import { DEFAULT_POST_AUDIENCE, POST_AUDIENCE_OPTIONS, type PostAudience } from '@/lib/postAudience';
import type { LiftSessionDraft } from '@/lib/lift/types';
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
  onSkip: () => void;
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
  onSkip,
}: LiftShareSheetProps) {
  const { user } = useAuth();
  const friends = useFriends(user?.id);
  const myCircles = useMyCircles();
  const circles = myCircles.data ?? [];
  const [destination, setDestination] = useState<LiftShareDestination | null>(null);
  const [caption, setCaption] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [circleId, setCircleId] = useState<string | null>(null);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [home, setHome] = useState(true);
  const [audience, setAudience] = useState<PostAudience>(DEFAULT_POST_AUDIENCE);

  const recap = useMemo(() => (draft ? buildRecap(draft) : null), [draft]);
  const locked = challengeId ? (lockedChallengeIds ?? []).includes(challengeId) : false;

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
      setChallengeId(null);
      setCircleId(null);
    }
  }, [visible]);

  if (!recap) {
    return null;
  }

  const people = (friends.data ?? [])
    .map((edge) => edge.profile)
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile?.id));

  // Searching your friends rather than everyone: a group thread can only be opened with accepted
  // friends, so offering anyone else here would be a dead end at send time.
  const needle = recipientQuery.trim().toLowerCase();
  const matches = needle
    ? people.filter((person) =>
        `${person.display_name ?? ''} ${person.username ?? ''}`.toLowerCase().includes(needle),
      )
    : people;
  const chosen = people.filter((person) => recipientIds.includes(person.id));

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

  return (
    <ChromeOverlay visible={visible} onClose={busy ? undefined : onClose} align="end" zIndex={140}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingBottom: 20,
          maxHeight: '94%',
        }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: destination && !sharedPostId ? 6 : 18,
            paddingRight: 8,
            paddingTop: 14,
            paddingBottom: 6,
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

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 10 }}>
          <LiftRecapCard recap={recap} />

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
          ) : (
            <>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                multiline
                placeholder="Say something about it (optional)"
                placeholderTextColor={THEME.textMuted}
                accessibilityLabel="Caption"
                selectionColor={THEME.accent}
                style={{
                  marginTop: 12,
                  minHeight: 68,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: THEME.border,
                  backgroundColor: THEME.background,
                  paddingHorizontal: 14,
                  paddingTop: 12,
                  paddingBottom: 12,
                  fontSize: 15,
                  color: THEME.textPrimary,
                  textAlignVertical: 'top',
                }}
              />

              {destination === 'message' ? (
                people.length ? (
                  <>
                    <SectionLabel text="SEND TO" />
                    <AppText style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 8 }}>
                      {recipientIds.length > 1
                        ? 'Everyone you pick lands in one group chat.'
                        : 'Only the people you pick can open this lift.'}
                    </AppText>

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
                        value={recipientQuery}
                        onChangeText={setRecipientQuery}
                        placeholder="Type a name"
                        placeholderTextColor={THEME.textMuted}
                        autoCorrect={false}
                        autoCapitalize="none"
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

                    {chosen.length ? (
                      <View
                        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                        {chosen.map((person) => (
                          <Pressable
                            key={person.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${person.display_name || person.username}`}
                            onPress={() =>
                              setRecipientIds((current) =>
                                current.filter((id) => id !== person.id),
                              )
                            }
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
                            <AppText
                              style={{ fontSize: 13, fontWeight: '700', color: THEME.accent }}>
                              {person.display_name || person.username}
                            </AppText>
                            <Glyph name={GLYPH.close} color={THEME.accent} size={11} />
                          </Pressable>
                        ))}
                      </View>
                    ) : null}

                    <View style={{ gap: 6, marginTop: 10 }}>
                      {matches.length === 0 ? (
                        <AppText style={{ fontSize: 14, color: THEME.textMuted, paddingVertical: 8 }}>
                          No friends match “{recipientQuery.trim()}”.
                        </AppText>
                      ) : null}
                      {matches.map((friend) => {
                        const name = friend.display_name || friend.username;
                        const picked = recipientIds.includes(friend.id);
                        return (
                          <Pressable
                            key={friend.id}
                            accessibilityRole="checkbox"
                            accessibilityLabel={name}
                            accessibilityState={{ checked: picked }}
                            onPress={() =>
                              setRecipientIds((current) =>
                                current.includes(friend.id)
                                  ? current.filter((id) => id !== friend.id)
                                  : [...current, friend.id],
                              )
                            }
                            style={{
                              minHeight: 56,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 10,
                              paddingHorizontal: 10,
                              borderRadius: 12,
                              backgroundColor: picked ? THEME.accentSoft : 'transparent',
                            }}>
                            <Avatar uri={friend.avatar_url} name={name} size={34} />
                            <AppText
                              numberOfLines={1}
                              style={{
                                flex: 1,
                                minWidth: 0,
                                fontSize: 15,
                                fontWeight: '600',
                                color: THEME.textPrimary,
                              }}>
                              {name}
                            </AppText>
                            <Checkbox checked={picked} />
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <AppText style={{ marginTop: 16, fontSize: 14, color: THEME.textMuted }}>
                    Add a friend first and they will show up here.
                  </AppText>
                )
              ) : null}

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
                </>
              ) : null}

              {destination === 'home' ? (
                <>
                  <SectionLabel text="WHO SEES IT" />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {POST_AUDIENCE_OPTIONS.map((option) => {
                      const active = audience === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          accessibilityRole="button"
                          accessibilityLabel={option.label}
                          accessibilityState={{ selected: active }}
                          onPress={() => setAudience(option.value as PostAudience)}
                          style={{
                            flex: 1,
                            minHeight: 44,
                            borderRadius: 12,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: active ? THEME.accent : THEME.background,
                            borderWidth: 1,
                            borderColor: active ? THEME.accent : THEME.border,
                          }}>
                          <AppText
                            style={{
                              fontSize: 14,
                              fontWeight: '700',
                              color: active ? THEME.accentForeground : THEME.textPrimary,
                            }}>
                            {option.label}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
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
          )}
        </ScrollView>

        <View style={{ paddingHorizontal: 18, paddingTop: 12, gap: 8 }}>
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
              onPress={() =>
                onShare({
                  destination,
                  caption: caption.trim(),
                  challengeId: destination === 'live' ? challengeId : null,
                  circleId: destination === 'live' ? circleId : null,
                  home: destination === 'home' ? true : home,
                  audience: destination === 'message' ? 'specific' : audience,
                  recipientIds: destination === 'message' ? recipientIds : [],
                })
              }
            />
          )}
        </View>
      </View>
    </ChromeOverlay>
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
