import { Pressable, View } from 'react-native';

import { CreateIconChip } from '@/components/challenge/create/CreateIconChip';
import { DistanceMilesRow, HeartRateMinutesRow } from '@/components/challenge/create/ExtraTasksEditor';
import { LocationPlacePicker } from '@/components/challenge/LocationPlacePicker';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import {
  SIMPLE_PROOF_CAP,
  ensureProofSentence,
  proofDistanceMeters,
  proofNameForMethodChange,
  type ChallengeProof,
  type ChallengeProofMethod,
} from '@/lib/challengeProofs';
import { copy } from '@/lib/copy';
import type { DistanceUnit } from '@/lib/distance';
import {
  SIMPLE_PROOF_METHODS,
  addSimpleProof,
  applyBeforeAfterHrPreset,
  removeSimpleProof,
} from '@/lib/simpleChallenge';
import { THEME } from '@/lib/theme';

export function SimpleProofsEditor({
  proofs,
  onChange,
  cap = SIMPLE_PROOF_CAP,
  distanceUnit = 'mi',
  onDistanceUnitChange,
  showPreset = true,
}: {
  proofs: ChallengeProof[];
  onChange: (proofs: ChallengeProof[]) => void;
  cap?: number;
  distanceUnit?: DistanceUnit;
  onDistanceUnitChange?: (unit: DistanceUnit) => void;
  showPreset?: boolean;
}) {
  return (
    <View className="gap-2">
      <AppText className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        {copy('create.proofs')}
      </AppText>
      <View className="gap-3">
        {proofs.map((proof) => (
          <View key={proof.id} className="gap-2">
            <View className="flex-row items-center gap-2">
              <View className="flex-1">
                <Input
                  placeholder={copy('create.proofFallback')}
                  value={proof.name}
                  onChangeText={(name) =>
                    onChange(proofs.map((item) => (item.id === proof.id ? { ...item, name } : item)))
                  }
                  grow
                  maxLength={90}
                />
              </View>
              {proofs.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove proof"
                  onPress={() => onChange(removeSimpleProof(proofs, proof.id))}
                  className="h-[52px] w-[52px] items-center justify-center rounded-xl"
                  style={{ borderWidth: 1, borderColor: THEME.border, backgroundColor: THEME.surface }}>
                  <AppText className="text-[18px] font-semibold text-muted">×</AppText>
                </Pressable>
              ) : null}
            </View>
            <View className="flex-row flex-wrap gap-2">
              {SIMPLE_PROOF_METHODS.map((item) => (
                <CreateIconChip
                  key={item.value}
                  icon={item.icon}
                  label={item.label}
                  selected={proof.method === item.value}
                  onPress={() =>
                    onChange(
                      proofs.map((row) =>
                        row.id === proof.id
                          ? ensureProofSentence(
                              {
                                ...row,
                                method: item.value as ChallengeProofMethod,
                                minutes: item.value === 'hr' ? Math.max(row.minutes || 30, 1) : row.minutes,
                                distance_meters:
                                  item.value === 'distance' ? proofDistanceMeters(row) : row.distance_meters,
                                name: proofNameForMethodChange(
                                  row,
                                  item.value as ChallengeProofMethod,
                                  item.value === 'hr' ? Math.max(row.minutes || 30, 1) : 30,
                                ),
                              },
                              item.value === 'hr' ? Math.max(row.minutes || 30, 1) : 30,
                            )
                          : row,
                      ),
                    )
                  }
                />
              ))}
            </View>
            {proof.method === 'hr' ? (
              <HeartRateMinutesRow
                value={proof.minutes || 30}
                onChange={(minutes) =>
                  onChange(
                    proofs.map((row) =>
                      row.id === proof.id
                        ? ensureProofSentence({ ...row, method: 'hr', minutes }, minutes)
                        : row,
                    ),
                  )
                }
              />
            ) : null}
            {proof.method === 'distance' ? (
              <DistanceMilesRow
                meters={proofDistanceMeters(proof)}
                unit={distanceUnit}
                onChangeMeters={(distance_meters) =>
                  onChange(
                    proofs.map((row) =>
                      row.id === proof.id
                        ? ensureProofSentence({ ...row, method: 'distance', distance_meters })
                        : row,
                    ),
                  )
                }
                onChangeUnit={onDistanceUnitChange}
              />
            ) : null}
            {proof.method === 'location' ? (
              <LocationPlacePicker
                place={proof.place}
                onChange={(place) =>
                  onChange(
                    proofs.map((row) =>
                      row.id === proof.id ? ensureProofSentence({ ...row, method: 'location', place }) : row,
                    ),
                  )
                }
              />
            ) : null}
          </View>
        ))}
      </View>
      <View className="flex-row flex-wrap gap-2">
        {proofs.length < cap ? (
          <CreateIconChip
            icon=""
            label={copy('create.addProof')}
            selected={false}
            onPress={() => onChange(addSimpleProof(proofs, cap))}
          />
        ) : null}
        {showPreset ? (
          <CreateIconChip
            icon=""
            label={copy('create.proofPreset')}
            selected={false}
            onPress={() => onChange(applyBeforeAfterHrPreset().slice(0, cap))}
          />
        ) : null}
      </View>
      <AppText className="text-[12px] text-muted">{copy('create.proofsHelper')}</AppText>
      <AppText className="text-[12px] leading-5 text-muted">{copy('create.proofsBelong')}</AppText>
    </View>
  );
}
