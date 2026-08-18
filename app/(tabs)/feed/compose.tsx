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
      <AppText className="mb-4 text-[22px] font-bold text-charcoal">New post</AppText>
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
