import { OFFICIAL_BOB_ID } from '@/lib/official';

const UNNAMED_SPONSORS = new Set(['blob', 'official']);

/** Official Weekly / house cards created by @blob. Not a user or corporate owner. */
export function isBlobCreatedOfficial(challenge?: {
  is_official?: boolean | null;
  created_by?: string | null;
} | null): boolean {
  return Boolean(challenge?.is_official) && challenge?.created_by === OFFICIAL_BOB_ID;
}

function cleanName(value?: string | null): string {
  const name = value?.trim() ?? '';
  if (!name || UNNAMED_SPONSORS.has(name.toLowerCase())) {
    return '';
  }
  return name;
}

export function namedOfficialSponsor(challenge: {
  sponsor_name?: string | null;
  organization_name?: string | null;
  organization?: string | null;
} | null | undefined): string {
  return (
    cleanName(challenge?.sponsor_name) ||
    cleanName(challenge?.organization_name) ||
    cleanName(challenge?.organization)
  );
}

export function officialSponsorName(challenge: {
  sponsor_name?: string | null;
  organization_name?: string | null;
  organization?: string | null;
  is_official?: boolean | null;
  created_by?: string | null;
} | null | undefined): string {
  if (!challenge?.is_official) {
    return '';
  }
  if (challenge.created_by && challenge.created_by !== OFFICIAL_BOB_ID) {
    return '';
  }
  const named = namedOfficialSponsor(challenge);
  if (named) {
    return named;
  }
  return 'blOb';
}

export function isDefaultOfficialSponsor(name: string): boolean {
  return UNNAMED_SPONSORS.has(name.trim().toLowerCase());
}
