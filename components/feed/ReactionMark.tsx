import { Image, type ImageSourcePropType } from 'react-native';

import { displayReactionType } from '@/lib/reactions';

const SOURCES: Record<string, ImageSourcePropType> = {
  like: require('@/assets/blob-bob-reaction-emojis/like.png'),
  love: require('@/assets/blob-bob-reaction-emojis/love.png'),
  laugh: require('@/assets/blob-bob-reaction-emojis/lol.png'),
  care: require('@/assets/blob-bob-reaction-emojis/lol.png'),
  rofl: require('@/assets/blob-bob-reaction-emojis/rofl.png'),
  fire: require('@/assets/blob-bob-reaction-emojis/fire.png'),
  sad: require('@/assets/blob-bob-reaction-emojis/sad.png'),
};

export function reactionMarkSource(type: string | null | undefined): ImageSourcePropType {
  const key = displayReactionType(type);
  return SOURCES[key] ?? SOURCES.like;
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
  return (
    <Image
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
