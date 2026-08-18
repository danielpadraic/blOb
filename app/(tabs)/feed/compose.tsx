import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Composer } from '@/components/feed/Composer';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useCreatePost } from '@/hooks/useFeed';

export default function NewPostScreen() {
  const router = useRouter();
  const createPost = useCreatePost();

  return (
    <Screen>
      <AppText className="mb-3 text-[22px] font-bold text-charcoal">What’s the play?</AppText>
      <AppText className="mb-4 text-muted">
        Share a workout, a win, or a dare. Tag someone with @username if you want them to see it.
      </AppText>
      <View>
        <Composer
          autoFocus
          submitting={createPost.isPending}
          placeholder="Write a post…"
          onSubmit={async (input) => {
            await createPost.mutateAsync(input);
            router.back();
          }}
        />
      </View>
    </Screen>
  );
}
