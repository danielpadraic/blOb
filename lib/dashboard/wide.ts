/** Wide blob.mobi may show the left rail. A phone-width window keeps the bottom bar. */
export const WIDE_DASHBOARD_MIN = 960;

export function isWideDashboardWindow(width: number, platform?: string): boolean {
  const os = platform ?? 'web';
  return os === 'web' && width >= WIDE_DASHBOARD_MIN;
}
