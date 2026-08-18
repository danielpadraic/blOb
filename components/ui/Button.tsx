import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { THEME } from '@/lib/theme';
import { cn } from '@/utils/cn';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'mint' | 'danger';
type Size = 'md' | 'lg' | 'sm';

type ButtonProps = PressableProps & {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  className?: string;
};

const variantBg: Record<Variant, string> = {
  primary: THEME.primary,
  secondary: THEME.accent,
  ghost: 'transparent',
  outline: THEME.surface,
  mint: THEME.accentSoft,
  danger: THEME.danger,
};

const variantText: Record<Variant, string> = {
  primary: THEME.primaryForeground,
  secondary: THEME.accentForeground,
  ghost: THEME.primary,
  outline: THEME.textPrimary,
  mint: THEME.accent,
  danger: THEME.primaryForeground,
};

const sizeHeight: Record<Size, number> = {
  sm: 40,
  md: 48,
  lg: 56,
};

const sizeFont: Record<Size, number> = {
  sm: 14,
  md: 16,
  lg: 16,
};

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  onPressIn,
  onPressOut,
  style,
  ...props
}: ButtonProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const isDisabled = Boolean(disabled || loading);
  const height = sizeHeight[size];

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      className={cn(size === 'lg' || size === 'md' ? 'w-full' : undefined, className)}
      style={[
        animatedStyle,
        {
          height,
          backgroundColor: variantBg[variant],
          borderRadius: THEME.radiusSm,
          opacity: isDisabled ? 0.38 : 1,
          borderWidth: variant === 'ghost' || variant === 'outline' ? 1 : 0,
          borderColor:
            variant === 'outline'
              ? THEME.border
              : variant === 'ghost'
                ? THEME.primary
                : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: size === 'sm' ? 12 : 16,
        },
        style,
      ]}
      onPressIn={(event) => {
        if (!isDisabled) {
          scale.value = withSpring(0.98, { damping: 18, stiffness: 280 });
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, { damping: 18, stiffness: 280 });
        onPressOut?.(event);
      }}
      {...props}>
      {loading ? (
        <ActivityIndicator color={variantText[variant]} />
      ) : (
        <Text
          style={{
            color: variantText[variant],
            fontSize: sizeFont[size],
            fontWeight: '600',
            textAlign: 'center',
            includeFontPadding: false,
            textAlignVertical: 'center',
            lineHeight: sizeFont[size] + 2,
          }}>
          {title}
        </Text>
      )}
    </AnimatedPressable>
  );
}
