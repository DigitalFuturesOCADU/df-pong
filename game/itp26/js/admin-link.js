/*
 * admin-link.js — lets the admin panel change house rules and run the game.
 *
 * Two ways in, both optional:
 *   - BroadcastChannel: an admin panel open in another tab or window of the
 *     same browser works with no setup at all.
 *   - WebSocket relay (server/relay.js): an admin panel on any device — a
 *     phone, another laptop, or a Wi-Fi microcontroller — via a small server.
 *
 * The same class is used by the game (role "game") and the admin panel (role "admin").
 * Message formats are in docs/PROTOCOL.md, section 6.
 */

class AdminLink {
  constructor({ role, room, relay, key = '', id = null, onMessage, onStatus }) {
    this.role = role;
    this.room = room;
    this.relay = relay;
    this.key = key;
    this.id = id || `${role[0]}-${Math.random().toString(36).slice(2, 6)}`;
    this.onMessage = onMessage;
    this.onStatus = onStatus || (() => {});
    this.socket = null;
    this.socketState = relay ? 'connecting' : 'off';
    this.retry = 0;
    this.lastHeard = 0;
    this.seen = []; // recent message ids: the same message can arrive by channel and by relay

    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(`dfpong:${room}`);
      this.channel.onmessage = (e) => this.receive(e.data, 'local');
    }
    if (relay) this.openSocket();
  }

  openSocket() {
    let url;
    try {
      url = relayUrl(this.relay);
    } catch (e) {
      this.setSocketState('error', 'invalid relay address');
      return;
    }
    this.setSocketState('connecting');
    let socket;
    try {
      socket = new WebSocket(url);
    } catch (e) {
      // e.g. a ws:// relay from an https page: report it, never break the game
      this.setSocketState('error', e.message);
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      this.retry = 0;
      socket.send(JSON.stringify({ type: 'hello', role: this.role, room: this.room, id: this.id, key: this.key }));
      this.setSocketState('open');
    };
    socket.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      if (msg.type === 'relay:error') {
        this.setSocketState('error', msg.message);
        return;
      }
      this.receive(msg, 'relay');
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      if (this.socketState !== 'error') this.setSocketState('closed');
      const delay = Math.min(15000, 1000 * Math.pow(2, this.retry++));
      this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
    };
    socket.onerror = () => {};
  }

  setSocketState(state, detail = '') {
    this.socketState = state;
    this.socketDetail = detail;
    this.onStatus(this.status());
  }

  status() {
    return {
      relay: this.relay,
      socket: this.socketState,
      detail: this.socketDetail || '',
      local: !!this.channel,
      heardRecently: performance.now() - this.lastHeard < 6000,
    };
  }

  receive(msg, via) {
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
    if (msg.mid) {
      if (this.seen.includes(msg.mid)) return;
      this.seen.push(msg.mid);
      if (this.seen.length > 100) this.seen.shift();
    }
    // Games only listen to admins, admins only listen to games.
    const fromAdmin = msg.type.startsWith('admin:');
    if (this.role === 'game' ? !fromAdmin : fromAdmin) return;
    if (msg.target && this.role === 'game' && msg.target !== this.id) return;
    this.lastHeard = performance.now();
    this.onMessage(msg, via);
  }

  send(msg) {
    msg = { mid: Math.random().toString(36).slice(2, 10), ...msg };
    const text = JSON.stringify(msg);
    if (this.channel) this.channel.postMessage(msg);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) this.socket.send(text);
  }

  close() {
    clearTimeout(this.reconnectTimer);
    if (this.channel) this.channel.close();
    if (this.socket) {
      const s = this.socket;
      this.socket = null;
      s.close();
    }
  }
}

/** "same-origin" → this server's /relay; "host:port" → ws(s)://host:port/relay */
function relayUrl(relay) {
  if (relay === 'same-origin' || relay === 'auto') {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/relay`;
  }
  const url = new URL(/^wss?:\/\//.test(relay) ? relay : `wss://${relay}`);
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/relay';
  return url.href;
}
