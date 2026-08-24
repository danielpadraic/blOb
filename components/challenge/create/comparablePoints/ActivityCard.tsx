import { Pressable, Switch, View } from 'react-native';

import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { COLORS } from '@/lib/constants';
import {
  ACTIVITY_UNIT_PRESETS,
  formatPoints,
  type ActivityConfig,
} from '@/lib/comparablePoints';
import { THEME } from '@/lib/theme';

export function ActivityCard({
  activity,
  index,
  parityPoints,
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
  canRemove: boolean;
  onChange: (partial: Partial<ActivityConfig>) => void;
  onRemove: () => void;
  onAddQualifier: () => void;
  onPatchQualifier: (id: string, label: string) => void;
  onRemoveQualifier: (id: string) => void;
}) {
  const unitIsPreset = (ACTIVITY_UNIT_PRESETS as readonly string[]).includes(activity.unit);

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

      <Input
        label="Name"
        placeholder={index === 0 ? 'e.g. Running' : 'e.g. Push-ups'}
        value={activity.name}
        onChangeText={(name) => onChange({ name })}
        maxLength={40}
      />

      <View className="gap-2">
        <AppText className="text-sm font-semibold text-charcoal">Unit</AppText>
        <ChipRow>
          {ACTIVITY_UNIT_PRESETS.map((unit) => (
            <Chip
              key={unit}
              label={unit}
              selected={unitIsPreset && activity.unit === unit}
              onPress={() => onChange({ unit })}
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
            placeholder="e.g. pages"
            value={activity.unit}
            onChangeText={(unit) => onChange({ unit })}
            maxLength={20}
          />
        )}
      </View>

      <Input
        label="Quantity at full value"
        placeholder="30"
        keyboardType="decimal-pad"
        value={activity.parity_qty > 0 ? String(activity.parity_qty) : ''}
        onChangeText={(raw) => {
          const next = raw.replace(/[^\d.]/g, '');
          onChange({ parity_qty: next ? Number(next) : 0 });
        }}
        hint={
          activity.parity_qty > 0
            ? `${activity.parity_qty} ${activity.unit || 'units'} = ${formatPoints(parityPoints)} pts`
            : `How much of this equals ${formatPoints(parityPoints)} pts`
        }
      />

      <ToggleRow
        title="Multiplier"
        body="Extra work after full value still scores, at a lower rate."
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
          <Input
            label="Multiplier label"
            placeholder="e.g. presentations"
            value={activity.multiplier.label ?? ''}
            onChangeText={(label) =>
              onChange({ multiplier: { ...activity.multiplier, label } })
            }
          />
          {(activity.multiplier.tiers ?? []).map((tier, tierIndex) => (
            <View key={`${tier.threshold}-${tier.percent}-${tierIndex}`} className="flex-row items-start gap-2">
              <View className="flex-1">
                <Input
                  label={tierIndex === 0 ? 'At this many' : undefined}
                  placeholder="1"
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
                  placeholder="25"
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
          {(activity.multiplier.tiers ?? []).length === 0 ? (
            <Input
              label="Extra-work factor"
              placeholder="0.5"
              keyboardType="decimal-pad"
              value={String(activity.multiplier.extra_factor)}
              onChangeText={(raw) => {
                const next = Number(raw.replace(/[^\d.]/g, ''));
                onChange({
                  multiplier: {
                    ...activity.multiplier,
                    extra_factor: Number.isFinite(next) ? next : activity.multiplier.extra_factor,
                  },
                });
              }}
              hint="After full value, extra units score at this multiple. 0.5 = half rate."
            />
          ) : null}
        </View>
      ) : null}

      <ToggleRow
        title="Qualifiers"
        body="A bar this check-in must meet before it counts."
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
                  placeholder={itemIndex === 0 ? 'e.g. FEX' : 'Another qualifier'}
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
