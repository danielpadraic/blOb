import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { shortLaneMarkLabel } from '@/lib/board';
import { THEME } from '@/lib/theme';
import { scoringLaneName, type ScoringLane } from '@/lib/comparablePoints';

type ScoringLaneChipProps = {
  lanes: ScoringLane[];
  laneId?: string | null;
  canAssign: boolean;
  busy?: boolean;
  /** Board table: 18–20px mark. Default stays the larger picker chip. */
  density?: 'default' | 'mark';
  onAssign: (laneId: string) => void;
};

export function ScoringLaneChip({
  lanes,
  laneId,
  canAssign,
  busy,
  density = 'default',
  onAssign,
}: ScoringLaneChipProps) {
  const [open, setOpen] = useState(false);
  if (lanes.length < 1) {
    return null;
  }
  const current = lanes.find((lane) => lane.id === laneId);
  const needsSide = !current;
  const mark = density === 'mark';
  const label = mark
    ? shortLaneMarkLabel(scoringLaneName(current))
    : scoringLaneName(current) || 'Needs a side';

  function choose(id: string) {
    setOpen(false);
    if (id !== laneId) {
      onAssign(id);
    }
  }

  const chip = (
    <View
      style={{
        height: mark ? 20 : 28,
        paddingHorizontal: mark ? 8 : 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: needsSide ? THEME.border : THEME.accent,
        backgroundColor: mark ? 'transparent' : needsSide ? THEME.surface : THEME.accentSoft,
        justifyContent: 'center',
        alignItems: 'center',
        opacity: busy ? 0.55 : 1,
      }}>
      <AppText
        className={mark ? 'text-[10px] font-bold' : 'text-[12px] font-semibold'}
        numberOfLines={1}
        style={{
          color: needsSide ? THEME.textMuted : THEME.accent,
          fontSize: mark ? 10 : 12,
          lineHeight: mark ? 12 : 16,
          fontWeight: mark ? '700' : '600',
          textAlign: 'center',
          includeFontPadding: false,
        }}>
        {label}
      </AppText>
    </View>
  );

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={canAssign ? `Set side. ${label}` : label}
        disabled={!canAssign || busy}
        onPress={() => {
          if (canAssign) {
            setOpen(true);
          }
        }}
        hitSlop={mark ? { top: 12, bottom: 12, left: 8, right: 8 } : 0}
        style={
          mark
            ? {
                height: 20,
                width: '100%',
                justifyContent: 'center',
                alignItems: 'center',
              }
            : undefined
        }>
        {chip}
      </Pressable>
      <ChromeOverlay visible={open} onClose={() => setOpen(false)} align="center">
        <View
          style={{
            marginHorizontal: 24,
            padding: 16,
            borderRadius: THEME.radius,
            backgroundColor: THEME.surface,
            borderWidth: 1,
            borderColor: THEME.border,
            gap: 8,
          }}>
          <AppText className="text-[15px] font-bold text-charcoal">Pick a side</AppText>
          {lanes.map((lane) => (
            <Pressable
              key={lane.id}
              accessibilityRole="button"
              accessibilityLabel={scoringLaneName(lane)}
              onPress={() => choose(lane.id)}
              style={{
                minHeight: 48,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: lane.id === laneId ? THEME.accent : THEME.border,
                backgroundColor: lane.id === laneId ? THEME.accentSoft : THEME.background,
                paddingHorizontal: 14,
                justifyContent: 'center',
              }}>
              <AppText className="text-[15px] font-semibold text-charcoal">{scoringLaneName(lane)}</AppText>
            </Pressable>
          ))}
        </View>
      </ChromeOverlay>
    </>
  );
}
