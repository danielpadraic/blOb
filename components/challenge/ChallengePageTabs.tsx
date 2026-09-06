import { SharedTabs } from '@/components/ui/SharedTabs';

export const CHALLENGE_PAGE_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'board', label: 'Board' },
  { value: 'feed', label: 'Live' },
] as const;

export const CHALLENGE_LIVE_ONLY_TABS = [{ value: 'feed', label: 'Live' }] as const;

export type ChallengePageTab = (typeof CHALLENGE_PAGE_TABS)[number]['value'];

/** Push / share links use `tab=live`. Internal tab value stays `feed`. */
export function asChallengePageTab(value?: string | null): ChallengePageTab {
  if (value === 'live' || value === 'feed') {
    return 'feed';
  }
  if (value === 'board' || value === 'overview') {
    return value;
  }
  return 'overview';
}

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
