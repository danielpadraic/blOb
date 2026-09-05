import { describe, expect, it } from 'vitest';

import { isAllowedImageUrl } from './ocr-workout';

const PROJECT = 'https://tguzdtwsajnnczdxjqyq.supabase.co';

describe('image url allowlist', () => {
  it('accepts a signed proof URL from this project storage', () => {
    expect(
      isAllowedImageUrl(
        `${PROJECT}/storage/v1/object/sign/challenge-proofs/user/hr.jpg?token=abc`,
        PROJECT,
      ),
    ).toBe(true);
  });

  it('rejects another host, so the endpoint is not an open fetch proxy', () => {
    expect(isAllowedImageUrl('https://evil.example.com/a.jpg', PROJECT)).toBe(false);
  });

  it('rejects a lookalike hostname', () => {
    expect(
      isAllowedImageUrl('https://tguzdtwsajnnczdxjqyq.supabase.co.evil.com/storage/v1/a.jpg', PROJECT),
    ).toBe(false);
  });

  it('rejects internal and link-local addresses', () => {
    expect(isAllowedImageUrl('http://169.254.169.254/latest/meta-data/', PROJECT)).toBe(false);
    expect(isAllowedImageUrl('http://localhost:8000/secret', PROJECT)).toBe(false);
    expect(isAllowedImageUrl('https://127.0.0.1/secret', PROJECT)).toBe(false);
  });

  it('rejects plain http even on the right host', () => {
    expect(isAllowedImageUrl(`http://tguzdtwsajnnczdxjqyq.supabase.co/storage/v1/a.jpg`, PROJECT)).toBe(
      false,
    );
  });

  it('rejects a path outside storage, such as the auth or rest API', () => {
    expect(isAllowedImageUrl(`${PROJECT}/auth/v1/user`, PROJECT)).toBe(false);
    expect(isAllowedImageUrl(`${PROJECT}/rest/v1/profiles?select=*`, PROJECT)).toBe(false);
  });

  it('rejects junk and other protocols', () => {
    expect(isAllowedImageUrl('not a url', PROJECT)).toBe(false);
    expect(isAllowedImageUrl('file:///etc/passwd', PROJECT)).toBe(false);
    expect(isAllowedImageUrl('', PROJECT)).toBe(false);
  });

  it('rejects everything when the project URL is not configured', () => {
    expect(isAllowedImageUrl(`${PROJECT}/storage/v1/object/sign/a.jpg`, '')).toBe(false);
  });
});
