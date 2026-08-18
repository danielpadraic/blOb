import type { WebSocket as NodeWebSocket } from 'ws';

export function getRealtimeTransport(): { transport?: typeof WebSocket } {
  if (typeof WebSocket !== 'undefined') {
    return {};
  }

  // Expo web SSR runs in Node. Node 20 has no native WebSocket.
  // Native never hits this branch because RN provides WebSocket.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ws = require('ws') as typeof NodeWebSocket;
  return { transport: ws as unknown as typeof WebSocket };
}
