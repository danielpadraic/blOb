import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Image } from 'expo-image';

import { AppText } from '@/components/ui/AppText';
import { gifProvider, searchGifs, type GifHit } from '@/lib/gifSearch';
import { THEME } from '@/lib/theme';

type GifPickerProps = {
  visible: boolean;
  onPick: (url: string) => void;
  onClose: () => void;
};

export function GifPicker({ visible, onPick, onClose }: GifPickerProps) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<GifHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const provider = gifProvider();

  useEffect(() => {
    if (!visible) {
      return;
    }
    if (!provider) {
      setHits([]);
      setError(null);
      return;
    }
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      void searchGifs(query)
        .then((rows) => setHits(rows))
        .catch(() => {
          setHits([]);
          setError('Couldn’t load GIFs.');
        })
        .finally(() => setLoading(false));
    }, query.trim() ? 280 : 0);
    return () => clearTimeout(handle);
  }, [provider, query, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View
      className="mt-2 overflow-hidden"
      style={{
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: 16,
        backgroundColor: THEME.surface,
      }}>
      <View className="flex-row items-center px-3" style={{ minHeight: 44, gap: 8 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search GIFs"
          placeholderTextColor={THEME.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          textContentType="none"
          importantForAutofill="no"
          style={{
            flex: 1,
            fontSize: 16,
            color: THEME.textPrimary,
            minHeight: 44,
            paddingVertical: 8,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close GIFs"
          onPress={onClose}
          hitSlop={8}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <AppText className="text-[14px] font-semibold text-muted">Close</AppText>
        </Pressable>
      </View>
      {!provider ? (
        <AppText className="px-3 pb-3 text-[13px] leading-5 text-muted">
          GIF search isn’t set up yet.
        </AppText>
      ) : loading && hits.length === 0 ? (
        <View className="items-center py-6">
          <ActivityIndicator color={THEME.accent} />
        </View>
      ) : error ? (
        <AppText className="px-3 pb-3 text-[13px] text-coral-dark">{error}</AppText>
      ) : hits.length === 0 ? (
        <AppText className="px-3 pb-3 text-[13px] text-muted">No GIFs for that.</AppText>
      ) : (
        <ScrollView horizontal={false} style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
          <View className="flex-row flex-wrap px-1.5 pb-2">
            {hits.map((hit) => (
              <Pressable
                key={hit.id}
                accessibilityRole="button"
                accessibilityLabel="Attach GIF"
                onPress={() => onPick(hit.url)}
                style={{ width: '33.33%', padding: 4, minHeight: 88 }}>
                <Image
                  source={{ uri: hit.previewUrl }}
                  style={{ width: '100%', height: 80, borderRadius: 10, backgroundColor: THEME.background }}
                  contentFit="cover"
                />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
      {provider ? (
        <AppText className="px-3 pb-2 text-[11px] text-muted">
          {provider === 'tenor' ? 'Powered by Tenor' : 'Powered by GIPHY'}
        </AppText>
      ) : null}
    </View>
  );
}
