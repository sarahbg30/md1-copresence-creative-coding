// Draws whatever the server says. All the rules live on the server, in game.js.
const $ = (id) => document.getElementById(id);

// One id per tab, so you can test several riders with several tabs.
function personId() {
  let id = null;
  try { id = sessionStorage.getItem('bus-id'); } catch {}
  if (!id) {
    id = Array.from({ length: 20 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    try { sessionStorage.setItem('bus-id', id); } catch {}
  }
  return id;
}
const id = personId();

let view = null;
let clockOffset = 0;
let actions = [];
let lastLineId = 0;
let renderedSeats = '';

const post = (path, body = {}) => fetch(path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id, ...body }),
});

const formatTime = (ms) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
// Like a real departure board: whole minutes, then seconds in the last minute.
const formatBoardTime = (ms) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return seconds > 60 ? `${Math.ceil(seconds / 60)}min` : `${seconds}s`;
};
const serverNow = () => Date.now() + clockOffset;

function makeShape(shape, color) {
  const el = document.createElement('span');
  el.className = `shape ${shape ?? ''}`;
  if (color) el.style.background = color;
  return el;
}

async function loadOptions() {
  actions = (await (await fetch('/api/options')).json()).actions;
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

function appendLog(lines) {
  const log = $('log');
  const wasAtBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  let braked = false;
  for (const line of lines) {
    if (line.id <= lastLineId) continue;
    lastLineId = line.id;
    const item = document.createElement('li');
    item.className = [line.kind, line.mine ? 'mine' : ''].join(' ').trim();
    if (line.shape) item.append(makeShape(line.shape, line.color));
    const text = document.createElement('span');
    text.textContent = line.text;
    item.append(text);
    log.append(item);
    if (line.kind === 'stop') braked = true;
  }
  while (log.children.length > 200) log.firstChild.remove();
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

// Where a seat row starts in the window grid. The bus faces right, so row 0 is
// at the front and the back bench (y = 5) is at the far left. Column 6 is the door.
const firstWindowColumn = (y) => (y === 5 ? 1 : y === 4 ? 4 : 7 + (3 - y) * 2);

// Riders sit in the bus windows. One side of the aisle is the top line of the
// window, the other side is the bottom line.
function renderSeats() {
  const key = JSON.stringify(view.seats);
  if (key === renderedSeats) return;
  renderedSeats = key;

  const passengers = view.seats.map((person) => {
    const cell = document.createElement('div');
    cell.className = person.me ? 'passenger me' : 'passenger';
    cell.title = person.name;
    const farSide = person.x >= 3;
    cell.style.gridColumn = firstWindowColumn(person.y) + (farSide ? person.x - 3 : person.x);
    cell.style.gridRow = farSide ? 2 : 1;
    cell.append(makeShape(person.shape, person.color));
    return cell;
  });
  $('seats').replaceChildren(...passengers);
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
  const left = view.nextStopAt - serverNow();
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
$('trigger').addEventListener('click', () => post('/api/trigger'));

// --- start --------------------------------------------------------------

(async function start() {
  refreshNotifyButtons();
  await loadOptions();
  const events = new EventSource(`/events?id=${id}`);
  events.onmessage = (message) => {
    const next = JSON.parse(message.data);
    if (view?.phase === 'bus' && next.phase !== 'bus') {
      lastLineId = 0;
      renderedSeats = '';
      $('log').replaceChildren();
    }
    view = next;
    clockOffset = view.now - Date.now();
    render();
  };
  setInterval(renderClocks, 250);
})();
