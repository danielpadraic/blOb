import { Platform } from 'react-native';

function copyOnWeb(text: string): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', 'readonly');
  field.setAttribute('aria-hidden', 'true');
  field.style.position = 'fixed';
  field.style.top = '0';
  field.style.left = '0';
  field.style.width = '1px';
  field.style.height = '1px';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.focus();
  field.select();
  field.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(field);
  return ok;
}

/** Copy inside the tap. Web: clipboard API, then execCommand. Native: expo-clipboard. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text ?? '').trim();
  if (!value) {
    return false;
  }
  if (Platform.OS === 'web') {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // Safari / iframe / insecure: fall through to execCommand while we still can.
    }
    return copyOnWeb(value);
  }
  try {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(value);
    return true;
  } catch {
    return false;
  }
}
