import { SharedTabs } from '@/components/ui/SharedTabs';
import { copy } from '@/lib/copy';

export const CIRCLE_PAGE_TABS = [
  { value: 'details', label: copy('circles.details') },
  { value: 'roster', label: copy('circles.roster') },
  { value: 'chat', label: copy('circles.chat') },
] as const;

export type CirclePageTab = (typeof CIRCLE_PAGE_TABS)[number]['value'];

export function CirclePageTabs({
  value,
  onChange,
  member = true,
}: {
  value: CirclePageTab;
  onChange: (tab: CirclePageTab) => void;
  member?: boolean;
}) {
  const options = member ? CIRCLE_PAGE_TABS : CIRCLE_PAGE_TABS.filter((tab) => tab.value !== 'chat');
  return (
    <SharedTabs
      value={value}
      onChange={onChange}
      options={options}
      accessibilityLabel="Circle sections"
    />
  );
}
