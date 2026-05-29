/**
 * TypeRPG Network Client (Phase F-1)
 * ====================================
 * Thin wrapper over WebSocket that handles room create/join + message relay.
 * Game logic stays in app.js — this module ONLY moves bytes.
 *
 * Usage:
 *   NET.connect();                       // open WebSocket (idempotent)
 *   NET.createRoom();                    // host: triggers 'room_created' event
 *   NET.joinRoom('ABC123');              // guest: triggers 'room_joined' event
 *   NET.send({ type: 'game_state', ... }); // forward to peer
 *   NET.on('peer_message', handler);     // receive from peer
 *   NET.disconnect();
 *
 * Events emitted (via NET.on(name, fn)):
 *   'open'           — socket connected
 *   'close'          — socket closed
 *   'room_created'   — { roomCode }
 *   'room_joined'    — { roomCode, role }
 *   'peer_joined'    — guest connected to host
 *   'peer_left'      — { reason }
 *   'peer_message'   — { payload, from }   ← gameplay data
 *   'error'          — { reason }
 */

const NET = (function () {
  // Server URL — auto-detect by environment.
  //   • Page on localhost / 127.0.0.1 / file://  → ws://localhost:3001 (dev)
  //   • Anywhere else (deployed site)            → Railway production
  //   • Override via window.TYPERPG_SERVER_URL before this file loads.
  const PROD_SERVER_URL = 'wss://typerpg-production.up.railway.app';
  function defaultServerUrl() {
    if (typeof window !== 'undefined' && window.TYPERPG_SERVER_URL) {
      return window.TYPERPG_SERVER_URL;
    }
    if (typeof window !== 'undefined' && window.location) {
      const host = window.location.hostname;
      const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '' || host === '0.0.0.0';
      if (isLocal) return 'ws://localhost:3001';
    }
    return PROD_SERVER_URL;
  }
  let serverUrl = defaultServerUrl();

  let ws = null;
  let roomCode = null;
  let role = null;           // 'host' | 'guest' | null
  let peerConnected = false; // becomes true when 'peer_joined' (host) or 'room_joined' (guest)
  const listeners = {};      // event -> array of fns

  function emit(event, data) {
    (listeners[event] || []).forEach(function (fn) {
      try { fn(data); } catch (e) { console.error('NET listener error:', e); }
    });
  }

  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
  }
  function off(event, fn) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(function (f) { return f !== fn; });
  }

  function setServerUrl(url) {
    serverUrl = url;
  }
  function getServerUrl() { return serverUrl; }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;  // already connected/connecting
    }
    try {
      ws = new WebSocket(serverUrl);
    } catch (e) {
      emit('error', { reason: 'ws_construct_failed', error: e.message });
      return;
    }

    ws.addEventListener('open', function () { emit('open'); });

    ws.addEventListener('close', function () {
      emit('close');
      ws = null;
      roomCode = null;
      role = null;
      peerConnected = false;
    });

    ws.addEventListener('error', function () {
      emit('error', { reason: 'ws_error' });
    });

    ws.addEventListener('message', function (ev) {
      let msg;
      try { msg = JSON.parse(ev.data); }
      catch (e) { emit('error', { reason: 'bad_json' }); return; }

      switch (msg.type) {
        case 'room_created':
          roomCode = msg.roomCode;
          role = 'host';
          emit('room_created', { roomCode: msg.roomCode });
          break;
        case 'room_joined':
          roomCode = msg.roomCode;
          role = 'guest';
          peerConnected = true;  // guest knows host is already there
          emit('room_joined', { roomCode: msg.roomCode, role: msg.role });
          break;
        case 'peer_joined':
          peerConnected = true;
          emit('peer_joined', { roomCode: msg.roomCode });
          break;
        case 'peer_left':
          peerConnected = false;
          emit('peer_left', { reason: msg.reason });
          break;
        case 'relay':
          emit('peer_message', { payload: msg.payload, from: msg.from });
          break;
        case 'error':
          emit('error', { reason: msg.reason, detail: msg });
          break;
      }
    });
  }

  function rawSend(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      emit('error', { reason: 'not_connected' });
      return false;
    }
    try { ws.send(JSON.stringify(obj)); return true; }
    catch (e) { emit('error', { reason: 'send_failed' }); return false; }
  }

  // Public API ─────────────────────────────────────────────
  function createRoom() {
    return rawSend({ type: 'create_room' });
  }
  function joinRoom(code) {
    return rawSend({ type: 'join_room', roomCode: code.toUpperCase() });
  }
  // Forward arbitrary game payload to the other peer.
  function send(payload) {
    if (!roomCode) { emit('error', { reason: 'no_room' }); return false; }
    return rawSend({ type: 'relay', roomCode: roomCode, payload: payload });
  }
  function leaveRoom() {
    if (roomCode) rawSend({ type: 'leave_room' });
    roomCode = null;
    role = null;
    peerConnected = false;
  }
  function disconnect() {
    leaveRoom();
    if (ws) try { ws.close(); } catch (e) {}
    ws = null;
  }

  function getState() {
    return {
      connected: !!ws && ws.readyState === WebSocket.OPEN,
      roomCode: roomCode,
      role: role,
      peerConnected: peerConnected,
    };
  }

  return {
    setServerUrl: setServerUrl,
    getServerUrl: getServerUrl,
    connect: connect,
    disconnect: disconnect,
    createRoom: createRoom,
    joinRoom: joinRoom,
    leaveRoom: leaveRoom,
    send: send,
    on: on,
    off: off,
    getState: getState,
  };
})();

// Expose globally for app.js
if (typeof window !== 'undefined') window.NET = NET;
