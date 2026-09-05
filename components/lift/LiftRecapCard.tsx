import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import type { LiftRecap } from '@/lib/lift/recap';
import { THEME } from '@/lib/theme';

/**
 * The lift recap as it appears inside a feed post, on Home and in a challenge's Live thread.
 *
 * Condensed on purpose: one line per exercise, heaviest working set, no warm-ups and no body
 * weight. Someone scrolling past should read the session in about a second.
 */

type LiftRecapCardProps = {
  recap: LiftRecap;
  /** "Use this workout" — absent on your own card, where importing your own session is noise. */
  onImport?: (() => void) | null;
  importing?: boolean;
  compact?: boolean;
};

export function LiftRecapCard({ recap, onImport, importing, compact }: LiftRecapCardProps) {
  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: THEME.border,
        backgroundColor: THEME.background,
        overflow: 'hidden',
      }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: 8,
        }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: THEME.accentSoft,
          }}>
          <Glyph name={GLYPH.lift} color={THEME.accent} size={14} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText
            numberOfLines={1}
            style={{ fontSize: 15, fontWeight: '800', color: THEME.textPrimary }}>
            {recap.title}
          </AppText>
          <AppText numberOfLines={1} style={{ fontSize: 12, color: THEME.textMuted }}>
            {recap.exerciseCount} {recap.exerciseCount === 1 ? 'exercise' : 'exercises'} ·{' '}
            {recap.setCount} {recap.setCount === 1 ? 'set' : 'sets'}
          </AppText>
        </View>
        {recap.overloadChip ? (
          <View
            style={{
              paddingHorizontal: 9,
              minHeight: 24,
              justifyContent: 'center',
              borderRadius: 999,
              backgroundColor: THEME.accent,
            }}>
            <AppText style={{ fontSize: 11, fontWeight: '800', color: THEME.accentForeground }}>
              {recap.overloadChip}
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 12, paddingBottom: 10, gap: 3 }}>
        {recap.lines.map((line) => (
          <View
            key={line.key}
            style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            {line.superset ? (
              <View
                style={{
                  width: 3,
                  alignSelf: 'stretch',
                  minHeight: 16,
                  borderRadius: 2,
                  backgroundColor: THEME.accent,
                }}
              />
            ) : null}
            <AppText
              numberOfLines={compact ? 1 : 2}
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 14,
                fontWeight: '600',
                color: THEME.textPrimary,
              }}>
              {line.name}
            </AppText>
            {line.detail ? (
              <AppText
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: THEME.textMuted,
                  fontVariant: ['tabular-nums'],
                }}>
                {line.detail}
              </AppText>
            ) : null}
          </View>
        ))}
        {recap.moreCount > 0 ? (
          <AppText style={{ fontSize: 13, color: THEME.textMuted }}>
            +{recap.moreCount} more
          </AppText>
        ) : null}
      </View>

      {onImport ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Use this workout"
          accessibilityState={{ disabled: Boolean(importing) }}
          disabled={importing}
          onPress={onImport}
          style={({ pressed }) => ({
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderTopWidth: 1,
            borderTopColor: THEME.border,
            backgroundColor: pressed ? THEME.accentSoft : 'transparent',
            opacity: importing ? 0.5 : 1,
          })}>
          <Glyph name={GLYPH.plus} color={THEME.accent} size={12} />
          <AppText style={{ fontSize: 14, fontWeight: '700', color: THEME.accent }}>
            {importing ? 'Setting it up…' : 'Use this workout'}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
