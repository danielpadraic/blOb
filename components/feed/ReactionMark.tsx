import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Image, type ImageSourcePropType } from 'react-native';

import { displayReactionType, LIKE_MARK_REV } from '@/lib/reactions';
import { imageSource } from '@/lib/resolveAsset';

const LIKE_PNG = require('@/assets/blob-bob-reaction-emojis/like.png');

const MODULES: Record<string, number | object> = {
  like: LIKE_PNG,
  love: require('@/assets/blob-bob-reaction-emojis/love.png'),
  laugh: require('@/assets/blob-bob-reaction-emojis/lol.png'),
  care: require('@/assets/blob-bob-reaction-emojis/lol.png'),
  rofl: require('@/assets/blob-bob-reaction-emojis/rofl.png'),
  fire: require('@/assets/blob-bob-reaction-emojis/fire.png'),
  sad: require('@/assets/blob-bob-reaction-emojis/sad.png'),
};

export function reactionMarkModule(type: string | null | undefined): number | object {
  const key = displayReactionType(type);
  return MODULES[key] ?? LIKE_PNG;
}

export function reactionMarkSource(type: string | null | undefined): ImageSourcePropType {
  return imageSource(reactionMarkModule(type)) as ImageSourcePropType;
}

type ReactionMarkProps = {
  type: string | null | undefined;
  size: number;
};

type SafeState = { failed: boolean };

/** A bad PNG or missing Image helper must not white-screen Home / Live. */
class SafeReactionImage extends Component<ReactionMarkProps, SafeState> {
  state: SafeState = { failed: false };

  static getDerivedStateFromError(): SafeState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.setState({ failed: true });
  }

  render(): ReactNode {
    if (this.state.failed) {
      return null;
    }
    const { type, size } = this.props;
    const kind = displayReactionType(type);
    let source: ImageSourcePropType;
    try {
      source = reactionMarkSource(type);
    } catch {
      return null;
    }
    if (source == null) {
      return null;
    }
    return (
      <Image
        key={kind === 'like' ? `like-${LIKE_MARK_REV}` : kind}
        source={source}
        resizeMode="contain"
        fadeDuration={0}
        accessibilityIgnoresInvertColors
        pointerEvents="none"
        onError={() => this.setState({ failed: true })}
        style={{
          width: size,
          height: size,
          backgroundColor: 'transparent',
        }}
      />
    );
  }
}

/**
 * Bob PNG for Home, Live, comments, and the Wave / Round rail.
 * `require()` only. Never resolveAssetSource. Never tint.
 */
export function ReactionMark({ type, size }: ReactionMarkProps) {
  return <SafeReactionImage type={type} size={size} />;
}
