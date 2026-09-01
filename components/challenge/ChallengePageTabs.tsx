import { SharedTabs } from '@/components/ui/SharedTabs';

export const CHALLENGE_PAGE_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'board', label: 'Board' },
  { value: 'feed', label: 'Live' },
] as const;

export type ChallengePageTab = (typeof CHALLENGE_PAGE_TABS)[number]['value'];

export function ChallengePageTabs({
  value,
  onChange,
}: {
  value: ChallengePageTab;
  onChange: (tab: ChallengePageTab) => void;
}) {
  return (
    <SharedTabs
      value={value}
      onChange={onChange}
      options={CHALLENGE_PAGE_TABS}
      accessibilityLabel="Challenge sections"
    />
  );
}
