export type OfficialDobStatus = 'ok' | 'dob_required' | 'underage';

export function parseDateOnly(value: string | null | undefined): Date | null {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function ageOnDate(dob: Date, today: Date = new Date()): number {
  let age = today.getFullYear() - dob.getFullYear();
  const month = today.getMonth() - dob.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export function officialDobStatus(
  dateOfBirth: string | null | undefined,
  today: Date = new Date(),
): OfficialDobStatus {
  const dob = parseDateOnly(dateOfBirth);
  if (!dob) {
    return 'dob_required';
  }
  if (ageOnDate(dob, today) < 18) {
    return 'underage';
  }
  return 'ok';
}

export const OFFICIAL_DOB_COPY = {
  missingTitle: 'Add your birth date to enter Official Challenges.',
  missingBody: 'This stays private. It is never on your public profile.',
  underageTitle: 'Official Challenges are for 18 and up.',
  underageBody: 'You can still use Home, friends, and peer challenges.',
} as const;
