export function getRealtimeTransport(): { transport?: typeof WebSocket } {
  // React Native provides a global WebSocket. Do not import `ws` here —
  // Metro cannot resolve Node's `stream` module on native.
  return {};
}
