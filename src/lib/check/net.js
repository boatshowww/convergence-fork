/**
 * Broadcast helper for the check lifecycle.
 *
 * Wires a check controller to the per-game broadcast channel set up by the
 * DataStore (`game-broadcast:${gameId}`). The DataStore funnels every broadcast
 * message into a single `game-event` emitter event whose `event.args` is the raw
 * Supabase broadcast message `{ type, event, payload }`.
 *
 * Usage:
 *   const net = makeCheckNet(store, (event, data) => { ... apply remote event ... });
 *   net.send('check:attempt', { attemptId, skill, total });
 *   ...
 *   net.dispose();
 *
 * Notes:
 *  - Only `check:*` events are delivered to `onEvent`.
 *  - Each client gets a random `clientId`; outgoing payloads carry `senderId`, and
 *    incoming messages from self are ignored (Supabase broadcast already defaults
 *    to not echoing to the sender — this is belt-and-suspenders).
 */
export function makeCheckNet(store, onEvent) {
  const clientId = Math.random().toString(36).slice(2, 10);

  const handler = (evt) => {
    const msg = evt?.args; // raw supabase broadcast message: { type, event, payload }
    const event = msg?.event;
    if (typeof event !== 'string' || !(event.startsWith('check:') || event.startsWith('radar:'))) return;
    const data = msg.payload ?? {};
    if (data.senderId === clientId) return; // ignore our own broadcasts
    onEvent(event, data);
  };

  store.on('game-event', handler);

  function send(event, data = {}) {
    const channel = store.realtimeChannels?.broadcast;
    if (!channel) return false;
    channel.send({ type: 'broadcast', event, payload: { ...data, senderId: clientId } });
    return true;
  }

  function dispose() {
    store.off('game-event', handler);
  }

  return { clientId, send, dispose };
}
