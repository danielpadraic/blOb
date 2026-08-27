import * as ImagePicker from 'expo-image-picker';

import { copy } from '@/lib/copy';
import { supabase } from '@/lib/supabase';
import { uploadAvatarImage, uploadCoverImage } from '@/utils/upload';

const PHOTO_ERROR = copy('error.uploadPhoto');

function blobUsername(userId: string) {
  return `blob_${userId.replace(/-/g, '').slice(0, 10)}`;
}

/** Insert a profiles row if signup didn’t. Storage + avatar_url writes need it. */
export async function ensureOwnProfileRow(userId: string): Promise<void> {
  const existing = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (existing.data?.id) {
    return;
  }
  const inserted = await supabase.from('profiles').insert({
    id: userId,
    username: blobUsername(userId),
  } as never);
  if (inserted.error) {
    const text = inserted.error.message.toLowerCase();
    if (text.includes('duplicate') || text.includes('unique')) {
      return;
    }
    throw new Error(PHOTO_ERROR);
  }
}

/** System picker with square crop. Returns a local uri, or null if they cancel. */
export async function pickCropProfilePhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Turn on photo access in Settings.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
  });
  if (result.canceled || !result.assets[0]?.uri) {
    return null;
  }
  return result.assets[0].uri;
}

/** Upload cropped file → public avatars URL, then write profiles.avatar_url. */
export async function uploadProfilePhoto(userId: string, uri: string): Promise<string> {
  try {
    await ensureOwnProfileRow(userId);
    const publicUrl = await uploadAvatarImage({ uri, userId });
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);
    if (error) {
      throw error;
    }
    return publicUrl;
  } catch (error) {
    if (error instanceof Error && error.message === 'Turn on photo access in Settings.') {
      throw error;
    }
    throw new Error(PHOTO_ERROR);
  }
}

export async function pickAndUploadProfilePhoto(userId: string): Promise<string | null> {
  const uri = await pickCropProfilePhoto();
  if (!uri) {
    return null;
  }
  return uploadProfilePhoto(userId, uri);
}

/** Wide crop for the Facebook-style cover. */
export async function pickCropCoverPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Turn on photo access in Settings.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [16, 9],
    quality: 0.85,
  });
  if (result.canceled || !result.assets[0]?.uri) {
    return null;
  }
  return result.assets[0].uri;
}

export async function uploadProfileCover(userId: string, uri: string): Promise<string> {
  try {
    await ensureOwnProfileRow(userId);
    const publicUrl = await uploadCoverImage({ uri, userId });
    const { error } = await supabase.from('profiles').update({ cover_url: publicUrl }).eq('id', userId);
    if (error) {
      throw error;
    }
    return publicUrl;
  } catch (error) {
    if (error instanceof Error && error.message === 'Turn on photo access in Settings.') {
      throw error;
    }
    throw new Error(PHOTO_ERROR);
  }
}
