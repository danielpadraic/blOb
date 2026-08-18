import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { BodyUnitSystem } from '@/lib/bodyMetrics';

const OPTIONS = [
  { value: 'imperial' as const, label: 'ft / lb' },
  { value: 'metric' as const, label: 'cm / kg' },
];

type UnitToggleProps = {
  value: BodyUnitSystem;
  onChange: (value: BodyUnitSystem) => void;
};

export function UnitToggle({ value, onChange }: UnitToggleProps) {
  return (
    <SegmentedControl
      value={value}
      options={OPTIONS}
      onChange={onChange}
      accessibilityLabel="Measurement units"
    />
  );
}
