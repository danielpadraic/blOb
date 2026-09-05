import { File as ExpoFile, Paths } from 'expo-file-system';

/**
 * Svg.toDataURL hands back base64 PNG. The existing proof upload path compresses whatever file it
 * is given down to JPEG, so the card only has to reach disk.
 */
export async function writeWorkoutCardPng(base64: string, key: string): Promise<string> {
  const payload = String(base64 ?? '').replace(/^data:image\/\w+;base64,/, '').trim();
  if (!payload) {
    throw new Error('Could not build that workout card.');
  }
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'workout';
  const file = new ExpoFile(Paths.cache, `blob-workout-proof-${safeKey}-${Date.now()}.png`);
  try {
    file.create({ overwrite: true, intermediates: true });
  } catch {
    // create throws when it already exists on some platforms; write still overwrites below.
  }
  file.write(payload, { encoding: 'base64' });
  if (!file.exists || !(Number(file.size) > 0)) {
    throw new Error('Could not build that workout card.');
  }
  return file.uri;
}
