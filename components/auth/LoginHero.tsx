import { Image } from 'expo-image';
import { Platform, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';

const BOB = require('@/assets/login/blob-login.png');
const ICON_MOVE = require('@/assets/login/login-icon1.png');
const ICON_CONNECT = require('@/assets/login/login-icon2.png');
const ICON_GROW = require('@/assets/login/login-icon3.png');
const ICON_STREAK = require('@/assets/login/login-icon4.png');

const PILLARS: Array<{
  label: string;
  icon: number;
  color: string;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}> = [
  { label: 'Move', icon: ICON_MOVE, color: '#2C9B89', top: 10, left: 2 },
  { label: 'Grow', icon: ICON_GROW, color: '#8FCB5A', top: 10, right: 2 },
  { label: 'Connect', icon: ICON_CONNECT, color: '#9B6BFF', bottom: 36, left: 0 },
  { label: 'Stay Consistent', icon: ICON_STREAK, color: '#F08A3A', bottom: 18, right: 0 },
];

const glowStyle =
  Platform.OS === 'web'
    ? {
        position: 'absolute' as const,
        left: '50%' as const,
        top: 42,
        width: 220,
        height: 220,
        marginLeft: -110,
        borderRadius: 110,
        backgroundColor: 'rgba(44, 155, 137, 0.5)',
        filter: 'blur(42px)',
      }
    : {
        position: 'absolute' as const,
        left: '50%' as const,
        top: 78,
        width: 36,
        height: 36,
        marginLeft: -18,
        borderRadius: 18,
        backgroundColor: '#2C9B89',
        shadowColor: '#2C9B89',
        shadowOpacity: 0.95,
        shadowRadius: 48,
        shadowOffset: { width: 0, height: 0 },
      };

export function LoginHero() {
  return (
    <View style={{ height: 312, width: '100%' }}>
      <View pointerEvents="none" style={glowStyle} />
      <Image
        source={BOB}
        style={{
          position: 'absolute',
          left: '50%',
          top: 36,
          width: 196,
          height: 196,
          marginLeft: -98,
        }}
        contentFit="contain"
        contentPosition="center"
        cachePolicy="memory-disk"
        recyclingKey="bob-3d-wave"
        accessibilityLabel="Bob"
      />
      {PILLARS.map((pillar) => (
        <View
          key={pillar.label}
          style={{
            position: 'absolute',
            top: pillar.top,
            bottom: pillar.bottom,
            left: pillar.left,
            right: pillar.right,
            width: 92,
            alignItems: 'center',
          }}>
          <Image
            source={pillar.icon}
            style={{ width: 52, height: 52 }}
            contentFit="contain"
            accessibilityLabel={pillar.label}
          />
          <AppText
            className="mt-1 text-center text-[11px] font-extrabold"
            style={{ color: pillar.color, letterSpacing: 0.2 }}>
            {pillar.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}
