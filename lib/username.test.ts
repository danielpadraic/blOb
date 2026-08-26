import { describe, expect, it } from 'vitest';

import { normalizeUsername, usernameHandleLabel } from '@/lib/username';

describe('normalizeUsername', () => {
  it('persists lowercase and strips a leading @', () => {
    expect(normalizeUsername('  @Ada_Blob  ')).toBe('ada_blob');
    expect(usernameHandleLabel('Ada_Blob')).toBe('@ada_blob');
    expect(usernameHandleLabel('   ')).toBeNull();
  });
});
