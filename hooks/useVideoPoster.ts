import { useEffect, useState } from 'react';

import { cachedPosterUri, posterUriFor } from '@/lib/videoPoster';

export function useVideoPoster(
  videoUrl: string | null | undefined,
  stored?: string | null,
): string | null {
  const ready = stored?.trim() || cachedPosterUri(videoUrl);
  const [uri, setUri] = useState<string | null>(ready);

  useEffect(() => {
    const known = stored?.trim() || cachedPosterUri(videoUrl);
    if (known) {
      setUri(known);
      return;
    }
    const source = videoUrl?.trim();
    if (!source) {
      setUri(null);
      return;
    }
    let cancelled = false;
    void posterUriFor(source).then((next) => {
      if (!cancelled && next) {
        setUri(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [stored, videoUrl]);

  return uri;
}
