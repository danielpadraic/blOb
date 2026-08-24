import {
  isCorporateChallenge,
  isFitnessOfficialChallenge,
  usesComparablePointsScoring,
} from '@/lib/challengeExperience';
import { copy } from '@/lib/copy';
import type { ProofType } from '@/lib/types';

export const CHALLENGE_PROOF_METHODS = ['photo', 'video', 'checkin', 'honor', 'hr'] as const;

export type ChallengeProofMethod = (typeof CHALLENGE_PROOF_METHODS)[number];

export type ChallengeProof = {
  id: string;
  name: string;
  method: ChallengeProofMethod;
  minutes?: number;
};

export type ChallengeProofPart = {
  method: ChallengeProofMethod;
  url?: string | null;
  /** All image URLs for this slot. `url` stays the first for older rows. */
  urls?: string[] | null;
  text?: string | null;
  healthWorkoutId?: string | null;
  fromLibrary?: boolean;
};

/** Extra photos on top of required proofs. One photo is enough to submit. */
export const CHECKIN_PHOTO_CAP = 8;

export function uniqueProofUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = typeof raw === 'string' ? raw.trim() : '';
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function proofImageUrls(part?: ChallengeProofPart | null): string[] {
  return uniqueProofUrls([part?.url, ...(part?.urls ?? [])]);
}

export function extraProofImageUrls(
  proofs: ChallengeProof[],
  parts: Record<string, ChallengeProofPart> | null | undefined,
): string[] {
  if (!parts) {
    return [];
  }
  const required = new Set<string>();
  for (const proof of proofs) {
    const primary = parts[proof.id]?.url?.trim();
    if (primary) {
      required.add(primary);
    }
  }
  const extras: string[] = [];
  for (const proof of proofs) {
    for (const url of proofImageUrls(parts[proof.id])) {
      if (required.has(url) || extras.includes(url)) {
        continue;
      }
      extras.push(url);
    }
  }
  return extras;
}

export const SIMPLE_PROOF_CAP = 4;

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

export function defaultSentenceForMethod(method: ChallengeProofMethod, minutes = 30): string {
  if (method === 'hr') {
    return heartRateProofSentence(minutes);
  }
  if (method === 'video') {
    return 'Post a video of the work.';
  }
  if (method === 'checkin') {
    return 'Write a check-in of what you completed.';
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
  'honor',
  'heart rate',
  'hr',
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
  const previousDefault = defaultSentenceForMethod(proof.method, minutes);
  if (!proof.name.trim() || isShortProofLabel(proof.name) || proof.name.trim() === previousDefault) {
    return defaultSentenceForMethod(method, minutes);
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

export function makeProof(name: string, method: ChallengeProofMethod, minutes?: number): ChallengeProof {
  const hrMinutes = method === 'hr' ? Math.max(Math.round(Number(minutes) || 30), 1) : undefined;
  return { id: newProofId(), name, method, minutes: hrMinutes };
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

export function proofsAreHonorOnly(proofs: ChallengeProof[]): boolean {
  return proofs.length > 0 && proofs.every((proof) => proof.method === 'honor');
}

export function checkinProofsReady(
  proofs: ChallengeProof[],
  parts: Record<string, ChallengeProofPart> | null | undefined,
): boolean {
  if (proofs.length === 0) {
    return true;
  }
  return proofs.every((proof) => partSatisfies(proof, parts?.[proof.id]));
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
  const named = proof.name.trim().toLowerCase();
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

export function namedProofsFromLegacyTypes(types: string[]): ChallengeProof[] {
  const list = types.filter(Boolean).map((type) => makeProof(nameFromLegacyType(type), methodFromLegacyType(type)));
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
    parsed.push({ id, name, method, minutes });
  }
  return parsed;
}

export function proofsFromProofType(proofType: unknown): ChallengeProof[] {
  const method = methodFromProofType(proofType);
  return [makeProof(defaultSentenceForMethod(method), method)];
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

export function partSatisfies(proof: ChallengeProof, part: ChallengeProofPart | null | undefined): boolean {
  if (proof.method === 'honor') {
    return true;
  }
  if (proof.method === 'checkin') {
    return Boolean(part?.text?.trim() || part?.url?.trim());
  }
  if (proof.method === 'hr') {
    return Boolean(part?.url?.trim() || part?.healthWorkoutId?.trim());
  }
  return proofImageUrls(part).length > 0;
}

export function logHasEveryProof(
  proofs: ChallengeProof[],
  parts: Record<string, ChallengeProofPart> | null | undefined,
): boolean {
  if (proofs.length === 0) {
    return true;
  }
  if (!parts || Object.keys(parts).length === 0) {
    return true;
  }
  return proofs.every((proof) => partSatisfies(proof, parts[proof.id]));
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
    };
  }
  return parts;
}
