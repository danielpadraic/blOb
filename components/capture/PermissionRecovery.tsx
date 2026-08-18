import { Platform, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import {
  openAppSettings,
  permissionCopy,
  type MediaPermissionKind,
} from '@/lib/mediaPermissions';
import { THEME } from '@/lib/theme';

type PermissionRecoveryProps = {
  kind: MediaPermissionKind;
  canAskAgain?: boolean;
  onRetry?: () => void;
  webHint?: string;
};

export function PermissionRecovery({
  kind,
  canAskAgain = false,
  onRetry,
  webHint,
}: PermissionRecoveryProps) {
  const copy = permissionCopy(kind);
  const isWeb = Platform.OS === 'web';

  return (
    <View
      className="gap-3 px-4 py-5"
      style={{
        backgroundColor: THEME.surface,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: THEME.border,
      }}>
      <AppText className="text-[18px] font-extrabold text-charcoal">{copy.title}</AppText>
      <AppText className="text-[14px] leading-5 text-muted">
        {isWeb ? webHint ?? 'Allow access in the browser prompt, or pick a file instead.' : copy.body}
      </AppText>
      {isWeb ? (
        onRetry ? <Button title="Try again" onPress={onRetry} /> : null
      ) : (
        <>
          {canAskAgain && onRetry ? <Button title="Allow access" onPress={onRetry} /> : null}
          <Button title="Open Settings" variant={canAskAgain ? 'outline' : 'primary'} onPress={() => void openAppSettings()} />
        </>
      )}
    </View>
  );
}
