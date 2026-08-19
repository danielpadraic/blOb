import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { officialBob } from '@/copy/officialBob';
import { officialFitnessProofIcons } from '@/components/challenge/ProofRequirementIcons';
import { THEME } from '@/lib/theme';
import type { Challenge } from '@/lib/types';

export function ChallengeDetailsCard({ challenge }: { challenge: Challenge }) {
  const proofs = officialFitnessProofIcons(challenge);
  const line = { color: THEME.textPrimary };
  return (
    <Card className="mt-4 gap-3" style={{ overflow: 'visible' }}>
      <AppText className="text-[11px] font-semibold uppercase tracking-widest" style={line}>
        Details
      </AppText>
      <AppText className="text-[14px] leading-6" style={line}>
        {officialBob('cardPromise')}
      </AppText>
      <AppText className="text-[14px] leading-6" style={line}>
        {officialBob('legalBoard')}
      </AppText>
      <AppText className="text-[14px] leading-6" style={line}>
        {officialBob('legalDays')}
      </AppText>
      {proofs.camera || proofs.heart ? (
        <AppText className="text-[14px] leading-6" style={line}>
          {officialBob('detailsHardware')}
        </AppText>
      ) : null}
      <AppText className="text-[14px] leading-6" style={line}>
        {officialBob('legalAllFinish')}
      </AppText>
      <AppText className="text-[14px] leading-6" style={line}>
        {officialBob('legalAge')}
      </AppText>
    </Card>
  );
}
