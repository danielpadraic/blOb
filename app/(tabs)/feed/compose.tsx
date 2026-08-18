import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, View } from 'react-native';

import { Composer } from '@/components/feed/Composer';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useCreatePost } from '@/hooks/useFeed';
import { useCopyTone } from '@/hooks/useCopy';
import { copy } from '@/lib/copy';

function firstParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function NewPostScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    wallHostId?: string;
    wallHostName?: string;
    wallHostUsername?: string;
    returnTo?: string;
  }>();
  const createPost = useCreatePost();
  const tone = useCopyTone();
  const wallHostId = firstParam(params.wallHostId);
  const wallHostName = firstParam(params.wallHostName);
  const wallHostUsername = firstParam(params.wallHostUsername);
  const returnTo = firstParam(params.returnTo);

  return (
    <Screen>
      <AppText className="mb-4 text-[22px] font-bold text-charcoal">New post</AppText>
      <View>
        <Composer
          autoFocus
          submitting={createPost.isPending}
          placeholder={copy('home.composer', tone)}
          wallHost={
            wallHostId
              ? { id: wallHostId, name: wallHostName, username: wallHostUsername }
              : null
          }
          onSubmit={async (input) => {
            try {
              const created = await createPost.mutateAsync(input);
              if (wallHostUsername) {
                const posted = created && typeof created === 'object' && 'id' in created
                  ? String((created as { id: string }).id)
                  : '';
                if (returnTo) {
                  const joiner = returnTo.includes('?') ? '&' : '?';
                  router.replace((posted ? `${returnTo}${joiner}posted=${posted}` : returnTo) as never);
                  return;
                }
                router.replace({
                  pathname: '/feed/u/[username]',
                  params: posted ? { username: wallHostUsername, posted } : { username: wallHostUsername },
                });
                return;
              }
              router.back();
            } catch (error) {
              const message = error instanceof Error ? error.message : '';
              if (message === copy('wall.closed')) {
                Alert.alert(copy('wall.closed'));
                router.back();
                return;
              }
              throw error;
            }
          }}
        />
      </View>
    </Screen>
  );
}
