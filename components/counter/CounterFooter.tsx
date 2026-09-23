import { View } from 'react-native';

import { LiftFooterBtn } from '@/components/lift/LiftLoggingFooter';

export function CounterLiveFooter({
  onClear,
  onSave,
  onShare,
  busy,
}: {
  onClear: () => void;
  onSave: () => void;
  onShare: () => void;
  busy?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <LiftFooterBtn title="Clear" variant="outline" disabled={busy} onPress={onClear} />
      <LiftFooterBtn title="Save" variant="save" loading={busy} onPress={onSave} />
      <LiftFooterBtn title="Share" variant="share" disabled={busy} onPress={onShare} />
    </View>
  );
}

export function CounterSavedFooter({
  onShare,
  onStartAgain,
  onDelete,
  busy,
}: {
  onShare: () => void;
  onStartAgain: () => void;
  onDelete: () => void;
  busy?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <LiftFooterBtn title="Share" variant="share" disabled={busy} onPress={onShare} />
      <LiftFooterBtn title="Start again" variant="save" disabled={busy} onPress={onStartAgain} />
      <LiftFooterBtn title="Delete" variant="outline" disabled={busy} onPress={onDelete} />
    </View>
  );
}
