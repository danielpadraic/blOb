import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Image: {},
}));

import { imageSource, imageUri } from '@/lib/resolveAsset';

describe('imageSource', () => {
  it('passes a require() module id through and wraps a uri string', () => {
    expect(imageSource(42)).toBe(42);
    expect(imageSource('https://cdn.example/like.png')).toEqual({ uri: 'https://cdn.example/like.png' });
  });

  it('does not read width or height and returns null when resolveAssetSource is missing', () => {
    expect(imageUri(42)).toBeNull();
    expect(imageUri('https://cdn.example/like.png')).toBe('https://cdn.example/like.png');
  });
});
