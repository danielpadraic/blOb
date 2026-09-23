import { COUNTER_CARD_HEIGHT, COUNTER_CARD_WIDTH, type CounterCardModel } from '@/lib/counter/card';
import { THEME } from '@/lib/theme';

/** Web fallback when Svg.toDataURL is missing. Same 1080×1350 still as the native card. */
export function renderCounterCardDataUrl(card: CounterCardModel): string {
  if (typeof document === 'undefined') {
    throw new Error('Could not build that card.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = COUNTER_CARD_WIDTH;
  canvas.height = COUNTER_CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not build that card.');
  }
  ctx.fillStyle = THEME.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  roundRect(ctx, 48, 48, 984, 1254, 44, THEME.surface);
  ctx.fillStyle = THEME.textPrimary;
  ctx.font = '800 56px system-ui, sans-serif';
  ctx.fillText(card.title.slice(0, 28), 96, 180);
  ctx.fillStyle = THEME.textMuted;
  ctx.font = '600 28px system-ui, sans-serif';
  ctx.fillText(card.dateLine, 96, 240);
  ctx.fillStyle = THEME.textPrimary;
  ctx.font = '700 36px system-ui, sans-serif';
  card.rows.slice(0, 10).forEach((row, index) => {
    ctx.fillText(`${row.name}   ${row.value}`.slice(0, 36), 96, 320 + index * 78);
  });
  ctx.fillStyle = THEME.accent;
  ctx.font = '800 28px system-ui, sans-serif';
  ctx.fillText('blOb', 96, 1240);
  return canvas.toDataURL('image/png');
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
