import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { useMediaLightboxOptional } from '@/components/feed/MediaLightbox';
import { MascotState } from '@/components/mascot/MascotState';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { useSocialSheetsOptional } from '@/components/social/SocialSheets';
import { useUpdatePostAudience } from '@/hooks/useFeed';
import { copy } from '@/lib/copy';
import { asPostAudience } from '@/lib/postAudience';
import type { ProfileMediaItem } from '@/lib/profileMedia';
import type { PostWithMeta } from '@/lib/types';
import { THEME } from '@/lib/theme';

export function ProfileMediaGrid({
  items,
  posts,
}: {
  items: ProfileMediaItem[];
  posts: PostWithMeta[];
}) {
  const lightbox = useMediaLightboxOptional();
  const social = useSocialSheetsOptional();
  const updateAudience = useUpdatePostAudience();
  const byId = new Map(posts.map((post) => [post.id, post]));

  if (items.length === 0) {
    return <MascotState kind="empty" title={copy('profile.photosEmpty')} compact />;
  }

  function openMenu(item: ProfileMediaItem) {
    if (!item.owned || item.locked) {
      return;
    }
    const post = byId.get(item.postId);
    if (!post) {
      return;
    }
    social?.openAudience({
      audience: asPostAudience(post.audience),
      audienceUserIds: post.audience_user_ids ?? [],
      profileOnly: true,
      onSave: async (next, ids) => {
        await updateAudience.mutateAsync({
          postId: post.id,
          audience: next,
          audienceUserIds: ids,
        });
      },
    });
  }

  return (
    <View className="flex-row flex-wrap" style={{ marginHorizontal: -3 }}>
      {items.map((item, index) => (
        <View key={item.id} className="w-1/3 p-0.5" style={{ position: 'relative' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open photo"
            onPress={() =>
              lightbox?.openLightbox(
                items.map((row) => ({ uri: row.url })),
                index,
              )
            }
            onLongPress={item.owned && !item.locked ? () => openMenu(item) : undefined}
            delayLongPress={320}>
            <Image source={{ uri: item.url }} style={{ width: '100%', aspectRatio: 1, borderRadius: 10 }} />
            {item.kind === 'video' ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  right: 8,
                  bottom: 8,
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: THEME.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Glyph name={GLYPH.play} color={THEME.primaryForeground} size={10} />
              </View>
            ) : null}
          </Pressable>
          {item.owned && !item.locked ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Who can see this"
              hitSlop={8}
              onPress={() => openMenu(item)}
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: THEME.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Glyph name={GLYPH.more} color={THEME.textPrimary} size={12} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}
