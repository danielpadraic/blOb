import {
  isCorporateChallenge,
  isFitnessOfficialChallenge,
  usesComparablePointsScoring,
} from '@/lib/challengeExperience';
import { copy } from '@/lib/copy';
import {
  DEFAULT_DISTANCE_MILES,
  athleteDistanceUnit,
  distanceProofSentence,
  milesToMeters,
  parseSessionDistanceText,
  type DistanceUnit,
} from '@/lib/distance';
import { parseCheckinHealthProof, type CheckinHealthProof } from '@/lib/health/checkinHealthProof';
import {
  locationPartSatisfies,
  locationProofSentence,
  parseLocationPlace,
  publicLocationPlace,
  type LocationPlace,
} from '@/lib/locationProof';
import type { ProofType } from '@/lib/types';

export const CHALLENGE_PROOF_METHODS = ['photo', 'video', 'checkin', 'honor', 'hr', 'distance', 'location'] as const;

export type ChallengeProofMethod = (typeof CHALLENGE_PROOF_METHODS)[number];

export type ChallengeProof = {
  id: string;
  name: string;
  method: ChallengeProofMethod;
  minutes?: number;
  distance_meters?: number;
  place?: LocationPlace | null;
};

export type ChallengeProofPart = {
  method: ChallengeProofMethod;
  url?: string | null;
  /** All image URLs for this slot. `url` stays the first for older rows. */
  urls?: string[] | null;
  /** Media URLs on this part that the author hid (blur-in-place). File stays. */
  hidden_urls?: string[] | null;
  text?: string | null;
  healthWorkoutId?: string | null;
  fromLibrary?: boolean;
  /** Watch/Health snapshot on this check-in. Not a profile field. */
  health?: CheckinHealthProof | null;
  distanceMeters?: number | null;
  place_id?: string | null;
  label?: string | null;
  radius_m?: number | null;
  in_fence?: boolean;
  accuracy_m?: number | null;
  submitted_at?: string | null;
  /** User caption on this proof’s media. ≤180. Not posts.content. */
  caption?: string | null;
  /** SHA-256 of file bytes, or object:/health: fingerprint when bytes are unavailable. */
  contentHash?: string | null;
};

/** Extra photos on top of required proofs. Extras are optional and never unlock Send. */
export const CHECKIN_PHOTO_CAP = 8;

export function mediaUrlKey(url: string): string {
  return url.trim().split('?')[0]?.toLowerCase() ?? url.trim().toLowerCase();
}

export function uniqueProofUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = typeof raw === 'string' ? raw.trim() : '';
    if (!url) {
      continue;
    }
    const key = mediaUrlKey(url);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(url);
  }
  return out;
}

/** True when the draft is a new file for this slot (retake / replace). */
export function proofSlotNeedsRewrite(
  draftUri?: string | null,
  savedUrl?: string | null,
): boolean {
  const draft = draftUri?.trim() ?? '';
  const saved = savedUrl?.trim() ?? '';
  if (!draft) {
    return false;
  }
  if (!saved) {
    return true;
  }
  return mediaUrlKey(draft) !== mediaUrlKey(saved);
}

export function proofImageUrls(part?: ChallengeProofPart | null): string[] {
  return uniqueProofUrls([part?.url, ...(part?.urls ?? [])]);
}

const PROOF_ROLE_ALIASES = new Set(['pre', 'post', 'hr', 'pre_selfie', 'post_selfie', 'hr_monitor']);

export function extraProofImageUrls(
  proofs: ChallengeProof[],
  parts: Record<string, ChallengeProofPart> | null | undefined,
  legacy?: {
    pre_selfie_url?: string | null;
    post_selfie_url?: string | null;
    hr_monitor_url?: string | null;
  },
): string[] {
  const required = new Set<string>();
  for (const proof of proofs) {
    const primary = existingUrlForProof(proof, parts, legacy);
    if (primary) {
      required.add(mediaUrlKey(primary));
    }
    const listed = parts?.[proof.id]?.url?.trim();
    if (listed) {
      required.add(mediaUrlKey(listed));
    }
  }
  const extras: string[] = [];
  const seen = new Set<string>();
  const addExtra = (url: string) => {
    const key = mediaUrlKey(url);
    if (!key || required.has(key) || seen.has(key)) {
      return;
    }
    seen.add(key);
    extras.push(url);
  };
  for (const proof of proofs) {
    for (const url of proofImageUrls(parts?.[proof.id])) {
      addExtra(url);
    }
  }
  const knownIds = new Set(proofs.map((proof) => proof.id));
  for (const [id, part] of Object.entries(parts ?? {})) {
    if (knownIds.has(id) || PROOF_ROLE_ALIASES.has(id)) {
      continue;
    }
    for (const url of proofImageUrls(part)) {
      addExtra(url);
    }
  }
  return extras;
}

export function excludeRequiredSlotMedia<T extends { uri: string; remoteUrl?: string | null }>(
  extras: T[],
  requiredUrls: Array<string | null | undefined>,
): T[] {
  const required = new Set(
    requiredUrls
      .map((url) => (typeof url === 'string' ? url.trim() : ''))
      .filter(Boolean)
      .map((url) => mediaUrlKey(url)),
  );
  return extras.filter((item) => {
    const raw = String(item.remoteUrl ?? item.uri ?? '').trim();
    return !raw || !required.has(mediaUrlKey(raw));
  });
}

export const SIMPLE_PROOF_CAP = 4;
export const CALLOUT_PROOF_CAP = 3;

export const BEFORE_AFTER_HR_PRESET: Array<{ name: string; method: ChallengeProofMethod; minutes?: number }> = [
  { name: 'Post a pre-workout selfie.', method: 'photo' },
  { name: 'Post a post-workout selfie.', method: 'photo' },
  { name: 'Share proof of at least 30 minutes of elevated heart rate.', method: 'hr', minutes: 30 },
];

export const PRE_WORKOUT_SELFIE_SENTENCE = 'Post a pre-workout selfie.';
export const POST_WORKOUT_SELFIE_SENTENCE = 'Post a post-workout selfie.';

/** Official week_10 and the join-confirm proof checkbox. Never “HR.” */
export const WEEK_10_PROOF_SENTENCE =
  'A pre-workout selfie, a post-workout selfie, and proof of at least 30 minutes of elevated heart rate from your fitness or heart-rate tracker app.';

export function heartRateMinutesLabel(minutes: number): string {
  const n = Math.max(Math.round(Number(minutes) || 30), 1);
  return n === 1 ? '1 minute' : `${n} minutes`;
}

export function heartRateProofSentence(minutes = 30): string {
  const n = Math.max(Math.round(Number(minutes) || 30), 1);
  return `Share proof of at least ${heartRateMinutesLabel(n)} of elevated heart rate.`;
}

export function proofHeartRateMinutes(proof: Pick<ChallengeProof, 'method' | 'minutes'>, fallback = 30): number {
  if (proof.method !== 'hr') {
    return Math.max(Math.round(Number(fallback) || 30), 1);
  }
  return Math.max(Math.round(Number(proof.minutes) || Number(fallback) || 30), 1);
}

export function proofDistanceMeters(
  proof?: Pick<ChallengeProof, 'method' | 'distance_meters'> | null,
  fallback = milesToMeters(DEFAULT_DISTANCE_MILES),
): number {
  if (proof?.method && proof.method !== 'distance') {
    return Math.max(Math.round(Number(fallback) || milesToMeters(DEFAULT_DISTANCE_MILES)), 1);
  }
  const stored = Number(proof?.distance_meters);
  if (Number.isFinite(stored) && stored > 0) {
    return Math.round(stored);
  }
  return Math.max(Math.round(Number(fallback) || milesToMeters(DEFAULT_DISTANCE_MILES)), 1);
}

export function partDistanceMeters(part?: ChallengeProofPart | null, unit: DistanceUnit = 'mi'): number | null {
  const health = Number(part?.health?.distanceMeters);
  if (Number.isFinite(health) && health > 0) {
    return Math.round(health);
  }
  const stored = Number(part?.distanceMeters);
  if (Number.isFinite(stored) && stored > 0) {
    return Math.round(stored);
  }
  return parseSessionDistanceText(part?.text, unit);
}

export function defaultSentenceForMethod(
  method: ChallengeProofMethod,
  minutes = 30,
  options?: { distanceMeters?: number; unit?: DistanceUnit; place?: LocationPlace | null },
): string {
  if (method === 'hr') {
    return heartRateProofSentence(minutes);
  }
  if (method === 'distance') {
    return distanceProofSentence(options?.distanceMeters, options?.unit ?? athleteDistanceUnit());
  }
  if (method === 'location') {
    return locationProofSentence(options?.place);
  }
  if (method === 'video') {
    return 'Post a video of the work.';
  }
  if (method === 'checkin') {
    return 'Write a short note that you did the work.';
  }
  if (method === 'honor') {
    return 'Confirm on your honor that you did the work.';
  }
  return 'Post a photo of the work.';
}

const SHORT_PROOF_LABELS = new Set([
  'photo',
  'proof',
  'video',
  'check-in',
  'checkin',
  'note',
  'honor',
  'heart rate',
  'hr',
  'distance',
  'location',
  'place',
  'miles',
  'km',
  'pre-selfie',
  'post-selfie',
  'pre-workout',
  'post-workout',
  'screenshot',
  'selfie',
]);

export function isShortProofLabel(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/\.$/, '');
  if (!normalized) {
    return true;
  }
  if (SHORT_PROOF_LABELS.has(normalized)) {
    return true;
  }
  const words = normalized.split(/\s+/);
  return words.length <= 2 && !/^(post|share|write|confirm)\b/.test(normalized);
}

export function ensureProofSentence(proof: ChallengeProof, minutes = 30): ChallengeProof {
  const name = proof.name.trim();
  const lower = name.toLowerCase();
  const hrMinutes = proofHeartRateMinutes({ method: 'hr', minutes: proof.minutes }, minutes);
  if (proof.method === 'distance') {
    const meters = proofDistanceMeters(proof);
    if (isShortProofLabel(name) || name === defaultSentenceForMethod('distance', minutes, { distanceMeters: meters })) {
      return { ...proof, distance_meters: meters, name: defaultSentenceForMethod('distance', minutes, { distanceMeters: meters }) };
    }
    return { ...proof, distance_meters: meters, name: name.endsWith('.') ? name : `${name}.` };
  }
  if (proof.method === 'location') {
    const place = parseLocationPlace(proof.place) ?? proof.place ?? null;
    const sentence = defaultSentenceForMethod('location', minutes, { place });
    if (isShortProofLabel(name) || name === sentence) {
      return { ...proof, place, name: sentence };
    }
    return { ...proof, place, name: name.endsWith('.') ? name : `${name}.` };
  }
  if (proof.method === 'hr' || /\bhr\b/.test(lower) || lower.includes('heart rate') || lower.includes('heart-rate')) {
    return { ...proof, method: 'hr', minutes: hrMinutes, name: heartRateProofSentence(hrMinutes) };
  }
  if (isCheckoutProofName(lower)) {
    return { ...proof, name: POST_WORKOUT_SELFIE_SENTENCE };
  }
  if (isCheckinSelfieName(lower)) {
    return { ...proof, name: PRE_WORKOUT_SELFIE_SENTENCE };
  }
  if (isShortProofLabel(name)) {
    return { ...proof, name: defaultSentenceForMethod(proof.method, minutes) };
  }
  return { ...proof, name: name.endsWith('.') ? name : `${name}.` };
}

export function proofNameForMethodChange(proof: ChallengeProof, method: ChallengeProofMethod, minutes = 30): string {
  const previousDefault = defaultSentenceForMethod(proof.method, minutes, {
    distanceMeters: proof.distance_meters,
    place: proof.place,
  });
  if (!proof.name.trim() || isShortProofLabel(proof.name) || proof.name.trim() === previousDefault) {
    return defaultSentenceForMethod(method, minutes, { distanceMeters: proof.distance_meters, place: proof.place });
  }
  return ensureProofSentence({ ...proof, method }, minutes).name;
}

export function signupProofLines(challenge: {
  is_official?: boolean | null;
  series_id?: string | null;
  category?: string | null;
  min_minutes?: number | string | null;
  proofs?: unknown;
  proof_type?: unknown;
  proof_requirements?: Array<{ type?: string; required?: boolean }> | null;
  challenge_type?: string | null;
  task?: string | null;
  tasks?: unknown;
}): string[] {
  const minutes = Math.max(Math.round(Number(challenge.min_minutes) || 30), 1);
  if (usesWeek10ProofSentence(challenge)) {
    return [WEEK_10_PROOF_SENTENCE];
  }
  const listed = resolveChallengeProofs({
    proofs: challenge.proofs,
    proof_type: challenge.proof_type,
    proof_requirements: challenge.proof_requirements,
  });
  const lines = listed.map((proof) => ensureProofSentence(proof, proofHeartRateMinutes(proof, minutes)).name);
  const primary = String(challenge.task ?? '')
    .trim()
    .toLowerCase();
  if (!Array.isArray(challenge.tasks)) {
    return uniqueSignupLines(lines);
  }
  for (const raw of challenge.tasks) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const row = raw as {
      id?: unknown;
      title?: unknown;
      once?: unknown;
      proof_required?: unknown;
      proof_types?: unknown;
    };
    const title = String(row.title ?? '').trim();
    const taskId = String(row.id ?? '').trim();
    if (!title || title.toLowerCase() === primary) {
      continue;
    }
    if (listed.some((proof) => proofCoversTask(proof, taskId, title))) {
      continue;
    }
    const types = Array.isArray(row.proof_types)
      ? row.proof_types.map((item) => String(item))
      : [];
    const honor = row.proof_required === false || types.length === 0;
    if (honor) {
      lines.push(`Complete “${title}” on your honor.`);
      continue;
    }
    const method = methodFromProofType(types[0]);
    const sentence = defaultSentenceForMethod(method, minutes);
    lines.push(row.once ? `Once, for “${title}”: ${sentence}` : `For “${title}”: ${sentence}`);
  }
  if (listed.some((proof) => proof.method === 'photo' || proof.method === 'video')) {
    lines.push('Extra photos or videos are welcome.');
  }
  return uniqueSignupLines(lines);
}

function proofCoversTask(proof: ChallengeProof, taskId: string, title: string): boolean {
  const id = taskId.toLowerCase();
  const proofId = proof.id.toLowerCase();
  const name = proof.name.toLowerCase();
  const task = title.toLowerCase();
  if (id && (proofId === id || proofId.startsWith(`${id}_`) || proofId.startsWith(id.split('_')[0] ?? id))) {
    return true;
  }
  if (name.includes(task) || task.includes(name)) {
    return true;
  }
  const words = task.split(/\s+/).filter((word) => word.length > 3);
  return words.some((word) => name.includes(word) || proofId.includes(word));
}

function uniqueSignupLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(line);
  }
  return out;
}

export function newProofId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeProof(
  name: string,
  method: ChallengeProofMethod,
  minutes?: number,
  distanceMeters?: number,
  place?: LocationPlace | null,
): ChallengeProof {
  const hrMinutes = method === 'hr' ? Math.max(Math.round(Number(minutes) || 30), 1) : undefined;
  const meters =
    method === 'distance' ? proofDistanceMeters({ method, distance_meters: distanceMeters }) : undefined;
  const pinned = method === 'location' ? parseLocationPlace(place) ?? place ?? null : undefined;
  return { id: newProofId(), name, method, minutes: hrMinutes, distance_meters: meters, place: pinned };
}

export function defaultChallengeProofs(_task = ''): ChallengeProof[] {
  return [makeProof(defaultSentenceForMethod('photo'), 'photo')];
}

export function isChallengeProofMethod(value: unknown): value is ChallengeProofMethod {
  return CHALLENGE_PROOF_METHODS.includes(value as ChallengeProofMethod);
}

export function methodLabel(method: ChallengeProofMethod): string {
  if (method === 'video') {
    return copy('create.proofVideo');
  }
  if (method === 'checkin') {
    return copy('create.proofCheckin');
  }
  if (method === 'honor') {
    return copy('create.proofHonor');
  }
  if (method === 'hr') {
    return copy('create.proofHr');
  }
  if (method === 'distance') {
    return copy('create.proofDistance');
  }
  if (method === 'location') {
    return copy('create.proofLocation');
  }
  return copy('create.proofPhoto');
}

export function proofDisplayName(proof: ChallengeProof, minutes = 30): string {
  return ensureProofSentence(proof, minutes).name;
}

export function firstProofMethod(proofs: ChallengeProof[]): ChallengeProofMethod {
  return proofs[0]?.method ?? 'photo';
}

function isCheckoutProofName(lower: string): boolean {
  if (
    lower.includes('pre-workout') ||
    lower.includes('pre-selfie') ||
    lower.includes('check-in selfie') ||
    (lower.includes('pre') && lower.includes('selfie'))
  ) {
    return false;
  }
  return (
    lower.includes('check-out') ||
    lower.includes('checkout') ||
    /\bcheck out\b/.test(lower) ||
    lower.includes('post-workout') ||
    lower.includes('post-selfie') ||
    (lower.includes('post') && lower.includes('selfie'))
  );
}

function isCheckinSelfieName(lower: string): boolean {
  if (isCheckoutProofName(lower)) {
    return false;
  }
  return (
    lower.includes('pre-workout') ||
    lower.includes('pre-selfie') ||
    lower.includes('check-in selfie') ||
    (lower.includes('pre') && lower.includes('selfie'))
  );
}

export function isPreWorkoutProof(proof: Pick<ChallengeProof, 'id' | 'name'>): boolean {
  const lower = proof.name.trim().toLowerCase();
  return proof.id === 'pre' || isCheckinSelfieName(lower);
}

export function isPostWorkoutProof(proof: Pick<ChallengeProof, 'id' | 'name'>): boolean {
  const lower = proof.name.trim().toLowerCase();
  return proof.id === 'post' || isCheckoutProofName(lower);
}

export function existingUrlForProof(
  proof: ChallengeProof,
  parts?: Record<string, ChallengeProofPart> | null,
  legacy?: {
    pre_selfie_url?: string | null;
    post_selfie_url?: string | null;
    hr_monitor_url?: string | null;
  },
): string | null {
  const direct = String(parts?.[proof.id]?.url ?? '').trim();
  if (direct) {
    return direct;
  }
  const role = isPreWorkoutProof(proof)
    ? 'pre'
    : isPostWorkoutProof(proof)
      ? 'post'
      : proof.method === 'hr' || isHeartRateNamed(proof)
        ? 'hr'
        : null;
  if (role && parts) {
    const aliases =
      role === 'pre'
        ? ['pre', 'pre_selfie']
        : role === 'post'
          ? ['post', 'post_selfie']
          : ['hr', 'hr_monitor'];
    for (const key of aliases) {
      const url = String(parts[key]?.url ?? '').trim();
      if (url) {
        return url;
      }
    }
  }
  if (role === 'pre') {
    return String(legacy?.pre_selfie_url ?? '').trim() || null;
  }
  if (role === 'post') {
    return String(legacy?.post_selfie_url ?? '').trim() || null;
  }
  if (role === 'hr') {
    return String(legacy?.hr_monitor_url ?? '').trim() || null;
  }
  return null;
}

function isBeforeAfterHeartRateProofs(proofs: ChallengeProof[]): boolean {
  return (
    proofs.length === 3 &&
    proofs.some(isPreWorkoutProof) &&
    proofs.some(isPostWorkoutProof) &&
    proofs.some((proof) => proof.method === 'hr')
  );
}

/** Legacy Official fitness trio — ignore on Comparable Points / corporate unless stored proofs match. */
export function isDefaultFitnessProofRequirements(
  items?: Array<{ type?: string; required?: boolean }> | null,
): boolean {
  if (!items?.length) {
    return false;
  }
  const types = new Set(items.map((item) => String(item.type ?? '').toLowerCase()));
  return types.has('pre_selfie') && types.has('post_selfie') && (types.has('hr_monitor') || types.has('hr'));
}

/** Official week_10, official fitness, and the before/after/heart-rate trio. */
export function usesWeek10ProofSentence(challenge: {
  is_official?: boolean | null;
  series_id?: string | null;
  category?: string | null;
  proofs?: unknown;
  proof_type?: unknown;
  proof_requirements?: Array<{ type?: string; required?: boolean }> | null;
  challenge_type?: string | null;
  privacy_mode?: string | null;
  scoring_method?: string | null;
  scoring_config?: unknown;
  comparable_points_config?: unknown;
}): boolean {
  if (usesComparablePointsScoring(challenge) || isCorporateChallenge(challenge)) {
    return isBeforeAfterHeartRateProofs(parseChallengeProofs(challenge.proofs));
  }
  if (isFitnessOfficialChallenge(challenge)) {
    return true;
  }
  return isBeforeAfterHeartRateProofs(resolveChallengeProofs(challenge));
}

export function beginCameraProof(proofs: ChallengeProof[]): ChallengeProof | null {
  const pre = proofs.find(
    (proof) =>
      isPreWorkoutProof(proof) &&
      (proof.method === 'photo' || proof.method === 'video' || proof.method === 'hr'),
  );
  if (pre) {
    return pre;
  }
  return (
    proofs.find(
      (proof) => proof.method === 'photo' || proof.method === 'video' || proof.method === 'hr',
    ) ?? null
  );
}

export function isGuidedCameraProof(proof: Pick<ChallengeProof, 'method'>): boolean {
  return proof.method === 'photo' || proof.method === 'video' || proof.method === 'hr';
}

export function nextEmptyRequiredProof(
  proofs: ChallengeProof[],
  isFilled: (proof: ChallengeProof) => boolean,
): ChallengeProof | null {
  return proofs.find((proof) => !isFilled(proof)) ?? null;
}

function isHeartRateNamed(proof: Pick<ChallengeProof, 'method' | 'name'>): boolean {
  if (proof.method === 'hr') {
    return true;
  }
  const lower = String(proof.name ?? '').trim().toLowerCase();
  return /\bhr\b/.test(lower) || lower.includes('heart rate') || lower.includes('heart-rate');
}

export function guidedCheckinTitle(proof: ChallengeProof): string {
  if (isHeartRateNamed(proof)) {
    const minutes = proofHeartRateMinutes(proof);
    return `Upload Proof of ${minutes}-Min of Elevated Heart Rate`;
  }
  if (proof.method === 'photo' || proof.method === 'video') {
    if (isPreWorkoutProof(proof)) {
      return 'Take a Pre-Workout Selfie';
    }
    if (isPostWorkoutProof(proof)) {
      return 'Take a Post-Workout Selfie';
    }
  }
  return guidedImperativeFromLabel(proof);
}

function isGenericGuidedLabel(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/\.+$/, '');
  return !normalized || SHORT_PROOF_LABELS.has(normalized);
}

function guidedImperativeFromLabel(proof: ChallengeProof): string {
  const raw = String(proof.name ?? '').trim().replace(/\.+$/, '');
  const lower = raw.toLowerCase();
  if (/^(take|log|upload|share|post|write|confirm|attach)\b/.test(lower)) {
    return raw;
  }
  if (proof.method === 'honor') {
    return raw && !isGenericGuidedLabel(raw) ? raw : 'Confirm on your honor';
  }
  if (proof.method === 'checkin') {
    return raw && !isGenericGuidedLabel(raw) ? `Log ${raw}` : "Log today's note";
  }
  if (proof.method === 'distance') {
    return raw && !isGenericGuidedLabel(raw) ? `Log ${raw}` : "Log today's distance";
  }
  if (proof.method === 'location') {
    return raw && !isGenericGuidedLabel(raw) ? raw : 'Check in here';
  }
  if (proof.method === 'video') {
    return raw && !isGenericGuidedLabel(raw) ? `Take ${raw}` : "Take today's video";
  }
  if (/^pages?$/i.test(raw)) {
    return "Log today's pages";
  }
  if (/^minutes?$/i.test(raw)) {
    return "Log today's minutes";
  }
  if (raw && !isGenericGuidedLabel(raw)) {
    if (/\b(pages?|minutes?|hours?)\b/i.test(raw)) {
      return `Log ${raw}`;
    }
    return `Take ${raw}`;
  }
  return "Take today's photo";
}

export function guidedCheckinNextSlot(proof: ChallengeProof): string {
  if (isHeartRateNamed(proof)) {
    const minutes = proofHeartRateMinutes(proof);
    return `Proof of ${minutes}-Min of Elevated Heart Rate`;
  }
  if (proof.method === 'photo' || proof.method === 'video') {
    if (isPreWorkoutProof(proof)) {
      return 'a Pre-Workout Selfie';
    }
    if (isPostWorkoutProof(proof)) {
      return 'a Post-Workout Selfie';
    }
  }
  const title = guidedCheckinTitle(proof);
  const stripped = title.replace(/^(Take a |Take |Log |Upload |Share |Post |Write |Confirm |Attach )/i, '').trim();
  return stripped || title;
}

export type GuidedCheckinPrompt = {
  current: ChallengeProof;
  next: ChallengeProof | null;
  title: string;
  helper: string | null;
};

/** Camera title + helper for the next empty required slot (or a focused retake). */
export function guidedCheckinPrompt(
  proofs: ChallengeProof[],
  isFilled: (proof: ChallengeProof) => boolean,
  current?: ChallengeProof | null,
): GuidedCheckinPrompt | null {
  const focus = current ?? nextEmptyRequiredProof(proofs, isFilled);
  if (!focus) {
    return null;
  }
  const index = proofs.findIndex((proof) => proof.id === focus.id);
  const next =
    proofs.slice(index >= 0 ? index + 1 : 0).find((proof) => proof.id !== focus.id && !isFilled(proof)) ?? null;
  return {
    current: focus,
    next,
    title: guidedCheckinTitle(focus),
    helper: next ? `Then you'll add ${guidedCheckinNextSlot(next)}.` : null,
  };
}

export function proofsAreHonorOnly(proofs: ChallengeProof[]): boolean {
  return proofs.length > 0 && proofs.every((proof) => proof.method === 'honor');
}

export function checkinProofsReady(
  proofs: ChallengeProof[],
  parts: Record<string, ChallengeProofPart> | null | undefined,
  opts?: ProofSatisfyOptions,
): boolean {
  if (proofs.length === 0) {
    return true;
  }
  return proofs.every((proof) => partSatisfies(proof, parts?.[proof.id], opts));
}

/** Stored on challenges.proof_type for old rows. */
export function proofTypeFromMethod(method: ChallengeProofMethod): string {
  if (method === 'checkin') {
    return 'check_in';
  }
  return method;
}

export function methodFromProofType(value: unknown): ChallengeProofMethod {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'video') {
    return 'video';
  }
  if (raw === 'check_in' || raw === 'checkin' || raw === 'text_note' || raw === 'link') {
    return 'checkin';
  }
  if (raw === 'honor') {
    return 'honor';
  }
  if (raw === 'hr' || raw === 'hr_monitor') {
    return 'hr';
  }
  if (raw === 'distance') {
    return 'distance';
  }
  if (raw === 'location' || raw === 'place') {
    return 'location';
  }
  return 'photo';
}

export function methodFromLegacyType(type: string): ChallengeProofMethod {
  return methodFromProofType(type);
}

export function nameFromLegacyType(type: string): string {
  if (type === 'pre_selfie') {
    return PRE_WORKOUT_SELFIE_SENTENCE;
  }
  if (type === 'post_selfie') {
    return POST_WORKOUT_SELFIE_SENTENCE;
  }
  if (type === 'hr_monitor') {
    return heartRateProofSentence(30);
  }
  if (type === 'video') {
    return defaultSentenceForMethod('video');
  }
  if (type === 'text_note' || type === 'link') {
    return defaultSentenceForMethod('checkin');
  }
  if (type === 'photo') {
    return defaultSentenceForMethod('photo');
  }
  if (type === 'screenshot') {
    return 'Post a screenshot of the work.';
  }
  return defaultSentenceForMethod(methodFromLegacyType(type));
}

export function captureTypeForMethod(method: ChallengeProofMethod): ProofType {
  if (method === 'video') {
    return 'video';
  }
  if (method === 'hr') {
    return 'hr_monitor';
  }
  return 'photo';
}

export function legacyTypeForProof(proof: ChallengeProof): ProofType | null {
  if (proof.method === 'honor') {
    return null;
  }
  if (proof.method === 'video') {
    return 'video';
  }
  if (proof.method === 'checkin') {
    return 'text_note';
  }
  if (proof.method === 'hr') {
    return 'hr_monitor';
  }
  if (proof.method === 'distance') {
    return 'distance';
  }
  if (proof.method === 'location') {
    return 'location';
  }
  const named = String(proof.name ?? '').trim().toLowerCase();
  if (isCheckoutProofName(named) || proof.id === 'post') {
    return 'post_selfie';
  }
  if (isCheckinSelfieName(named) || proof.id === 'pre') {
    return 'pre_selfie';
  }
  return 'photo';
}

export function proofRequirementsFrom(proofs: ChallengeProof[]): Array<{ type: ProofType; required: true }> {
  return proofs
    .map(legacyTypeForProof)
    .filter((type): type is ProofType => Boolean(type))
    .map((type) => ({ type, required: true as const }));
}

export function stableProofIdForLegacyType(type: string): string | null {
  const key = type.trim().toLowerCase();
  if (key === 'pre_selfie' || key === 'pre') {
    return 'pre';
  }
  if (key === 'post_selfie' || key === 'post') {
    return 'post';
  }
  if (key === 'hr_monitor' || key === 'hr') {
    return 'hr';
  }
  return null;
}

export function namedProofsFromLegacyTypes(types: string[]): ChallengeProof[] {
  const list = types.filter(Boolean).map((type) => {
    const proof = makeProof(nameFromLegacyType(type), methodFromLegacyType(type));
    const stable = stableProofIdForLegacyType(type);
    return stable ? { ...proof, id: stable } : proof;
  });
  return list.length > 0 ? list : [makeProof(defaultSentenceForMethod('honor'), 'honor')];
}

export function parseChallengeProofs(value: unknown): ChallengeProof[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed: ChallengeProof[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Record<string, unknown>;
    const method = isChallengeProofMethod(row.method) ? row.method : methodFromProofType(row.method ?? row.type);
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : newProofId();
    const name = typeof row.name === 'string' ? row.name : '';
    const rawMinutes = row.minutes ?? row.min_minutes;
    const minutes =
      method === 'hr'
        ? Math.max(Math.round(Number(rawMinutes) || 30), 1)
        : undefined;
    const rawMeters = row.distance_meters ?? row.distanceMeters;
    const distance_meters =
      method === 'distance' ? proofDistanceMeters({ method, distance_meters: Number(rawMeters) }) : undefined;
    const place = method === 'location' ? parseLocationPlace(row.place ?? row) : undefined;
    parsed.push({ id, name, method, minutes, distance_meters, place });
  }
  return parsed;
}

export function proofsFromProofType(proofType: unknown): ChallengeProof[] {
  const method = methodFromProofType(proofType);
  return [makeProof(defaultSentenceForMethod(method), method)];
}

/** Persist proofs without raw coordinates on the challenge row. */
export function proofsForStorage(proofs: ChallengeProof[]): ChallengeProof[] {
  return proofs.map((proof) =>
    proof.method === 'location'
      ? { ...proof, place: publicLocationPlace(proof.place) }
      : proof,
  );
}

export function resolveChallengeProofs(input: {
  proofs?: unknown;
  proof_type?: unknown;
  proof_requirements?: Array<{ type?: string; required?: boolean }> | null;
  min_minutes?: number | string | null;
}): ChallengeProof[] {
  const minutes = Math.max(Math.round(Number(input.min_minutes) || 30), 1);
  const listed = parseChallengeProofs(input.proofs).map((proof) =>
    ensureProofSentence(proof, proofHeartRateMinutes(proof, minutes)),
  );
  if (listed.length > 0) {
    return listed;
  }
  const requirements = (input.proof_requirements ?? [])
    .filter((item) => item && item.required !== false && item.type)
    .map((item) => String(item.type));
  if (requirements.length > 0) {
    return namedProofsFromLegacyTypes(requirements);
  }
  if (input.proof_type) {
    return proofsFromProofType(input.proof_type);
  }
  return defaultChallengeProofs();
}

export type ProofSatisfyOptions = {
  /** Consistency / cumulative / repeating logs: any session distance > 0 counts. */
  sessionDistance?: boolean;
};

export function partSatisfies(
  proof: ChallengeProof,
  part: ChallengeProofPart | null | undefined,
  opts?: ProofSatisfyOptions,
): boolean {
  if (proof.method === 'honor') {
    return true;
  }
  if (proof.method === 'checkin') {
    return Boolean(part?.text?.trim());
  }
  if (proof.method === 'hr') {
    return Boolean(part?.url?.trim() || part?.healthWorkoutId?.trim() || part?.health);
  }
  if (proof.method === 'distance') {
    const meters = partDistanceMeters(part);
    if (meters == null || meters <= 0) {
      return false;
    }
    if (opts?.sessionDistance) {
      return true;
    }
    return meters >= proofDistanceMeters(proof);
  }
  if (proof.method === 'location') {
    return locationPartSatisfies(part);
  }
  return proofImageUrls(part).length > 0 || Boolean(part?.healthWorkoutId?.trim());
}

export function logHasEveryProof(
  proofs: ChallengeProof[],
  parts: Record<string, ChallengeProofPart> | null | undefined,
  opts?: ProofSatisfyOptions,
): boolean {
  if (proofs.length === 0) {
    return true;
  }
  if (!parts || Object.keys(parts).length === 0) {
    return true;
  }
  return proofs.every((proof) => partSatisfies(proof, parts[proof.id], opts));
}

export function parseProofParts(value: unknown): Record<string, ChallengeProofPart> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const parts: Record<string, ChallengeProofPart> = {};
  for (const [id, item] of Object.entries(value as Record<string, unknown>)) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Record<string, unknown>;
    const method = isChallengeProofMethod(row.method) ? row.method : methodFromProofType(row.method);
    const url = typeof row.url === 'string' ? row.url : null;
    const urls = Array.isArray(row.urls)
      ? uniqueProofUrls(row.urls.map((item) => (typeof item === 'string' ? item : null)))
      : [];
    parts[id] = {
      method,
      url,
      urls: uniqueProofUrls([url, ...urls]),
      text: typeof row.text === 'string' ? row.text : null,
      healthWorkoutId:
        typeof row.healthWorkoutId === 'string'
          ? row.healthWorkoutId
          : typeof row.health_workout_id === 'string'
            ? row.health_workout_id
            : null,
      fromLibrary: row.fromLibrary === true || row.from_library === true,
      health: parseCheckinHealthProof(row.health),
      distanceMeters:
        Number(row.distanceMeters ?? row.distance_meters) > 0
          ? Math.round(Number(row.distanceMeters ?? row.distance_meters))
          : parseCheckinHealthProof(row.health)?.distanceMeters ?? null,
      place_id: typeof row.place_id === 'string' ? row.place_id : typeof row.placeId === 'string' ? row.placeId : null,
      label: typeof row.label === 'string' ? row.label : null,
      radius_m: Number(row.radius_m ?? row.radiusM) > 0 ? Math.round(Number(row.radius_m ?? row.radiusM)) : null,
      in_fence: row.in_fence === true || row.inFence === true,
      accuracy_m: Number(row.accuracy_m ?? row.accuracyM) > 0 ? Math.round(Number(row.accuracy_m ?? row.accuracyM)) : null,
      submitted_at: typeof row.submitted_at === 'string' ? row.submitted_at : typeof row.submittedAt === 'string' ? row.submittedAt : null,
      caption: typeof row.caption === 'string' ? row.caption.replace(/\r\n/g, '\n').slice(0, 180) : null,
      contentHash:
        typeof row.contentHash === 'string'
          ? row.contentHash
          : typeof row.content_hash === 'string'
            ? row.content_hash
            : null,
    };
  }
  return parts;
}
