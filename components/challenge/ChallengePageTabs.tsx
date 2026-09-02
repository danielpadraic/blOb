import { SharedTabs } from '@/components/ui/SharedTabs';

export const CHALLENGE_PAGE_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'board', label: 'Board' },
  { value: 'feed', label: 'Live' },
] as const;

export const CHALLENGE_LIVE_ONLY_TABS = [{ value: 'feed', label: 'Live' }] as const;

export type ChallengePageTab = (typeof CHALLENGE_PAGE_TABS)[number]['value'];

export function ChallengePageTabs({
  value,
  onChange,
  options = CHALLENGE_PAGE_TABS,
}: {
  value: ChallengePageTab;
  onChange: (tab: ChallengePageTab) => void;
  options?: readonly { value: ChallengePageTab; label: string }[];
}) {
  return (
    <SharedTabs
      value={value}
      onChange={onChange}
      options={options}
      accessibilityLabel="Challenge sections"
    />
  );
}
