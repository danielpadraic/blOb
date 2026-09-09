import { describe, expect, it } from 'vitest';

import { isAllowedOcrImageUrl, isOcrSpaHtml } from '@/lib/health/ocrAllowlist';
import { ocrEndpoint } from '@/lib/health/ocrEndpoint';

describe('OCR client treats the Expo SPA as a miss', () => {
  it('detects HTML even when the status is 200', () => {
    expect(isOcrSpaHtml('text/html; charset=utf-8', '<!DOCTYPE html><html>')).toBe(true);
    expect(isOcrSpaHtml('application/json', '{"ok":false,"reason":"unauthorized"}')).toBe(false);
  });
});

describe('OCR endpoint survives Expo web export', () => {
  it('always calls the blob.mobi Vercel function, never a relative SPA path', async () => {
    expect(ocrEndpoint()).toBe('https://blob.mobi/api/ocr-workout');
    expect(ocrEndpoint().startsWith('/')).toBe(false);
  });
});

describe('storage URL allowlist', () => {
  const project = 'https://tguzdtwsajnnczdxjqyq.supabase.co';

  it('accepts this project’s signed proof objects', () => {
    expect(
      isAllowedOcrImageUrl(`${project}/storage/v1/object/sign/challenge-proofs/a.jpg?token=x`, project),
    ).toBe(true);
  });

  it('rejects another host', () => {
    expect(isAllowedOcrImageUrl('https://evil.example/storage/v1/a.jpg', project)).toBe(false);
  });
});
