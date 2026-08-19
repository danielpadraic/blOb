import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { OFFICIAL_DETAILS_LINES } from '@/copy/officialBob';
import { THEME } from '@/lib/theme';
import type { Challenge } from '@/lib/types';

export function ChallengeDetailsCard(_props: { challenge: Challenge }) {
  const line = { color: THEME.textPrimary };
  return (
    <Card className="mt-4 gap-3" style={{ overflow: 'visible' }}>
      <AppText className="text-[11px] font-semibold uppercase tracking-widest" style={line}>
        Details
      </AppText>
      {OFFICIAL_DETAILS_LINES.map((paragraph) => (
        <AppText key={paragraph} className="text-[14px] leading-6" style={line}>
          {paragraph}
        </AppText>
      ))}
    </Card>
  );
}
