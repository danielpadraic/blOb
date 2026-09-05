import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { THEME, themeShadow } from '@/lib/theme';

export function GeoSheetCard({
  children,
  onClose,
  align = 'center',
}: {
  children: ReactNode;
  onClose?: () => void;
  align?: 'center' | 'end';
}) {
  return (
    <ChromeOverlay visible onClose={onClose} align={align} dim="heavy" zIndex={240}>
      <View
        className={align === 'end' ? 'px-5 pt-4' : 'mx-4 px-5 py-5'}
        style={{
          backgroundColor: THEME.surface,
          borderRadius: THEME.radius,
          borderWidth: 1,
          borderColor: THEME.border,
          ...(align === 'end'
            ? {
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
                borderTopLeftRadius: THEME.radiusLg,
                borderTopRightRadius: THEME.radiusLg,
              }
            : null),
          ...themeShadow(),
        }}>
        <View className="mb-3 items-center">
          <View
            className="h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: THEME.accentSoft }}>
            <Glyph name={GLYPH.pin} color={THEME.primary} size={22} />
          </View>
        </View>
        {children}
      </View>
    </ChromeOverlay>
  );
}
