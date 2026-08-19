import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { officialBob } from '@/copy/officialBob';
import { officialFitnessProofIcons } from '@/components/challenge/ProofRequirementIcons';
import type { Challenge } from '@/lib/types';

export function ChallengeDetailsCard({ challenge }: { challenge: Challenge }) {
  const proofs = officialFitnessProofIcons(challenge);
  return (
    <Card className="mt-4 gap-2">
      <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
        Details
      </AppText>
      <AppText className="text-[14px] leading-5 text-charcoal">{officialBob('cardPromise')}</AppText>
      <AppText className="text-[14px] leading-5 text-charcoal">{officialBob('legalBoard')}</AppText>
      <AppText className="text-[13px] leading-5 text-muted">{officialBob('legalDays')}</AppText>
      {proofs.camera || proofs.heart ? (
        <AppText className="text-[13px] leading-5 text-muted">{officialBob('detailsHardware')}</AppText>
      ) : null}
      <AppText className="text-[13px] leading-5 text-muted">{officialBob('legalAllFinish')}</AppText>
      <AppText className="text-[13px] leading-5 text-muted">{officialBob('legalZero')}</AppText>
      <AppText className="text-[12px] leading-5 text-muted">{officialBob('legalAge')}</AppText>
    </Card>
  );
}
