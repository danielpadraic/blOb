import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { Input } from '@/components/ui/Input';
import { StepperField } from '@/components/ui/Stepper';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { copy } from '@/lib/copy';
import {
  LOCATION_RADIUS_DEFAULT_M,
  LOCATION_RADIUS_MAX_M,
  LOCATION_RADIUS_MIN_M,
  clampLocationRadius,
  locationPlaceIsSet,
  parseLocationPlace,
  type LocationPlace,
} from '@/lib/locationProof';
import { searchPlaces, type PlaceSearchHit } from '@/lib/locationPlaces';
import { THEME } from '@/lib/theme';

function staticMapUri(place: LocationPlace): string {
  const lat = Number(place.lat);
  const lng = Number(place.lng);
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=16&size=640x280&markers=${lat},${lng},ol-marker`;
}

function MapPreview({ place }: { place: LocationPlace }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View
        className="items-center justify-center"
        style={{ height: 140, borderRadius: 16, backgroundColor: THEME.accentSoft }}>
        <Glyph name={GLYPH.pin} color={THEME.accent} size={22} />
        <AppText className="mt-1 text-[13px] font-semibold text-charcoal">{place.label || 'Pinned place'}</AppText>
      </View>
    );
  }
  return (
    <Image
      accessibilityLabel="Place map"
      source={{ uri: staticMapUri(place) }}
      onError={() => setFailed(true)}
      style={{ width: '100%', height: 180, borderRadius: 16, backgroundColor: THEME.accentSoft }}
    />
  );
}

export function LocationPlacePicker({
  place,
  onChange,
}: {
  place?: LocationPlace | null;
  onChange: (next: LocationPlace) => void;
}) {
  const current = parseLocationPlace(place);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlaceSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(text: string) {
    setQuery(text);
    if (text.trim().length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      setHits(await searchPlaces(text));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Couldn’t search places.');
    } finally {
      setSearching(false);
    }
  }

  function applyHit(hit: PlaceSearchHit) {
    const label = current?.label?.trim() || hit.label;
    onChange({
      place_id: hit.place_id,
      label,
      lat: hit.lat,
      lng: hit.lng,
      radius_m: clampLocationRadius(current?.radius_m ?? LOCATION_RADIUS_DEFAULT_M),
    });
    setHits([]);
    setQuery(hit.label);
  }

  return (
    <View className="gap-2">
      <Input
        label={copy('create.locationSearch')}
        placeholder="Search a gym, store, or home"
        value={query}
        onChangeText={(text) => void runSearch(text)}
        autoCorrect={false}
      />
      {searching ? <AppText className="text-[12px] text-muted">Searching…</AppText> : null}
      {error ? <AppText className="text-[12px] text-coral-dark">{error}</AppText> : null}
      {hits.length > 0 ? (
        <View className="gap-1">
          {hits.map((hit) => (
            <Pressable
              key={hit.place_id}
              accessibilityRole="button"
              onPress={() => applyHit(hit)}
              className="flex-row items-center px-3"
              style={{
                minHeight: 44,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: THEME.border,
                backgroundColor: THEME.surface,
                gap: 8,
              }}>
              <Glyph name={GLYPH.pin} color={THEME.accent} size={14} />
              <AppText className="flex-1 text-[14px] font-semibold text-charcoal" numberOfLines={1}>
                {hit.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
      {current && locationPlaceIsSet(current) ? <MapPreview place={current} /> : null}
      <Input
        label={copy('create.locationLabel')}
        placeholder={copy('create.locationPlaceholder')}
        value={current?.label ?? ''}
        onChangeText={(label) =>
          onChange({
            place_id: current?.place_id ?? null,
            label,
            lat: current?.lat ?? null,
            lng: current?.lng ?? null,
            radius_m: clampLocationRadius(current?.radius_m ?? LOCATION_RADIUS_DEFAULT_M),
          })
        }
      />
      <StepperField
        label={copy('create.locationRadius')}
        value={clampLocationRadius(current?.radius_m ?? LOCATION_RADIUS_DEFAULT_M)}
        min={LOCATION_RADIUS_MIN_M}
        max={LOCATION_RADIUS_MAX_M}
        step={10}
        formatValue={(value) => `${value} m`}
        onChange={(radius_m) =>
          onChange({
            place_id: current?.place_id ?? null,
            label: current?.label ?? '',
            lat: current?.lat ?? null,
            lng: current?.lng ?? null,
            radius_m,
          })
        }
      />
    </View>
  );
}
