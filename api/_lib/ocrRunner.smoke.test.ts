import { Jimp, loadFont } from 'jimp';
import { SANS_32_WHITE, SANS_64_WHITE } from 'jimp/fonts';
import { describe, expect, it } from 'vitest';

import { parseWorkoutOcrText } from '../../lib/health/workoutOcr';
import { meanBrightness, ocrImageBuffer, prepareImage } from './ocrRunner';

/**
 * End-to-end check that Tesseract can read light-on-dark workout stats after preprocessing.
 * Downloads the English language data on first run, so it is slow by nature.
 */

async function appleFitnessLikeScreen(): Promise<Buffer> {
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
    { font: small, y: 700, text: 'Total Calories' },
    { font: big, y: 750, text: '385 CAL' },
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

describe('preprocessing', () => {
  it('inverts a dark screenshot so Tesseract sees dark-on-light', async () => {
    const dark = await appleFitnessLikeScreen();
    const prepared = await prepareImage(dark);
    expect(prepared.inverted).toBe(true);
    expect(prepared.width).toBeGreaterThanOrEqual(1080);
  }, 60_000);

  it('leaves an already light screenshot alone', async () => {
    const light = await new Jimp({ width: 800, height: 800, color: 0xf7f7f5ff }).getBuffer('image/png');
    const prepared = await prepareImage(light);
    expect(prepared.inverted).toBe(false);
  }, 60_000);

  it('measures brightness', async () => {
    const image = new Jimp({ width: 40, height: 40, color: 0x000000ff });
    expect(meanBrightness(image)).toBeLessThan(10);
  });
});

describe('tesseract on a dark workout summary', () => {
  it('reads the headline numbers off the screen', async () => {
    const screen = await appleFitnessLikeScreen();
    const { text, inverted } = await ocrImageBuffer(screen);
    expect(inverted).toBe(true);

    const parsed = parseWorkoutOcrText(text);
    // Log once so a failure shows what Tesseract actually saw.
    if (parsed.durationSec !== 2470) {
      console.log('OCR TEXT >>>\n', text, '\n<<< PARSED', parsed);
    }
    expect(parsed.durationSec).toBe(41 * 60 + 10);
    expect(parsed.activeEnergyKcal).toBe(312);
    expect(parsed.avgHrBpm).toBe(108);
    expect(parsed.maxHrBpm).toBe(147);
  }, 180_000);
});
