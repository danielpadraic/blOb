import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { useMediaLightboxOptional } from '@/components/feed/MediaLightbox';
import { AppText } from '@/components/ui/AppText';
import { storyHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import { storyIdFromShareText } from '@/lib/waveShare';
import type { Message } from '@/types/social';
import { formatFeedTime } from '@/utils/format';

type MessageBubbleProps = {
  message: Message;
  mine: boolean;
};

export function MessageBubble({ message, mine }: MessageBubbleProps) {
  const router = useRouter();
  const lightbox = useMediaLightboxOptional();
  const photo = message.media_url?.trim() || null;
  const text = message.body?.trim() || '';
  const storyId = text ? storyIdFromShareText(text) : null;
  if (!text && !photo) {
    return null;
  }

  const bubble = (
    <View
      className="overflow-hidden"
      style={{
        backgroundColor: mine ? THEME.primary : THEME.surface,
        borderRadius: 20,
        borderBottomRightRadius: mine ? 6 : 20,
        borderBottomLeftRadius: mine ? 20 : 6,
        borderWidth: mine ? 0 : 1,
        borderColor: THEME.border,
      }}>
      {photo ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open photo"
          onPress={() => lightbox?.openLightbox([{ uri: photo, label: 'Photo' }])}
          disabled={!lightbox}
          style={{
            width: 220,
            maxWidth: '100%',
            aspectRatio: 1,
            backgroundColor: THEME.surface,
          }}>
          <Image
            source={{ uri: photo }}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={photo}
          />
        </Pressable>
      ) : null}
      {text ? (
        <View className="px-3.5 py-2.5">
          <AppText
            className="text-[15px] leading-5"
            style={{ color: mine ? THEME.primaryForeground : THEME.textPrimary }}>
            {storyId ? 'Open this Wave' : text}
          </AppText>
        </View>
      ) : null}
    </View>
  );

  return (
    <View className={mine ? 'max-w-[78%] items-end self-end' : 'max-w-[78%] items-start self-start'}>
      {storyId ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Open Wave"
          onPress={() => router.push(storyHref(storyId))}>
          {bubble}
        </Pressable>
      ) : (
        bubble
      )}
      <AppText className="mt-1 text-[10px] text-muted">{formatFeedTime(message.created_at)}</AppText>
    </View>
  );
}
