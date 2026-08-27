import { proofsForStorage, type ChallengeProof } from '@/lib/challengeProofs';
import {
  clampLocationRadius,
  hostLocationPlace,
  locationPlaceIsSet,
  parseLocationPlace,
  publicLocationPlace,
  type LocationPlace,
} from '@/lib/locationProof';
import { supabase } from '@/lib/supabase';

export type PlaceSearchHit = {
  place_id: string;
  label: string;
  lat: number;
  lng: number;
};

export function proofsReadyToPublish(proofs: ChallengeProof[]): string | null {
  for (const proof of proofs) {
    if (proof.method !== 'location') {
      continue;
    }
    if (!locationPlaceIsSet(proof.place)) {
      return 'Drop a pin for the Location proof.';
    }
  }
  return null;
}

export async function searchPlaces(query: string): Promise<PlaceSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'blOb/1.0 (https://blob.mobi)',
    },
  });
  if (!response.ok) {
    throw new Error('Couldn’t search places. Try again.');
  }
  const rows = (await response.json()) as Array<{
    osm_type?: string;
    osm_id?: number;
    display_name?: string;
    name?: string;
    lat?: string;
    lon?: string;
  }>;
  return rows
    .map((row) => {
      const lat = Number(row.lat);
      const lng = Number(row.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }
      const label = (row.name || row.display_name || '').split(',')[0]?.trim() || 'Pinned place';
      return {
        place_id: row.osm_type && row.osm_id ? `osm:${row.osm_type}:${row.osm_id}` : `geo:${lat},${lng}`,
        label,
        lat,
        lng,
      };
    })
    .filter((row): row is PlaceSearchHit => Boolean(row));
}

export async function persistChallengePlaces(challengeId: string, proofs: ChallengeProof[]): Promise<void> {
  for (const proof of proofs) {
    if (proof.method !== 'location') {
      continue;
    }
    const place = hostLocationPlace(proof.place);
    if (!place || !locationPlaceIsSet(place)) {
      throw new Error('Drop a pin for the Location proof.');
    }
    const { error } = await supabase.rpc('set_challenge_proof_place', {
      p_challenge_id: challengeId,
      p_proof_id: proof.id,
      p_label: place.label,
      p_place_id: place.place_id ?? null,
      p_lat: place.lat,
      p_lng: place.lng,
      p_radius_m: clampLocationRadius(place.radius_m),
    });
    if (error) {
      throw new Error(error.message || 'Couldn’t save the place pin.');
    }
  }
}

export async function loadHostPlaces(challengeId: string, proofs: ChallengeProof[]): Promise<ChallengeProof[]> {
  const { data, error } = await supabase.rpc('get_challenge_proof_places', { p_challenge_id: challengeId });
  if (error || !Array.isArray(data)) {
    return proofs;
  }
  const byId = new Map<string, LocationPlace>();
  for (const row of data as Array<Record<string, unknown>>) {
    const parsed = parseLocationPlace(row);
    const id = typeof row.proof_id === 'string' ? row.proof_id : '';
    if (id && parsed) {
      byId.set(id, parsed);
    }
  }
  return proofs.map((proof) =>
    proof.method === 'location' && byId.has(proof.id) ? { ...proof, place: byId.get(proof.id) } : proof,
  );
}

export function storedProofs(proofs: ChallengeProof[]): ChallengeProof[] {
  return proofsForStorage(proofs);
}

export function venueLabelFromProofs(proofs: ChallengeProof[]): string | null {
  for (const proof of proofs) {
    if (proof.method !== 'location') {
      continue;
    }
    const place = publicLocationPlace(proof.place);
    if (place?.label) {
      return place.label;
    }
  }
  return null;
}
