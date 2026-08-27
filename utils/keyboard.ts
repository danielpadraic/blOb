import { Keyboard, Platform, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';

type KeyPressEvent = NativeSyntheticEvent<TextInputKeyPressEventData> & {
  nativeEvent: TextInputKeyPressEventData & { shiftKey?: boolean };
};

/** Hide the software keyboard (native) or blur the focused field (web / mobile Safari). */
export function dismissKeyboard() {
  Keyboard.dismiss();
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const node = document.activeElement;
    if (node && 'blur' in node && typeof node.blur === 'function') {
      node.blur();
    }
  }
}

/** Enter posts; Shift+Enter inserts a newline (web / hardware keyboards). */
export function handleEnterToSubmit(
  event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  submit: () => void,
) {
  const native = (event as KeyPressEvent).nativeEvent;
  if (native.key !== 'Enter' || native.shiftKey) {
    return;
  }
  event.preventDefault();
  submit();
}
