// Runs the shared bus and keeps every open page in sync.
// No dependencies: pages listen with Server-Sent Events and act with POST requests.
import http from 'node:http';
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { BusGame } from './game.js';
import { ACTIONS } from './data.js';

const PORT = Number(process.env.PORT) || 3000;
const SPEED = Number(process.env.SPEED) || 1; // SPEED=12 makes all the waiting 12 times shorter
const MAX_RIDERS = Number(process.env.MAX_RIDERS) || 25;
const RECONNECT_GRACE_MS = 15_000; // a reload shouldn't throw you off the bus
const ID_PATTERN = /^[a-z0-9]{8,40}$/;

const MINUTE = 60_000 / SPEED;
const game = new BusGame({
  stopEveryMs: [2 * MINUTE, 3 * MINUTE],
  rideLengthMs: [8 * MINUTE, 20 * MINUTE],
  mixCooldownMs: 10_000 / SPEED,
  fakeActsEveryMs: [1 * MINUTE, 3 * MINUTE],
  maxRiders: MAX_RIDERS,
});
const clients = new Map(); // person id -> open response
const goodbyes = new Map(); // person id -> pending removal

const STATIC_FILES = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/style.css': ['public/style.css', 'text/css; charset=utf-8'],
  '/client.js': ['public/client.js', 'text/javascript; charset=utf-8'],
  '/images/sky.gif': ['public/images/sky.gif', 'image/gif'],
  '/images/road.gif': ['public/images/road.gif', 'image/gif'],
  '/images/bus.gif': ['public/images/bus.gif', 'image/gif'],
  '/images/road-still.png': ['public/images/road-still.png', 'image/png'],
  '/images/bus-still.png': ['public/images/bus-still.png', 'image/png'],
  '/images/ticket.png': ['public/images/ticket.png', 'image/png'],
  '/images/ticket-back.png': ['public/images/ticket-back.png', 'image/png'],
  '/images/sky-still.png': ['public/images/sky-still.png', 'image/png'],
  '/images/stop-sign-still.png': ['public/images/stop-sign-still.png', 'image/png'],
  '/images/shelter-still.png': ['public/images/shelter-still.png', 'image/png'],
};

function broadcast() {
  for (const [id, res] of clients) {
    res.write(`data: ${JSON.stringify(game.view(id))}\n\n`);
  }
}

setInterval(() => {
  if (game.update()) broadcast();
}, 200);

// Keeps connections from timing out on some networks.
setInterval(() => {
  for (const res of clients.values()) res.write(': still here\n\n');
}, 20_000);

function openEvents(req, res, id) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  clearTimeout(goodbyes.get(id));
  goodbyes.delete(id);
  clients.get(id)?.end();
  clients.set(id, res);
  game.join(id);
  broadcast();

  req.on('close', () => {
    if (clients.get(id) !== res) return; // a newer connection replaced this one
    clients.delete(id);
    goodbyes.set(id, setTimeout(() => {
      goodbyes.delete(id);
      game.leave(id);
      broadcast();
    }, RECONNECT_GRACE_MS));
  });
}

const ACTIONS_API = {
  '/api/trigger': (id) => game.trigger(id),
};

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000) throw new Error('too large');
  }
  return JSON.parse(raw || '{}');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const sendJson = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  if (req.method === 'GET' && STATIC_FILES[url.pathname]) {
    const [file, type] = STATIC_FILES[url.pathname];
    const content = await readFile(new URL(file, import.meta.url));
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    return res.end(content);
  }

  if (req.method === 'GET' && url.pathname === '/api/options') {
    return sendJson(200, { actions: ACTIONS });
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    const id = url.searchParams.get('id') ?? '';
    if (!ID_PATTERN.test(id)) return sendJson(400, { ok: false });
    return openEvents(req, res, id);
  }

  if (req.method === 'POST' && ACTIONS_API[url.pathname]) {
    try {
      const body = await readJson(req);
      if (typeof body.id !== 'string' || !ID_PATTERN.test(body.id)) return sendJson(400, { ok: false });
      const ok = ACTIONS_API[url.pathname](body.id, body);
      if (ok) broadcast();
      return sendJson(ok ? 200 : 409, { ok });
    } catch {
      return sendJson(400, { ok: false });
    }
  }

  sendJson(404, { ok: false });
});

server.listen(PORT, () => {
  console.log(`\nThe bus is running, ${MAX_RIDERS} people max${SPEED === 1 ? '' : `, ${SPEED} times faster`}.`);
  console.log(`  On this computer:  http://localhost:${PORT}`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  On the same wifi:  http://${net.address}:${PORT}`);
      }
    }
  }
  console.log('');
});
