import { Platform } from 'react-native';

import { saveOwnCapture, type SaveCaptureResult } from '@/lib/saveCapture';

export const CHECKIN_SAVE_PERMISSION =
  'blOb saves videos and photos you record so you can keep them.';

export const CHECKIN_UPLOAD_SAVED_NATIVE =
  'Saved to your photos. You can pick it from Gallery and send again.';

export const CHECKIN_UPLOAD_SAVED_WEB = 'Kept on this device. Send again when you’re ready.';

export function checkinUploadStayCopy(): string {
  return Platform.OS === 'web' ? CHECKIN_UPLOAD_SAVED_WEB : CHECKIN_UPLOAD_SAVED_NATIVE;
}

export type SaveCapturedProofInput = {
  uri?: string | null;
  fromLibrary?: boolean;
};

export type SaveCapturedProofResult = SaveCaptureResult;

/** Write an in-app capture to Photos. Never blocks Send. Same file is not written twice. */
export async function saveCapturedProofLocally(
  input: SaveCapturedProofInput,
): Promise<SaveCapturedProofResult> {
  return saveOwnCapture(input);
}
