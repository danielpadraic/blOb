export function getRealtimeTransport(): { transport?: typeof WebSocket } {
  if (typeof WebSocket !== 'undefined') {
    return {};
  }

  // Expo web SSR can run in Node without a global WebSocket.
  // Isolated from native via the `.web.ts` platform file so Metro never
  // pulls `ws` into the iOS/Android bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ws = require('ws') as typeof WebSocket;
  return { transport: ws };
}
