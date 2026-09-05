import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import {
  proofStatChips,
  proofStatsProse,
  type CheckinProofStats as CheckinProofStatsPayload,
} from '@/lib/checkin/proofStats';
import { THEME } from '@/lib/theme';

type Props = {
  stats?: CheckinProofStatsPayload | null;
  /** Home and detail have room for the sentence; the dense Live bubble does not. */
  showProse?: boolean;
  displayName?: string | null;
  align?: 'left' | 'right';
};

/**
 * Compact stats chips for a fitness check-in post. Renders nothing when the payload is absent or
 * carries no numbers, which is how Prayer, honor and every non-fitness category stay clean.
 * Shared by Live and Home so iOS, Android and Web read the same.
 */
export function CheckinProofStatsRow({ stats, showProse, displayName, align = 'left' }: Props) {
  const chips = proofStatChips(stats);
  if (chips.length === 0) {
    return null;
  }
  const prose = showProse ? proofStatsProse({ stats, displayName }) : null;
  return (
    <View style={{ gap: 4, alignItems: 'stretch' }}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        }}>
        {chips.map((chip) => (
          <View
            key={chip.key}
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: THEME.accentSoft,
            }}>
            <AppText
              className="text-[11px] font-bold"
              numberOfLines={1}
              style={{ color: THEME.accent }}>
              {chip.label}
            </AppText>
          </View>
        ))}
      </View>
      {prose ? (
        <AppText
          className="text-[12px]"
          style={{ color: THEME.textMuted, textAlign: align === 'right' ? 'right' : 'left' }}>
          {prose}
        </AppText>
      ) : null}
    </View>
  );
}
