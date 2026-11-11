// Runs the whole bus inside this browser tab: there is no server.
// Everyone else on the bus is a fake rider, so every tab has its own bus.
import { BusGame, SEATS } from './game.js';
import { followTheWeather, forceSky } from './weather.js';
import { ACTIONS as actions } from './data.js';
import { wholeFace, wrap, WHEEL, armsKey, drawSky, drawStopScene, drawBoard, drawBus, drawDoubleDecker, drawRoad, drawTicket } from './ascii.js';

const $ = (id) => document.getElementById(id);
const ME = 'me';
const SAVE_KEY = 'the-bus';

// Add ?speed=12 to the address to make all the waiting 12 times shorter.
const speed = Number(new URLSearchParams(location.search).get('speed')) || 1;
const MINUTE = 60_000 / speed;

const game = new BusGame({
  stopEveryMs: [2 * MINUTE, 3 * MINUTE],
  rideLengthMs: [8 * MINUTE, 20 * MINUTE],
  mixCooldownMs: 10_000 / speed,
  fakeActsEveryMs: [1 * MINUTE, 3 * MINUTE],
  fakeAtStart: 11,
});

let view = null;
let lastLineId = 0;
let renderedSeats = '';

const formatTime = (ms) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
// Like a real departure board: whole minutes, then seconds in the last minute.
const formatBoardTime = (ms) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return seconds > 60 ? `${Math.ceil(seconds / 60)}min` : `${seconds}s`;
};

const actionText = (actionId) => actions.find((a) => a.id === actionId)?.text ?? '';

// The ticket you look at before boarding: your name and your action.
function drawBoardingTicket() {
  const rows = [{ text: '' }, { text: view.name, bold: true }, ...wrap(actionText(view.actionId), 28).map((text) => ({ text }))];
  return drawTicket('your ticket', rows, 28);
}

// The ticket after the ride, with the memories written on it.
function drawMemoriesTicket() {
  const width = 34;
  const stops = view.stops === 1 ? '1 stop' : `${view.stops} stops`;
  const rows = [{ text: '' }, ...wrap(`${view.name}, ${stops} on the bus`, width).map((text) => ({ text, bold: true }))];
  const memories = view.memories.length
    ? view.memories
    : [{ text: 'nothing happened. you looked out of the window.', mine: false }];
  for (const memory of memories) {
    rows.push({ text: '' });
    wrap(memory.text, width - 2).forEach((text, i) => rows.push({ text: `${i ? '  ' : '- '}${text}`, bold: memory.mine }));
  }
  return drawTicket('terminal stop', rows, width);
}

// --- the notification ----------------------------------------------------

// Browsers only allow this on https or localhost, so not on the wifi address.
const canNotify = () => 'Notification' in window && window.isSecureContext;
let toldAboutStop = false;

function refreshNotifyButtons() {
  const canAsk = canNotify() && Notification.permission === 'default';
  for (const button of document.querySelectorAll('.notify')) button.hidden = !canAsk;
}

function tellAboutStop() {
  if (toldAboutStop) return;
  toldAboutStop = true;
  if (!canNotify() || Notification.permission !== 'granted') return;
  try {
    const notification = new Notification('your stop is next', {
      body: 'you get off when the bus stops',
      tag: 'your-stop',
    });
    notification.onclick = () => window.focus();
  } catch {
    // Some phones refuse this. The message on the page still shows.
  }
}

// --- drawing ------------------------------------------------------------

function render() {
  if (!view) return;
  $('stop').hidden = view.phase !== 'queue';
  $('stop-scene').hidden = view.phase === 'bus';
  $('bus').hidden = view.phase !== 'bus';
  $('off').hidden = view.phase !== 'off';
  document.body.classList.toggle('riding', view.phase === 'bus');

  if (view.phase === 'queue') renderStop();
  if (view.phase === 'bus') renderBus();
  if (view.phase !== 'bus') toldAboutStop = false;
  if (view.phase === 'off') {
    document.title = 'the bus';
    renderOff();
  }
  renderClocks();
}

function renderStop() {
  $('stop-status').hidden = !view.busFull;
  const ticket = $('stop-ticket');
  const key = `${view.name}/${view.actionId}`;
  if (ticket.dataset.key !== key) {
    ticket.dataset.key = key;
    ticket.innerHTML = drawBoardingTicket();
  }
}

function renderBus() {
  $('trigger').textContent = `[ ${actionText(view.actionId)} ]`;

  $('your-stop').hidden = !view.yourStopIsNext;
  if (view.yourStopIsNext) tellAboutStop();
  document.title = view.yourStopIsNext ? 'your stop is next' : 'the bus';

  appendLog(view.log);
  renderSeats();
}

function renderOff() {
  $('memories-ticket').innerHTML = drawMemoriesTicket();
}

// The story is short-lived: at most 10 lines on screen, each one fades
// away 8 seconds after it appears.
const SHOWN_MAX = 10;
const SHOWN_MS = 8000;
const FADE_MS = 600;

function fadeAway(item) {
  setTimeout(() => {
    item.classList.add('fading');
    setTimeout(() => item.remove(), FADE_MS);
  }, SHOWN_MS);
}

function appendLog(lines) {
  const log = $('log');
  const wasAtBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  let braked = false;
  for (const line of lines) {
    if (line.id <= lastLineId) continue;
    lastLineId = line.id;
    const item = document.createElement('li');
    item.className = [line.kind, line.mine ? 'mine' : ''].join(' ').trim();
    const text = document.createElement('span');
    if (line.kind === 'stop') {
      text.textContent = `- - - ${line.text} - - -`;
    } else {
      const glyph = document.createElement('span');
      glyph.className = 'glyph';
      glyph.textContent = line.kind === 'mix' ? '  *  ' : line.face ? wholeFace(line.face) : '     ';
      item.append(glyph);
      text.textContent = line.text;
    }
    item.append(text);
    log.append(item);
    fadeAway(item);
    if (line.kind === 'stop') braked = true;
  }
  while (log.children.length > SHOWN_MAX) log.firstChild.remove();
  if (wasAtBottom) log.scrollTop = log.scrollHeight;
  if (braked) brake();
}

const STOP_MS = 2500;
let stopTimer = null;

// At each stop the bus jolts, then the bus and the road stand still for a moment.
function brake() {
  document.body.classList.remove('braking');
  void document.body.offsetWidth; // restarts the animation
  document.body.classList.add('braking', 'stopped');
  clearTimeout(stopTimer);
  stopTimer = setTimeout(() => document.body.classList.remove('stopped'), STOP_MS);
}

// The bus and the road are redrawn when someone gets on or off, and a few
// times a second while driving, so the wheels turn and the road slides by.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let frame = 0;

// On a phone the long bus does not fit: it becomes a double decker.
const phone = matchMedia('(max-width: 700px)');
phone.addEventListener('change', () => {
  renderedSeats = '';
  if (view?.phase === 'bus') renderSeats();
});

function renderSeats() {
  const key = JSON.stringify(view.seats) + armsKey(view.seats) + phone.matches;
  if (key === renderedSeats) return;
  const firstDraw = !renderedSeats;
  renderedSeats = key;
  drawScene();
  // If the bus is still wider than the screen, start with you in the middle.
  if (firstDraw) document.querySelector('#vehicle .me')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function drawScene() {
  $('vehicle').innerHTML = (phone.matches ? drawDoubleDecker : drawBus)(view.seats, SEATS);
  drawMotion();
}

// Only the wheels and the road change while driving, so the seats you can
// click are never replaced under your finger.
function drawMotion() {
  for (const wheel of document.querySelectorAll('.wheel')) wheel.textContent = WHEEL[frame % WHEEL.length];
  $('road').textContent = drawRoad(frame);
}

// The clouds always drift: slowly while you stand still, faster while the bus drives.
// The speed eases from one to the other, so the sky never jumps.
const CLOUD_SPEED = { standing: 6, driving: 24 }; // pixels per second
let cloudX = 0;
let cloudSpeed = CLOUD_SPEED.standing;
let lastSkyTime = null;

function driftSky(time) {
  const driving = view?.phase === 'bus' && !document.body.classList.contains('stopped');
  const target = driving ? CLOUD_SPEED.driving : CLOUD_SPEED.standing;
  const seconds = lastSkyTime === null ? 0 : Math.min(1, (time - lastSkyTime) / 1000);
  lastSkyTime = time;
  cloudSpeed += (target - cloudSpeed) * Math.min(1, seconds * 1.5);
  const loop = $('sky').scrollWidth / 2; // the sky is drawn twice, side by side
  cloudX = loop ? (cloudX + cloudSpeed * seconds) % loop : 0;
  $('sky').style.transform = `translateX(${-cloudX}px)`;
  requestAnimationFrame(driftSky);
}
if (!reduceMotion) requestAnimationFrame(driftSky);

setInterval(() => {
  if (view?.phase !== 'bus') return;
  renderSeats(); // arms go back down after a few seconds
  if (reduceMotion || document.body.classList.contains('stopped')) return;
  frame++;
  drawMotion();
}, 140);

// In the last 10 seconds before you board, the ticket comes out of your pocket,
// you look at it, and it goes back in. The animation in style.css lasts 10 seconds.
const TICKET_SHOWN_MS = 10_000;

function pullOutTicket(left) {
  const ticket = $('stop-ticket');
  const show = view.isNext && left > 0 && left <= TICKET_SHOWN_MS;
  if (show && ticket.hidden) {
    ticket.style.animationDelay = `${left - TICKET_SHOWN_MS}ms`; // in step if you reload late
    ticket.hidden = false;
  }
  if (!show) ticket.hidden = true;
}

// Runs every 250 ms, so the clocks tick between server messages.
function renderClocks() {
  if (!view || !view.nextStopAt) return;
  const left = view.nextStopAt - Date.now();
  if (view.phase === 'queue') {
    $('board').textContent = drawBoard(formatBoardTime(left));
    pullOutTicket(left);
  }
  if (view.phase === 'bus') $('bus-time').textContent = formatTime(left);
}

// --- what you can do ----------------------------------------------------

for (const button of document.querySelectorAll('.notify')) {
  button.addEventListener('click', async () => {
    await Notification.requestPermission();
    refreshNotifyButtons();
  });
}
// Click a free seat to sit there, next to other people.
$('vehicle').addEventListener('click', (event) => {
  const seat = event.target.closest('[data-seat]');
  if (seat && game.move(ME, Number(seat.dataset.seat))) refresh();
});
// Or walk with the arrow keys: you go to the closest free seat that way,
// stepping past the people already sitting there.
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const middle = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
document.addEventListener('keydown', (event) => {
  const arrow = ARROWS[event.key];
  const me = document.querySelector('#vehicle .me');
  if (!arrow || !me || event.altKey || event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  const from = middle(me);
  let best = null;
  for (const seat of document.querySelectorAll('#vehicle [data-seat]')) {
    const to = middle(seat);
    const ahead = (to.x - from.x) * arrow[0] + (to.y - from.y) * arrow[1]; // how far that way
    const aside = Math.abs((to.x - from.x) * arrow[1] + (to.y - from.y) * arrow[0]); // how far off the line
    if (ahead < 4) continue;
    if (arrow[1] && aside > me.offsetWidth * 1.5) continue; // up and down stay in your part of the bus
    const score = ahead + aside * 3;
    if (!best || score < best.score) best = { seat, score };
  }
  if (best && game.move(ME, Number(best.seat.dataset.seat))) {
    refresh();
    document.querySelector('#vehicle .me')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }
});
$('trigger').addEventListener('click', () => {
  if (game.trigger(ME)) refresh();
});

// --- start --------------------------------------------------------------

// One save per tab: reloading keeps your ride, and a new tab is a new ride.
function saveGame() {
  try { sessionStorage.setItem(SAVE_KEY, JSON.stringify(game.save())); } catch {}
}

function loadGame() {
  try {
    const saved = sessionStorage.getItem(SAVE_KEY);
    if (saved) game.load(JSON.parse(saved));
  } catch {}
}

function refresh() {
  const next = game.view(ME);
  if (view?.phase === 'bus' && next.phase !== 'bus') {
    lastLineId = 0;
    renderedSeats = '';
    $('log').replaceChildren();
  }
  view = next;
  render();
  saveGame();
}

$('sky').textContent = drawSky();
if (!forceSky(new URLSearchParams(location.search).get('sky'))) followTheWeather();
$('stop-scene').textContent = drawStopScene();
refreshNotifyButtons();
loadGame();
game.join(ME);
refresh();
setInterval(() => {
  if (game.update()) refresh();
}, 200);
setInterval(renderClocks, 250);
