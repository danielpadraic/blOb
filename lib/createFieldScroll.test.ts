import { describe, expect, it } from 'vitest';

import { CREATE_FIELD_ALIGN_MAX, createFieldScrollDelta } from '@/lib/createFieldScroll';

describe('createFieldScrollDelta', () => {
  it('scrolls a short Task field just above the sticky footer', () => {
    expect(
      createFieldScrollDelta({
        fieldY: 450,
        fieldH: 80,
        windowH: 800,
        footerH: 64,
        keyboardOverlap: 300,
      }),
    ).toBe(110);
  });

  it('does not treat a tall Task+proofs wrapper as the focused block', () => {
    const tall = createFieldScrollDelta({
      fieldY: 200,
      fieldH: 600,
      windowH: 800,
      footerH: 64,
      keyboardOverlap: 300,
    });
    const capped = createFieldScrollDelta({
      fieldY: 200,
      fieldH: CREATE_FIELD_ALIGN_MAX,
      windowH: 800,
      footerH: 64,
      keyboardOverlap: 300,
    });
    expect(tall).toBe(capped);
    expect(tall).toBe(0);
  });

  it('leaves a field that already sits above the footer', () => {
    expect(
      createFieldScrollDelta({
        fieldY: 80,
        fieldH: 72,
        windowH: 800,
        footerH: 64,
        keyboardOverlap: 300,
      }),
    ).toBe(0);
  });

  it('pulls a field out from under the top edge so Title stays reachable', () => {
    expect(
      createFieldScrollDelta({
        fieldY: 4,
        fieldH: 72,
        windowH: 800,
        footerH: 64,
        keyboardOverlap: 0,
      }),
    ).toBe(-20);
  });
});
