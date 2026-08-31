import { MissBudgetLines } from '@/components/challenge/MissBudgetLines';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { officialDetailsParagraphs } from '@/copy/officialBob';
import { challengeShowsMissBudget } from '@/lib/missDuty';
import { THEME } from '@/lib/theme';
import type { Challenge } from '@/lib/types';

export function ChallengeDetailsCard({
  challenge,
  missesUsed = 0,
}: {
  challenge: Challenge;
  missesUsed?: number;
}) {
  const line = { color: THEME.textPrimary };
  const paragraphs = officialDetailsParagraphs(challenge);
  const showMisses = challengeShowsMissBudget(challenge);
  if (paragraphs.length === 0 && !showMisses) {
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
      {showMisses ? <MissBudgetLines challenge={challenge} used={missesUsed} /> : null}
    </Card>
  );
}
