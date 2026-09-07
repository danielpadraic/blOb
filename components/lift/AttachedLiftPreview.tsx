import { Pressable, View } from 'react-native';

import { LiftCompletedCard } from '@/components/lift/LiftCompletedCard';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { buildCompletedCardFromSummary } from '@/lib/lift/complete';
import type { LiftSessionSummary } from '@/lib/lift/types';
import { THEME } from '@/lib/theme';

/**
 * Confirm chip on the composer: the chosen session title, then the same summary card History uses.
 * Send writes this session's id — never last-open or the first row in the picker.
 */

export function AttachedLiftPreview({
  session,
  onRemove,
  note,
}: {
  session: LiftSessionSummary;
  onRemove?: () => void;
  note?: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: THEME.accentBright,
          backgroundColor: THEME.accentSoft,
        }}>
        <Glyph name={GLYPH.lift} color={THEME.accent} size={16} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText
            numberOfLines={1}
            style={{ fontSize: 14, fontWeight: '800', color: THEME.textPrimary }}>
            {session.title}
          </AppText>
          <AppText numberOfLines={1} style={{ fontSize: 12, color: THEME.textMuted }}>
            {note ?? `${session.exerciseCount} exercises · ${session.setCount} sets`}
          </AppText>
        </View>
        {onRemove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove the attached lift"
            hitSlop={8}
            onPress={onRemove}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.close} color={THEME.textMuted} size={14} />
          </Pressable>
        ) : null}
      </View>
      <LiftCompletedCard card={buildCompletedCardFromSummary(session)} compact />
    </View>
  );
}
