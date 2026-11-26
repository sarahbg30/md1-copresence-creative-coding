// "the bus", drawn with p5.js.
//
// The same game as ../bus/: the rules come from ../bus/rules.js (BusRules),
// the drawings are the same, without the filter (../bus/naked/). Here everything is painted on one canvas,
// every frame, instead of stacking <img> tags.
//
// Every drawing shares one 2544 x 590 canvas ("bus units"). We look at a
// 980 x 650 slice of it (the view), with the bus 60 units down to leave room
// for the route.

const R = BusRules;
const A = "../bus/";                       // where the drawings live

const W = 2544, H = 590;
const VIEW_W = 980, VIEW_H = 650, BUS_TOP = 60;

// --- Where things are on the bus drawing ----------------------------------
const windows = [190, 318, 615, 912, 1240, 1548, 1866, 2163];   // left edges, front to back
const seatX = {
  [R.LANE.window]: [409, 528, 685, 804, 997, 1134, 1327, 1438, 1634, 1765, 1951, 2057, 2256, 2383],
  [R.LANE.aisle]: [400, 517, 677, 788, 994, 1124, 1322, 1431, 1628, 1754, 1946, 2052, 2256, 2375],
};
// Each drawing has its character on one seat (or standing at one spot);
// shifting it by (seat - drawnOn) puts it on another seat.
const drawnOn = {
  blue: { [R.LANE.window]: 1438, [R.LANE.aisle]: 994, stand: 553 },
  brown: { [R.LANE.window]: 804, [R.LANE.aisle]: 1124, stand: 466 },
  orange: { [R.LANE.window]: 685, [R.LANE.aisle]: 1322, stand: 383 },
};
const FILE = { blue: "Blue", brown: "Brown", orange: "Orange" };
// The front seats sit lower towards the back: in the last two windows the
// front-row riders drop to sit on their seat.
const frontSeatBottom = [354, 353, 347, 346, 355, 352, 356, 367, 364, 357, 363, 366, 373, 375];
const dropFor = (colour, row) => {
  if (row < 10) return 0;
  const home = seatX[R.LANE.aisle].indexOf(drawnOn[colour][R.LANE.aisle]);
  return frontSeatBottom[row] - frontSeatBottom[home];
};
const standX = row => seatX[R.LANE.window][row] - 25;
const windowOf = row => 1 + Math.floor(row / 2);    // two rows per window; window 0 is the driver's

// Traced from the small front window in BusCoque (percent of the bus).
const FRONT_GLASS = "7.39 29.32,7.59 29.32,7.74 22.37,7.90 20.34,8.06 18.31,8.22 16.61,8.37 15.93,8.53 14.92,8.69 14.41,8.84 13.90,9.00 13.22,9.16 12.71,9.32 12.37,9.47 12.20,9.63 11.86,9.79 11.86,9.94 11.86,10.10 12.20,10.26 12.54,10.42 13.22,10.57 14.07,10.73 15.93,10.89 21.19,11.05 29.15,11.20 35.08,11.36 40.00,11.52 47.63,11.67 49.66,11.87 49.66,11.87 53.56,11.67 53.56,11.52 54.92,11.36 55.76,11.20 56.10,11.05 56.61,10.89 56.78,10.73 56.95,10.57 56.78,10.42 56.78,10.26 56.44,10.10 56.44,9.94 56.27,9.79 56.10,9.63 55.76,9.47 55.42,9.32 55.08,9.16 54.92,9.00 54.41,8.84 53.90,8.69 52.88,8.53 51.36,8.37 49.66,8.22 47.46,8.06 45.76,7.90 44.24,7.74 41.86,7.59 35.76,7.39 35.76"
  .split(",").map(p => p.split(" ").map(Number)).map(([x, y]) => [x / 100 * W, y / 100 * H]);
const SHADOW = "M210 528 C 220 506, 420 500, 900 503 S 2200 498, 2460 510 C 2540 516, 2530 548, 2440 552 S 1500 562, 900 558 S 230 556, 210 528 Z";
const ROUTE = "M130 142 C 300 132, 380 150, 430 140 S 800 128, 1162 144 S 1600 132, 1862 140";
const STOP_RINGS = [[130, 140, 64, 60, -8], [430, 141, 60, 64, 6], [1162, 139, 65, 61, -4], [1862, 141, 61, 65, 9]];

const INK = "#676b6e", PAPER = "#f6ecf0", BLUE = "#4f6ff0", GREY_BLUE = "#8e9bb8";

// --- The game ----------------------------------------------------------------
// ?speed=40 makes the ride go 40 times faster, for testing.
const speed = Number(new URLSearchParams(location.search).get("speed")) || 1;
let t0 = 0;
const clock = () => (performance.now() - t0) * speed;

const ride = R.createRide({ now: 0 });
const me = R.you(ride);

// --- Loading the drawings ------------------------------------------------------
// Every drawing fills a whole 2544 x 590 canvas, which is a lot of memory
// for 18 drawings. So each one is loaded on its own, cut down
// to the box its drawing actually fills, and the full frames are let go.
const sprites = {};
// The "naked" drawings (../bus/naked/, no filter baked in), one picture each;
// dreamcore-assets.js gives each one Sarah's dreamcore filter while loading.
const N = "naked/";
const TO_LOAD = [
  ["window", N + "Window.png"], ["interior", N + "InteriorBus.png"], ["seats", N + "FrontSeats.png"],
  ["coque", N + "BusCoque.png"], ["road", N + "road.png"],
  ["cloud1", N + "cloud1.png"], ["cloud2", N + "cloud2.png"], ["cloud3", N + "cloud3.png"], ["cloud4", N + "cloud4.png"],
  ...["Blue", "Brown", "Orange"].flatMap(c => [[c + "Sitting", N + c + "Sitting.png"], [c + "SittingFront", N + c + "SittingFront.png"], [c + "Standing", N + c + "Standing.png"]]),
];
let loaded = 0, ready = false, failed = null;

// Three at a time: quicker over the network, without holding all the full
// frames in memory at once.
function loadAll() {
  let asked = 0;
  const next = () => {
    if (asked === TO_LOAD.length) return;
    const [key, src, white] = TO_LOAD[asked++];
    loadImage(A + src, img => {
      bake(img, white).then(s => {
        sprites[key] = s;
        if (++loaded === TO_LOAD.length) start(); else next();
      }, () => { failed = src; });
    }, () => { failed = src; });
  };
  for (let n = 0; n < 3; n++) next();
}

// Crop every frame to the box the drawing fills. Clouds are drawn pink;
// `white` turns them white, keeping a little of their shading
// (like CSS grayscale(1) brightness(1.7) contrast(0.85)).
// The crop is done on the pixels themselves, with no canvas in between:
// Safari on iPhone swapped red and blue when big frames went from one
// canvas to another (the blue bus came out orange).
async function bake(img, white) {
  const frames = img.gifProperties
    ? img.gifProperties.frames.map(f => ({ data: f.image, delay: f.delay || 100 }))
    : [{ data: img.canvas.getContext("2d").getImageData(0, 0, img.width, img.height), delay: 1000 }];
  const w = img.width, h = img.height;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (const { data } of frames) {
    const d = data.data;
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (d[row + x * 4 + 3]) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
  }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const out = await Promise.all(frames.map(({ data }) => {
    if (white) whiten(data, x0, y0, x1, y1);
    const crop = new ImageData(bw, bh);
    for (let y = 0; y < bh; y++) {
      const from = ((y0 + y) * w + x0) * 4;
      crop.data.set(data.data.subarray(from, from + bw * 4), y * bw * 4);
    }
    return crop;
  }));
  // The filter turns one picture into a few, with moving grain.
  let crops = out, delays = frames.map(f => f.delay);
  if (DreamAssets.on && out.length === 1) {
    crops = DreamAssets.apply(out[0]);
    delays = crops.map(() => DreamAssets.DELAY);
  }
  const pics = await Promise.all(crops.map(crop => {
    if (window.createImageBitmap) return createImageBitmap(crop);
    const c = document.createElement("canvas"); // older browsers
    c.width = bw; c.height = bh;
    c.getContext("2d").putImageData(crop, 0, 0);
    return c;
  }));
  return { x: x0, y: y0, w: bw, h: bh, frames: pics, delays, total: delays.reduce((a, b) => a + b, 0) };
}

function whiten(data, x0, y0, x1, y1) {
  const d = data.data, w = data.width;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * w + x) * 4;
    if (!d[i + 3]) continue;
    const g = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    const v = ((Math.min(1, g * 1.7) - 0.5) * 0.85 + 0.5) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
}

// The frame of a GIF to show at time t (all GIFs keep looping).
function frameOf(s, t) {
  if (s.frames.length === 1) return s.frames[0];
  let m = t % s.total;
  for (let i = 0; i < s.delays.length; i++) { m -= s.delays[i]; if (m < 0) return s.frames[i]; }
  return s.frames[0];
}
// Draw a drawing where it sits on the bus canvas, shifted by (dx, dy).
function paint(ctx, s, dx = 0, dy = 0) {
  ctx.drawImage(frameOf(s, millis()), s.x + dx, s.y + dy, s.w, s.h);
}

// --- Smooth moves (like CSS transitions) -----------------------------------------
const easeInOut = p => p * p * (3 - 2 * p);
const linear = p => p;
class Tween {
  constructor(dur, ease, v = 0) { this.dur = dur; this.ease = ease; this.from = this.to = v; this.start = -1e9; }
  set(v, now, instant) {
    if (v === this.to && !instant) return;
    this.from = instant ? v : this.at(now);
    this.to = v;
    this.start = now;
  }
  at(now) {
    const p = Math.min(1, (now - this.start) / this.dur);
    return this.from + (this.to - this.from) * this.ease(p);
  }
}
const viewX = new Tween(600, easeInOut);   // left edge of the view on the bus canvas
const holeL = new Tween(600, easeInOut);   // the clear window's left and right edges
const holeR = new Tween(600, easeInOut);
const meX = new Tween(600, easeInOut);
const walkers = new Map();                 // rider id -> Tween of their x, while standing
let meBobAt = -1e9;                        // when you last took a step

// --- The clear window, and the view centred on it -----------------------------
let shownWindow = -1;
function centreView(now, instant) {
  const i = me.where === "bus" ? windowOf(me.row) : 1;
  if (i === shownWindow) return;
  shownWindow = i;
  const right = (windows[i + 1] ?? windows[i] + 302) - 32;
  viewX.set((windows[i] + right) / 2 - VIEW_W / 2, now, instant);
  holeL.set(windows[i], now, instant);
  holeR.set(windows[i + 1] ?? W, now, instant);
  fresh = null;
}

// --- The story, written on the windows ------------------------------------------
// What people do (actions, the stops) on the window to the right of yours,
// what happens between people (the mix lines) on the window to the left.
// In the last window both move one window left; in the first, one right
// (the small front window by the driver stays empty).
const KEEP = 9;
const logs = { actions: [], mixes: [] };
let fresh = null;                          // the newest line fades in
const pane = n => {
  const left = windows[n];
  const l = left + 45, r = (windows[n + 1] ?? left + 302) - 32 - 45;
  return { x: l, y: 125, w: r - l, h: 290 - 125 };
};
function write(line) {
  const log = line.kind === "mix" ? logs.mixes : logs.actions;
  log.push(line);
  if (log.length > KEEP) log.shift();
  line.at = millis();
  fresh = line;
}

function wrap(g, text, width) {
  const out = [];
  let cur = "";
  for (const word of text.split(" ")) {
    const tryLine = cur ? cur + " " + word : word;
    if (cur && g.textWidth(tryLine) > width) { out.push(cur); cur = word; } else cur = tryLine;
  }
  if (cur) out.push(cur);
  return out;
}

// Lines stack from the bottom of the pane; only whole lines that fit are shown.
function drawPane(g, box, log) {
  const size = smallScreen() ? 0.008 * W : 0.0055 * W;
  const lead = size * 1.15, gap = 0.0015 * W;
  g.textFont("Gaegu");
  g.textSize(size);
  g.textAlign(LEFT, TOP);
  g.noStroke();
  let bottom = box.y + box.h;
  for (let n = log.length - 1; n >= 0; n--) {
    const line = log[n];
    g.textStyle(line.mine ? BOLD : NORMAL);
    const rows = wrap(g, line.text, box.w);
    const top = bottom - rows.length * lead;
    if (top < box.y && n < log.length - 1) break;
    const fade = line === fresh ? 1 - Math.pow(1 - Math.min(1, (millis() - line.at) / 1200), 2) : 1;
    g.fill(255, 255 * fade);
    rows.forEach((row, k) => g.text(row, box.x, top + k * lead));
    bottom = top - gap;
  }
}

function drawLogs(g) {
  const i = shownWindow, last = windows.length - 1;
  const [left, right] = i === last ? [i - 2, i - 1] : i === 1 ? [i + 1, i + 2] : [i - 1, i + 1];
  drawPane(g, pane(right), logs.actions);
  drawPane(g, pane(left), logs.mixes);
}

// --- Clouds, scattered at random -------------------------------------------------
// Each layer repeats one bus-canvas-wide strip holding eight clouds (the four
// drawings, twice): one per slot, at a random spot in the slot, random height
// and size, and now and then one left out. Every repeat has the same layout,
// so the drifting loop never jumps.
function scatter({ dy: [dyLo, dyHi], scale: [sLo, sHi] }) {
  const drawn = [[36, 136, 127], [380, 586, 157], [758, 906, 138], [1012, 1166, 152]];  // left, right, middle y
  const SLOT = W / 8;
  const order = shuffle([0, 1, 2, 3, 0, 1, 2, 3]);
  return order.map((c, slot) => {
    const [left, right, midY] = drawn[c];
    return {
      c, x: slot * SLOT + random(0, Math.max(0, SLOT - (right - left))) - left,
      y: random(dyLo, dyHi), scale: random(sLo, sHi), cx: (left + right) / 2, midY,
      hidden: random() < 0.2,
    };
  });
}
// --- Birds -------------------------------------------------------------------------
// Sarah's yellow bird (../bus/yellow-bird-anim-8ips), cut down to one strip of
// 8 frames, 176 x 216 each, flapping at 8 frames a second. Now and then one
// to three of them fly across the way the bus drives (right to left, so the
// drawing is flipped to face left), in jumps like the clouds.
// Three kinds of flock: in the sky above the roof (half of them), behind
// the bus at window height, seen through the glass (a quarter), and in
// front of the bus across the windows, bigger and a bit faster because they
// are closer (a quarter).
const BIRD = { frames: 8, w: 176, h: 216, fps: 8, scale: 0.3, speed: 0.05, step: 500 };   // speed: units per ms
const FRONT_BIRD = { scale: 0.42, speed: 0.07 };
// When the view slides along the bus, the birds slide with it, the far ones
// less than the near ones: 1 moves exactly like the bus.
const BIRD_DEPTH = { sky: 0.6, window: 0.85, front: 1 };
// Drawn at half the size of Sarah's 6307-wide canvas: 1.24 times the bus canvas.
const birdPic = DreamAssets.picture(A + "yellow-bird.png", 6307 / 2544 / 2);
let birds = [], nextFlock = 3000;

const screenLeft = () => -viewLeft / k;               // the screen edges, in view units
const screenRight = () => (width - viewLeft) / k;

function moveBirds(now) {
  const top = -viewTop / k + 15;
  if (now > nextFlock) {
    const r = random();
    const kind = r < 0.5 ? "sky" : r < 0.75 ? "window" : "front";
    const front = kind === "front";
    // Sky: between the top of the screen and the roof. Window and front: across the windows.
    const y = kind === "sky" ? random(Math.max(top, -200), 45) : random(130, 300);
    for (let n = 0, many = 1 + Math.floor(random(3)); n < many; n++) {
      birds.push({ kind, start: now + n * random(250, 600), x0: screenRight() + 80 + n * 40 + viewX.at(now) * BIRD_DEPTH[kind],
        y: kind === "sky" ? Math.min(50, y + random(-20, 20)) : y + random(-25, 25),
        phase: random(1000), speed: (front ? FRONT_BIRD.speed : BIRD.speed) * random(0.85, 1.15) });
    }
    nextFlock = now + random(9000, 22000);
  }
  birds = birds.filter(b => b.x0 - (now - b.start) * b.speed - viewX.at(now) * BIRD_DEPTH[b.kind] > screenLeft() - 80);
}

// One kind of bird ("sky", "window" or "front"), in view units moved by (ox, oy).
function drawBirds(ctx, now, kind, ox = 0, oy = 0) {
  if (!birdPic.frames.length) return;
  const birdImg = DreamAssets.frame(birdPic, now);
  const { w, h } = BIRD;
  for (const b of birds) {
    if (b.kind !== kind || now < b.start) continue;
    const sc = kind === "front" ? FRONT_BIRD.scale : BIRD.scale;
    const t = now - b.start + b.phase;
    const f = Math.floor(t / (1000 / BIRD.fps)) % BIRD.frames;
    // They move in jumps, like the clouds: BIRD.step ms between two jumps.
    const jumped = Math.floor((now - b.start) / BIRD.step) * BIRD.step;
    const x = b.x0 - jumped * b.speed - viewX.at(now) * BIRD_DEPTH[kind] + ox;
    const y = b.y + 6 * Math.sin((jumped + b.phase) / 400) + oy;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);                                  // face left, like the bus
    ctx.drawImage(birdImg, f * w, 0, w, h, -w * sc / 2, -h * sc / 2, w * sc, h * sc);
    ctx.restore();
  }
}

// --- The driver ----------------------------------------------------------------------
// Driver.png and Volant.png (the steering wheel) are drawn on a 6307 x 1462
// canvas, the bus canvas at 2.48 times the size. They were cut down to their
// drawings (driver-small.png, wheel-small.png); `at` is where that cut sits
// on the big canvas. The driver sits behind the small front window.
const BIG = W / 6307;
const driverParts = [["driver-small.png", 502, 420], ["wheel-small.png", 494, 672]].map(([src, x, y]) =>
  ({ pic: DreamAssets.picture(A + src, 1 / BIG), x, y }));
function drawDriver(ctx) {
  for (const { pic, x, y } of driverParts) {
    if (!pic.frames.length) continue;
    ctx.drawImage(DreamAssets.frame(pic, millis()), x * BIG, y * BIG, pic.w * BIG, pic.h * BIG);
  }
}

// --- A cloud in front of the bus ---------------------------------------------------
// Every 25 to 50 seconds of driving, one cloud drifts past in front of the
// bus, at the height of the roof and the tops of the windows, in jumps like
// the others (and standing still at the stops, like them).
const FRONT_CLOUD = { speed: 0.035, step: 500, every: [25000, 50000] };   // units per ms of driving
let frontCloud = null, nextFrontCloud = 12000;

function drawFrontCloud(ctx) {
  if (!frontCloud && drive > nextFrontCloud) {
    frontCloud = { c: 1 + Math.floor(random(4)), from: drive, y: random(40, 120), scale: random(0.7, 1) };
  }
  if (!frontCloud) return;
  const s = sprites["cloud" + frontCloud.c];
  const jumped = Math.floor((drive - frontCloud.from) / FRONT_CLOUD.step) * FRONT_CLOUD.step;
  const half = s.w * frontCloud.scale / 2;
  const x = screenLeft() - half + jumped * FRONT_CLOUD.speed;
  if (x - half > screenRight()) {
    frontCloud = null;
    nextFrontCloud = drive + random(...FRONT_CLOUD.every);
    return;
  }
  ctx.save();
  ctx.translate(x, frontCloud.y);
  ctx.scale(frontCloud.scale, frontCloud.scale);
  ctx.translate(-(s.x + s.w / 2), -(s.y + s.h / 2));
  paint(ctx, s);
  ctx.restore();
}

let skyClouds, windowClouds;
function drawCloudStrip(ctx, layout) {
  for (const l of layout) {
    if (l.hidden) continue;
    ctx.save();
    ctx.translate(l.x + l.cx, l.y + l.midY);
    ctx.scale(l.scale, l.scale);
    ctx.translate(-l.cx, -l.midY);
    paint(ctx, sprites["cloud" + (l.c + 1)]);
    ctx.restore();
  }
}

// --- Screen layout --------------------------------------------------------------
// The view (980 x 650 units) is as big as fits, in the middle of the screen.
// The road, the sky and the bus carry on past it to the screen edges.
let k = 1, viewLeft = 0, viewTop = 0;
function layout() {
  const vw = Math.min(width, height * VIEW_W / VIEW_H);
  k = vw / VIEW_W;
  viewLeft = (width - vw) / 2;
  viewTop = (height - VIEW_H * k) / 2;
}
const touchScreen = () => matchMedia("(pointer: coarse)").matches;
const smallScreen = () => matchMedia("(max-height: 500px), (max-width: 700px)").matches;
const portrait = () => touchScreen() && height > width;

// --- Bus motion -------------------------------------------------------------------
// The road, the clouds and the bus's bounce only run while the bus drives:
// they all follow `drive`, which stands still at the stops.
const STOP_PAUSE = 4000;
let drive = 0, lastMillis = 0, stoppedUntil = 0;

// Keyframes of the bounce, 1.7 s: [time, lift (units), tilt (deg)]; and the
// shadow's [time, width scale, height scale, opacity].
const WIGGLE = [[0, 0, 0], [0.2, -3.54, -0.12], [0.45, 1.18, 0.08], [0.7, -2.36, 0.14], [1, 0, 0]];
const SHADOW_KEYS = [[0, 1, 1, 1], [0.2, 0.985, 0.9, 0.85], [0.45, 1.005, 1.03, 1], [0.7, 0.99, 0.93, 0.9], [1, 1, 1, 1]];
function keyframe(keys, t) {
  const p = (t % 1700) / 1700;
  let i = 0;
  while (keys[i + 1][0] < p) i++;
  const [a, b] = [keys[i], keys[i + 1]];
  const e = easeInOut((p - a[0]) / (b[0] - a[0]));
  return a.map((v, n) => v + (b[n] - v) * e).slice(1);
}

// From screen to the view, and from the view to the bus (with its bounce).
function toView(g = window) {
  g.translate(viewLeft, viewTop);
  g.scale(k);
}
function toBus(g, now) {
  toView(g);
  g.translate(-viewX.at(now), BUS_TOP);
  const [lift, tilt] = keyframe(WIGGLE, drive);
  g.translate(0.5 * W, 0.9 * H + lift);
  g.rotate(radians(tilt));
  g.translate(-0.5 * W, -0.9 * H);
}

// --- p5 -------------------------------------------------------------------------
let frost, small, blurWorks, shadowImg, mainCanvas;

function setup() {
  pixelDensity(Math.min(2, displayDensity()));
  createCanvas(windowWidth, windowHeight);
  mainCanvas = drawingContext.canvas;
  frost = createGraphics(width, height);
  small = document.createElement("canvas");
  layout();
  // Real blur where the browser can do it; otherwise shrink and stretch.
  const test = document.createElement("canvas").getContext("2d");
  test.filter = "blur(2px)";
  blurWorks = test.filter === "blur(2px)";
  skyClouds = scatter({ dy: [-35, 25], scale: [0.7, 1.15] });
  windowClouds = scatter({ dy: [-10, 140], scale: [0.8, 1.2] });   // seen through the windows
  shadowImg = makeShadow();
  Promise.all([document.fonts.load("20px Gaegu"), document.fonts.load("bold 20px Gaegu"), DreamAssets.ready]).finally(loadAll);
}

function start() {
  t0 = performance.now();
  lastMillis = millis();
  centreView(0, true);
  meX.set(standX(me.row) - drawnOn[me.colour].stand, 0, true);
  write({ text: `You are ${me.name}, waiting at ${R.STOPS[0]}. Your one thing to do: ${R.YOUR_ACTIONS[me.action]}.`, row: null, mine: true });
  ready = true;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  frost.resizeCanvas(width, height);
  layout();
}

// The bus's shadow on the road, drawn once: soft, dark blue, see-through.
function makeShadow() {
  const s = 0.5;
  const c = document.createElement("canvas");
  c.width = W * s; c.height = H * s;
  const ctx = c.getContext("2d");
  // Draw the shape far off the canvas and keep only its blurred shadow.
  ctx.shadowColor = "rgba(22, 33, 58, 0.45)";
  ctx.shadowBlur = 10 * s;
  ctx.shadowOffsetX = 10000;
  ctx.scale(s, s);
  ctx.translate(-10000 / s, 0);
  ctx.fill(new Path2D(SHADOW));
  return c;
}

function draw() {
  const now = millis();
  background("#7fa8cf");
  if (!ready) { drawLoading(); return; }
  if (portrait()) { drawTurn(); return; }

  // The game moves on.
  const t = clock();
  for (const line of R.tick(ride, t)) {
    centreView(now);
    write(line);
    if (line.text.startsWith("The bus stops")) stoppedUntil = t + STOP_PAUSE * speed;
  }
  centreView(now);
  const stopped = ride.over || t < stoppedUntil;
  if (!stopped) drive += now - lastMillis;
  lastMillis = now;

  drawRoad();
  drawSky();
  moveBirds(now);
  push();
  toView();
  drawBirds(drawingContext, now, "sky");
  pop();
  drawShadow(now);
  drawBus(now);
  push();
  toView();
  drawFrontCloud(drawingContext);
  drawBirds(drawingContext, now, "front");
  pop();
  drawRoute(t);
  drawButtons(now);
}

function drawLoading() {
  fill(255);
  noStroke();
  textFont("Gaegu");
  textStyle(BOLD);
  textAlign(CENTER, CENTER);
  textSize(Math.min(28, width / 20));
  text(failed ? `couldn't load ${failed}` : `the bus is coming… ${loaded} / ${TO_LOAD.length}`, width / 2, height / 2);
}

function drawTurn() {
  fill(255);
  noStroke();
  textFont("Gaegu");
  textStyle(BOLD);
  textAlign(CENTER, CENTER);
  textSize(28);
  textLeading(36);
  text("turn your phone sideways\nto ride the bus", width / 2, height / 2);
}

// The road scrolls right, slow and choppy (6 jumps a second, two tiles a
// minute). Every second tile is flipped so the edges meet. Below the drawing,
// its plain bottom band (under the dashes, y 500 to 590) is repeated down to
// the bottom of the screen, every second band upside down so they meet
// without a line: the same grain all the way, one row of dashes.
const PLAIN_TOP = 500;
function drawRoad() {
  const ctx = drawingContext;
  const s = sprites.road, frame = frameOf(s, millis());
  const band = H - PLAIN_TOP;
  const bottom = (height - viewTop) / k;              // screen bottom, in view units
  push();
  toView();
  // One loop moves two tiles (which looks the same), then starts over.
  const offset = (Math.floor(drive / (60000 / 360)) % 360) * (2 * W / 360);
  for (let n = 0; n < 4; n++) {
    ctx.save();
    ctx.translate(VIEW_W / 2 - 3 * W + n * W + offset, BUS_TOP);
    if (n % 2) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    paint(ctx, s);
    // Bands overlap by a unit so no sky shows between them.
    for (let y = H - 1, m = 0; BUS_TOP + y < bottom; y += band - 1, m++) {
      ctx.save();
      ctx.translate(0, y);
      if (m % 2 === 0) { ctx.translate(0, band); ctx.scale(1, -1); }
      ctx.drawImage(frame, 0, PLAIN_TOP - s.y, s.w, band, s.x, 0, s.w, band);
      ctx.restore();
    }
    ctx.restore();
  }
  pop();
}

// Clouds above the roof, at 70% size, drifting right very slowly in jumps.
function drawSky() {
  const ctx = drawingContext, s = 0.7, tile = W * s;
  push();
  toView();
  const offset = (Math.floor(drive / 500) * (tile / 480)) % tile;
  for (let n = 0; n < 3; n++) {
    ctx.save();
    ctx.translate(VIEW_W / 2 - 2 * tile + n * tile + offset, 4 - 82 * s);
    ctx.scale(s, s);
    drawCloudStrip(ctx, skyClouds);
    ctx.restore();
  }
  pop();
}

// The shadow slides with the bus but doesn't rock: it shrinks and fades as
// the bus bounces up.
function drawShadow(now) {
  const [sx, sy, alpha] = keyframe(SHADOW_KEYS, drive);
  push();
  toView();
  translate(-viewX.at(now), BUS_TOP);
  translate(0.53 * W, 0.9 * H);
  scale(sx, sy);
  translate(-0.53 * W, -0.9 * H);
  drawingContext.globalAlpha = alpha;
  drawingContext.drawImage(shadowImg, 0, 0, W, H);
  pop();
}

function drawBus(now) {
  const ctx = drawingContext;
  push();
  toBus(window, now);

  // Inside: the glass seen from inside, the clouds outside, the bus inside,
  // the riders behind and in front of the front seats.
  paint(ctx, sprites.window);
  ctx.save();
  ctx.beginPath();
  ctx.rect(180, 0, 2500 - 180, H);
  ctx.clip();
  const offset = (Math.floor(drive / 500) * (W / 686)) % W;
  for (let n = 0; n < 3; n++) {
    ctx.save();
    ctx.translate(-2 * W + n * W + offset, 0);
    drawCloudStrip(ctx, windowClouds);
    ctx.restore();
  }
  drawBirds(ctx, now, "window", viewX.at(now), -BUS_TOP);   // outside, seen through the glass
  ctx.restore();
  paint(ctx, sprites.interior);
  const { back, standing, front } = riders(now);
  back.forEach(([s, dx, dy]) => paint(ctx, s, dx, dy));
  standing.forEach(([s, dx, dy]) => paint(ctx, s, dx, dy));
  if (me.where === "bus" && me.lane === R.LANE.standing) {
    meX.set(standX(me.row) - drawnOn[me.colour].stand, now);
    const since = now - meBobAt;
    const bob = since < 600 ? -0.012 * H * Math.sin(Math.PI * (since % 300) / 300) : 0;
    paint(ctx, sprites[FILE[me.colour] + "Standing"], meX.at(now), bob);
  }
  paint(ctx, sprites.seats);
  front.forEach(([s, dx, dy]) => paint(ctx, s, dx, dy));

  // Where the frosted band is on the screen (device pixels).
  const m = ctx.getTransform();
  const a = m.transformPoint(new DOMPoint(0, 85)), b = m.transformPoint(new DOMPoint(W, H - 175));
  pop();

  drawFrost(now, a, b);

  push();
  toBus(window, now);
  // The driver isn't frosted over like the other windows: always in sight,
  // behind a light blue tint of glass.
  drawDriver(ctx);
  noStroke();
  fill(85, 128, 251, 50);
  beginShape();
  FRONT_GLASS.forEach(([px, py]) => vertex(px, py));
  endShape(CLOSE);
  paint(ctx, sprites.coque);
  pop();
}

// Riders on the bus, as [drawing, dx, dy], by layer.
function riders(now) {
  const back = [], standing = [], front = [], here = new Set();
  for (const r of R.onBus(ride)) {
    if (r === me && r.lane === R.LANE.standing) continue;
    if (r.lane === R.LANE.standing) {
      here.add(r.id);
      // A little sideways shuffle per rider, so people waiting together at
      // the door don't stand on top of each other.
      const x = standX(r.row) + ((r.id % 5) - 2) * 14 - drawnOn[r.colour].stand;
      let tw = walkers.get(r.id);
      if (!tw) { tw = new Tween(700, linear, x); walkers.set(r.id, tw); }
      tw.set(x, now);
      const walking = r.target !== null && r.row !== r.target.row;
      const bob = walking ? -0.012 * H * Math.sin(Math.PI * (now % 350) / 350) : 0;
      standing.push([sprites[FILE[r.colour] + "Standing"], tw.at(now), bob]);
      continue;
    }
    const isBack = r.lane === R.LANE.window;
    const s = sprites[FILE[r.colour] + (isBack ? "Sitting" : "SittingFront")];
    const dx = seatX[r.lane][r.row] - drawnOn[r.colour][r.lane];
    (isBack ? back : front).push([s, dx, isBack ? 0 : dropFor(r.colour, r.row)]);
  }
  for (const id of walkers.keys()) if (!here.has(id)) walkers.delete(id);
  return { back, standing, front };
}

// Frosted glass on every window but yours: the band behind it blurred, the
// glass tinted, the story written on it, and a soft-edged hole cut where
// your window is. All on its own layer, then laid over the bus.
function drawFrost(now, a, b) {
  const g = frost, ctx = g.drawingContext;
  g.clear();
  const pd = pixelDensity();
  const [x, y, w, h] = [Math.min(a.x, b.x), a.y, Math.abs(b.x - a.x), b.y - a.y];
  const left = Math.max(0, x), right = Math.min(mainCanvas.width, x + w);
  const top = Math.max(0, y), bottom = Math.min(mainCanvas.height, y + h);
  if (right > left && bottom > top) {
    const [bx, by, bw, bh] = [left, top, right - left, bottom - top];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();
    if (blurWorks) {
      ctx.filter = `blur(${4 * pd}px)`;
      ctx.drawImage(mainCanvas, bx, by, bw, bh, bx, by, bw, bh);
      ctx.filter = "none";
    } else {
      const f = 1 / (3 * pd);
      small.width = Math.max(1, Math.round(bw * f));
      small.height = Math.max(1, Math.round(bh * f));
      const sc = small.getContext("2d");
      sc.imageSmoothingQuality = "high";
      sc.drawImage(mainCanvas, bx, by, bw, bh, 0, 0, small.width, small.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(small, bx, by, bw, bh);
    }
    ctx.restore();
  }

  g.push();
  toBus(g, now);
  // Glass: Window, half see-through, cut at the pillar behind the small
  // front window; the front window gets a flat patch of the same blue.
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.rect(320, 0, W - 320, H);
  ctx.clip();
  paint(ctx, sprites.window);
  ctx.restore();
  g.noStroke();
  g.fill(85, 128, 251, 128);
  g.beginShape();
  FRONT_GLASS.forEach(([px, py]) => g.vertex(px, py));
  g.endShape(CLOSE);

  drawLogs(g);

  // The hole: fully clear inside your window, fading out at its edges.
  const l = holeL.at(now), r = holeR.at(now);
  const stop = v => Math.min(1, Math.max(0, v / W));
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  const s1 = stop(l - 0.014 * W), s2 = Math.max(s1, stop(l + 0.006 * W));
  const s3 = Math.max(s2, stop(r - 0.02 * W)), s4 = Math.max(s3, stop(r));
  grad.addColorStop(s1, "rgba(0,0,0,0)");
  grad.addColorStop(s2, "rgba(0,0,0,1)");
  grad.addColorStop(s3, "rgba(0,0,0,1)");
  grad.addColorStop(s4, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = grad;
  ctx.fillRect(0, -H, W, 3 * H);
  ctx.globalCompositeOperation = "source-over";
  g.pop();

  image(g, 0, 0, width, height);
}

// The route above the bus: four stops, the ones passed filled in, and a
// marker for the bus.
function drawRoute(t) {
  const p = R.progress(ride, t);
  const n = Math.floor(p);
  const xs = STOP_RINGS.map(s => s[0]);
  const mx = n >= xs.length - 1 ? xs.at(-1) : xs[n] + (xs[n + 1] - xs[n]) * (p - n);
  push();
  toView();
  const w = 0.48 * VIEW_W, s = w / 1920;
  translate(VIEW_W / 2 - w / 2, 0.006 * VIEW_W);
  scale(s);
  translate(-40, -50);
  stroke(INK);
  strokeCap(ROUND);
  strokeJoin(ROUND);
  strokeWeight(16);
  noFill();
  drawingContext.stroke(new Path2D(ROUTE));
  strokeWeight(14);
  STOP_RINGS.forEach(([cx, cy, rx, ry, deg], i) => {
    fill(i < ride.nextStop || ride.over ? BLUE : PAPER);
    push();
    translate(cx, cy);
    rotate(radians(deg));
    ellipse(0, 0, 2 * rx, 2 * ry);
    pop();
  });
  fill(BLUE);
  strokeWeight(10);
  circle(mx, 140, 52);
  pop();
}

// --- Buttons ------------------------------------------------------------------
// Drawn in the view, in the hand-drawn style of the bus: wobbly corners,
// grey outline. The action button under your window; on touch screens,
// walking buttons at either end.
let buttons = [];
let pressed = null, pressedAt = -1e9;
const cqw = VIEW_W / 100;

function drawButtons(now) {
  const touch = touchScreen();
  const label = ride.over ? "ride again" : R.YOUR_ACTIONS[me.action];
  const enabled = ride.over || me.where === "bus";
  const size = (touch ? 3 : 2.4) * cqw;
  textFont("Gaegu");
  textStyle(BOLD);
  textSize(size);
  const w = textWidth(label) + 4.8 * cqw, h = size + 1 * cqw;
  buttons = [{ id: "action", x: VIEW_W / 2 - w / 2, y: 0.745 * VIEW_H, w, h, label, size, enabled, tilt: -1, do: pressAction }];
  if (touch) {
    const side = 5.5 * cqw, y = 0.725 * VIEW_H;
    buttons.push({ id: "front", x: 3 * cqw, y, w: side, h: side, label: "‹", size: 4 * cqw, enabled: true, tilt: -3, do: () => walk(-1) });
    buttons.push({ id: "back", x: VIEW_W - 3 * cqw - side, y, w: side, h: side, label: "›", size: 4 * cqw, enabled: true, tilt: 2, do: () => walk(+1) });
  }
  const [ux, uy] = [(mouseX - viewLeft) / k, (mouseY - viewTop) / k];
  let hovering = false;
  push();
  toView();
  for (const b of buttons) {
    const hover = !touch && b.enabled && inside(b, ux, uy);
    hovering ||= hover;
    const down = pressed === b.id && now - pressedAt < 150;
    push();
    translate(b.x + b.w / 2, b.y + b.h / 2);
    rotate(radians(hover && b.id === "action" ? 1 : b.enabled ? b.tilt : 0));
    scale(down ? 0.94 : hover ? 1.04 : 1);
    stroke(INK);
    strokeWeight(0.35 * cqw);
    fill(PAPER);
    rect(-b.w / 2, -b.h / 2, b.w, b.h, 2.2 * cqw, 0.8 * cqw, 2 * cqw, 0.9 * cqw);
    noStroke();
    fill(b.enabled ? BLUE : GREY_BLUE);
    textSize(b.size);
    textAlign(CENTER, CENTER);
    text(b.label, 0, -0.1 * b.size);
    pop();
  }
  pop();
  cursor(hovering ? HAND : ARROW);
}

const inside = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

function pressAt(px, py) {
  if (!ready || portrait()) return;
  const [x, y] = [(px - viewLeft) / k, (py - viewTop) / k];
  const b = buttons.find(b => b.enabled && inside(b, x, y));
  if (!b) return;
  pressed = b.id;
  pressedAt = millis();
  b.do();
}

function pressAction() {
  if (ride.over) { location.reload(); return; }
  R.act(ride, clock()).forEach(write);
}

// Walk one row: arrow keys on a computer, the ‹ › buttons on a phone.
function walk(dir) {
  if (!ready || me.where !== "bus") return;
  R.move(ride, dir, clock());
  meBobAt = millis();
}

function keyPressed() {
  if (keyCode === LEFT_ARROW) { walk(-1); return false; }
  if (keyCode === RIGHT_ARROW) { walk(+1); return false; }
}

// A tap is handled as a touch; the mouse press a phone fakes after it is ignored.
let lastTouch = -1e9;
function touchStarted() {
  lastTouch = millis();
  const t = touches[touches.length - 1];
  if (t) pressAt(t.x, t.y);
  return false;
}
function mousePressed() {
  if (millis() - lastTouch < 800) return;
  pressAt(mouseX, mouseY);
}
