import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { officialBob } from '@/copy/officialBob';
import { methodFromProofType, parseChallengeProofs } from '@/lib/challengeProofs';
import { THEME, themeShadow } from '@/lib/theme';
import type { Challenge } from '@/lib/types';

type ProofKind = 'camera' | 'heart';

function isCameraType(value: string): boolean {
  return value === 'photo' || value === 'video' || value === 'pre_selfie' || value === 'post_selfie';
}

function isHeartType(value: string): boolean {
  return value === 'hr' || value === 'hr_monitor';
}

export function officialFitnessProofIcons(challenge: Pick<
  Challenge,
  'is_official' | 'category' | 'proofs' | 'proof_type' | 'proof_requirements' | 'challenge_type' | 'tasks'
>): { camera: boolean; heart: boolean } {
  if (challenge.is_official) {
    const category = String(challenge.category ?? 'fitness').toLowerCase();
    if (category === 'fitness') {
      return { camera: true, heart: true };
    }
  }

  let camera = false;
  let heart = false;
  for (const proof of parseChallengeProofs(challenge.proofs)) {
    if (proof.method === 'photo' || proof.method === 'video') {
      camera = true;
    }
    if (proof.method === 'hr') {
      heart = true;
    }
  }
  if (challenge.proof_type) {
    const proofType = methodFromProofType(challenge.proof_type);
    if (proofType === 'photo' || proofType === 'video') {
      camera = true;
    }
    if (proofType === 'hr') {
      heart = true;
    }
  }
  for (const item of challenge.proof_requirements ?? []) {
    const type = String(item.type ?? '').toLowerCase();
    if (isCameraType(type)) {
      camera = true;
    }
    if (isHeartType(type)) {
      heart = true;
    }
  }
  for (const task of challenge.tasks ?? []) {
    for (const type of task.proof_types ?? []) {
      const value = String(type).toLowerCase();
      if (isCameraType(value) || value === 'photo' || value === 'video') {
        camera = true;
      }
      if (isHeartType(value)) {
        heart = true;
      }
    }
  }
  return { camera, heart };
}

type ProofRequirementIconsProps = {
  challenge: Pick<
    Challenge,
    'is_official' | 'category' | 'proofs' | 'proof_type' | 'proof_requirements' | 'challenge_type' | 'tasks'
  >;
  tint?: 'light' | 'dark';
};

export function ProofRequirementIcons({ challenge, tint = 'light' }: ProofRequirementIconsProps) {
  const icons = officialFitnessProofIcons(challenge);
  const [open, setOpen] = useState<ProofKind | null>(null);
  if (!icons.camera && !icons.heart) {
    return null;
  }

  const color = tint === 'light' ? '#FFFFFF' : THEME.textPrimary;
  const copyFor = (kind: ProofKind) =>
    kind === 'camera' ? officialBob('proofCamera') : officialBob('proofHeart');

  return (
    <View style={{ zIndex: 8 }}>
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <AppText
          className="text-[13px] font-semibold"
          style={{ color }}
          numberOfLines={1}>
          Required:
        </AppText>
        {icons.camera ? (
          <ProofIconButton
            label="Camera proof"
            icon={GLYPH.camera}
            color={color}
            onPress={() => setOpen((current) => (current === 'camera' ? null : 'camera'))}
          />
        ) : null}
        {icons.heart ? (
          <ProofIconButton
            label="Heart-rate proof"
            icon={GLYPH.heartbeat}
            color={color}
            onPress={() => setOpen((current) => (current === 'heart' ? null : 'heart'))}
          />
        ) : null}
      </View>
      {open ? (
        <View
          accessibilityRole="text"
          style={{
            position: 'absolute',
            top: 46,
            left: 0,
            width: 260,
            zIndex: 20,
            backgroundColor: THEME.surface,
            borderColor: THEME.border,
            borderWidth: 1,
            borderRadius: 16,
            paddingHorizontal: 12,
            paddingVertical: 10,
            ...themeShadow('card'),
          }}>
          <AppText className="text-[13px] leading-5 text-charcoal">{copyFor(open)}</AppText>
        </View>
      ) : null}
    </View>
  );
}

function ProofIconButton({
  label,
  icon,
  color,
  onPress,
}: {
  label: string;
  icon: (typeof GLYPH)[keyof typeof GLYPH];
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      hitSlop={6}
      style={{
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
      }}>
      <Glyph name={icon} color={color} size={18} />
    </Pressable>
  );
}
