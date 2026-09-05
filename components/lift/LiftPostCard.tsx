import { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { LiftRecapCard } from '@/components/lift/LiftRecapCard';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useLiftSession } from '@/hooks/useLift';
import { buildRecap, recapFallbackText } from '@/lib/lift/recap';
import { liftImportHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';

/**
 * Renders the recap card for a post that carries a lift session.
 *
 * The session is read by id and gated by the same policy that made it shareable, so a card in a
 * feed the viewer should not see resolves to nothing rather than leaking numbers.
 */

type LiftPostCardProps = {
  sessionId: string;
  authorId?: string | null;
  /**
   * The post's body. A post must have one, so an empty caption is stored as a plain-text version of
   * the card for stale clients. When that is what it is, it is not shown twice.
   */
  caption?: string | null;
  compact?: boolean;
};

export function LiftPostCard({ sessionId, authorId, caption, compact }: LiftPostCardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const session = useLiftSession(sessionId);

  const recap = useMemo(
    () => (session.data ? buildRecap(session.data) : null),
    [session.data],
  );

  if (session.isLoading) {
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

  if (!recap) {
    return (
      <View
        style={{
          padding: 14,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: THEME.border,
          backgroundColor: THEME.background,
        }}>
        <AppText style={{ fontSize: 13, color: THEME.textMuted }}>
          This workout isn’t available.
        </AppText>
      </View>
    );
  }

  const mine = Boolean(user?.id && authorId && user.id === authorId);
  const typed = String(caption ?? '').trim();
  const theirWords = typed && typed !== recapFallbackText(recap) ? typed : null;

  return (
    <View style={{ gap: 8 }}>
      {theirWords ? (
        <AppText style={{ fontSize: 15, lineHeight: 21, color: THEME.textPrimary }}>
          {theirWords}
        </AppText>
      ) : null}
      <LiftRecapCard
        recap={recap}
        compact={compact}
        onImport={mine ? null : () => router.push(liftImportHref(sessionId))}
      />
    </View>
  );
}
