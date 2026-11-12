// Runs the whole bus inside this browser tab: there is no server.
// Everyone else on the bus is a fake rider, so every tab has its own bus.
import { BusGame, SEATS } from './game.js';
import { ACTIONS as actions } from './data.js';

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

// Everyone has a face: [^w^], {o_O}, |-.-|...
function makeFace(face) {
  const el = document.createElement('span');
  el.className = 'face';
  el.textContent = face ?? '(o_o)';
  return el;
}

function fillTicket(ticket, name, actionId) {
  const key = `${name}/${actionId}`;
  if (ticket.dataset.key === key) return;
  ticket.dataset.key = key;
  ticket.querySelector('.ticket-name').textContent = name;
  ticket.querySelector('.ticket-action').textContent = actions.find((a) => a.id === actionId)?.text ?? '';
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
  fillTicket($('stop-ticket'), view.name, view.actionId);
}

function renderBus() {
  const action = actions.find((a) => a.id === view.actionId);
  $('trigger').textContent = action?.text ?? '';

  $('your-stop').hidden = !view.yourStopIsNext;
  if (view.yourStopIsNext) tellAboutStop();
  document.title = view.yourStopIsNext ? 'your stop is next' : 'the bus';

  appendLog(view.log);
  renderSeats();
}

function renderOff() {
  const stops = view.stops === 1 ? '1 stop' : `${view.stops} stops`;
  $('off-summary').textContent = `${view.name}, ${stops} on the bus`;
  const items = view.memories.map((memory) => {
    const item = document.createElement('li');
    item.className = [memory.kind, memory.mine ? 'mine' : ''].join(' ').trim();
    item.textContent = memory.text;
    return item;
  });
  if (!items.length) {
    const quiet = document.createElement('li');
    quiet.textContent = 'nothing happened. you looked out of the window.';
    items.push(quiet);
  }
  $('memories').replaceChildren(...items);
}

// The story shows at most 10 lines, and each one fades out after 8 seconds.
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
  let braked = false;
  for (const line of lines) {
    if (line.id <= lastLineId) continue;
    lastLineId = line.id;
    const item = document.createElement('li');
    item.className = [line.kind, line.mine ? 'mine' : ''].join(' ').trim();
    if (line.kind !== 'stop') item.append(makeFace(line.face));
    const text = document.createElement('span');
    text.textContent = line.text;
    item.append(text);
    log.append(item);
    fadeAway(item);
    if (line.kind === 'stop') braked = true;
  }
  while (log.children.length > SHOWN_MAX) log.firstChild.remove();
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
  stopTimer = setTimeout(() => document.body.classList.remove('stopped', 'braking'), STOP_MS);
}

// Where a seat row starts in the window grid. The bus faces right, so row 0 is
// at the front and the back bench (y = 5) is at the far left. Column 6 is the door.
const firstWindowColumn = (y) => (y === 5 ? 1 : y === 4 ? 4 : 7 + (3 - y) * 2);

// Riders sit in the bus windows. One side of the aisle is the top line of the
// window, the other side is the bottom line. Free seats are buttons: click one
// to sit there.
function renderSeats() {
  const key = JSON.stringify(view.seats.map((p) => [p.seat, p.face, p.me]));
  if (key === renderedSeats) return;
  renderedSeats = key;

  const bySeat = new Map(view.seats.map((person) => [person.seat, person]));
  const cells = SEATS.map((seat, i) => {
    const person = bySeat.get(i);
    const cell = document.createElement(person ? 'div' : 'button');
    if (person) {
      cell.className = person.me ? 'passenger me' : 'passenger';
      cell.title = person.name;
      cell.append(makeFace(person.face));
    } else {
      cell.type = 'button';
      cell.className = 'seat';
      cell.dataset.seat = i;
      cell.title = 'sit here';
      cell.setAttribute('aria-label', 'sit here');
      cell.textContent = '_';
    }
    const farSide = seat.x >= 3;
    cell.style.gridColumn = firstWindowColumn(seat.y) + (farSide ? seat.x - 3 : seat.x);
    cell.style.gridRow = farSide ? 2 : 1;
    return cell;
  });
  $('seats').replaceChildren(...cells);
}

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
    $('stop-time').textContent = formatBoardTime(left);
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
// Skip the wait at the stop: the bus comes right away.
$('skip').addEventListener('click', () => {
  if (game.skipWait()) refresh();
  renderClocks();
});
// Click a free seat to sit there, next to other people.
$('seats').addEventListener('click', (event) => {
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
  const me = document.querySelector('#seats .me');
  if (!arrow || !me || event.altKey || event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  const from = middle(me);
  let best = null;
  for (const seat of document.querySelectorAll('#seats [data-seat]')) {
    const to = middle(seat);
    const ahead = (to.x - from.x) * arrow[0] + (to.y - from.y) * arrow[1]; // how far that way
    const aside = Math.abs((to.x - from.x) * arrow[1] + (to.y - from.y) * arrow[0]); // how far off the line
    if (ahead < 2) continue;
    if (arrow[1] && aside > me.offsetWidth * 1.5) continue; // up and down stay in your part of the bus
    const score = ahead + aside * 3;
    if (!best || score < best.score) best = { seat, score };
  }
  if (best && game.move(ME, Number(best.seat.dataset.seat))) refresh();
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

refreshNotifyButtons();
loadGame();
game.join(ME);
refresh();
setInterval(() => {
  if (game.update()) refresh();
}, 200);
setInterval(renderClocks, 250);
