import { Redirect } from 'expo-router';

import { CAPTURE_STORY_HREF } from '@/lib/routes';

/** Route `/story/create` stays for existing links. Capture UI is Wave. */
export default function CreateStoryScreen() {
  return <Redirect href={CAPTURE_STORY_HREF} />;
}
