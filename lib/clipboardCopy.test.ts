import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';

import { copyTextToClipboard } from '@/lib/clipboardCopy';

describe('copyTextToClipboard', () => {
  const previousOs = Platform.OS;

  afterEach(() => {
    Platform.OS = previousOs;
    vi.unstubAllGlobals();
  });

  it('refuses an empty string so private corporate never copies ""', async () => {
    expect(await copyTextToClipboard('')).toBe(false);
    expect(await copyTextToClipboard('   ')).toBe(false);
  });

  it('uses writeText then execCommand on web', async () => {
    Platform.OS = 'web';
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('document', {
      createElement: () => {
        const field = {
          value: '',
          style: {},
          setAttribute: () => undefined,
          focus: () => undefined,
          select: () => undefined,
          setSelectionRange: () => undefined,
        };
        return field;
      },
      body: { appendChild: () => undefined, removeChild: () => undefined },
      execCommand,
    });

    expect(await copyTextToClipboard('https://blob.mobi/challenges/abc?invite=tok')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://blob.mobi/challenges/abc?invite=tok');
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});
