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
 * The Done sheet: what happens to a finished lift.
 *
 * Picking a challenge is the Live share and the check-in attach at once — a challenge already keeps
 * exactly one feed post per period, so the card goes onto that post instead of publishing a second
 * one. Picking nothing publishes a plain Home card. Corporate challenges lock Home off, the same
 * rule check-ins follow.
 *
 * The caption is whatever they typed. An empty caption stays empty; the app does not write
 * "Daniel crushed chest" on anyone's behalf.
 */

export type LiftShareChoice = {
  caption: string;
  /** The challenge to attach to, or null for a Home-only card. */
  challengeId: string | null;
  home: boolean;
  audience: PostAudience;
};

type LiftShareSheetProps = {
  visible: boolean;
  draft: LiftSessionDraft | null;
  /** Live lifting challenges they can still check into. Empty hides the whole Live block. */
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
  const [caption, setCaption] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
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

  if (!recap) {
    return null;
  }

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
            paddingLeft: 18,
            paddingRight: 8,
            paddingTop: 14,
            paddingBottom: 6,
          }}>
          <AppText
            style={{ flex: 1, fontSize: 19, fontWeight: '800', color: THEME.textPrimary }}>
            {sharedPostId ? 'Shared' : 'Nice work'}
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

              {challenges.length ? (
                <>
                  <SectionLabel text="ADD TO A CHALLENGE" />
                  <AppText
                    style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 8 }}>
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

              {challengeId && !locked ? (
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
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: home ? THEME.accent : THEME.surface,
                      borderWidth: 1,
                      borderColor: home ? THEME.accent : THEME.border,
                    }}>
                    <Glyph
                      name={GLYPH.checkmark}
                      color={home ? THEME.accentForeground : THEME.border}
                      size={12}
                    />
                  </View>
                  <AppText
                    style={{ flex: 1, fontSize: 15, fontWeight: '600', color: THEME.textPrimary }}>
                    Also show on Home
                  </AppText>
                </Pressable>
              ) : null}

              {locked ? (
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
          ) : (
            <>
              <Button
                title={
                  busy
                    ? 'Sharing…'
                    : challengeId
                      ? 'Share to challenge'
                      : 'Share to Home'
                }
                loading={busy}
                onPress={() => onShare({ caption: caption.trim(), challengeId, home, audience })}
              />
              <Button
                title="Keep it to myself"
                variant="ghost"
                size="sm"
                onPress={onSkip}
              />
            </>
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
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 7,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? THEME.accent : THEME.surface,
          borderWidth: 1,
          borderColor: selected ? THEME.accent : THEME.border,
        }}>
        <Glyph
          name={GLYPH.checkmark}
          color={selected ? THEME.accentForeground : THEME.border}
          size={12}
        />
      </View>
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
