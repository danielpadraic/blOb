import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import type { LiftCompletedCardModel } from '@/lib/lift/complete';
import { THEME, themeShadow } from '@/lib/theme';

/**
 * The unique summary for a finished lift: title, date, the exercises that were actually done,
 * weight moved, and cardio time when there was a clock. RN view, not an image. No body metrics.
 *
 * History, Share, and the check-in attach preview all render this same card. A draft share uses
 * the same chrome without the weight-moved hero.
 */

type LiftCompletedCardProps = {
  card: LiftCompletedCardModel;
  compact?: boolean;
  hideChrome?: boolean;
  onPress?: () => void;
};

export function LiftCompletedCard({ card, compact, hideChrome, onPress }: LiftCompletedCardProps) {
  const body = (
    <View
      style={{
        borderRadius: hideChrome ? 0 : 18,
        borderWidth: hideChrome ? 0 : 1,
        borderColor: THEME.border,
        backgroundColor: THEME.surface,
        overflow: 'hidden',
        ...(hideChrome ? null : themeShadow('card')),
      }}>
      <View style={{ paddingHorizontal: hideChrome ? 0 : 14, paddingTop: hideChrome ? 0 : 12, paddingBottom: hideChrome ? 0 : compact ? 12 : 14, gap: 6 }}>
        {hideChrome ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
                ellipsizeMode="tail"
                style={{
                  width: '100%',
                  minHeight: 22,
                  lineHeight: 22,
                  fontSize: 16,
                  fontWeight: '800',
                  color: THEME.textPrimary,
                }}>
                {card.title}
              </AppText>
              <AppText
                numberOfLines={1}
                style={{ minHeight: 16, lineHeight: 16, fontSize: 12, color: THEME.textMuted }}>
                {card.date}
                {card.durationLine ? ` · ${card.durationLine}` : ''}
              </AppText>
            </View>
          </View>
        )}

        {card.weightLine ? (
          <AppText style={{ fontSize: 20, fontWeight: '800', color: THEME.textPrimary }}>
            {card.weightLine}
          </AppText>
        ) : null}

        {card.exerciseNames.length ? (
          <View style={{ gap: 2 }}>
            {card.exerciseNames.map((name) => (
              <AppText
                key={name}
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{ fontSize: 13, lineHeight: 18, color: THEME.textPrimary }}>
                {name}
              </AppText>
            ))}
            {card.moreCount > 0 ? (
              <AppText style={{ fontSize: 12, color: THEME.textMuted }}>+{card.moreCount} more</AppText>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) {
    return body;
  }

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${card.title}`} onPress={onPress}>
      {body}
    </Pressable>
  );
}
