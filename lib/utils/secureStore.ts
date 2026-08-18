import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { SupportedStorage } from '@supabase/supabase-js';

const CHUNK_SIZE = 1800;

async function getChunkCount(key: string): Promise<number | null> {
  const raw = await SecureStore.getItemAsync(`${key}_chunks`);
  if (!raw) {
    return null;
  }
  const count = Number(raw);
  return Number.isFinite(count) && count > 0 ? count : null;
}

/**
 * SecureStore rejects values over ~2KB on some platforms.
 * Supabase sessions (JWTs + refresh tokens) regularly exceed that, so we chunk.
 */
const chunkedSecureStore: SupportedStorage = {
  async getItem(key: string) {
    const chunkCount = await getChunkCount(key);
    if (chunkCount == null) {
      return SecureStore.getItemAsync(key);
    }

    const chunks: string[] = [];
    for (let index = 0; index < chunkCount; index += 1) {
      const chunk = await SecureStore.getItemAsync(`${key}_${index}`);
      if (chunk == null) {
        return null;
      }
      chunks.push(chunk);
    }
    return chunks.join('');
  },

  async setItem(key: string, value: string) {
    await chunkedSecureStore.removeItem(key);

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const chunks: string[] = [];
    for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
      chunks.push(value.slice(offset, offset + CHUNK_SIZE));
    }

    await SecureStore.setItemAsync(`${key}_chunks`, String(chunks.length));
    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(`${key}_${index}`, chunk),
      ),
    );
  },

  async removeItem(key: string) {
    const chunkCount = await getChunkCount(key);
    const deletions = [SecureStore.deleteItemAsync(key)];

    if (chunkCount != null) {
      deletions.push(SecureStore.deleteItemAsync(`${key}_chunks`));
      for (let index = 0; index < chunkCount; index += 1) {
        deletions.push(SecureStore.deleteItemAsync(`${key}_${index}`));
      }
    }

    await Promise.all(deletions);
  },
};

const webStorage: SupportedStorage = {
  getItem: (key) =>
    Promise.resolve(
      typeof localStorage === 'undefined' ? null : localStorage.getItem(key),
    ),
  setItem: (key, value) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    return Promise.resolve();
  },
  removeItem: (key) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    return Promise.resolve();
  },
};

export const authStorage: SupportedStorage =
  Platform.OS === 'web' ? webStorage : chunkedSecureStore;
