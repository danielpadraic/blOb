/** Official Bob / @blob. Testers: is_official, is_admin, or username blob. */
export const OFFICIAL_BOB_ID = '81dfe427-d413-4c60-bd4a-e710c95077ad';

type OfficialProfile = {
  id?: string | null;
  is_official?: boolean | null;
  is_admin?: boolean | null;
  username?: string | null;
};

function isBlobUsername(username?: string | null): boolean {
  return String(username ?? '').trim().toLowerCase() === 'blob';
}

/** Official @blob: is_official, is_admin, username blob, or the Official Bob id. */
export function isOfficialAccount(profile?: OfficialProfile | null): boolean {
  if (!profile) {
    return false;
  }
  if (profile.id === OFFICIAL_BOB_ID) {
    return true;
  }
  if (profile.is_official || profile.is_admin) {
    return true;
  }
  return isBlobUsername(profile.username);
}

/** /admin gate: same as Official. Do not require is_admin. */
export function isAdminViewer(profile?: OfficialProfile | null): boolean {
  return isOfficialAccount(profile);
}
