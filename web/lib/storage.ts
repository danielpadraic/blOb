import { supabase } from '~/lib/supabase';

export async function uploadWebProof(input: {
  uri: string;
  userId: string;
  challengeId: string;
  proofType: string;
  mimeType?: string | null;
  blob?: Blob | null;
}): Promise<string> {
  const blob = input.blob ?? (await fetch(input.uri).then((res) => res.blob()));
  if (!blob) {
    throw new Error('Add that proof to continue.');
  }
  const type = input.mimeType || blob.type || 'image/jpeg';
  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
  const path = `${input.userId}/${input.challengeId}/${input.proofType}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('challenge-proofs').upload(path, blob, {
    contentType: type,
    upsert: false,
  });
  if (error) {
    throw new Error(error.message || 'Couldn’t save that proof. Try again.');
  }
  return path;
}

export async function resolveProofUrl(path: string): Promise<string> {
  if (path.startsWith('http') || path.startsWith('blob:')) {
    return path;
  }
  const { data: published } = supabase.storage.from('challenge-proofs').getPublicUrl(path);
  if (published?.publicUrl) {
    return published.publicUrl;
  }
  const { data } = await supabase.storage.from('challenge-proofs').createSignedUrl(path, 60 * 60);
  return data?.signedUrl || path;
}
