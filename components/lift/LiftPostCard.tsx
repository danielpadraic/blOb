import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { LiftRecapCard } from '@/components/lift/LiftRecapCard';
import { LiftSessionSheet } from '@/components/lift/LiftSessionSheet';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useLiftSession } from '@/hooks/useLift';
import { copy } from '@/lib/copy';
import { buildRecap, recapFallbackText } from '@/lib/lift/recap';
import { draftFromLiftSnapshot, parseLiftSnapshot } from '@/lib/lift/snapshot';
import { liftSessionHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';

/**
 * Recap card for a post that carries a lift. Tap opens the session (author) or a read-only sheet
 * (everyone else) so they can add a private copy.
 */

type LiftPostCardProps = {
  sessionId: string;
  authorId?: string | null;
  authorName?: string | null;
  snapshot?: unknown;
  caption?: string | null;
  compact?: boolean;
};

export function LiftPostCard({
  sessionId,
  authorId,
  authorName,
  snapshot,
  caption,
  compact,
}: LiftPostCardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const session = useLiftSession(sessionId);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fromSnapshot = useMemo(() => {
    const parsed = parseLiftSnapshot(snapshot);
    return parsed ? draftFromLiftSnapshot(parsed, { ownerName: authorName }) : null;
  }, [authorName, snapshot]);

  const draft = session.data ?? fromSnapshot;
  const recap = useMemo(() => (draft ? buildRecap(draft) : null), [draft]);
  const mine = Boolean(user?.id && authorId && user.id === authorId);
  const unavailable = !session.isLoading && !recap;

  function openCard() {
    if (mine && sessionId) {
      router.push(liftSessionHref(sessionId));
      return;
    }
    setOpen(true);
  }

  if (session.isLoading && !fromSnapshot) {
    return (
      <View
        style={{
          height: 96,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: THEME.border,
          backgroundColor: THEME.background,
        }}
      />
    );
  }

  const typed = String(caption ?? '').trim();
  const theirWords = recap && typed && typed !== recapFallbackText(recap) ? typed : null;

  return (
    <View style={{ gap: 8 }}>
      {theirWords ? (
        <AppText style={{ fontSize: 15, lineHeight: 21, color: THEME.textPrimary }}>
          {theirWords}
        </AppText>
      ) : null}
      {unavailable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy('lift.sessionUnavailable')}
          onPress={openCard}
          style={{
            padding: 14,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: THEME.border,
            backgroundColor: THEME.background,
          }}>
          <AppText style={{ fontSize: 13, color: THEME.textMuted }}>
            {copy('lift.sessionUnavailable')}
          </AppText>
        </Pressable>
      ) : recap ? (
        <Pressable accessibilityRole="button" accessibilityLabel={recap.title} onPress={openCard}>
          <LiftRecapCard recap={recap} compact={compact} />
        </Pressable>
      ) : null}
      {toast ? (
        <AppText style={{ fontSize: 13, fontWeight: '700', color: THEME.accent }}>{toast}</AppText>
      ) : null}
      <LiftSessionSheet
        visible={open}
        sessionId={sessionId}
        snapshot={fromSnapshot}
        authorId={authorId}
        authorName={authorName}
        onClose={() => setOpen(false)}
        onAdded={() => {
          setToast(copy('lift.addedToYours'));
          setTimeout(() => setToast((current) => (current === copy('lift.addedToYours') ? null : current)), 2200);
        }}
      />
    </View>
  );
}
