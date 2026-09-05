import { Jimp, loadFont } from 'jimp';
import { SANS_32_WHITE, SANS_64_WHITE } from 'jimp/fonts';
import { describe, expect, it } from 'vitest';

import { buildOcrHealthProof, ocrFieldsFromParse } from '../lib/health/ocrSession';
import { classifyWorkoutScreen, parseWorkoutOcrText } from '../lib/health/workoutOcr';
import { ocrImageBuffer } from './_lib/ocrRunner';
import { decodeImageBase64 } from './ocr-workout';

/**
 * Full submit path for a screenshot on the hero: base64 bytes in, chips and a stored snapshot out.
 * Slow by nature — Tesseract downloads its language data on first run.
 */

async function watchSummaryScreen(): Promise<Buffer> {
  const image = new Jimp({ width: 1080, height: 1500, color: 0x101312ff });
  const big = await loadFont(SANS_64_WHITE);
  const small = await loadFont(SANS_32_WHITE);
  const lines: Array<{ font: typeof big; y: number; text: string }> = [
    { font: small, y: 90, text: 'Traditional Strength Training' },
    { font: small, y: 160, text: '7:33 AM - 8:14 AM' },
    { font: small, y: 300, text: 'Total Time' },
    { font: big, y: 350, text: '0:41:10' },
    { font: small, y: 500, text: 'Active Calories' },
    { font: big, y: 550, text: '312 CAL' },
    { font: small, y: 900, text: 'Avg. Heart Rate' },
    { font: big, y: 950, text: '108 BPM' },
    { font: small, y: 1100, text: 'Max Heart Rate' },
    { font: big, y: 1150, text: '147 BPM' },
  ];
  for (const line of lines) {
    image.print({ font: line.font, x: 90, y: line.y, text: line.text });
  }
  return image.getBuffer('image/png');
}

describe('screenshot on the hero to stored session', () => {
  it('turns posted bytes into chips and an honest window', async () => {
    const png = await watchSummaryScreen();
    // What the client posts for a still that has not been uploaded yet.
    const bytes = decodeImageBase64(`data:image/png;base64,${png.toString('base64')}`);
    expect(bytes).not.toBeNull();

    const { text } = await ocrImageBuffer(bytes as Buffer);
    expect(classifyWorkoutScreen(text).isWorkoutScreen).toBe(true);

    const parsed = parseWorkoutOcrText(text);
    const fields = ocrFieldsFromParse(parsed);
    expect(fields.durationSec).toBe(2470);
    expect(fields.activeEnergyKcal).toBe(312);
    expect(fields.avgHrBpm).toBe(108);
    expect(fields.maxHrBpm).toBe(147);

    const snapshot = buildOcrHealthProof({
      fields,
      source: 'ocr',
      activityLabel: parsed.activityLabel,
      clockRange: parsed.clockRange,
      periodKey: '2026-09-04',
      timeZone: 'America/Denver',
    });
    expect(snapshot?.source).toBe('ocr');
    // The window came off the screen, not from the clock at submit time.
    expect(snapshot?.startedAt).toBe('2026-09-04T13:33:00.000Z');
    expect(snapshot?.endedAt).toBe('2026-09-04T14:14:00.000Z');
    expect(snapshot?.durationSec).toBe(2470);
  }, 180_000);
});
