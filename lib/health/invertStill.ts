/**
 * In-memory grayscale + invert of a still. Never writes over the user's file.
 * Used when the first OCR pass found no numbers on a dark Fitness screenshot.
 */

/** Invert an already-downscaled JPEG data URL or raw base64. Web canvas only. */
export async function invertJpegBase64(base64: string): Promise<string | null> {
  const body = String(base64 ?? '').trim();
  if (!body) {
    return null;
  }
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null;
  }
  try {
    const src = body.startsWith('data:') ? body : `data:image/jpeg;base64,${body}`;
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('invert_load'));
      image.src = src;
    });
    const width = Math.max(1, image.naturalWidth || image.width);
    const height = Math.max(1, image.naturalHeight || image.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    ctx.drawImage(image, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      const inverted = 255 - gray;
      data[i] = inverted;
      data[i + 1] = inverted;
      data[i + 2] = inverted;
    }
    ctx.putImageData(pixels, 0, 0);
    const next = canvas.toDataURL('image/jpeg', 0.9);
    const comma = next.indexOf(',');
    return comma >= 0 ? next.slice(comma + 1) : null;
  } catch {
    return null;
  }
}
