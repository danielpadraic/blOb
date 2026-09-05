/**
 * Ids for rows the client creates before the server sees them.
 *
 * No `expo-crypto` import so this stays usable from plain unit tests and from the web bundle.
 * Prefers the platform generator and falls back only when neither is present.
 */

type MaybeCrypto = {
  randomUUID?: () => string;
  getRandomValues?: <T extends Uint8Array>(array: T) => T;
};

function platformCrypto(): MaybeCrypto | null {
  const candidate = (globalThis as { crypto?: MaybeCrypto }).crypto;
  return candidate ?? null;
}

function fromBytes(bytes: Uint8Array): string {
  // RFC 4122 version 4, variant 10xx.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex: string[] = [];
  for (let index = 0; index < 16; index += 1) {
    hex.push(bytes[index].toString(16).padStart(2, '0'));
  }
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

export function newId(): string {
  const crypto = platformCrypto();
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto?.getRandomValues === 'function') {
    return fromBytes(crypto.getRandomValues(new Uint8Array(16)));
  }
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return fromBytes(bytes);
}

let localCounter = 0;

/** Key for a row that only ever lives in React state (set rows, exercise rows in a draft). */
export function newLocalKey(prefix: string): string {
  localCounter += 1;
  return `${prefix}_${localCounter}_${Math.random().toString(36).slice(2, 8)}`;
}
