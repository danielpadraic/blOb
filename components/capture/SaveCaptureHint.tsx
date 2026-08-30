import { useEffect, useState } from 'react';
import { Platform, Pressable } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import {
  offerWebSaveCapture,
  watchSaveCapture,
  type SaveCaptureInput,
  type SaveCaptureResult,
} from '@/lib/saveCapture';
import { THEME } from '@/lib/theme';

type SaveCaptureHintProps = SaveCaptureInput & {
  compact?: boolean;
};

export function SaveCaptureHint({ compact, ...input }: SaveCaptureHintProps) {
  const [notice, setNotice] = useState<SaveCaptureResult | null>(null);
  const uri = input.uri?.trim() ?? '';

  useEffect(() => {
    return watchSaveCapture((result) => {
      if (!uri || result.uri === uri) {
        setNotice(result);
      }
    });
  }, [uri]);

  if (!uri || input.fromLibrary || uri.startsWith('health:') || /^https?:\/\//i.test(uri)) {
    return null;
  }

  if (Platform.OS === 'web') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy('capture.saveWeb')}
        onPress={() => {
          void offerWebSaveCapture(input);
        }}
        style={{
          alignSelf: compact ? 'flex-start' : 'stretch',
          minHeight: 36,
          paddingHorizontal: compact ? 10 : 0,
          justifyContent: 'center',
        }}>
        <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
          {copy('capture.saveWeb')}
        </AppText>
      </Pressable>
    );
  }

  if (notice?.reason === 'denied' || notice?.reason === 'failed') {
    return (
      <AppText className="text-[13px]" style={{ color: THEME.textMuted }}>
        {copy('capture.saveDenied')}
      </AppText>
    );
  }

  return null;
}
