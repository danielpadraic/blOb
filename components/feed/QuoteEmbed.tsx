import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { Avatar } from '@/components/ui/Avatar';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { audienceLabel, asPostAudience } from '@/lib/postAudience';
import type { QuoteSnapshot } from '@/lib/quotePost';
import { THEME } from '@/lib/theme';
import { formatFeedTime } from '@/utils/format';
import { mediaKind } from '@/utils/media';

type QuoteEmbedProps = {
  snapshot: QuoteSnapshot;
  audience?: string | null;
  unavailable?: boolean;
  onPress?: () => void;
};

export function QuoteEmbed({ snapshot, audience, unavailable, onPress }: QuoteEmbedProps) {
  const preview = snapshot.media_preview_url;
  const kind = preview ? mediaKind(preview) : null;
  const name = snapshot.display_name || snapshot.username || 'blob';
  const body = snapshot.body?.trim() ?? '';

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'none'}
      disabled={!onPress}
      onPress={onPress}
      className="flex-row gap-2.5 px-3 py-2.5"
      style={{
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: 16,
        backgroundColor: THEME.surface2,
      }}>
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Avatar uri={snapshot.avatar_url} name={name} size={28} />
          <View className="min-w-0 flex-1">
            <AppText className="text-[13px] font-extrabold text-charcoal" numberOfLines={1}>
              {name}
            </AppText>
            <AppText className="text-[11px] text-muted" numberOfLines={1}>
              @{snapshot.username}
              {snapshot.created_at ? ` · ${formatFeedTime(snapshot.created_at)}` : ''}
              {audience ? ` · ${audienceLabel(asPostAudience(audience))}` : ''}
            </AppText>
          </View>
        </View>
        {unavailable ? (
          <AppText className="mt-1 text-[13px] leading-5 text-muted">This post isn’t available.</AppText>
        ) : body ? (
          <AppText className="mt-1 text-[13px] leading-5 text-ink" numberOfLines={4}>
            {body}
          </AppText>
        ) : null}
      </View>
      {preview && !unavailable ? (
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 12,
            overflow: 'hidden',
            backgroundColor: THEME.border,
          }}>
          {kind === 'image' ? (
            <Image source={{ uri: preview }} style={{ width: 72, height: 72 }} contentFit="cover" />
          ) : (
            <View className="h-full w-full items-center justify-center" style={{ backgroundColor: THEME.primary }}>
              <Glyph name={GLYPH.play} color="#fff" size={22} />
            </View>
          )}
        </View>
      ) : null}
    </Pressable>
  );
}
