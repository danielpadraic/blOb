import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StoryCreator } from '@/components/stories/StoryCreator';
import { THEME } from '@/lib/theme';

export default function CreateStoryScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 px-4" style={{ backgroundColor: THEME.background, paddingTop: insets.top + 8 }}>
      <StoryCreator />
    </View>
  );
}
