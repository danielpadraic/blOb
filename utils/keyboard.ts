import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';

type KeyPressEvent = NativeSyntheticEvent<TextInputKeyPressEventData> & {
  nativeEvent: TextInputKeyPressEventData & { shiftKey?: boolean };
};

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
