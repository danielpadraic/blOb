import { Image } from 'expo-image';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Avatar } from '@/components/ui/Avatar';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { THEME } from '@/lib/theme';

type StoryRingProps = {
  uri?: string | null;
  previewUri?: string | null;
  name?: string | null;
  size?: number;
  seen?: boolean;
  showAdd?: boolean;
  showPlay?: boolean;
};

export function StoryRing({
  uri,
  previewUri,
  name,
  size = 54,
  seen = false,
  showAdd = false,
  showPlay = false,
}: StoryRingProps) {
  const inner = size - 8;
  return (
    <View style={{ width: size, height: size, minWidth: 44, minHeight: 44 }}>
      <LinearGradient
        colors={seen ? [THEME.border, THEME.border] : [THEME.accentBright, THEME.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          padding: 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          style={{
            width: size - 4,
            height: size - 4,
            borderRadius: (size - 4) / 2,
            backgroundColor: THEME.background,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}>
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              contentFit="cover"
              style={{ width: inner, height: inner, borderRadius: inner / 2 }}
            />
          ) : (
            <Avatar uri={uri} name={name} size={inner} />
          )}
          {showPlay && previewUri ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Glyph name={GLYPH.play} color="#FFFFFF" size={16} />
            </View>
          ) : null}
        </View>
      </LinearGradient>
      {showAdd ? (
        <View
          className="absolute items-center justify-center"
          style={{
            right: -1,
            bottom: -1,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: THEME.accent,
            borderWidth: 2,
            borderColor: THEME.background,
          }}>
          <Glyph name={GLYPH.plus} color={THEME.primaryForeground} size={10} />
        </View>
      ) : null}
    </View>
  );
}
