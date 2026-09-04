import type { ReactNode } from 'react';
import { usePathname, useRouter, type Href } from 'expo-router';
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

type ProfileLinkProps = Omit<PressableProps, 'onPress'> & {
  username?: string | null;
  userId?: string | null;
  children: ReactNode;
};

const WEB_LINK = Platform.OS === 'web' ? ({ display: 'inline-flex' } as unknown as ViewStyle) : undefined;

export function ProfileLink({ username, userId, children, style, ...props }: ProfileLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  const handle = username?.trim() || userId?.trim();

  if (!handle) {
    return <>{children}</>;
  }

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(profileHref(pathname, handle))}
      style={
        typeof style === 'function'
          ? (state) => [{ flexGrow: 0 }, WEB_LINK, style(state)]
          : ([{ flexGrow: 0 }, WEB_LINK, style] as StyleProp<ViewStyle>)
      }
      {...props}>
      {children}
    </Pressable>
  );
}

function profileHref(pathname: string, handle: string): Href {
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
