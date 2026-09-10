import { Image, Platform, type ImageSourcePropType } from 'react-native';

import { displayReactionType, LIKE_MARK_REV } from '@/lib/reactions';

const LIKE_SOURCE = require('@/assets/blob-bob-reaction-emojis/like.png');

const SOURCES: Record<string, ImageSourcePropType> = {
  like: LIKE_SOURCE,
  love: require('@/assets/blob-bob-reaction-emojis/love.png'),
  laugh: require('@/assets/blob-bob-reaction-emojis/lol.png'),
  care: require('@/assets/blob-bob-reaction-emojis/lol.png'),
  rofl: require('@/assets/blob-bob-reaction-emojis/rofl.png'),
  fire: require('@/assets/blob-bob-reaction-emojis/fire.png'),
  sad: require('@/assets/blob-bob-reaction-emojis/sad.png'),
};

function likeSource(): ImageSourcePropType {
  if (Platform.OS !== 'web') {
    return LIKE_SOURCE;
  }
  const resolved = Image.resolveAssetSource(LIKE_SOURCE);
  if (!resolved?.uri) {
    return LIKE_SOURCE;
  }
  const sep = resolved.uri.includes('?') ? '&' : '?';
  return { uri: `${resolved.uri}${sep}v=${LIKE_MARK_REV}` };
}

export function reactionMarkSource(type: string | null | undefined): ImageSourcePropType {
  const key = displayReactionType(type);
  if (key === 'like') {
    return likeSource();
  }
  return SOURCES[key] ?? likeSource();
}

type ReactionMarkProps = {
  type: string | null | undefined;
  size: number;
};

/**
 * Bob PNG for Home, Live, comments, and the Wave / Round rail.
 * Fixed box + contain. Never tint. Never a font / emoji fallback when the file exists.
 */
export function ReactionMark({ type, size }: ReactionMarkProps) {
  const kind = displayReactionType(type);
  return (
    <Image
      key={kind === 'like' ? `like-${LIKE_MARK_REV}` : kind}
      source={reactionMarkSource(type)}
      resizeMode="contain"
      fadeDuration={0}
      accessibilityIgnoresInvertColors
      pointerEvents="none"
      style={{
        width: size,
        height: size,
        backgroundColor: 'transparent',
      }}
    />
  );
}
