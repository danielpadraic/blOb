import { describe, expect, it } from 'vitest';
import { decodeImageBase64 } from '../api/ocr-workout';

describe('base64 image intake', () => {
  it('accepts a data URL', () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const decoded = decodeImageBase64(`data:image/png;base64,${png.toString('base64')}`);
    expect(decoded?.equals(png)).toBe(true);
  });
  it('accepts bare base64', () => {
    expect(decodeImageBase64(Buffer.from('hello').toString('base64'))?.toString()).toBe('hello');
  });
  it('rejects junk and empties', () => {
    expect(decodeImageBase64('not base64 !!! <>')).toBeNull();
    expect(decodeImageBase64('')).toBeNull();
  });
  it('rejects a payload past the memory cap', () => {
    expect(decodeImageBase64('A'.repeat(20 * 1024 * 1024))).toBeNull();
  });
});
