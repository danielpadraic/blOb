import { OfficialHomeCarousel } from '@/components/feed/OfficialHomeCarousel';
import { WAVES_RAIL_HEIGHT } from '@/components/stories/StoryTray';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { useHomeOfficialChallenges } from '@/hooks/useChallenge';

export function FeaturedOfficialStrip() {
  const officials = useHomeOfficialChallenges();
  const slides = officials.data ?? [];

  if (slides.length === 0) {
    return null;
  }

  return (
    <TourAnchor
      id="tour-official"
      style={{ height: WAVES_RAIL_HEIGHT, maxHeight: WAVES_RAIL_HEIGHT, overflow: 'hidden' }}>
      <OfficialHomeCarousel slides={slides} />
    </TourAnchor>
  );
}
