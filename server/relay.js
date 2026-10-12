#!/usr/bin/env node
/*
 * DF Pong relay — connects admin panels to games over WebSocket.
 *
 *   node server/relay.js            serves the repo at http://localhost:5501 and a relay at /relay
 *   PORT=8080 node server/relay.js
 *   ADMIN_KEY=secret node server/relay.js   admins must enter this key
 *   STATIC=0 node server/relay.js   relay only (for cloud hosting)
 *
 * No dependencies: only Node's built-in modules (Node 18+).
 * Message format: docs/PROTOCOL.md, section 6.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 5501;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const SERVE_STATIC = process.env.STATIC !== '0';
const ROOT = path.resolve(__dirname, '..');
const MAX_MESSAGE = 16 * 1024;
const MAX_PER_SECOND = 30;

// ---------------------------------------------------------------------------
// Static files (so one command runs the whole thing in a classroom)
// ---------------------------------------------------------------------------

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  if (!SERVE_STATIC) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('DF Pong relay. Connect a WebSocket to /relay.\n');
    return;
  }
  const fail = (code) => {
    if (!res.headersSent) res.writeHead(code, { 'content-type': 'text/plain' });
    res.end();
  };
  let rawPath;
  let pathname;
  try {
    rawPath = new URL(req.url, 'http://x').pathname;
    pathname = decodeURIComponent(rawPath);
  } catch (e) {
    return fail(400);
  }
  // No null bytes, and nothing hidden (.git, .claude, .env…)
  if (pathname.includes('\0') || pathname.split('/').some((part) => part.startsWith('.'))) return fail(404);
  let file = path.join(ROOT, pathname);
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) return fail(403);

  fs.stat(file, (err, stat) => {
    try {
      if (!err && stat.isDirectory()) {
        if (!rawPath.endsWith('/')) {
          res.writeHead(301, { location: rawPath + '/' }); // the raw (still-encoded) path is header-safe
          res.end();
          return;
        }
        file = path.join(file, 'index.html');
      }
      fs.readFile(file, (readErr, data) => {
        if (readErr) {
          if (!res.headersSent) res.writeHead(404, { 'content-type': 'text/plain' });
          res.end('Not found\n');
          return;
        }
        res.writeHead(200, {
          'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'cache-control': 'no-cache',
          'access-control-allow-origin': '*',
        });
        res.end(data);
      });
    } catch (e) {
      log('static error:', e.message);
      fail(500);
    }
  });
}

// ---------------------------------------------------------------------------
// A minimal WebSocket server (RFC 6455): text frames, ping/pong, close.
// ---------------------------------------------------------------------------

class Client {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.role = null;
    this.room = null;
    this.id = null;
    this.alive = true;
    this.window = { start: Date.now(), count: 0 };
    this.onText = () => {};
    this.onClose = () => {};
    socket.on('data', (chunk) => this.read(chunk));
    socket.on('close', () => this.onClose());
    socket.on('error', () => socket.destroy());
  }

  read(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0];
      const b1 = this.buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let length = b1 & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const big = this.buffer.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) return this.close(1009);
        length = Number(big);
        offset = 10;
      }
      if (length > MAX_MESSAGE) return this.close(1009);
      if (!masked) return this.close(1002); // clients must mask
      if (this.buffer.length < offset + 4 + length) return;
      const mask = this.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      this.buffer = this.buffer.subarray(offset + 4 + length);

      if (!fin) return this.close(1003); // fragmented messages aren't needed here
      if (opcode === 0x1) this.onText(payload.toString('utf8'));
      else if (opcode === 0x8) return this.close(1000);
      else if (opcode === 0x9) this.frame(0xa, payload);
      else if (opcode === 0xa) this.alive = true;
    }
  }

  frame(opcode, payload) {
    if (this.socket.destroyed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    this.socket.write(Buffer.concat([header, payload]));
  }

  send(obj) {
    this.frame(0x1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)));
  }

  close(code = 1000) {
    if (this.socket.destroyed) return;
    const body = Buffer.alloc(2);
    body.writeUInt16BE(code);
    this.frame(0x8, body);
    this.socket.end();
  }

  overLimit() {
    const now = Date.now();
    if (now - this.window.start > 1000) this.window = { start: now, count: 0 };
    return ++this.window.count > MAX_PER_SECOND;
  }
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

const rooms = new Map(); // room name → Set<Client>

function join(client, hello) {
  if (typeof hello.room !== 'string' || (hello.id !== undefined && typeof hello.id !== 'string')) {
    return client.send({ type: 'relay:error', message: 'room and id must be text' });
  }
  const room = hello.room.slice(0, 64);
  const role = hello.role === 'admin' ? 'admin' : hello.role === 'game' ? 'game' : null;
  if (!room || !role) return client.send({ type: 'relay:error', message: 'hello needs a room and a role' });
  if (role === 'admin' && ADMIN_KEY && String(hello.key) !== ADMIN_KEY) {
    client.send({ type: 'relay:error', message: 'wrong admin key' });
    return client.close(4001);
  }
  client.role = role;
  client.room = room;
  client.id = (hello.id || '').slice(0, 32) || crypto.randomUUID().slice(0, 8);
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(client);
  client.send({ type: 'relay:welcome', role, room });
  log(`${role} ${client.id} joined ${room} (${rooms.get(room).size} in room)`);
}

function leave(client) {
  const members = rooms.get(client.room);
  if (!members) return;
  members.delete(client);
  if (!members.size) rooms.delete(client.room);
  log(`${client.role} ${client.id} left ${client.room}`);
}

function route(client, text) {
  if (client.overLimit()) return;
  let msg;
  try {
    msg = JSON.parse(text);
  } catch (e) {
    return;
  }
  if (!msg || typeof msg.type !== 'string') return;

  if (!client.role) {
    if (msg.type === 'hello') join(client, msg);
    return;
  }
  // Admins may only send admin:* to games; games may only send game:* to admins.
  const allowed = client.role === 'admin' ? msg.type.startsWith('admin:') : msg.type.startsWith('game:');
  if (!allowed) return;
  const to = client.role === 'admin' ? 'game' : 'admin';
  for (const other of rooms.get(client.room) || []) {
    if (other !== client && other.role === to) other.send(text);
  }
}

// ---------------------------------------------------------------------------
// HTTP server + upgrade
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  try {
    serveStatic(req, res);
  } catch (e) {
    log('request error:', e.message);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

server.on('upgrade', (req, socket) => {
  try {
    upgrade(req, socket);
  } catch (e) {
    log('upgrade error:', e.message);
    socket.destroy();
  }
});

function upgrade(req, socket) {
  const { pathname } = new URL(req.url, 'http://x');
  const key = req.headers['sec-websocket-key'];
  if (pathname !== '/relay' || !key || req.headers.upgrade?.toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return;
  }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
  socket.setNoDelay(true);

  const client = new Client(socket);
  client.onText = (text) => {
    try {
      route(client, text);
    } catch (e) {
      log('message error:', e.message);
    }
  };
  client.onClose = () => leave(client);
  setTimeout(() => {
    if (!client.role) client.close(4000); // never said hello
  }, 5000);
}

// Last line of defense: log and keep serving rather than taking the class offline.
process.on('uncaughtException', (e) => log('unexpected error:', e && e.stack ? e.stack : e));

// Drop connections that stop answering pings (laptop lid closed, Wi-Fi gone).
setInterval(() => {
  for (const members of rooms.values()) {
    for (const client of members) {
      if (!client.alive) {
        client.socket.destroy();
        continue;
      }
      client.alive = false;
      client.frame(0x9, Buffer.alloc(0));
    }
  }
}, 25000);

function log(...args) {
  console.log(new Date().toLocaleTimeString(), ...args);
}

server.listen(PORT, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  console.log('\nDF Pong relay running');
  if (SERVE_STATIC) {
    console.log(`  Game:   http://localhost:${PORT}/game/cc26/?relay=same-origin`);
    console.log(`  Admin:  http://localhost:${PORT}/game/admin/?room=cc26&relay=same-origin`);
    lan.forEach((ip) => console.log(`  Admin from another device on this network: http://${ip}:${PORT}/game/admin/?room=cc26&relay=same-origin`));
  }
  console.log(`  Relay:  ws://localhost:${PORT}/relay`);
  console.log(ADMIN_KEY ? '  Admin key required.' : '  No admin key set (anyone on the network can be admin). Set ADMIN_KEY to require one.');
  console.log('');
});
