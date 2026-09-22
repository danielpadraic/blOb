import { SharedTabs } from '@/components/ui/SharedTabs';
import { canSeeCorporateLive } from '@/lib/privacyMode';

export { asChallengePageTab } from '@/lib/livePush';

export const CHALLENGE_PAGE_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'board', label: 'Board' },
  { value: 'feed', label: 'Live' },
] as const;

export const CHALLENGE_LIVE_ONLY_TABS = [{ value: 'feed', label: 'Live' }] as const;

export type ChallengePageTab = (typeof CHALLENGE_PAGE_TABS)[number]['value'];

export function challengeTabsForViewer(input: {
  privacyMode?: string | null;
  isParticipant?: boolean | null;
  isHost?: boolean | null;
  isMod?: boolean | null;
  isOps?: boolean | null;
  isCalloutObserver?: boolean | null;
}): readonly { value: ChallengePageTab; label: string }[] {
  if (input.isCalloutObserver) {
    return CHALLENGE_LIVE_ONLY_TABS;
  }
  if (!canSeeCorporateLive(input)) {
    return CHALLENGE_PAGE_TABS.filter((tab) => tab.value !== 'feed');
  }
  return CHALLENGE_PAGE_TABS;
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
