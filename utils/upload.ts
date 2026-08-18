import { File as ExpoFile } from 'expo-file-system';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { STORAGE_BUCKETS } from '@/lib/constants';
import type { ProofType } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

export type StorageBucket = 'avatars' | 'challenge-proofs' | 'post-media';

const IMAGE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

export function guessContentType(uri: string): string {
  const lowered = uri.toLowerCase().split('?')[0] ?? uri.toLowerCase();
  if (lowered.endsWith('.png')) return 'image/png';
  if (lowered.endsWith('.webp')) return 'image/webp';
  if (lowered.endsWith('.gif')) return 'image/gif';
  if (lowered.endsWith('.heic') || lowered.endsWith('.heif')) return 'image/heic';
  if (lowered.endsWith('.mp4') || lowered.endsWith('.m4v')) return 'video/mp4';
  if (lowered.endsWith('.mov')) return 'video/quicktime';
  if (lowered.endsWith('.webm')) return 'video/webm';
  if (lowered.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}

export function normalizeContentType(mimeType?: string | null, uri?: string): string {
  const raw = (mimeType ?? '').toLowerCase().trim();
  if (raw === 'image/jpg' || raw === 'image/pjpeg') return 'image/jpeg';
  if (raw === 'image/heif') return 'image/heic';
  if (raw.startsWith('image/') || raw.startsWith('video/') || raw.startsWith('application/')) {
    return raw;
  }
  return guessContentType(uri ?? '');
}

/** Storage buckets only allow a short image list. Map picker aliases onto that list. */
export function coerceImageContentType(mimeType?: string | null, uri?: string): string {
  const normalized = normalizeContentType(mimeType, uri);
  if (IMAGE_CONTENT_TYPES.has(normalized)) {
    return normalized;
  }
  if (normalized.startsWith('image/')) {
    return 'image/jpeg';
  }
  return normalized;
}

function extensionFor(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/gif') return 'gif';
  if (contentType === 'image/heic') return 'heic';
  if (contentType === 'video/quicktime') return 'mov';
  if (contentType === 'video/webm') return 'webm';
  if (contentType.startsWith('video/')) return 'mp4';
  if (contentType === 'application/pdf') return 'pdf';
  if (!contentType.startsWith('image/')) return 'bin';
  return 'jpg';
}

export async function uriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (uri.startsWith('file:') || uri.startsWith('/')) {
    try {
      const file = new ExpoFile(uri);
      if (file.exists) {
        return await file.arrayBuffer();
      }
    } catch {
      // Fall through to fetch for blob:/http: and odd cache URIs.
    }
  }
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('We couldn’t read that photo. Try choosing it again.');
  }
  return response.arrayBuffer();
}

async function toTypedBlob(input: {
  uri: string;
  contentType: string;
  blob?: Blob | null;
}): Promise<Blob> {
  if (input.blob && input.blob.size > 0) {
    if (input.blob.type === input.contentType) {
      return input.blob;
    }
    return new Blob([input.blob], { type: input.contentType });
  }

  try {
    const response = await fetch(input.uri);
    if (response.ok) {
      const fetched = await response.blob();
      if (fetched.size > 0) {
        return fetched.type === input.contentType
          ? fetched
          : new Blob([fetched], { type: input.contentType });
      }
    }
  } catch {
    // Native file:// URIs sometimes fail fetch; read bytes next.
  }

  const buffer = await uriToArrayBuffer(input.uri);
  return new Blob([buffer], { type: input.contentType });
}

function asNamedFile(blob: Blob, fileName: string, contentType: string): Blob {
  try {
    if (typeof File === 'function' && File !== ExpoFile) {
      return new File([blob], fileName, { type: contentType, lastModified: Date.now() });
    }
  } catch {
    // Native runtimes may not construct a browser File.
  }
  return blob.type === contentType ? blob : new Blob([blob], { type: contentType });
}

export function buildStoragePath(input: {
  userId: string;
  bucket: StorageBucket;
  challengeId?: string;
  proofType?: ProofType;
  fileName?: string;
}): string {
  const ext = input.fileName
    ? (input.fileName.split('.').pop() ?? 'jpg')
    : 'jpg';
  const stamp = Date.now();

  if (input.bucket === 'avatars') {
    return `${input.userId}/avatar.${ext}`;
  }

  if (input.bucket === 'challenge-proofs') {
    if (!input.challengeId || !input.proofType) {
      throw new Error('Proof uploads require a challenge and proof type.');
    }
    return `${input.userId}/${input.challengeId}/${input.proofType}-${stamp}.${ext}`;
  }

  return `${input.userId}/${stamp}.${ext}`;
}

function humanStorageError(error: unknown, kind: 'photo' | 'proof' | 'avatar'): string {
  const raw = getErrorMessage(error);
  const message = raw.toLowerCase();
  const noun = kind === 'proof' ? 'proof' : 'photo';

  if (message.includes('mime') || message.includes('not supported') || message.includes('content type') || message.includes('octet-stream')) {
    return kind === 'proof'
      ? 'That proof type isn’t supported. Try a JPEG, PNG, or short MP4.'
      : `That ${noun} type isn’t supported. Try a JPEG or PNG.`;
  }
  if (message.includes('maximum size') || message.includes('payload too large') || message.includes('file size')) {
    return `That ${noun} is too large. Try a smaller one.`;
  }
  if (message.includes('row-level') || message.includes('policy') || message.includes('unauthorized') || message.includes('42501')) {
    return 'You can only upload into your own folder. Try signing in again.';
  }
  if (
    message.includes('400') ||
    message.includes('invalid') ||
    message.includes('bad request') ||
    message.includes('malformed') ||
    message.includes('bucket not found')
  ) {
    return `We couldn’t upload that ${noun}. Try another JPEG or PNG.`;
  }
  if (message.includes('bucket') || message.includes('storage') || message.includes('network')) {
    return `We couldn’t save that ${noun}. Check your connection and try again.`;
  }
  return raw;
}

async function uploadObject(input: {
  bucket: StorageBucket;
  path: string;
  uri: string;
  contentType: string;
  blob?: Blob | null;
  upsert?: boolean;
}): Promise<string> {
  const body = await toTypedBlob({
    uri: input.uri,
    contentType: input.contentType,
    blob: input.blob,
  });
  if (body.size < 32) {
    throw new Error('That photo didn’t load. Try choosing it again.');
  }

  const kind =
    input.bucket === 'avatars' ? 'avatar' : input.bucket === 'challenge-proofs' ? 'proof' : 'photo';
  // post-media has INSERT but historically no UPDATE policy; upsert:true is a 400.
  const upsert = input.upsert ?? false;
  const fileName = input.path.split('/').pop() ?? `upload.${extensionFor(input.contentType)}`;
  const typed = asNamedFile(body, fileName, input.contentType);

  const send = (payload: Blob | ArrayBuffer, path = input.path, contentType = input.contentType) =>
    supabase.storage.from(input.bucket).upload(path, payload, {
      contentType,
      cacheControl: '3600',
      upsert,
    });

  const primary = Platform.OS === 'web' ? typed : await typed.arrayBuffer();
  const first = await send(primary);
  if (!first.error) {
    return input.path;
  }

  console.log(
    '[blob:upload]',
    input.bucket,
    input.path,
    input.contentType,
    typed.type,
    typed.size,
    first.error.message,
  );

  const secondary = Platform.OS === 'web' ? await typed.arrayBuffer() : typed;
  const alt = await send(secondary);
  if (!alt.error) {
    return input.path;
  }

  const canRetryJpeg = input.contentType.startsWith('image/') && input.contentType !== 'image/jpeg';
  if (!canRetryJpeg) {
    throw new Error(humanStorageError(first.error, kind));
  }

  const jpegPath = input.path.replace(/\.[^.]+$/, '.jpg');
  const jpegBody = asNamedFile(typed, jpegPath.split('/').pop() ?? 'photo.jpg', 'image/jpeg');
  const jpegPayload = Platform.OS === 'web' ? jpegBody : await jpegBody.arrayBuffer();
  const retry = await send(jpegPayload, jpegPath, 'image/jpeg');
  if (retry.error) {
    throw new Error(humanStorageError(first.error, kind));
  }
  return jpegPath;
}

export async function uploadChallengeProof(input: {
  uri: string;
  userId: string;
  challengeId: string;
  proofType: ProofType;
  mimeType?: string | null;
  blob?: Blob | null;
}): Promise<string> {
  const contentType = coerceImageContentType(input.mimeType, input.uri);
  if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
    throw new Error('Attach a photo or video. That file type isn’t supported yet.');
  }
  const ext = extensionFor(contentType);
  const path = buildStoragePath({
    userId: input.userId,
    bucket: STORAGE_BUCKETS.challengeProofs,
    challengeId: input.challengeId,
    proofType: input.proofType,
    fileName: `${input.proofType}.${ext}`,
  });
  return uploadObject({
    bucket: STORAGE_BUCKETS.challengeProofs,
    path,
    uri: input.uri,
    contentType,
    blob: input.blob,
    upsert: false,
  });
}

export async function uploadChallengeCover(input: {
  uri: string;
  userId: string;
  mimeType?: string | null;
}): Promise<string> {
  return uploadPostMedia({
    uri: input.uri,
    userId: input.userId,
    fileStem: `challenge-cover-${Date.now()}`,
    mimeType: input.mimeType,
  });
}

export async function uploadPostMedia(input: {
  uri: string;
  userId: string;
  fileStem: string;
  mimeType?: string | null;
  blob?: Blob | null;
}): Promise<string> {
  const contentType = coerceImageContentType(input.mimeType ?? input.blob?.type, input.uri);
  if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
    throw new Error('Attach a photo or video. That file type isn’t supported yet.');
  }
  const ext = extensionFor(contentType);
  const path = await uploadObject({
    bucket: STORAGE_BUCKETS.postMedia,
    path: `${input.userId}/${input.fileStem}.${ext}`,
    uri: input.uri,
    contentType,
    blob: input.blob,
    upsert: false,
  });
  const { data } = supabase.storage.from(STORAGE_BUCKETS.postMedia).getPublicUrl(path);
  if (!data.publicUrl) {
    throw new Error('The photo uploaded, but we couldn’t build a link to it.');
  }
  return data.publicUrl;
}

export async function uploadAvatarImage(input: {
  uri: string;
  userId: string;
  blob?: Blob | null;
}): Promise<string> {
  const contentType = coerceImageContentType(input.blob?.type, input.uri);
  const ext = extensionFor(contentType);
  const path = await uploadObject({
    bucket: STORAGE_BUCKETS.avatars,
    path: buildStoragePath({
      userId: input.userId,
      bucket: STORAGE_BUCKETS.avatars,
      fileName: `avatar.${ext}`,
    }),
    uri: input.uri,
    contentType,
    blob: input.blob,
    upsert: true,
  });
  const { data } = supabase.storage.from(STORAGE_BUCKETS.avatars).getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function signedProofUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) {
    return null;
  }
  if (path.startsWith('http') || path.startsWith('file:') || path.startsWith('content:')) {
    return path;
  }
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKETS.challengeProofs)
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) {
    return null;
  }
  return data.signedUrl;
}

/** Public URL when the bucket allows it, otherwise a long-lived signed URL. */
export async function challengeProofUrl(path: string): Promise<string> {
  if (path.startsWith('http') || path.startsWith('file:') || path.startsWith('content:')) {
    return path;
  }
  const { data: published } = supabase.storage
    .from(STORAGE_BUCKETS.challengeProofs)
    .getPublicUrl(path);
  const { data: signed } = await supabase.storage
    .from(STORAGE_BUCKETS.challengeProofs)
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  const url = signed?.signedUrl || published?.publicUrl;
  if (!url) {
    throw new Error('The proof uploaded, but we couldn’t build a link to it.');
  }
  return url;
}
