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
  home: boolean;
  audience: PostAudience;
  /** Message only: who the card is addressed to. */
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
  const [destination, setDestination] = useState<LiftShareDestination | null>(null);
  const [caption, setCaption] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
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
    }
  }, [visible]);

  if (!recap) {
    return null;
  }

  const people = (friends.data ?? [])
    .map((edge) => edge.profile)
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile?.id));

  const canSend =
    destination === 'message'
      ? recipientIds.length > 0
      : destination === 'live'
        ? Boolean(challengeId)
        : destination === 'home';

  const primaryLabel = busy
    ? 'Sharing…'
    : destination === 'message'
      ? recipientIds.length > 1
        ? `Send to ${recipientIds.length} people`
        : 'Send'
      : destination === 'live'
        ? 'Add to challenge'
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
                  ? 'Add to a challenge'
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
                  challenges.length
                    ? 'Goes on your check-in for this period'
                    : 'No active challenges to add it to'
                }
                disabled={!challenges.length}
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
                    <SectionLabel text="FRIENDS" />
                    <AppText style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 8 }}>
                      Only the people you pick can open this lift.
                    </AppText>
                    <View style={{ gap: 6 }}>
                      {people.map((friend) => {
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

              {destination === 'live' ? (
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
                        onPress={() =>
                          setChallengeId((current) =>
                            current === challenge.id ? null : challenge.id,
                          )
                        }
                      />
                    ))}
                  </View>
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

              {destination === 'live' && challengeId && !locked ? (
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
