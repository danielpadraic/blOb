import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { ScoringIconPicker } from '@/components/challenge/ScoringIconPicker';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { ScoringIcon } from '@/components/ui/ScoringIcon';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { resolveScoringIconKey } from '@/lib/scoringIcons';
import { COLORS } from '@/lib/constants';
import {
  ACTIVITY_UNIT_PRESETS,
  extrasKeepAddingFor,
  formatPoints,
  inferInputKind,
  type ActivityConfig,
  type LogInputKind,
} from '@/lib/comparablePoints';
import { THEME } from '@/lib/theme';

const INPUT_KINDS: { id: LogInputKind; label: string }[] = [
  { id: 'count', label: 'Count' },
  { id: 'decimal', label: 'Decimal' },
  { id: 'money', label: 'Money' },
];

export function ActivityCard({
  activity,
  index,
  parityPoints,
  extrasKeepAdding,
  canRemove,
  onChange,
  onRemove,
  onAddQualifier,
  onPatchQualifier,
  onRemoveQualifier,
}: {
  activity: ActivityConfig;
  index: number;
  parityPoints: number;
  extrasKeepAdding: boolean;
  canRemove: boolean;
  onChange: (partial: Partial<ActivityConfig>) => void;
  onRemove: () => void;
  onAddQualifier: () => void;
  onPatchQualifier: (id: string, label: string) => void;
  onRemoveQualifier: (id: string) => void;
}) {
  const [iconOpen, setIconOpen] = useState(false);
  const [multiplierIconOpen, setMultiplierIconOpen] = useState(false);
  const unitIsPreset = (ACTIVITY_UNIT_PRESETS as readonly string[]).includes(activity.unit);
  const inputKind = inferInputKind(activity.unit, activity.input_kind);
  const extrasOn = extrasKeepAddingFor(activity, { extras_keep_adding: extrasKeepAdding });
  const iconKey = resolveScoringIconKey({
    icon_key: activity.icon_key,
    name: activity.name,
    unit: activity.unit,
    input_kind: inputKind,
  });

  return (
    <View
      className="gap-3"
      style={{
        backgroundColor: THEME.surface,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: THEME.border,
        padding: 14,
      }}>
      <View className="flex-row items-center justify-between gap-2">
        <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Activity {index + 1}
        </AppText>
        {canRemove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove activity"
            onPress={onRemove}
            hitSlop={8}
            style={{ minHeight: 32, justifyContent: 'center' }}>
            <AppText className="text-sm font-semibold text-muted">Remove</AppText>
          </Pressable>
        ) : null}
      </View>

      <View className="flex-row items-start" style={{ gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose scoring icon"
          onPress={() => setIconOpen(true)}
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: THEME.accent,
            backgroundColor: THEME.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 22,
          }}>
          <ScoringIcon iconKey={iconKey} size={28} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Input
            label="Name"
            placeholder={index === 0 ? 'e.g. walks' : 'e.g. tickets'}
            value={activity.name}
            onChangeText={(name) => onChange({ name })}
            maxLength={40}
          />
        </View>
      </View>
      <ScoringIconPicker
        visible={iconOpen}
        selected={iconKey}
        onSelect={(next) => onChange({ icon_key: next })}
        onClose={() => setIconOpen(false)}
      />

      <View className="gap-2">
        <AppText className="text-sm font-semibold text-charcoal">Input</AppText>
        <ChipRow>
          {INPUT_KINDS.map((kind) => (
            <Chip
              key={kind.id}
              label={kind.label}
              selected={inputKind === kind.id}
              onPress={() =>
                onChange({
                  input_kind: kind.id,
                  unit:
                    kind.id === 'money' && unitIsPreset
                      ? 'USD'
                      : kind.id !== 'money' && activity.unit === 'USD'
                        ? 'sessions'
                        : activity.unit,
                })
              }
            />
          ))}
        </ChipRow>
        {inputKind === 'money' ? (
          <AppText className="text-xs leading-5 text-muted">
            Check-in shows a $ amount. The score still uses the number.
          </AppText>
        ) : null}
      </View>

      <View className="gap-2">
        <AppText className="text-sm font-semibold text-charcoal">Unit</AppText>
        <ChipRow>
          {ACTIVITY_UNIT_PRESETS.map((unit) => (
            <Chip
              key={unit}
              label={unit}
              selected={unitIsPreset && activity.unit === unit}
              onPress={() => onChange({ unit, input_kind: inputKind === 'money' ? 'count' : inputKind })}
            />
          ))}
          <Chip
            label="Other"
            selected={!unitIsPreset}
            onPress={() => onChange({ unit: unitIsPreset ? '' : activity.unit })}
          />
        </ChipRow>
        {unitIsPreset ? null : (
          <Input
            placeholder="e.g. walks"
            value={activity.unit === 'USD' && inputKind === 'money' ? 'USD' : activity.unit}
            onChangeText={(unit) => onChange({ unit, input_kind: inferInputKind(unit, inputKind) })}
            maxLength={20}
          />
        )}
      </View>

      <Input
        label="Full-value quantity"
        placeholder={inputKind === 'money' ? '30000' : '30'}
        keyboardType="decimal-pad"
        value={activity.parity_qty > 0 ? String(activity.parity_qty) : ''}
        onChangeText={(raw) => {
          const next = raw.replace(/[^\d.]/g, '');
          onChange({ parity_qty: next ? Number(next) : 0 });
        }}
        hint={
          activity.parity_qty > 0
            ? `${inputKind === 'money' ? '$' : ''}${activity.parity_qty} ${activity.unit || 'units'} = ${formatPoints(parityPoints)} pts`
            : `How much of this equals ${formatPoints(parityPoints)} pts`
        }
      />

      <ToggleRow
        title="Amounts above full value keep adding"
        body="Off caps this activity at its full-value quantity."
        value={extrasOn}
        onValueChange={(enabled) =>
          onChange({
            multiplier: { ...activity.multiplier, extra_factor: enabled ? 1 : 0 },
          })
        }
      />

      <ToggleRow
        title="Multiplier"
        body="Optional extra number that scales this activity."
        value={activity.multiplier.enabled}
        onValueChange={(enabled) =>
          onChange({ multiplier: { ...activity.multiplier, enabled } })
        }
      />
      {activity.multiplier.enabled ? (
        <View
          className="gap-2"
          style={{
            backgroundColor: THEME.accentSoft,
            borderRadius: 14,
            padding: 12,
          }}>
          <View className="flex-row items-start" style={{ gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose multiplier icon"
              onPress={() => setMultiplierIconOpen(true)}
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: THEME.border,
                backgroundColor: THEME.surface,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 22,
              }}>
              <ScoringIcon
                iconKey={resolveScoringIconKey({
                  icon_key: activity.multiplier.icon_key,
                  name: activity.multiplier.label,
                })}
                size={28}
              />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Input
                label="Scales with"
                placeholder="e.g. demos"
                value={activity.multiplier.label ?? ''}
                onChangeText={(label) =>
                  onChange({ multiplier: { ...activity.multiplier, label } })
                }
              />
            </View>
          </View>
          <ScoringIconPicker
            visible={multiplierIconOpen}
            selected={resolveScoringIconKey({
              icon_key: activity.multiplier.icon_key,
              name: activity.multiplier.label,
            })}
            onSelect={(next) =>
              onChange({ multiplier: { ...activity.multiplier, icon_key: next } })
            }
            onClose={() => setMultiplierIconOpen(false)}
          />
          <AppText className="text-xs leading-5 text-muted">
            Collected on each log as its own number. Counts past the last tier do not raise the percent.
          </AppText>
          {(activity.multiplier.tiers ?? []).map((tier, tierIndex) => (
            <View key={`${tier.threshold}-${tier.percent}-${tierIndex}`} className="flex-row items-start gap-2">
              <View className="flex-1">
                <Input
                  label={tierIndex === 0 ? 'At this many' : undefined}
                  placeholder="5"
                  keyboardType="number-pad"
                  value={tier.threshold ? String(tier.threshold) : ''}
                  onChangeText={(raw) => {
                    const next = [...(activity.multiplier.tiers ?? [])];
                    next[tierIndex] = {
                      ...tier,
                      threshold: Number(raw.replace(/[^\d.]/g, '')) || 0,
                    };
                    onChange({ multiplier: { ...activity.multiplier, tiers: next } });
                  }}
                />
              </View>
              <View className="flex-1">
                <Input
                  label={tierIndex === 0 ? 'Percent' : undefined}
                  placeholder="50"
                  keyboardType="number-pad"
                  value={tier.percent ? String(tier.percent) : ''}
                  onChangeText={(raw) => {
                    const next = [...(activity.multiplier.tiers ?? [])];
                    next[tierIndex] = {
                      ...tier,
                      percent: Number(raw.replace(/[^\d.]/g, '')) || 0,
                    };
                    onChange({ multiplier: { ...activity.multiplier, tiers: next } });
                  }}
                />
              </View>
              {(activity.multiplier.tiers ?? []).length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove tier"
                  onPress={() => {
                    const next = (activity.multiplier.tiers ?? []).filter((_, i) => i !== tierIndex);
                    onChange({ multiplier: { ...activity.multiplier, tiers: next } });
                  }}
                  className="h-[52px] w-[52px] items-center justify-center"
                  style={{
                    marginTop: tierIndex === 0 ? 22 : 0,
                    borderWidth: 1,
                    borderColor: THEME.border,
                    backgroundColor: THEME.surface,
                    borderRadius: 12,
                  }}>
                  <AppText className="text-[18px] font-semibold text-muted">×</AppText>
                </Pressable>
              ) : null}
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              onChange({
                multiplier: {
                  ...activity.multiplier,
                  tiers: [...(activity.multiplier.tiers ?? []), { threshold: 0, percent: 0 }],
                },
              })
            }
            className="items-center self-start rounded-full px-3"
            style={{
              minHeight: 36,
              borderWidth: 1,
              borderColor: THEME.border,
              backgroundColor: THEME.surface,
              justifyContent: 'center',
            }}>
            <AppText className="text-sm font-semibold text-charcoal">+ Add tier</AppText>
          </Pressable>
        </View>
      ) : null}

      <ToggleRow
        title="Qualifiers"
        body="Optional checklist before this activity counts."
        value={activity.qualifiers.enabled}
        onValueChange={(enabled) =>
          onChange({ qualifiers: { ...activity.qualifiers, enabled } })
        }
      />
      {activity.qualifiers.enabled ? (
        <View
          className="gap-2"
          style={{
            backgroundColor: THEME.accentSoft,
            borderRadius: 14,
            padding: 12,
          }}>
          {activity.qualifiers.items.map((item, itemIndex) => (
            <View key={item.id} className="flex-row items-start gap-2">
              <View className="flex-1">
                <Input
                  placeholder={itemIndex === 0 ? 'e.g. form check' : 'Another qualifier'}
                  value={item.label}
                  onChangeText={(label) => onPatchQualifier(item.id, label)}
                  maxLength={80}
                />
              </View>
              {activity.qualifiers.items.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove qualifier"
                  onPress={() => onRemoveQualifier(item.id)}
                  className="h-[52px] w-[52px] items-center justify-center"
                  style={{
                    borderWidth: 1,
                    borderColor: THEME.border,
                    backgroundColor: THEME.surface,
                    borderRadius: 12,
                  }}>
                  <AppText className="text-[18px] font-semibold text-muted">×</AppText>
                </Pressable>
              ) : null}
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={onAddQualifier}
            className="items-center self-start rounded-full px-3"
            style={{
              minHeight: 36,
              borderWidth: 1,
              borderColor: THEME.border,
              backgroundColor: THEME.surface,
              justifyContent: 'center',
            }}>
            <AppText className="text-sm font-semibold text-charcoal">+ Add qualifier</AppText>
          </Pressable>
        </View>
      ) : null}

      <ToggleRow
        title="Floor"
        body="A minimum quantity before this activity starts counting."
        value={Boolean(activity.floor?.enabled)}
        onValueChange={(enabled) =>
          onChange({
            floor: { enabled, min_qty: activity.floor?.min_qty ?? 0 },
          })
        }
      />
      {activity.floor?.enabled ? (
        <Input
          label="Minimum quantity"
          placeholder="0"
          keyboardType="decimal-pad"
          value={activity.floor.min_qty > 0 ? String(activity.floor.min_qty) : ''}
          onChangeText={(raw) => {
            const next = raw.replace(/[^\d.]/g, '');
            onChange({
              floor: { enabled: true, min_qty: next ? Number(next) : 0 },
            });
          }}
        />
      ) : null}
    </View>
  );
}

function ToggleRow({
  title,
  body,
  value,
  onValueChange,
}: {
  title: string;
  body: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1">
        <AppText className="font-semibold text-charcoal">{title}</AppText>
        <AppText className="mt-0.5 text-xs leading-5 text-muted">{body}</AppText>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: COLORS.mintDark, false: COLORS.line }}
        thumbColor={COLORS.white}
        ios_backgroundColor={COLORS.line}
      />
    </View>
  );
}
