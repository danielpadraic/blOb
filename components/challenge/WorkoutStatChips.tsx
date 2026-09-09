import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { formatHealthDuration, parseHealthDurationInput } from '@/lib/health/durationChip';
import { METERS_PER_MILE, clampOcrDistance, clampOcrField, OCR_LIMITS } from '@/lib/health/workoutOcr';
import type { OcrSessionFields } from '@/lib/health/ocrSession';
import { THEME } from '@/lib/theme';

/**
 * Editable stat chips under the proof photo, fed by the screenshot reader.
 *
 * Tapping a chip opens a numeric field. Blur clamps to the same ranges the database check
 * constraints enforce, so a corrected value can never be rejected on Send.
 */

type ChipKey = 'durationSec' | 'activeEnergyKcal' | 'avgHrBpm' | 'maxHrBpm' | 'distanceMeters';

type Props = {
  fields: OcrSessionFields;
  /** Called with the corrected field set. The caller flips the session source to manual. */
  onChange: (fields: OcrSessionFields) => void;
  /** Distance unit the athlete types in. Metres are stored either way. */
  distanceUnit?: 'mi' | 'km';
  editable?: boolean;
  /** Empty chips the user can tap to type 32 min / 142 bpm when OCR missed. */
  allowAdd?: boolean;
};

/** What each chip shows when it is not being edited. */
function chipLabel(key: ChipKey, fields: OcrSessionFields, unit: 'mi' | 'km'): string | null {
  if (key === 'durationSec') {
    return formatHealthDuration(fields.durationSec);
  }
  if (key === 'activeEnergyKcal') {
    const kcal = fields.activeEnergyKcal ?? fields.totalEnergyKcal;
    return kcal == null ? null : `${kcal} cal`;
  }
  if (key === 'avgHrBpm') {
    return fields.avgHrBpm == null ? null : `${fields.avgHrBpm} bpm avg`;
  }
  if (key === 'maxHrBpm') {
    return fields.maxHrBpm == null ? null : `${fields.maxHrBpm} bpm max`;
  }
  if (fields.distanceMeters == null) {
    return null;
  }
  const value = unit === 'mi' ? fields.distanceMeters / METERS_PER_MILE : fields.distanceMeters / 1000;
  return `${value.toFixed(2)} ${unit}`;
}

/** The value the editor starts with, in the unit the user types. */
function editValue(key: ChipKey, fields: OcrSessionFields, unit: 'mi' | 'km'): string {
  if (key === 'durationSec') {
    return formatHealthDuration(fields.durationSec) ?? '';
  }
  if (key === 'distanceMeters') {
    if (fields.distanceMeters == null) {
      return '';
    }
    const value = unit === 'mi' ? fields.distanceMeters / METERS_PER_MILE : fields.distanceMeters / 1000;
    return value.toFixed(2);
  }
  if (key === 'activeEnergyKcal') {
    return String(fields.activeEnergyKcal ?? fields.totalEnergyKcal ?? '');
  }
  const raw = fields[key];
  return raw == null ? '' : String(raw);
}

const HINTS: Record<ChipKey, string> = {
  durationSec: 'mm:ss',
  activeEnergyKcal: `0–${OCR_LIMITS.kcal.max} cal`,
  avgHrBpm: `${OCR_LIMITS.hrBpm.min}–${OCR_LIMITS.hrBpm.max} bpm`,
  maxHrBpm: `${OCR_LIMITS.hrBpm.min}–${OCR_LIMITS.hrBpm.max} bpm`,
  distanceMeters: 'distance',
};

const ORDER: ChipKey[] = ['durationSec', 'activeEnergyKcal', 'distanceMeters', 'avgHrBpm'];
const ADD_LABEL: Record<ChipKey, string> = {
  durationSec: 'Add time',
  activeEnergyKcal: 'Add cal',
  avgHrBpm: 'Add bpm',
  maxHrBpm: 'Add bpm',
  distanceMeters: 'Add distance',
};

export function WorkoutStatChips({
  fields,
  onChange,
  distanceUnit = 'mi',
  editable = true,
  allowAdd = false,
}: Props) {
  const [editing, setEditing] = useState<ChipKey | null>(null);
  const [draft, setDraft] = useState('');

  const present = ORDER.filter((key) => chipLabel(key, fields, distanceUnit) != null);
  const extras = allowAdd ? ORDER.filter((key) => !present.includes(key)) : [];
  if (present.length === 0 && extras.length === 0) {
    return null;
  }

  function commit(key: ChipKey) {
    const raw = draft.trim();
    const next: OcrSessionFields = { ...fields };
    if (raw.length === 0) {
      // Clearing a chip drops the field rather than storing a zero.
      delete next[key];
      setEditing(null);
      onChange(next);
      return;
    }
    const typed = Number(raw.replace(/,/g, ''));
    if (key === 'distanceMeters') {
      const metres = clampOcrDistance(typed, distanceUnit);
      if (metres == null) {
        setEditing(null);
        return;
      }
      next.distanceMeters = metres;
    } else if (key === 'durationSec') {
      const parsed = parseHealthDurationInput(raw);
      const seconds = parsed == null ? null : clampOcrField('durationSec', parsed);
      if (seconds == null) {
        setEditing(null);
        return;
      }
      next.durationSec = seconds;
    } else {
      const value = clampOcrField(key, typed);
      if (value == null) {
        setEditing(null);
        return;
      }
      next[key] = value;
    }
    setEditing(null);
    onChange(next);
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {present.map((key) => {
        if (editing === key) {
          return (
            <View
              key={key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: THEME.accent,
                backgroundColor: THEME.surface,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onBlur={() => commit(key)}
                onSubmitEditing={() => commit(key)}
                keyboardType={key === 'durationSec' ? 'numbers-and-punctuation' : 'numeric'}
                autoFocus
                returnKeyType="done"
                placeholder={HINTS[key]}
                placeholderTextColor={THEME.textMuted}
                style={{ minWidth: 52, paddingVertical: 0, color: THEME.textPrimary, fontSize: 12 }}
              />
            </View>
          );
        }
        return (
          <Pressable
            key={key}
            disabled={!editable}
            onPress={() => {
              setDraft(editValue(key, fields, distanceUnit));
              setEditing(key);
            }}
            hitSlop={6}
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: THEME.border,
              backgroundColor: THEME.accentSoft,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}>
            <AppText className="text-[12px] font-semibold" style={{ color: THEME.accent }}>
              {chipLabel(key, fields, distanceUnit)}
            </AppText>
          </Pressable>
        );
      })}
      {extras.map((key) => {
        if (editing === key) {
          return (
            <View
              key={key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: THEME.accent,
                backgroundColor: THEME.surface,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onBlur={() => commit(key)}
                onSubmitEditing={() => commit(key)}
                keyboardType={key === 'durationSec' ? 'numbers-and-punctuation' : 'numeric'}
                autoFocus
                returnKeyType="done"
                placeholder={HINTS[key]}
                placeholderTextColor={THEME.textMuted}
                style={{ minWidth: 52, paddingVertical: 0, color: THEME.textPrimary, fontSize: 12 }}
              />
            </View>
          );
        }
        return (
          <Pressable
            key={`add-${key}`}
            disabled={!editable}
            onPress={() => {
              setDraft('');
              setEditing(key);
            }}
            hitSlop={6}
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: THEME.border,
              backgroundColor: THEME.surface,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}>
            <AppText className="text-[12px] font-semibold" style={{ color: THEME.textMuted }}>
              {key === 'distanceMeters' ? `Add ${distanceUnit}` : ADD_LABEL[key]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
