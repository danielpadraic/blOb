import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { officialDetailsParagraphs } from '@/copy/officialBob';
import { THEME } from '@/lib/theme';
import type { Challenge } from '@/lib/types';

export function ChallengeDetailsCard({ challenge }: { challenge: Challenge }) {
  const line = { color: THEME.textPrimary };
  const paragraphs = officialDetailsParagraphs(challenge);
  if (paragraphs.length === 0) {
    return null;
  }
  return (
    <Card className="mt-4 gap-3" style={{ overflow: 'visible' }}>
      <AppText className="text-[11px] font-semibold uppercase tracking-widest" style={line}>
        Details
      </AppText>
      {paragraphs.map((paragraph) => (
        <AppText key={paragraph} className="text-[14px] leading-6" style={line}>
          {paragraph}
        </AppText>
      ))}
    </Card>
  );
}
