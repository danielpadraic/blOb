import { Platform, type ViewStyle } from 'react-native';

export const THEME = {
  background: '#F7F7F5',
  surface: '#FFFFFF',
  surface2: '#F2F5F3',
  primary: '#101312',
  primaryForeground: '#FFFFFF',
  secondaryDark: '#151716',
  accent: '#2C9B89',
  accentSoft: '#E7F7F3',
  accentBright: '#72D9CB',
  accentForeground: '#FFFFFF',
  circle: '#C4784A',
  circleSoft: '#F6EDE4',
  gold: '#D7A62F',
  textPrimary: '#151716',
  textSecondary: '#151716',
  textMuted: '#7F8581',
  border: '#E8EBE8',
  borderSubtle: 'rgba(25, 34, 31, 0.12)',
  danger: '#9A3B3B',
  radius: 22,
  radiusSm: 14,
  radiusLg: 22,
  space: {
    8: 8,
    12: 12,
    16: 16,
    24: 24,
    32: 32,
  },
} as const;

/** Height of the floating pill tab bar (not including bottom inset). */
export const TAB_BAR_HEIGHT = 70;
export const TAB_BAR_GUTTER = 10;
/** Compose + peeks into the scene; scroll content needs this extra bottom space. */
export const TAB_BAR_PEEK = 40;
/** BlobTabBar paddingTop / negative marginTop — the pill peeks this far into the scene. */
export const TAB_BAR_SCENE_PEEK = 18;
/** Extra air above the pill for in-flow stickies. Keep at 0 so the CTA sits flush. */
export const TAB_STICKY_PAD = 0;

/** Phone-width Home column on web. Do not widen cards on desktop. */
export const FEED_COLUMN_MAX = 430;

/** Web flex children default to min-width:auto and ellipsis too early. Safe on native. */
export function flexChildMin(): ViewStyle {
  return { minWidth: 0, flexShrink: 1 };
}

/** Space so tab-root screens clear the floating pill bar (70px bar + inset + gap). */
export const TAB_BAR_CONTENT_INSET = 128;

/**
 * Offset from the bottom of a tab scene or overlay so content clears the pill.
 * `overlay` is for full-window layers. `sticky` is for in-flow scene CTAs — the
 * tab bar already occupies layout space, so do not add TAB_BAR_HEIGHT again.
 */
export function tabBarLift(bottomInset: number, kind: 'overlay' | 'sticky' = 'overlay'): number {
  if (kind === 'sticky') {
    // Scene already ends at the tab bar. The pill peeks TAB_BAR_SCENE_PEEK
    // into the scene; sit on that edge with no extra transparent gap.
    return TAB_BAR_SCENE_PEEK + TAB_STICKY_PAD;
  }
  return TAB_BAR_HEIGHT + Math.max(bottomInset, TAB_BAR_GUTTER) + 12;
}

export function themeShadow(kind: 'card' | 'bar' = 'card'): ViewStyle {
  if (kind === 'bar') {
    return Platform.OS === 'web'
      ? { boxShadow: '0 10px 30px rgba(20, 28, 26, 0.16)' }
      : {
          boxShadow: [
            {
              color: 'rgba(20, 28, 26, 0.16)',
              offsetX: 0,
              offsetY: 10,
              blurRadius: 30,
            },
          ],
        };
  }

  return Platform.OS === 'web'
    ? { boxShadow: '0 8px 24px rgba(25, 34, 31, 0.07)' }
    : {
        boxShadow: [
          {
            color: 'rgba(25, 34, 31, 0.07)',
            offsetX: 0,
            offsetY: 8,
            blurRadius: 24,
          },
        ],
      };
}

/** Back-compat aliases used across the app. */
export const COLORS = {
  charcoal: THEME.primary,
  charcoal800: THEME.secondaryDark,
  cream: THEME.background,
  cream100: THEME.border,
  coral: THEME.accent,
  coralDark: THEME.danger,
  mint: THEME.accentBright,
  mintDark: THEME.accent,
  ink: THEME.textPrimary,
  muted: THEME.textMuted,
  line: THEME.border,
  white: THEME.surface,
  accentSoft: THEME.accentSoft,
  circle: THEME.circle,
  circleSoft: THEME.circleSoft,
  danger: THEME.danger,
} as const;
