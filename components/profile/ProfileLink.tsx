import type { ReactNode } from 'react';
import { usePathname, useRouter, type Href } from 'expo-router';
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

type ProfileLinkProps = Omit<PressableProps, 'onPress'> & {
  username?: string | null;
  userId?: string | null;
  children: ReactNode;
  /** Board row: grow, no web inline-flex. Default stays shrink-wrapped for feed/DMs. */
  fill?: boolean;
};

const WEB_LINK = Platform.OS === 'web' ? ({ display: 'inline-flex' } as unknown as ViewStyle) : undefined;

const FILL_LINK: ViewStyle = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
};

export function ProfileLink({ username, userId, children, style, fill, ...props }: ProfileLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  const handle = username?.trim() || userId?.trim();

  if (!handle) {
    return <>{children}</>;
  }

  const lock = fill ? FILL_LINK : ([{ flexGrow: 0 }, WEB_LINK] as StyleProp<ViewStyle>);

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(profileHref(pathname, handle))}
      style={
        typeof style === 'function'
          ? (state) => [lock, style(state)]
          : ([lock, style] as StyleProp<ViewStyle>)
      }
      {...props}>
      {children}
    </Pressable>
  );
}

export function profileHref(pathname: string, handle: string): Href {
  if (pathname.startsWith('/challenges')) {
    return { pathname: '/challenges/u/[username]', params: { username: handle } };
  }
  if (pathname.startsWith('/profile')) {
    return { pathname: '/profile/u/[username]', params: { username: handle } };
  }
  if (pathname.startsWith('/friends') || pathname.startsWith('/messages')) {
    return { pathname: '/friends/u/[username]', params: { username: handle } };
  }
  return { pathname: '/feed/u/[username]', params: { username: handle } };
}
