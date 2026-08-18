import ws from 'ws';

export function getRealtimeTransport(): { transport?: typeof WebSocket } {
  if (typeof WebSocket === 'undefined') {
    return { transport: ws as unknown as typeof WebSocket };
  }

  return { transport: WebSocket };
}
