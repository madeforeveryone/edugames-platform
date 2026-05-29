/**
 * TypeRPG Co-op Relay Server
 * ============================
 * Host-authoritative design: this server is JUST a message relay. The host's
 * browser owns the game state and broadcasts updates; the guest's browser sends
 * inputs (typing/reward selection) back through the relay. No game logic here.
 *
 * Protocol (JSON over WebSocket text frames):
 *
 * Client → Server:
 *   { type: 'create_room' }                            // host: get a fresh room code
 *   { type: 'join_room',  roomCode: 'ABC123' }         // guest: attach to room
 *   { type: 'relay',      roomCode, payload: {...} }   // forward to the other peer
 *   { type: 'leave_room' }                             // explicit disconnect
 *
 * Server → Client:
 *   { type: 'room_created', roomCode: 'ABC123' }       // ack to host
 *   { type: 'room_joined',  roomCode, role: 'guest' }  // ack to guest
 *   { type: 'peer_joined',  roomCode }                 // host receives when guest joins
 *   { type: 'peer_left',    roomCode }                 // other side disconnected
 *   { type: 'relay',        payload: {...} }           // forwarded peer message
 *   { type: 'error',        reason: '...' }            // protocol/usage error
 *
 * Rooms are ephemeral — destroyed when both peers disconnect. Code collisions
 * are avoided by retrying generation. Codes are 6 chars from a curated alphabet
 * (no 0/O/1/I/L) so they're easy to share verbally.
 */

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3001;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  // no 0/O/1/I/L for clarity
const CODE_LEN = 6;
const ROOM_TTL_MS = 1000 * 60 * 30;   // 30 minutes — auto-cleanup dead rooms

// roomCode -> { host: ws, guest: ws|null, createdAt: ms }
const rooms = new Map();

function genCode() {
  let attempts = 0;
  while (attempts++ < 50) {
    let s = '';
    for (let i = 0; i < CODE_LEN; i++) {
      s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    if (!rooms.has(s)) return s;
  }
  throw new Error('Could not generate unique room code');
}

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch (e) { /* ignore */ }
  }
}

function destroyRoom(roomCode, reason) {
  const r = rooms.get(roomCode);
  if (!r) return;
  rooms.delete(roomCode);
  // Notify any remaining peer
  [r.host, r.guest].forEach(function (peer) {
    send(peer, { type: 'peer_left', roomCode, reason: reason || 'room_destroyed' });
  });
  console.log('[room ' + roomCode + '] destroyed (' + (reason || 'normal') + ')');
}

// Periodic cleanup: nuke rooms older than TTL with no live peers.
setInterval(function () {
  const now = Date.now();
  for (const [code, r] of rooms) {
    const hostAlive  = r.host  && r.host.readyState === r.host.OPEN;
    const guestAlive = r.guest && r.guest.readyState === r.guest.OPEN;
    if (!hostAlive && !guestAlive) destroyRoom(code, 'no_peers');
    else if (now - r.createdAt > ROOM_TTL_MS) destroyRoom(code, 'ttl_expired');
  }
}, 60 * 1000);

// Plain HTTP server so we get /health for monitoring (Railway likes this).
const httpServer = http.createServer(function (req, res) {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end('TypeRPG relay server — use WebSocket');
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', function (ws) {
  ws.roomCode = null;
  ws.role = null;       // 'host' | 'guest'
  console.log('[ws] new connection');

  ws.on('message', function (raw) {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch (e) { send(ws, { type: 'error', reason: 'bad_json' }); return; }

    switch (msg.type) {
      case 'create_room': {
        // Disallow if this socket is already in a room
        if (ws.roomCode) {
          send(ws, { type: 'error', reason: 'already_in_room' });
          return;
        }
        let code;
        try { code = genCode(); }
        catch (e) { send(ws, { type: 'error', reason: 'codegen_failed' }); return; }
        rooms.set(code, { host: ws, guest: null, createdAt: Date.now() });
        ws.roomCode = code;
        ws.role = 'host';
        send(ws, { type: 'room_created', roomCode: code });
        console.log('[room ' + code + '] created');
        return;
      }
      case 'join_room': {
        const code = (msg.roomCode || '').toUpperCase();
        const r = rooms.get(code);
        if (!r) { send(ws, { type: 'error', reason: 'room_not_found', roomCode: code }); return; }
        if (r.guest && r.guest.readyState === r.guest.OPEN) {
          send(ws, { type: 'error', reason: 'room_full', roomCode: code }); return;
        }
        r.guest = ws;
        ws.roomCode = code;
        ws.role = 'guest';
        send(ws, { type: 'room_joined', roomCode: code, role: 'guest' });
        send(r.host, { type: 'peer_joined', roomCode: code });
        console.log('[room ' + code + '] guest joined');
        return;
      }
      case 'relay': {
        if (!ws.roomCode) { send(ws, { type: 'error', reason: 'not_in_room' }); return; }
        const r = rooms.get(ws.roomCode);
        if (!r) { send(ws, { type: 'error', reason: 'room_gone' }); return; }
        const peer = (ws === r.host) ? r.guest : r.host;
        send(peer, { type: 'relay', payload: msg.payload, from: ws.role });
        return;
      }
      case 'leave_room': {
        if (ws.roomCode) destroyRoom(ws.roomCode, 'leave');
        ws.roomCode = null;
        return;
      }
      default:
        send(ws, { type: 'error', reason: 'unknown_type', got: msg.type });
    }
  });

  ws.on('close', function () {
    if (ws.roomCode) {
      const r = rooms.get(ws.roomCode);
      if (r) {
        // Tell the other peer we left, then drop the room
        const peer = (ws === r.host) ? r.guest : r.host;
        send(peer, { type: 'peer_left', roomCode: ws.roomCode, reason: 'disconnect' });
        destroyRoom(ws.roomCode, 'disconnect');
      }
    }
    console.log('[ws] connection closed');
  });

  ws.on('error', function (err) {
    console.error('[ws] error:', err.message);
  });
});

httpServer.listen(PORT, function () {
  console.log('TypeRPG relay server listening on port ' + PORT);
  console.log('  • WebSocket: ws://localhost:' + PORT);
  console.log('  • Health:    http://localhost:' + PORT + '/health');
});
