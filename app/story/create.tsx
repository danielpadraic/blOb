import { Redirect } from 'expo-router';

import { CAPTURE_STORY_HREF } from '@/lib/routes';

export default function CreateStoryScreen() {
  return <Redirect href={CAPTURE_STORY_HREF} />;
}
