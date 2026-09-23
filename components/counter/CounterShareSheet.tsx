import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CounterRecapCard } from '@/components/counter/CounterRecapCard';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { KeyboardField, useKeyboardHeight } from '@/components/ui/KeyboardFormShell';
import { useAuth } from '@/hooks/useAuth';
import { useMyCircles } from '@/hooks/useCircles';
import type { LoggableChallenge } from '@/hooks/useLoggableChallenge';
import { useFriends } from '@/hooks/useSocial';
import { checkinHidesHomeShare } from '@/lib/checkinShare';
import { buildCounterCard } from '@/lib/counter/card';
import type { CounterShareDestination } from '@/lib/counter/share';
import type { CounterDraft } from '@/lib/counter/types';
import { liftShareFooterPad, liftShareKeyboardOpen } from '@/lib/liftShareInset';
import { DEFAULT_POST_AUDIENCE, type PostAudience } from '@/lib/postAudience';
import { THEME } from '@/lib/theme';

export type CounterShareChoice = {
  destination: CounterShareDestination;
  caption: string;
  challengeId: string | null;
  circleId: string | null;
  hideHome: boolean;
  audience: PostAudience;
  recipientIds: string[];
};

type Props = {
  visible: boolean;
  draft: CounterDraft | null;
  challenges: LoggableChallenge[];
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onShare: (choice: CounterShareChoice) => void;
};

const DESTINATIONS: { id: CounterShareDestination; label: string; glyph: (typeof GLYPH)[keyof typeof GLYPH] }[] = [
  { id: 'image', label: 'Save image', glyph: GLYPH.album },
  { id: 'home', label: 'Home Feed', glyph: GLYPH.people },
  { id: 'live', label: 'Challenge Live', glyph: GLYPH.swords },
  { id: 'circle', label: 'Circle Feed', glyph: GLYPH.people },
  { id: 'wave', label: 'Wave', glyph: GLYPH.sparkle },
  { id: 'message', label: 'Message', glyph: GLYPH.reply },
];

export function CounterShareSheet({ visible, draft, challenges, busy, error, onClose, onShare }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const circles = useMyCircles().data ?? [];
  const friends = useFriends(user?.id);
  const keyboardHeight = useKeyboardHeight();
  const keyboardOpen = liftShareKeyboardOpen(keyboardHeight);
  const [destination, setDestination] = useState<CounterShareDestination | null>(null);
  const [caption, setCaption] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [circleId, setCircleId] = useState<string | null>(null);
  const [audience, setAudience] = useState<PostAudience>(DEFAULT_POST_AUDIENCE);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const card = useMemo(() => (draft ? buildCounterCard(draft) : null), [draft]);
  const locked = challengeId
    ? checkinHidesHomeShare(challenges.find((row) => row.id === challengeId) as never)
    : false;

  useEffect(() => {
    if (!visible) {
      setDestination(null);
      setCaption('');
      setChallengeId(null);
      setCircleId(null);
      setAudience(DEFAULT_POST_AUDIENCE);
      setRecipientIds([]);
    }
  }, [visible]);

  const people = (friends.data ?? [])
    .map((edge) => edge.profile)
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile?.id));

  function togglePerson(id: string) {
    setRecipientIds((current) => (current.includes(id) ? current.filter((row) => row !== id) : [...current, id]));
  }

  const canSend =
    destination === 'image' ||
    destination === 'home' ||
    destination === 'wave' ||
    (destination === 'live' && Boolean(challengeId)) ||
    (destination === 'circle' && Boolean(circleId)) ||
    (destination === 'message' && recipientIds.length > 0);

  return (
    <ChromeOverlay visible={visible} onClose={busy ? undefined : onClose} align="end" zIndex={140}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          maxHeight: '88%',
          paddingBottom: liftShareFooterPad(keyboardOpen, Math.max(insets.bottom, 12)),
        }}>
        <View style={{ alignItems: 'center', paddingTop: 8 }}>
          <View style={{ height: 4, width: 40, borderRadius: 999, backgroundColor: THEME.border }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
          <AppText style={{ flex: 1, fontSize: 17, fontWeight: '800', color: THEME.textPrimary }}>Share</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.close} color={THEME.textPrimary} size={16} />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
          {card ? <CounterRecapCard card={card} /> : null}
          {DESTINATIONS.map((row) => (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              accessibilityLabel={row.label}
              onPress={() => setDestination(row.id)}
              style={{
                minHeight: 52,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: destination === row.id ? THEME.accent : THEME.border,
                backgroundColor: destination === row.id ? THEME.accentSoft : THEME.surface,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}>
              <Glyph name={row.glyph} color={THEME.textPrimary} size={16} />
              <AppText style={{ fontSize: 15, fontWeight: '700', color: THEME.textPrimary }}>{row.label}</AppText>
            </Pressable>
          ))}
          {destination === 'home' ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['friends', 'public'] as const).map((value) => (
                <Pressable
                  key={value}
                  onPress={() => setAudience(value)}
                  style={{
                    minHeight: 36,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: audience === value ? THEME.accent : THEME.border,
                    backgroundColor: audience === value ? THEME.accentSoft : THEME.surface,
                    justifyContent: 'center',
                  }}>
                  <AppText style={{ fontWeight: '700', color: THEME.textPrimary }}>
                    {value === 'public' ? 'Public' : 'Friends'}
                  </AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
          {destination === 'live' ? (
            challenges.length ? (
              challenges.map((row) => (
                <Pressable
                  key={row.id}
                  onPress={() => setChallengeId(row.id)}
                  style={{
                    minHeight: 44,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: challengeId === row.id ? THEME.accent : THEME.border,
                    backgroundColor: challengeId === row.id ? THEME.accentSoft : THEME.surface,
                    paddingHorizontal: 12,
                    justifyContent: 'center',
                  }}>
                  <AppText style={{ fontWeight: '700', color: THEME.textPrimary }}>{row.title}</AppText>
                </Pressable>
              ))
            ) : (
              <AppText style={{ color: THEME.textMuted }}>No Active rooms to post to.</AppText>
            )
          ) : null}
          {destination === 'circle' ? (
            circles.length ? (
              circles.map((row) => (
                <Pressable
                  key={row.id}
                  onPress={() => setCircleId(row.id)}
                  style={{
                    minHeight: 44,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: circleId === row.id ? THEME.accent : THEME.border,
                    backgroundColor: circleId === row.id ? THEME.accentSoft : THEME.surface,
                    paddingHorizontal: 12,
                    justifyContent: 'center',
                  }}>
                  <AppText style={{ fontWeight: '700', color: THEME.textPrimary }}>{row.name}</AppText>
                </Pressable>
              ))
            ) : (
              <AppText style={{ color: THEME.textMuted }}>You are not in a circle yet.</AppText>
            )
          ) : null}
          {destination === 'message' ? (
            people.length ? (
              people.map((person) => (
                <Pressable
                  key={person.id}
                  onPress={() => togglePerson(person.id)}
                  style={{
                    minHeight: 48,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}>
                  <Avatar uri={person.avatar_url} name={person.display_name || person.username} size={32} />
                  <AppText style={{ flex: 1, fontWeight: '700', color: THEME.textPrimary }}>
                    {person.display_name || person.username}
                  </AppText>
                  <Glyph
                    name={recipientIds.includes(person.id) ? GLYPH.checkmark : GLYPH.circle}
                    color={recipientIds.includes(person.id) ? THEME.accent : THEME.border}
                    size={16}
                  />
                </Pressable>
              ))
            ) : (
              <AppText style={{ color: THEME.textMuted }}>Add a friend to message them.</AppText>
            )
          ) : null}
          {destination && destination !== 'image' ? (
            <KeyboardField>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Add a caption"
                placeholderTextColor={THEME.textMuted}
                accessibilityLabel="Caption"
                style={{
                  minHeight: 48,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: THEME.border,
                  paddingHorizontal: 12,
                  color: THEME.textPrimary,
                }}
              />
            </KeyboardField>
          ) : null}
          {error ? <AppText style={{ color: THEME.danger, fontWeight: '700' }}>{error}</AppText> : null}
          {destination ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={busy || !canSend}
              onPress={() =>
                onShare({
                  destination,
                  caption,
                  challengeId,
                  circleId,
                  hideHome: locked || destination === 'wave' || destination === 'message',
                  audience: destination === 'message' ? 'specific' : audience,
                  recipientIds: destination === 'message' ? recipientIds : [],
                })
              }
              style={{
                minHeight: 48,
                borderRadius: 14,
                backgroundColor: THEME.primary,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: busy || !canSend ? 0.5 : 1,
              }}>
              <AppText style={{ fontWeight: '800', color: THEME.primaryForeground }}>
                {destination === 'image' ? 'Save image' : 'Share'}
              </AppText>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </ChromeOverlay>
  );
}
