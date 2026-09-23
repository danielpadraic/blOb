import { File as ExpoFile, Paths } from 'expo-file-system';

export async function writeCounterCardPng(base64: string, key: string): Promise<string> {
  const payload = String(base64 ?? '').replace(/^data:image\/\w+;base64,/, '').trim();
  if (!payload) {
    throw new Error('Could not build that card.');
  }
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'counter';
  const file = new ExpoFile(Paths.cache, `blob-counter-card-${safeKey}-${Date.now()}.png`);
  try {
    file.create({ overwrite: true, intermediates: true });
  } catch {
    // overwrite below
  }
  file.write(payload, { encoding: 'base64' });
  if (!file.exists || !(Number(file.size) > 0)) {
    throw new Error('Could not build that card.');
  }
  return file.uri;
}
