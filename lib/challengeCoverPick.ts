export const COVER_STICK_FAIL = 'That photo didn’t stick. Pick it again.';

/** Web gallery/camera <input type="file"> — empty File is a failed pick, not a cancel. */
export function webCoverFile(
  file: Blob | File | null | undefined,
): { ok: true; file: Blob | File } | { ok: false; message: string } {
  if (!file || file.size <= 0) {
    return { ok: false, message: COVER_STICK_FAIL };
  }
  return { ok: true, file };
}
