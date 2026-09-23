import { Image, Platform } from 'react-native';

import {
  HONOR_CARD_HEIGHT,
  HONOR_CARD_INK as INK,
  HONOR_CARD_WIDTH,
  formatHonorFieldValue,
  type HonorCardModel,
} from '@/lib/checkin/honorCard';
import { BLOB_WORDMARK } from '@/lib/mascotAssets';
import { resolveScoringIconKey, type ScoringIconKey } from '@/lib/scoringIcons';

const ICON_SOURCES: Record<ScoringIconKey, number> = {
  calls: require('@/assets/scoring/calls.png'),
  presentation: require('@/assets/scoring/presentation.png'),
  money: require('@/assets/scoring/money.png'),
  star: require('@/assets/scoring/star.png'),
  checklist: require('@/assets/scoring/checklist.png'),
  calendar: require('@/assets/scoring/calendar.png'),
  camera: require('@/assets/scoring/camera.png'),
  timer: require('@/assets/scoring/timer.png'),
  steps: require('@/assets/scoring/steps.png'),
  route: require('@/assets/scoring/route.png'),
  strength: require('@/assets/scoring/strength.png'),
  heart: require('@/assets/scoring/heart.png'),
  fire: require('@/assets/scoring/fire.png'),
  hydration: require('@/assets/scoring/hydration.png'),
  reading: require('@/assets/scoring/reading.png'),
  writing: require('@/assets/scoring/writing.png'),
  learning: require('@/assets/scoring/learning.png'),
  trophy: require('@/assets/scoring/trophy.png'),
  generic: require('@/assets/scoring/star.png'),
};

function assetUri(source: number): string {
  try {
    return String(Image.resolveAssetSource(source)?.uri ?? '').trim();
  } catch {
    return '';
  }
}

function loadImage(uri: string): Promise<HTMLImageElement | null> {
  if (!uri || typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = uri;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Web-only JPEG. Native uses the SVG raster host. */
export async function rasterHonorCardOnWeb(card: HonorCardModel): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    throw new Error('Could not build that check-in card.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = HONOR_CARD_WIDTH;
  canvas.height = HONOR_CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not build that check-in card.');
  }
  const pad = 72;
  const inner = HONOR_CARD_WIDTH - pad * 2;
  ctx.fillStyle = INK.bg;
  ctx.fillRect(0, 0, HONOR_CARD_WIDTH, HONOR_CARD_HEIGHT);
  ctx.fillStyle = INK.surface;
  roundRect(ctx, pad, pad, inner, HONOR_CARD_HEIGHT - pad * 2, 40);
  ctx.fill();

  ctx.fillStyle = INK.ink;
  ctx.font = '700 44px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(card.title, pad + 48, 170, inner - 96);

  if (card.laneLabel) {
    const chipW = Math.min(280, Math.max(160, card.laneLabel.length * 28 + 48));
    ctx.fillStyle = INK.tealSoft;
    roundRect(ctx, pad + 48, 206, chipW, 56, 28);
    ctx.fill();
    ctx.fillStyle = INK.teal;
    ctx.font = '700 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(card.laneLabel, pad + 48 + chipW / 2, 244);
    ctx.textAlign = 'left';
  }

  const rowTop = card.laneLabel ? 340 : 260;
  const rowH = 168;
  const icons = await Promise.all(
    card.fields.map((field) => {
      const key = resolveScoringIconKey({ icon_key: field.iconKey, name: field.label });
      return loadImage(assetUri(ICON_SOURCES[key] ?? ICON_SOURCES.generic));
    }),
  );
  card.fields.forEach((field, index) => {
    const y = rowTop + index * rowH;
    ctx.fillStyle = INK.bg;
    roundRect(ctx, pad + 40, y, inner - 80, rowH - 24, 28);
    ctx.fill();
    const icon = icons[index];
    if (icon) {
      ctx.drawImage(icon, pad + 64, y + 36, 72, 72);
    }
    ctx.fillStyle = INK.muted;
    ctx.font = '600 32px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(field.label, pad + 160, y + 86, 420);
    ctx.fillStyle = INK.ink;
    ctx.font = '800 48px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatHonorFieldValue(field), HONOR_CARD_WIDTH - pad - 64, y + 90);
  });

  ctx.fillStyle = INK.muted;
  ctx.font = '500 28px system-ui, sans-serif';
  ctx.textAlign = 'left';
  if (card.periodLabel) {
    ctx.fillText(card.periodLabel, pad + 48, HONOR_CARD_HEIGHT - pad - 48);
  }
  const wordmark = await loadImage(assetUri(BLOB_WORDMARK));
  if (wordmark) {
    ctx.drawImage(wordmark, HONOR_CARD_WIDTH - pad - 200, HONOR_CARD_HEIGHT - pad - 88, 168, 56);
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((next) => resolve(next), 'image/jpeg', 0.9);
  });
  if (!blob || blob.size < 32) {
    throw new Error('Could not build that check-in card.');
  }
  return URL.createObjectURL(blob);
}
