import { MissBudgetLines } from '@/components/challenge/MissBudgetLines';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { officialDetailsParagraphs } from '@/copy/officialBob';
import { challengeShowsMissBudget } from '@/lib/missDuty';
import {
  isOfficialCoinChallenge,
  officialCoinMidWindowLine,
  officialCoinPrizeLine,
  officialCoinRulesParagraph,
  OFFICIAL_COIN_SPLIT_LINE,
  type OfficialCoinMembership,
} from '@/lib/officialCoin';
import { THEME } from '@/lib/theme';
import type { Challenge } from '@/lib/types';

export function ChallengeDetailsCard({
  challenge,
  missesUsed = 0,
  membership,
}: {
  challenge: Challenge;
  missesUsed?: number;
  /** Official Coin only: used to say how many days this person still has. */
  membership?: OfficialCoinMembership | null;
}) {
  const line = { color: THEME.textPrimary };

  if (isOfficialCoinChallenge(challenge)) {
    const midWindow = officialCoinMidWindowLine(challenge, membership);
    return (
      <Card className="mt-4 gap-3" style={{ overflow: 'visible' }}>
        <AppText className="text-[11px] font-semibold uppercase tracking-widest" style={line}>
          Rules
        </AppText>
        <AppText className="text-[14px] leading-6" style={line}>
          {officialCoinRulesParagraph(challenge)}
        </AppText>
        <AppText className="text-[14px] leading-6" style={line}>
          {`${officialCoinPrizeLine(challenge)} ${OFFICIAL_COIN_SPLIT_LINE}`}
        </AppText>
        {midWindow ? (
          <AppText className="text-[13px] leading-5" style={{ color: THEME.textMuted }}>
            {midWindow}
          </AppText>
        ) : null}
      </Card>
    );
  }

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
