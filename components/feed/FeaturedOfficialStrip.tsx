import { View } from 'react-native';

import { OfficialHomeCarousel } from '@/components/feed/OfficialHomeCarousel';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { useHomeOfficialChallenges } from '@/hooks/useChallenge';

export function FeaturedOfficialStrip() {
  const officials = useHomeOfficialChallenges();
  const slides = officials.data ?? [];

  if (slides.length === 0) {
    return null;
  }

  return (
    <TourAnchor id="tour-official">
      <View>
        <OfficialHomeCarousel slides={slides} />
      </View>
    </TourAnchor>
  );
}
