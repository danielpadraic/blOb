export type GifHit = {
  id: string;
  previewUrl: string;
  url: string;
};

function tenorKey(): string {
  return (process.env.EXPO_PUBLIC_TENOR_KEY ?? '').trim();
}

function giphyKey(): string {
  return (process.env.EXPO_PUBLIC_GIPHY_KEY ?? '').trim();
}

export function gifProvider(): 'tenor' | 'giphy' | null {
  if (tenorKey()) {
    return 'tenor';
  }
  if (giphyKey()) {
    return 'giphy';
  }
  return null;
}

export function gifSearchConfigured(): boolean {
  return gifProvider() != null;
}

async function readJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('GIF search failed.');
  }
  return response.json();
}

function tenorHits(payload: unknown): GifHit[] {
  const results = (payload as { results?: unknown[] }).results;
  if (!Array.isArray(results)) {
    return [];
  }
  return results.flatMap((row) => {
    const rec = row as {
      id?: string;
      media_formats?: Record<string, { url?: string }>;
    };
    const formats = rec.media_formats ?? {};
    const url = formats.gif?.url || formats.mediumgif?.url || formats.tinygif?.url;
    const preview = formats.tinygif?.url || formats.nanogif?.url || url;
    if (!rec.id || !url || !preview) {
      return [];
    }
    return [{ id: rec.id, url, previewUrl: preview }];
  });
}

function giphyHits(payload: unknown): GifHit[] {
  const data = (payload as { data?: unknown[] }).data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data.flatMap((row) => {
    const rec = row as {
      id?: string;
      images?: {
        original?: { url?: string };
        downsized?: { url?: string };
        fixed_width_small?: { url?: string };
      };
    };
    const url = rec.images?.downsized?.url || rec.images?.original?.url;
    const preview = rec.images?.fixed_width_small?.url || url;
    if (!rec.id || !url || !preview) {
      return [];
    }
    return [{ id: rec.id, url, previewUrl: preview }];
  });
}

export async function searchGifs(query: string): Promise<GifHit[]> {
  const provider = gifProvider();
  const q = query.trim();
  if (!provider) {
    throw new Error('missing_key');
  }
  if (provider === 'tenor') {
    const key = encodeURIComponent(tenorKey());
    const path = q
      ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${key}&client_key=blob&limit=24&media_filter=gif,tinygif`
      : `https://tenor.googleapis.com/v2/featured?key=${key}&client_key=blob&limit=24&media_filter=gif,tinygif`;
    return tenorHits(await readJson(path));
  }
  const key = encodeURIComponent(giphyKey());
  const path = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=24&rating=pg-13`;
  return giphyHits(await readJson(path));
}
