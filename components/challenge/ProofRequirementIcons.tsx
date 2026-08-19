import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { officialBob } from '@/copy/officialBob';
import { THEME, themeShadow } from '@/lib/theme';
import type { Challenge } from '@/lib/types';

type ProofKind = 'camera' | 'heart';

export function officialFitnessProofIcons(challenge: Pick<
  Challenge,
  'is_official' | 'category' | 'proofs' | 'proof_type' | 'proof_requirements' | 'challenge_type' | 'tasks'
>): { camera: boolean; heart: boolean } {
  if (!challenge.is_official) {
    return { camera: false, heart: false };
  }
  const category = String(challenge.category ?? 'fitness').toLowerCase();
  if (category !== 'fitness') {
    return { camera: false, heart: false };
  }
  return { camera: true, heart: true };
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
