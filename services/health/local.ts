import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { HealthSource } from '@/services/health/types';

const APPLE_STATUS_KEY = 'blob.health.apple.status';
const CONNECT_STATUS_KEY = 'blob.health.connect.status';
const DISMISSED_KEY = 'blob.health.dismissed';
const BEGIN_NOTIFIED_KEY = 'blob.health.beginNotified';

function statusKey(source: HealthSource = 'apple_health'): string {
  return source === 'health_connect' ? CONNECT_STATUS_KEY : APPLE_STATUS_KEY;
}

const memory = new Map<string, string>();

async function read(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') {
        return memory.get(key) ?? null;
      }
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

async function write(key: string, value: string): Promise<void> {
  memory.set(key, value);
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Keep the in-memory flag so this session still behaves.
  }
}

async function remove(key: string): Promise<void> {
  memory.delete(key);
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Local forget is best-effort.
  }
}

export async function readLocalHealthStatus(
  source: HealthSource = 'apple_health',
): Promise<'connected' | 'denied' | null> {
  const value = await read(statusKey(source));
  return value === 'connected' || value === 'denied' ? value : null;
}

export async function writeLocalHealthStatus(
  status: 'connected' | 'denied',
  source: HealthSource = 'apple_health',
): Promise<void> {
  await write(statusKey(source), status);
}

export async function clearLocalHealthStatus(source: HealthSource = 'apple_health'): Promise<void> {
  await remove(statusKey(source));
}

export async function readDismissedWorkoutIds(): Promise<string[]> {
  const raw = await read(DISMISSED_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function rememberDismissedWorkoutId(providerWorkoutId: string): Promise<void> {
  const current = await readDismissedWorkoutIds();
  if (current.includes(providerWorkoutId)) {
    return;
  }
  const next = [...current, providerWorkoutId].slice(-80);
  await write(DISMISSED_KEY, JSON.stringify(next));
}

export async function readBeginNotifiedWorkoutIds(): Promise<string[]> {
  const raw = await read(BEGIN_NOTIFIED_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function rememberBeginNotifiedWorkoutId(providerWorkoutId: string): Promise<void> {
  const current = await readBeginNotifiedWorkoutIds();
  if (current.includes(providerWorkoutId)) {
    return;
  }
  const next = [...current, providerWorkoutId].slice(-80);
  await write(BEGIN_NOTIFIED_KEY, JSON.stringify(next));
}
