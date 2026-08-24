const DEFAULT_OFFICIAL_SPONSOR = 'blOb';

export function namedOfficialSponsor(challenge: {
  sponsor_name?: string | null;
} | null | undefined): string {
  return challenge?.sponsor_name?.trim() ?? '';
}

export function officialSponsorName(challenge: {
  sponsor_name?: string | null;
  is_official?: boolean | null;
} | null | undefined): string {
  const named = namedOfficialSponsor(challenge);
  if (named) {
    return named;
  }
  return challenge?.is_official ? DEFAULT_OFFICIAL_SPONSOR : '';
}

export function isDefaultOfficialSponsor(name: string): boolean {
  return name.trim().toLowerCase() === DEFAULT_OFFICIAL_SPONSOR.toLowerCase();
}
