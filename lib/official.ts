/** Official Bob / @blob. Testers: is_official, is_admin, or username blob. */
export const OFFICIAL_BOB_ID = '81dfe427-d413-4c60-bd4a-e710c95077ad';

export function isOfficialAccount(
  profile?: { is_official?: boolean | null; is_admin?: boolean | null; username?: string | null } | null,
): boolean {
  if (!profile) {
    return false;
  }
  if (isAdminViewer(profile)) {
    return true;
  }
  return String(profile.username ?? '').trim().toLowerCase() === 'blob';
}

/** /admin gate: Official @blob via is_official or is_admin. */
export function isAdminViewer(
  profile?: { is_official?: boolean | null; is_admin?: boolean | null } | null,
): boolean {
  return Boolean(profile?.is_official || profile?.is_admin);
}
