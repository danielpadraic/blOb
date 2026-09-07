import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isSafeNotificationHref,
  NOTIFICATION_ROUTE_SEGMENTS,
  safeNotificationHref,
} from '@/lib/notificationHref';

describe('isSafeNotificationHref', () => {
  it('accepts routes the app owns', () => {
    expect(isSafeNotificationHref('/feed')).toBe(true);
    expect(isSafeNotificationHref('/challenges/abc-123')).toBe(true);
    expect(isSafeNotificationHref('/messages/42?focus=true')).toBe(true);
    expect(isSafeNotificationHref('/lift/timer')).toBe(true);
    expect(isSafeNotificationHref('/')).toBe(true);
  });

  it('rejects routes the app does not have', () => {
    expect(isSafeNotificationHref('/nope')).toBe(false);
    expect(isSafeNotificationHref('/settings/billing')).toBe(false);
  });

  it('rejects anything that would leave the app', () => {
    expect(isSafeNotificationHref('https://evil.example/feed')).toBe(false);
    expect(isSafeNotificationHref('//evil.example')).toBe(false);
    expect(isSafeNotificationHref('/javascript:alert(1)')).toBe(false);
    expect(isSafeNotificationHref('blob://auth/callback')).toBe(false);
  });

  it('rejects non-strings and relative paths', () => {
    expect(isSafeNotificationHref(undefined)).toBe(false);
    expect(isSafeNotificationHref(null)).toBe(false);
    expect(isSafeNotificationHref(42)).toBe(false);
    expect(isSafeNotificationHref('feed')).toBe(false);
  });

  it('returns null rather than an unusable Href', () => {
    expect(safeNotificationHref('/nope')).toBeNull();
    expect(safeNotificationHref('/feed')).toBe('/feed');
  });
});

describe('NOTIFICATION_ROUTE_SEGMENTS', () => {
  it('covers every routable segment on disk', () => {
    const appDir = join(__dirname, '..', 'app');
    const segments = new Set<string>();

    const collect = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const name = entry.name;
        // Route groups are not part of the URL, so their children sit at this level.
        if (entry.isDirectory() && name.startsWith('(') && name.endsWith(')')) {
          collect(join(dir, name));
          continue;
        }
        if (name.startsWith('_') || name.startsWith('+') || name.startsWith('.')) {
          continue;
        }
        if (entry.isDirectory()) {
          segments.add(name);
          continue;
        }
        const base = name.replace(/\.tsx?$/, '');
        // `index` is the bare "/" route, and dynamic segments are never a first segment.
        if (base === 'index' || base.startsWith('[')) {
          continue;
        }
        segments.add(base);
      }
    };
    collect(appDir);

    const missing = [...segments].filter(
      (segment) =>
        !NOTIFICATION_ROUTE_SEGMENTS.includes(segment) && !segment.startsWith('dev-'),
    );
    expect(missing).toEqual([]);
  });
});
