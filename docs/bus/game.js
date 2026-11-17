// Draws the ride from rules.js onto the bus drawing, and handles the keys.
(() => {
const R = BusRules;

// --- Where things are on the 2544 x 590 canvas ------------------------------
const W = 2544;
const VIEW_W = 980;
const windows = [190, 318, 615, 912, 1240, 1548, 1866, 2163];   // left edges, front to back
// Middle of each seat: back row (window seats) and front row (aisle seats).
const seatX = {
  [R.LANE.window]: [409, 528, 685, 804, 997, 1134, 1327, 1438, 1634, 1765, 1951, 2057, 2256, 2383],
  [R.LANE.aisle]: [400, 517, 677, 788, 994, 1124, 1322, 1431, 1628, 1754, 1946, 2052, 2256, 2375],
};
// Each drawing has its character on one seat (or standing at one spot);
// moving it by (seat - drawnOn) puts it on another seat.
const drawnOn = {
  blue: { [R.LANE.window]: 1438, [R.LANE.aisle]: 994, stand: 553 },
  brown: { [R.LANE.window]: 804, [R.LANE.aisle]: 1124, stand: 466 },
  orange: { [R.LANE.window]: 685, [R.LANE.aisle]: 1322, stand: 383 },
};
const file = { blue: "Blue", brown: "Brown", orange: "Orange" };
// The front seats sit lower towards the back of the bus. Bottom edge of each
// front seat (canvas px), measured from FrontSeats.gif; in the last two
// windows the front-row riders drop by the difference, to sit on their seat.
const frontSeatBottom = [354, 353, 347, 346, 355, 352, 356, 367, 364, 357, 363, 366, 373, 375];
const LOWER_FROM_ROW = 10;
const dropFor = (colour, row) => {
  if (row < LOWER_FROM_ROW) return 0;
  const home = seatX[R.LANE.aisle].indexOf(drawnOn[colour][R.LANE.aisle]);
  return frontSeatBottom[row] - frontSeatBottom[home];
};
const standX = row => seatX[R.LANE.window][row] - 25;   // you stand just in front of the window seat
const windowOf = row => 1 + Math.floor(row / 2);         // two rows per window; window 0 is the driver's

// ?speed=40 makes the ride go 40 times faster, for testing.
const speed = Number(new URLSearchParams(location.search).get("speed")) || 1;
const t0 = performance.now();
const clock = () => (performance.now() - t0) * speed;

const ride = R.createRide({ now: 0 });
const me = R.you(ride);

const $ = id => document.getElementById(id);
const root = document.documentElement;
const bus = document.querySelector(".bus");
const standing = $("me");
standing.src = `${file[me.colour]}Standing.gif`;

// --- Riders -----------------------------------------------------------------
const sprites = new Map();   // rider id -> <img>

function drawRiders() {
  const aboard = new Set();
  for (const r of R.onBus(ride)) {
    if (r === me && r.lane === R.LANE.standing) continue;
    aboard.add(r.id);
    let img = sprites.get(r.id);
    if (!img) { img = new Image(); img.alt = ""; sprites.set(r.id, img); }
    if (r.lane === R.LANE.standing) {
      // Standing or walking. A little sideways shuffle per rider, so people
      // waiting together at the door don't stand exactly on top of each other.
      const src = `${file[r.colour]}Standing.gif`;
      if (!img.src.endsWith(src)) img.src = src;
      const x = standX(r.row) + ((r.id % 5) - 2) * 14;
      img.style.translate = `${(x - drawnOn[r.colour].stand) / W * 100}% 0`;
      img.classList.toggle("walking", r.target !== null && r.row !== r.target.row);
      if (img.parentNode !== $("standing")) $("standing").append(img);
      continue;
    }
    img.classList.remove("walking");
    const back = r.lane === R.LANE.window;
    const src = `${file[r.colour]}Sitting${back ? "" : "Front"}.gif`;
    if (!img.src.endsWith(src)) img.src = src;
    const dy = back ? 0 : dropFor(r.colour, r.row);
    img.style.translate = `${(seatX[r.lane][r.row] - drawnOn[r.colour][r.lane]) / W * 100}% ${dy / 590 * 100}%`;
    const layer = $(back ? "back" : "front");
    if (img.parentNode !== layer) layer.append(img);
  }
  for (const [id, img] of sprites) if (!aboard.has(id)) { img.remove(); sprites.delete(id); }

  const up = me.where === "bus" && me.lane === R.LANE.standing;
  standing.hidden = !up;
  if (up) standing.style.translate = `${(standX(me.row) - drawnOn[me.colour].stand) / W * 100}% 0`;
}

// --- The clear window, and the view centred on it --------------------------
let shownWindow = -1;
function centreView() {
  const i = me.where === "bus" ? windowOf(me.row) : 1;
  if (i === shownWindow) return;
  shownWindow = i;
  const pct = v => `${v / W * 100}%`;
  bus.style.setProperty("--l", pct(windows[i]));
  bus.style.setProperty("--r", pct(windows[i + 1] ?? W));
  const right = (windows[i + 1] ?? windows[i] + 302) - 32;
  root.style.setProperty("--view-x", (windows[i] + right) / 2 - VIEW_W / 2);
  fresh = null;
  drawLogs();
}

// --- The story, written on the windows --------------------------------------
// Two running logs, on the frosted windows either side of your clear one:
// what people do (actions, and the stops) on the window to your right,
// what happens between people (the mix lines) on the window to your left.
// In the last window there is nothing to the right, so both logs move one
// window to the left. In the first window the one to the left is the small
// front window by the driver, which stays empty, so both move one to the right.
const KEEP = 9;
const panes = windows.map((left, n) => {
  if (n === 0) return null;                    // no text on the small front window
  const [l, r, top, bottom] = [left + 45, (windows[n + 1] ?? left + 302) - 32 - 45, 125, 290];
  const p = document.createElement("p");
  p.style.left = `${l / W * 100}%`;
  p.style.width = `${(r - l) / W * 100}%`;
  p.style.top = `${top / 590 * 100}%`;
  p.style.height = `${(bottom - top) / 590 * 100}%`;
  $("texts").append(p);
  return p;
});
const logs = { actions: [], mixes: [] };
let fresh = null;                              // the newest line fades in

function drawLogs() {
  const i = shownWindow;
  const last = windows.length - 1;
  const [left, right] = i === last ? [i - 2, i - 1] : i === 1 ? [i + 1, i + 2] : [i - 1, i + 1];
  panes.forEach(p => p?.replaceChildren());
  for (const [n, log] of [[right, logs.actions], [left, logs.mixes]]) {
    panes[n].append(...log.map(line => {
      const span = document.createElement("span");
      span.textContent = line.text;
      if (line.mine) span.className = "mine";
      if (line !== fresh) span.style.animation = "none";
      return span;
    }));
    trim(panes[n]);
  }
}

// Only whole lines: drop the oldest ones until the newest all fit in the
// window. (Lines stack from the bottom, so one that sticks out of the top
// starts above the box.)
function trim(pane) {
  while (pane.children.length > 1 && pane.firstElementChild.offsetTop < 0) pane.firstElementChild.remove();
}
document.fonts?.ready.then(() => panes.forEach(p => p && trim(p)));

function write(line) {
  const log = line.kind === "mix" ? logs.mixes : logs.actions;
  log.push(line);
  if (log.length > KEEP) log.shift();
  fresh = line;
  drawLogs();
}

// --- Route, button ------------------------------------------------------------
const stopX = [130, 430, 1162, 1862];
function drawRoute(now) {
  const p = R.progress(ride, now);
  const k = Math.floor(p);
  const x = k >= stopX.length - 1 ? stopX.at(-1) : stopX[k] + (stopX[k + 1] - stopX[k]) * (p - k);
  $("marker").setAttribute("cx", x);
  [...$("stops").querySelectorAll("ellipse")].forEach((e, i) =>
    e.classList.toggle("done", i < ride.nextStop || ride.over));
}

// The button is just your action ("waves", "pretends to read"). It can be
// pressed once you are on the bus; at the end of the line it starts a new ride.
const button = $("action");
button.textContent = R.YOUR_ACTIONS[me.action];
function drawButton() {
  if (ride.over) { button.disabled = false; button.textContent = "ride again"; return; }
  button.disabled = me.where !== "bus";
}

button.addEventListener("click", () => {
  if (ride.over) { location.reload(); return; }
  R.act(ride, clock()).forEach(write);
});

// Walk one row: arrow keys on a computer, the ‹ › buttons on a phone.
function walk(dir) {
  if (me.where !== "bus") return;
  R.move(ride, dir, clock());
  standing.classList.remove("walking");
  void standing.offsetWidth;                   // restart the bob on every step
  standing.classList.add("walking");
  frame();
}
addEventListener("keydown", e => {
  const dir = { ArrowLeft: -1, ArrowRight: +1 }[e.key];
  if (!dir) return;
  e.preventDefault();
  walk(dir);
});
$("walk-front").addEventListener("click", () => walk(-1));
$("walk-back").addEventListener("click", () => walk(+1));

// --- Clouds, scattered at random --------------------------------------------------
// Two cloud layers: the sky above the roof, and the clouds outside at window
// height seen through the windows. Each layer is made of copies one bus
// canvas wide with eight clouds in them (the four drawings, twice). The
// canvas is cut into eight slots; the clouds are shuffled into them, each at
// a random spot in its slot, a random height and size, and now and then one
// is left out. All copies of a layer get the same layout, so the drifting
// loop is seamless.
function scatter(copies, { dy: [dyLo, dyHi], scale: [sLo, sHi] }) {
  const drawn = [[36, 136, 127], [380, 586, 157], [758, 906, 138], [1012, 1166, 152]]; // left, right, middle y
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const SLOT = W / 8;
  const order = [0, 1, 2, 3, 0, 1, 2, 3].sort(() => Math.random() - 0.5);
  const layout = order.map((c, slot) => {
    const [left, right, midY] = drawn[c];
    const x = slot * SLOT + rand(0, Math.max(0, SLOT - (right - left))) - left;
    return { c, x, y: rand(dyLo, dyHi), scale: rand(sLo, sHi), cx: (left + right) / 2, midY,
             hidden: Math.random() < 0.2 };
  });
  for (const copy of copies) {
    copy.querySelectorAll("img").forEach((img, n) => {
      const l = layout[n];
      img.src = `cloud${l.c + 1}.gif`;
      img.hidden = l.hidden;
      img.style.translate = `${l.x / W * 100}% ${l.y / 590 * 100}%`;
      img.style.transformOrigin = `${l.cx / W * 100}% ${l.midY / 590 * 100}%`;
      img.style.scale = l.scale;
    });
  }
}
scatter(document.querySelectorAll(".sky > div"), { dy: [-35, 25], scale: [0.7, 1.15] });
// Through the windows: middles between y 130 and 290, inside the openings.
scatter(document.querySelectorAll(".window-cloud-track > div"), { dy: [-10, 140], scale: [0.8, 1.2] });

// --- The road stops for a moment at each stop -----------------------------------
const STOP_PAUSE = 4000;                       // ms, in real time
const view = document.querySelector(".view");
let stoppedUntil = 0;

// --- Loop -----------------------------------------------------------------------
function frame() {
  const now = clock();
  R.tick(ride, now).forEach(line => {
    centreView();
    write(line);
    if (line.text.startsWith("The bus stops")) stoppedUntil = now + STOP_PAUSE * speed;
  });
  view.classList.toggle("stopped", ride.over || now < stoppedUntil);
  drawRiders();
  centreView();
  drawRoute(now);
  drawButton();
}

bus.style.transition = "none";
centreView();
write({ text: `You are ${me.name}, waiting at ${R.STOPS[0]}. Your one thing to do: ${R.YOUR_ACTIONS[me.action]}.`, row: null, mine: true });
frame();
requestAnimationFrame(() => requestAnimationFrame(() => { bus.style.transition = ""; }));
setInterval(frame, 250);
})();
