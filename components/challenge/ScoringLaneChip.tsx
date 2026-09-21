import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
import type { ScoringLane } from '@/lib/comparablePoints';

type ScoringLaneChipProps = {
  lanes: ScoringLane[];
  laneId?: string | null;
  canAssign: boolean;
  busy?: boolean;
  onAssign: (laneId: string) => void;
};

export function ScoringLaneChip({ lanes, laneId, canAssign, busy, onAssign }: ScoringLaneChipProps) {
  const [open, setOpen] = useState(false);
  if (lanes.length < 1) {
    return null;
  }
  const current = lanes.find((lane) => lane.id === laneId);
  const label = current?.label.trim() || 'Needs a side';
  const needsSide = !current;

  function choose(id: string) {
    setOpen(false);
    if (id !== laneId) {
      onAssign(id);
    }
  }

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
        style={{
          minHeight: 28,
          paddingHorizontal: 10,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: needsSide ? THEME.border : THEME.accent,
          backgroundColor: needsSide ? THEME.surface : THEME.accentSoft,
          justifyContent: 'center',
          opacity: busy ? 0.55 : 1,
        }}>
        <AppText
          className="text-[12px] font-semibold"
          style={{ color: needsSide ? THEME.textMuted : THEME.accent }}>
          {label}
        </AppText>
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
              accessibilityLabel={lane.label}
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
              <AppText className="text-[15px] font-semibold text-charcoal">{lane.label}</AppText>
            </Pressable>
          ))}
        </View>
      </ChromeOverlay>
    </>
  );
}
