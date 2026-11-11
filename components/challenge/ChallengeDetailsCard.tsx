import { View } from 'react-native';

import { MissBudgetLines } from '@/components/challenge/MissBudgetLines';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { officialDetailsParagraphs } from '@/copy/officialBob';
import { challengeShowsMissBudget } from '@/lib/missDuty';
import {
  isOfficialCoinChallenge,
  officialCoinMidWindowLines,
  officialCoinPrizeLine,
  OFFICIAL_COIN_ABOUT,
  OFFICIAL_COIN_ONE_LIVE_LINE,
  OFFICIAL_COIN_WINDOWS,
  type OfficialCoinChallenge,
  type OfficialCoinMembership,
} from '@/lib/officialCoin';
import { THEME } from '@/lib/theme';
import type { Challenge } from '@/lib/types';

export function ChallengeDetailsCard({
  challenge,
  missesUsed = 0,
  membership,
  coinWeekly,
  coinMonthly,
  nowMs,
}: {
  challenge: Challenge;
  missesUsed?: number;
  /** Official Coin only: used to say how many days this person still has. */
  membership?: OfficialCoinMembership | null;
  /** Official Coin only: both windows, so one page explains both. */
  coinWeekly?: { challenge: OfficialCoinChallenge; membership?: OfficialCoinMembership | null } | null;
  coinMonthly?: { challenge: OfficialCoinChallenge; membership?: OfficialCoinMembership | null } | null;
  nowMs?: number;
}) {
  const line = { color: THEME.textPrimary };

  if (isOfficialCoinChallenge(challenge)) {
    const now = new Date(nowMs ?? Date.now());
    const weeklyRoom = coinWeekly ?? { challenge: challenge as OfficialCoinChallenge, membership };
    const midLines = officialCoinMidWindowLines(weeklyRoom, coinMonthly, now);
    const prizeLine = officialCoinPrizeLine(weeklyRoom.challenge, coinMonthly?.challenge);
    return (
      <Card className="mt-4 gap-3" style={{ overflow: 'visible' }}>
        <View>
          <AppText className="text-[15px] font-extrabold leading-6" style={line}>
            {OFFICIAL_COIN_WINDOWS.title}
          </AppText>
          <AppText className="mt-1 text-[14px] leading-6" style={line}>
            {OFFICIAL_COIN_WINDOWS.weekly}
          </AppText>
          <AppText className="mt-2 text-[14px] leading-6" style={line}>
            {OFFICIAL_COIN_WINDOWS.monthly}
          </AppText>
          <AppText className="mt-2 text-[14px] leading-6" style={line}>
            {OFFICIAL_COIN_ONE_LIVE_LINE}
          </AppText>
        </View>
        {prizeLine ? (
          <AppText className="text-[15px] font-extrabold leading-6" style={line}>
            {prizeLine}
          </AppText>
        ) : null}
        <View>
          <AppText className="text-[15px] font-extrabold leading-6" style={line}>
            {OFFICIAL_COIN_ABOUT.proofTitle}
          </AppText>
          <View className="mt-1 gap-1">
            {OFFICIAL_COIN_ABOUT.proofs.map((proof) => (
              <View key={proof} className="flex-row" style={{ gap: 8 }}>
                <AppText className="text-[14px] leading-6" style={line}>
                  •
                </AppText>
                <AppText className="min-w-0 flex-1 text-[14px] leading-6" style={line}>
                  {proof}
                </AppText>
              </View>
            ))}
          </View>
        </View>
        {midLines.map((midWindow) => (
          <AppText key={midWindow} className="text-[13px] leading-5" style={{ color: THEME.textMuted }}>
            {midWindow}
          </AppText>
        ))}
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
