import { describe, expect, it } from 'vitest';

import { LEGAL_DOCS } from '@/copy/legalDocs';

describe('legal privacy copy', () => {
  it('starts the private-metrics sentence with These stay private', () => {
    const privacy = LEGAL_DOCS.privacy.sections
      .flatMap((section) => section.body)
      .find((paragraph) => paragraph.includes('stay private'));
    expect(privacy).toBe('These stay private. Completing a fitness profile does not publish them.');
    expect(privacy?.startsWith('These stay private.')).toBe(true);
    expect(privacy).not.toMatch(/nese/i);
  });
});
