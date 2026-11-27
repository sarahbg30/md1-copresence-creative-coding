// 3steps 2gether, drawn with p5.js.
//
// The rules come from rules.js (BusRules). The drawings come from
// ../resized-assets/, without the filter: dreamcore-assets.js adds it while
// loading. Everything is painted on one canvas, every frame.
//
// Every drawing shares one 2544 x 590 canvas ("bus units"). We look at a
// 980 x 650 slice of it (the view), with the bus 60 units down to leave room
// for the route.

const R = BusRules;
const A = "../resized-assets/";            // where the drawings live: cut to their edges (positions.js says where each sits)

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
// ?speed=40 makes the ride go 40 times faster, for testing (on your own:
// the shared clock below is only used at normal speed).
const speed = Number(new URLSearchParams(location.search).get("speed")) || 1;
let t0 = 0;
const clock = () => (performance.now() - t0) * speed;

// One bus for everyone. It never stops running: it drives Geneva's tpg lines
// 6, 10 and 22 one after the other (real stops, from the 2025 timetables),
// then starts again, on the same clock for everyone (the time of day,
// counted from 1970). When you arrive you wait for the next stop it calls at
// (at least CATCH_BY away, so your card has time to come out, and with your
// three stops on the same line), get on there and ride three stops. Stops
// are numbered from 1970 too, so everyone agrees on them (boardStop). The
// clock is negative while you wait.
const LIVE = speed === 1;
const LINES = {
  6: ["Vernier-Village", "Vernier-Marché", "Vernier-École", "Champ-Claude", "Gare de Vernier", "De-Sauvage",
      "Bois-des-Frères", "Châtelaine", "Les Ouches", "Guye", "Charmilles", "Dôle", "Prairie", "Gare Cornavin",
      "Chantepoulet", "Mont-Blanc", "Métropole", "Rive", "Place des Eaux-Vives", "Rue du Lac", "Vollandes",
      "Merle-d'Aubigné", "Parc Plage Eaux-Vives", "Genève-Plage"],
  10: ["Rive", "Place des Eaux-Vives", "Métropole", "Molard", "Jonction", "Cirque", "Théâtre", "Bel-Air",
       "Coutance", "Gare Cornavin", "Prairie", "Dôle", "Charmilles", "Guye", "Franchises", "Bouchet",
       "Balexert-Pailly", "Avanchets-Casaï", "De-Joinville", "Aéroport Tour-Contrôle", "Aéroport WTC", "Aéroport Terminal"],
  22: ["Jardin Botanique", "Gare de Sécheron", "Nations", "Appia", "OMS-BIT", "Morillons", "Le Pommier", "Sonnex",
       "Maison des Parlements", "Tourelle", "Petit-Saconnex", "Moillebeau", "Trembley", "Mervelet",
       "Collège Rousseau", "Bouchet", "Franchises", "Les Ouches", "Châtelaine", "Avenue de l'Ain", "Chemin du Bac",
       "Bossons", "Les Esserts", "Pré-Monnard", "Lancy Piscine", "Palettes", "Pontets", "Gare de Lancy-Bachet",
       "Stade de Genève", "Tours", "Rondeau"],
};
const LINE_STOPS = Object.entries(LINES).flatMap(([line, stops]) => stops.map(name => ({ line, name })));
// From each stop to the next: 45 s to 110 s, the same for everyone.
const LINE_LEGS = LINE_STOPS.map((_, i) => 45000 + ((i * 7919) % 14) * 5000);
const LINE_AT = LINE_LEGS.reduce((at, leg) => [...at, at.at(-1) + leg], [0]);   // LINE_AT[i]: stop i, from the start of a round
const LINE_LOOP = LINE_AT.pop();
const CATCH_BY = 12000;
const routeStop = n => LINE_STOPS[n % LINE_STOPS.length];
const routeStopAt = n => Math.floor(n / LINE_STOPS.length) * LINE_LOOP + LINE_AT[n % LINE_STOPS.length];   // Date.now() time of stop n
let boardStop = 0;                       // the stop where you get on, numbered from 1970
let busLine = null;                      // the line you ride: "6", "10" or "22"
function joinLoop() {
  const now = Date.now();
  let n = Math.floor(now / LINE_LOOP) * LINE_STOPS.length;
  while (routeStopAt(n) - now < CATCH_BY || routeStop(n).line !== routeStop(n + 3).line) n++;
  boardStop = n;
  busLine = routeStop(n).line;
  ride.stops = [0, 1, 2, 3].map(i => routeStop(n + i).name);
  ride.legs = [0, 1, 2].map(i => LINE_LEGS[(n + i) % LINE_STOPS.length]);
  t0 = performance.now() - (now - (routeStopAt(n) - R.FIRST_STOP_AT));
}

// ?font=Special+Elite tries another Google font for all the text (Gaegu,
// a round handwritten face, by default; it's loaded in index.html).
const FONT = new URLSearchParams(location.search).get("font") || "Gaegu";
if (FONT !== "Gaegu") {
  // Plain, and with a bold too (some fonts have no bold: that one just fails).
  const fam = encodeURIComponent(FONT).replace(/%20/g, "+");
  for (const w of ["", ":wght@400;700"]) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${fam}${w}&display=swap`;
    document.head.appendChild(link);
  }
}

// Only real people ride: no fake riders. The others are added from live.js.
const ride = R.createRide({ now: 0, fakes: false });
const me = R.you(ride);
// You start at the bus stop: 10 s of the stop, then 10 s with your card out, then a straight cut to the bus. The rules say 2 to 3 minutes: 120000 + Math.random() * 60000.
// rules.js has it after 4 s, for the other prototypes.
ride.nextStopAt = 20000;

// --- Loading the drawings ------------------------------------------------------
// Every drawing fills a whole 2544 x 590 canvas, which is a lot of memory
// for 18 drawings. So each one is loaded on its own, cut down
// to the box its drawing actually fills, and the full frames are let go.
const sprites = {};
// The "naked" drawings (../bus/naked/, no filter baked in), one picture each;
// dreamcore-assets.js gives each one Sarah's dreamcore filter while loading.
const RIDE = "bus-ride/", STOP = "bus-stop/", OTHER = "background-assets/";   // resized-assets is sorted into folders
const TO_LOAD = [
  ["window", RIDE + "Window.png"], ["interior", RIDE + "InteriorBus.png"], ["seats", RIDE + "FrontSeats.png"],
  ["coque", RIDE + "BusCoque.png"], ["road", OTHER + "road.png"],
  ["cloud1", OTHER + "cloud1.png"], ["cloud2", OTHER + "cloud2.png"], ["cloud3", OTHER + "cloud3.png"], ["cloud4", OTHER + "cloud4.png"],
  ...["Blue", "Brown", "Orange"].flatMap(c => [[c + "Sitting", RIDE + c + "Sitting.png"], [c + "SittingFront", RIDE + c + "SittingFront.png"], [c + "Standing", RIDE + c + "Standing.png"]]),
  // The bus stop: shelter, sidewalk, and someone of each colour on the bench.
  ["StopShelter", STOP + "StopShelter.png"], ["StopGround", STOP + "StopGround.png"],
  ...["Blue", "Brown", "Orange"].map(c => [c + "Stop", STOP + c + "Stop.png"]),
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
        const [px, py] = (window.ASSET_POS || {})[src.split("/").pop()] || [0, 0];   // back where it sat on the full canvas
        s.x += px; s.y += py;
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
    await new Promise(r => setTimeout(r, 0));   // a short break, so the page can paint
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
// Everything (actions, the stops, what happens between people) on the window
// to the right of yours; at the very back of the bus, on the one to its left.
const KEEP = 9;
const logs = { actions: [], mixes: [] };
let fresh = null;                          // the newest line fades in
const pane = n => {
  const left = windows[n];
  const l = left + 30, r = (windows[n + 1] ?? left + 302) - 32 - 30;
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

// How each kind of line looks, from loudest to quietest: the stop as a
// heading, your own lines, what others do, then who gets on and off. All in
// the same ink; the names keep their person's colour.
const INK_TEXT = "#1C2B1C";   // the text's ink, almost black with a little green
const LINE_STYLE = {
  heading: { size: 1.3, bold: true, colour: INK_TEXT },    // "The bus stops at …"
  mine:    { size: 1.05, bold: true, colour: INK_TEXT },   // what you did
  act:     { size: 1, bold: false, colour: INK_TEXT },     // what the others do
  info:    { size: 0.85, bold: false, colour: INK_TEXT },  // who gets on and off, smaller
};
// Names in the colour of the person.
const NAME_COLOUR = { blue: "#7fb2ff", orange: "#ff8c26", brown: "#ffbf7a" };
function styleOf(line) {
  if (line.mine) return LINE_STYLE.mine;
  if (line.kind === "act") return LINE_STYLE.act;
  if (/^The bus stops|^End of the line/.test(line.text)) return LINE_STYLE.heading;
  return LINE_STYLE.info;
}
// Names come in capitals from the rules; they're shown as "Lemon". In the
// window text each one is marked with an invisible character first, so only
// real names get coloured (not "Plum" in "Plum Lane").
const niceName = name => name[0] + name.slice(1).toLowerCase();
const MARK = "\u200b";
const riderNamed = word => ride.riders.find(r => r.name === word.replace(/[^A-Za-z]/g, "").toUpperCase());
const niceText = text => text.replace(/\b[A-Z]{2,}\b/g, w => riderNamed(w) ? MARK + niceName(w) : w);
function nameColour(word) {
  if (!word.startsWith(MARK)) return null;
  const r = riderNamed(word);
  if (!r) return null;
  return r === me ? MY_NAME_FILL : NAME_FILL;
}

// Lines stack from the bottom of the pane; only whole lines that fit are shown.
function drawPane(g, box, log) {
  const base = smallScreen() ? 0.0095 * W : 0.0075 * W;
  const gap = 0.002 * W;
  const ctx = g.drawingContext;
  g.textFont(FONT);
  g.textAlign(LEFT, TOP);
  g.noStroke();
  let bottom = box.y + box.h;
  for (let n = log.length - 1; n >= 0; n--) {
    const line = log[n], st = styleOf(line), size = base * st.size, lead = size * 1.12;
    g.textSize(size);
    g.textStyle(st.bold ? BOLD : NORMAL);
    const rows = wrap(g, niceText(line.text), box.w);
    const extra = st === LINE_STYLE.heading ? gap * 2 : 0;   // room above a heading
    const top = bottom - rows.length * lead;
    if (top < box.y && n < log.length - 1) break;
    const fade = line === fresh ? 1 - Math.pow(1 - Math.min(1, (millis() - line.at) / 1200), 2) : 1;
    const space = g.textWidth(" ");
    rows.forEach((row, k) => {
      let x = box.x;
      for (const word of row.split(" ")) {
        // Names pink in a black outline, like over people's heads.
        const nameFill = nameColour(word), isName = nameFill !== null;
        const c = color(isName ? nameFill : st.colour);
        c.setAlpha(255 * fade);
        if (isName) {
          const o = color(NAME_OUTLINE);
          o.setAlpha(255 * fade);
          g.stroke(o);
          g.strokeWeight(size * 0.16);
          g.strokeJoin(ROUND);
        }
        g.fill(c);
        g.text(word, x, top + k * lead);
        g.noStroke();
        x += g.textWidth(word) + space;
      }
    });
    bottom = top - gap - extra;
  }
}

function drawLogs(g) {
  const i = shownWindow, last = windows.length - 1;
  const all = [...logs.actions, ...logs.mixes].sort((a, b) => a.at - b.at).slice(-KEEP);
  drawPane(g, pane(i === last ? i - 1 : i + 1), all);
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
// At the stop, with nothing moving, the birds fly this much faster.
const BIRD_AT_STOP = 4;
const BIRD = { frames: 8, w: 176, h: 216, fps: 8, scale: 0.3, speed: 0.05, step: 500 };   // speed: units per ms
const FRONT_BIRD = { scale: 0.42, speed: 0.07 };
// When the view slides along the bus, the birds slide with it, the far ones
// less than the near ones: 1 moves exactly like the bus.
const BIRD_DEPTH = { sky: 0.6, window: 0.85, front: 1 };
// Drawn at half the size of Sarah's 6307-wide canvas: 1.24 times the bus canvas.
const birdPic = DreamAssets.picture(A + "background-assets/yellow-bird.png", 6307 / 2544 / 2);
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
        phase: random(1000), speed: (front ? FRONT_BIRD.speed : BIRD.speed) * random(0.85, 1.15) * (atStop() ? BIRD_AT_STOP : 1) });
    }
    nextFlock = now + random(9000, 22000) / (atStop() ? 2 : 1);
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
// drawings (driver-small.png, volant-driver.png); `at` is where that cut sits
// on the big canvas. The driver sits behind the small front window.
const BIG = W / 6307;
const driverParts = [["bus-ride/driver-small.png", 502, 420], ["bus-ride/volant-driver.png", 494, 672]].map(([src, x, y]) =>
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
  if (!frontCloud && sky > nextFrontCloud) {
    frontCloud = { c: 1 + Math.floor(random(4)), from: sky, y: random(40, 120), scale: random(0.7, 1) };
  }
  if (!frontCloud) return;
  const s = sprites["cloud" + frontCloud.c];
  const jumped = Math.floor((sky - frontCloud.from) / FRONT_CLOUD.step) * FRONT_CLOUD.step;
  const half = s.w * frontCloud.scale / 2;
  const x = screenLeft() - half + jumped * FRONT_CLOUD.speed;
  if (x - half > screenRight()) {
    frontCloud = null;
    nextFrontCloud = sky + random(...FRONT_CLOUD.every);
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
// The clouds follow `sky`: like `drive`, but barely moving while you wait at the stop.
let sky = 0;
const SKY_AT_STOP = 0.3;
const atStop = () => me.where === "queue" && !ride.over;

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
  // Wait until the loading bird is on screen and flapping before the heavy
  // work starts: an animation that never got shown once can't start later.
  const birdPng = new Image();
  birdPng.src = A + "background-assets/yellow-bird.png";
  const birdShown = birdPng.decode().catch(() => {})
    .then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 300)))));
  Promise.all([document.fonts.load(`20px "${FONT}"`), document.fonts.load(`bold 20px "${FONT}"`), DreamAssets.ready, birdShown]).finally(loadAll);
}

// The bird flies for at least this long, even when everything loads fast.
const MIN_LOADING = 2000;
function start() {
  const left = MIN_LOADING - millis();
  if (left > 0) { setTimeout(start, left); return; }
  document.getElementById("loading-bird")?.remove();
  cardPrintPicture();   // ready before the card comes out
  routePicture(0); markerPicture();   // and the route map, before the bus
  t0 = performance.now();
  if (LIVE) joinLoop();
  lastMillis = millis();
  centreView(0, true);
  meX.set(standX(me.row) - drawnOn[me.colour].stand, 0, true);
  write({ text: `You are ${me.name}, waiting at ${ride.stops[0]}${busLine ? ` for the ${busLine}` : ""}. Your one thing to do: ${R.YOUR_ACTIONS[me.action]}.`, row: null, mine: true });
  write({ text: `You ride three stops and get off at ${ride.stops.at(-1)}.`, row: null, mine: true });
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
  background("#87a4ad");
  if (!ready) { drawLoading(); return; }
  if (portrait()) { drawTurn(); return; }

  // The game moves on.
  const t = clock();
  syncPeople();
  for (const line of R.tick(ride, t)) {
    centreView(now);
    write(line);
    if (line.text.startsWith("The bus stops")) { stoppedUntil = t + STOP_PAUSE * speed; }
  }
  centreView(now);
  const stopped = ride.over || (!atStop() && t < stoppedUntil);   // at the bus stop the sky always drifts
  if (!stopped) drive += now - lastMillis;
  if (!stopped) sky += (now - lastMillis) * (atStop() ? SKY_AT_STOP : 1);
  lastMillis = now;

  if (atStop()) { drawStop(now, t); return; }

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
  drawRoute(t);   // the bus's way, above it: stops passed filled in
  drawButtons(now);
}

// --- The bus stop -------------------------------------------------------------------
// While you wait in the line, the view is the stop: the shelter on its
// sidewalk, the first three people of the line on the bench (you always among
// them) with their names, and on the shelter's blue panel the stop, the time
// until the bus and your one thing to do. In the last seconds the bus drives
// in from the right; if it leaves without you (full), it drives off to the left.
// The stop drawings share the bus canvas (2544 x 590). They are seen from
// further away than the bus: STOP_SCALE of the size, the shelter's middle
// (STOP_CX) in the middle of the view, the canvas bottom on the view bottom.
// The road runs below the sidewalk: the whole stop is lifted by STOP_LIFT
// (stop units) to make room, and the road drawn ROAD_DOWN lower than on its
// own canvas, its top just under the sidewalk.
const STOP_LIFT = 105, ROAD_DOWN = 150;
const STOP_SCALE = 0.9, STOP_CX = 1342;   // 1342: the middle of the shelter (818 to 1867)
// Where the one who doesn't fit on the bench stands, under the shelter: x is
// the centre of their feet, feet a little below the top of the sidewalk there
// (543). And how much bigger than on the bus (the bench people are bigger too).
const STAND = [{ x: 960, feet: 556 }], STAND_SCALE = 1.21;
const BENCH = [1443, 1550, 1664];            // left edge of each seat on the bench
const PANEL = { x: 1245, y: 300, w: 190 };   // middle and width of the blue panel
function toStop(g = window) {
  toView(g);
  g.translate(VIEW_W / 2, VIEW_H);
  g.scale(STOP_SCALE);
  g.translate(-STOP_CX, -H - STOP_LIFT);
}

function benchRiders() {
  // Only the people waiting at the same stop as you.
  const line = ride.queue.map(id => ride.riders[id]).filter(r => (r.boardAt ?? 0) === 0);
  const bench = line.slice(0, 3);
  if (!bench.includes(me)) bench[bench.length - 1] = me;
  return bench;
}

function drawStop(now, t) {
  const ctx = drawingContext;
  drawSky();
  moveBirds(now);
  push();
  toView();
  drawBirds(ctx, now, "sky");
  pop();
  push();
  toStop();
  // The road below the sidewalk, standing still, across the whole screen
  // (every second tile flipped so the edges meet, like on the bus).
  const road = sprites.road;
  const stopX = sx => STOP_CX + ((sx - viewLeft) / k - VIEW_W / 2) / STOP_SCALE;
  for (let n = Math.floor(stopX(0) / W) - 1; n * W < stopX(width); n++) {
    ctx.save();
    ctx.translate(n * W, ROAD_DOWN);
    if (n % 2) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    paint(ctx, road);
    // Its plain bottom band (under the dashes) again below it, down to the
    // bottom of the screen: every second one upside down.
    const band = H - PLAIN_TOP, frame = frameOf(road, now);
    const bottom = H + STOP_LIFT + ((height - viewTop) / k - VIEW_H) / STOP_SCALE - ROAD_DOWN;
    for (let y = H - 1, m = 0; y < bottom; y += band - 1, m++) {
      ctx.save();
      ctx.translate(0, y);
      if (m % 2 === 0) { ctx.translate(0, band); ctx.scale(1, -1); }
      ctx.drawImage(frame, 0, PLAIN_TOP - road.y, road.w, band, road.x, 0, road.w, band);
      ctx.restore();
    }
    ctx.restore();
  }
  paint(ctx, sprites.StopGround);
  paint(ctx, sprites.StopShelter);
  // Everyone at the stop, left to right, with where their head is, so the ones
  // next to you can show their names.
  const people = [];
  const bench = benchRiders();
  ride.queue.map(id => ride.riders[id]).filter(r => !bench.includes(r)).slice(0, STAND.length).forEach((r, j) => {
    const s = sprites[FILE[r.colour] + "Standing"];
    ctx.save();
    ctx.translate(STAND[j].x, STAND[j].feet);
    ctx.scale(STAND_SCALE, STAND_SCALE);
    ctx.drawImage(frameOf(s, now), -s.w / 2, -s.h, s.w, s.h);
    ctx.restore();
    people.push({ r, x: STAND[j].x, y: STAND[j].feet - s.h * STAND_SCALE });
  });
  bench.forEach((r, j) => {
    const s = sprites[FILE[r.colour] + "Stop"];
    paint(ctx, s, BENCH[j] - s.x);
    people.push({ r, x: BENCH[j] + s.w / 2, y: s.y });
  });
  // Strangers at the stop: no names yet, and yours is only a question mark.
  people.forEach(p => { p.near = p.r === me; p.label = "?"; });
  drawNames(ctx, now, people, 34);
  pop();

  push();
  toView();
  drawFrontCloud(ctx);
  drawBirds(ctx, now, "front");
  pop();
  drawCard(ctx, now, t);
}

// --- The bus card --------------------------------------------------------------------
// When the bus is coming, you take out your bus card: it shows in the middle
// of the screen for the last CARD_TIME of the wait, with the little birds
// around its edge flapping (3 drawings, card-bird-anim in naked assets).
// card-small.png and card-birds-*.png are cut from the 6307 x 1462 drawings,
// all to the same box, so they sit on top of each other.
const CARD_TIME = 10000, CARD_FADE = 250, CARD_BIRD_FPS = 4;
const cardPic = DreamAssets.picture(A + "bus-pass/card-small.png", 1);
const cardText = DreamAssets.picture(A + "bus-pass/card-text.png", 1);   // exemple-text-manuscrit: name, dates, place, signature
// The birds around the card: one sheet of 3 frames side by side, each cut to
// CARD_BIRD_BOX ([x, y, w, h]) on the 1200 x 787 card.
const cardBirds = DreamAssets.picture(A + "bus-pass/card-birds-sheet.png", 1);
const CARD_BIRD_FRAMES = 3, CARD_BIRD_BOX = [57, 53, 1086, 687];
// The stop behind the card goes blurry while the card is out (`a`: 0 to 1).
// Where the browser has no blur filter, it's shrunk and stretched instead.
const CARD_BLUR = 8;   // px
const cardBg = document.createElement("canvas");
function blurBehindCard(ctx, a) {
  const c = mainCanvas, pd = pixelDensity();
  if (cardBg.width !== c.width || cardBg.height !== c.height) { cardBg.width = c.width; cardBg.height = c.height; }
  const g = cardBg.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
  if (blurWorks) {
    g.filter = `blur(${CARD_BLUR * pd}px)`;
    g.drawImage(c, 0, 0);
    g.filter = "none";
  } else {
    const f = 1 / (CARD_BLUR * pd);
    small.width = Math.max(1, Math.round(c.width * f));
    small.height = Math.max(1, Math.round(c.height * f));
    small.getContext("2d").drawImage(c, 0, 0, small.width, small.height);
    g.imageSmoothingEnabled = true;
    g.drawImage(small, 0, 0, c.width, c.height);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = a;
  ctx.drawImage(cardBg, 0, 0);
  ctx.restore();
}
// The printed part of the card, in a typewriter face like an old travel
// licence: titles, the labels on dotted lines (the handwriting sits on them),
// two short paragraphs and the captions. Laid out on the 1200 x 787
// card-small.png, drawn once, through the filter.
const CARD_FONT = "Courier Prime", CARD_INK = "#3b3330";
const CARD_ROWS = [["Issued to", 210], ["Date of birth", 252], ["Place of issue", 298], ["Date of issue", 343]];
// A short order for each action, under the action as a heading.
const CARD_ORDERS = {
  sun: "Look at the sun.", rain: "Trace one down the glass.", read: "Read something.",
  think: "Think hard.", bar: "Grab a bar.", wave: "Wave at someone.", photo: "Take a picture.",
  aura: "Stare someone down.", nails: "Clip your nails.",
};
// Each paragraph: [title, text, a bold last line]. The first one is the
// action you're given for the ride.
const CARD_PARAS = () => [
  [R.YOUR_ACTIONS[me.action].toUpperCase(), CARD_ORDERS[me.action]],
  ["IMPORTANT", "The holder of this licence takes three steps together with strangers before getting off, unless the bus says otherwise."],
];
let cardPrint = null;
function cardPrintPicture() {
  if (cardPrint) return cardPrint;
  const fonts = [`bold 15px "${CARD_FONT}"`, `15px "${CARD_FONT}"`, `italic 12px "${CARD_FONT}"`];
  if (!fonts.every(f => document.fonts.check(f))) { fonts.forEach(f => document.fonts.load(f)); return null; }
  const c = document.createElement("canvas");
  c.width = 1200; c.height = 787;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.fillStyle = CARD_INK;
  const L = 605, R = 1035, MID = (L + R) / 2;
  const font = (style, px) => { g.font = `${style} ${px}px "${CARD_FONT}"`; };
  const dots = (x0, x1, y) => { for (let x = x0; x < x1; x += 6) g.fillRect(x, y - 1.5, 2, 2); };
  g.textAlign = "center";
  font("bold", 17); g.fillText("PERMANENT LICENSE OF TRAVEL", MID, 158);
  font("bold", 15); g.fillText("NO. 3S2G-2026", MID, 180);
  g.textAlign = "left";
  font("", 14);
  for (const [label, y] of CARD_ROWS) {
    g.fillText(label, L, y);
    dots(L + g.measureText(label).width + 6, R, y);
  }
  let y = 390;
  const lines = (text, style, px = 13) => {
    font(style, px);
    let line = "";
    for (const word of text.split(" ")) {
      const next = line ? line + " " + word : word;
      if (g.measureText(next).width > R - L && line) { g.fillText(line, L, y); y += px + 4; line = word; }
      else line = next;
    }
    g.fillText(line, L, y);
  };
  CARD_PARAS().forEach(([title, text, bold], i) => {
    const big = i === 0;                  // your action, bigger
    g.textAlign = "center";
    let px = big ? 22 : 14;
    font("bold", px);
    while (g.measureText(title).width > R - L && px > 12) font("bold", --px);   // long actions shrink to fit
    g.fillText(title, MID, y);
    y += big ? 32 : 22;
    if (big) { font("", 20); g.fillText(text, MID, y); y += 46; return; }
    g.textAlign = "left";
    lines(text, "");
    if (bold) { y += 19; lines(bold, "bold"); }
    y += 30;
  });
  dots(L, R, 678);
  g.textAlign = "center";
  font("italic", 12);
  g.fillText("Signature of authorized traveler", MID, 696);
  g.fillText("Photograph of authorized traveler", 345, 655);
  let frames = [c];
  if (DreamAssets.on) frames = DreamAssets.apply(g.getImageData(0, 0, c.width, c.height), 1, true).map(d => {
    const f = document.createElement("canvas");
    f.width = c.width; f.height = c.height;
    f.getContext("2d").putImageData(d, 0, 0);
    return f;
  });
  return cardPrint = { frames };
}
function drawCard(ctx, now, t) {
  const left = ride.nextStopAt - t;
  if (left > CARD_TIME || !cardPic.frames.length) return;
  const shown = (CARD_TIME - left) / speed;          // ms since it came out
  const a = easeInOut(Math.min(1, shown / CARD_FADE));
  const w = Math.min(width * 0.62, height * 0.75 * cardPic.w / cardPic.h), h = w * cardPic.h / cardPic.w;
  const x = (width - w) / 2, y = (height - h) / 2 + 20 * (1 - a);   // comes up a little
  blurBehindCard(ctx, a);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.drawImage(DreamAssets.frame(cardPic, now), x, y, w, h);
  const print = cardPrintPicture();
  if (print) ctx.drawImage(DreamAssets.frame(print, now), x, y, w, h);
  if (cardText.frames.length) ctx.drawImage(DreamAssets.frame(cardText, now), x, y, w, h);
  if (cardBirds.frames.length) {
    const i = Math.floor(now / (1000 / CARD_BIRD_FPS)) % CARD_BIRD_FRAMES;
    const [bx, by, bw, bh] = CARD_BIRD_BOX, sx = w / cardPic.w;
    ctx.drawImage(DreamAssets.frame(cardBirds, now), i * bw, 0, bw, bh, x + bx * sx, y + by * sx, bw * sx, bh * sx);
  }
  ctx.restore();
}

// While the drawings load, the yellow bird flaps in index.html (#loading-bird),
// where it keeps moving even while the filter keeps the page busy. Here only
// a note if something couldn't load.
function drawLoading() {
  if (!failed) return;
  document.getElementById("loading-bird")?.remove();
  fill(255);
  noStroke();
  textFont(FONT);
  textAlign(CENTER, CENTER);
  textSize(Math.min(28, width / 20));
  text(`couldn't load ${failed}`, width / 2, height / 2);
}

function drawTurn() {
  fill(255);
  noStroke();
  textFont(FONT);
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
function drawRoad(still = false, up = 0) {
  const ctx = drawingContext;
  const s = sprites.road, frame = frameOf(s, millis());
  const band = H - PLAIN_TOP;
  const bottom = (height - viewTop) / k;              // screen bottom, in view units
  push();
  toView();
  // One loop moves two tiles (which looks the same), then starts over.
  const offset = still ? 0 : (Math.floor(drive / (60000 / 360)) % 360) * (2 * W / 360);
  for (let n = 0; n < 4; n++) {
    ctx.save();
    ctx.translate(VIEW_W / 2 - 3 * W + n * W + offset, BUS_TOP - up);
    if (n % 2) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    paint(ctx, s);
    // Bands overlap by a unit so no sky shows between them.
    for (let y = H - 1, m = 0; BUS_TOP - up + y < bottom; y += band - 1, m++) {
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
  const offset = (Math.floor(sky / 500) * (tile / 480)) % tile;
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
  // Names of the people within a row of you, over their heads (drawn last).
  const near = [...back, ...standing, ...front].map(([s, dx, dy, r]) => ({ r, x: s.x + dx + s.w / 2, y: s.y + dy,
    near: me.where === "bus" && Math.abs(r.row - me.row) <= NEAR_ROWS }));
  back.forEach(([s, dx, dy]) => paint(ctx, s, dx, dy));
  standing.forEach(([s, dx, dy]) => paint(ctx, s, dx, dy));
  if (me.where === "bus" && me.lane === R.LANE.standing) {
    meX.set(standX(me.row) - drawnOn[me.colour].stand, now);
    const since = now - meBobAt;
    const bob = since < 600 ? -0.012 * H * Math.sin(Math.PI * (since % 300) / 300) : 0;
    paint(ctx, sprites[FILE[me.colour] + "Standing"], meX.at(now), bob);
    const s = sprites[FILE[me.colour] + "Standing"];
    near.push({ r: me, x: s.x + meX.at(now) + s.w / 2, y: s.y + bob, near: true });
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
  drawNames(ctx, now, near, 30);
  pop();
}

// Names above people's heads when you're close to them: they fade in as you
// come near and out as you walk away. `people`: [{ r, x, y, near }], x the
// middle and y the top of their head, in the current units; `size` in those units.
const NAME_FILL = "#ff86d6", NAME_OUTLINE = "#000000";   // names over heads
const MY_NAME_FILL = "#4f8dff";   // your own name, blue
const NEAR_ROWS = 0;   // 0: only the people in your own row
const nameFade = new Map();   // rider id -> Tween of how visible (0 to 1)
function drawNames(ctx, now, people, size) {
  for (const p of people) {
    if (!nameFade.has(p.r.id)) nameFade.set(p.r.id, new Tween(350, easeInOut, 0));
    nameFade.get(p.r.id).set(p.near ? 1 : 0, now);
  }
  textFont(FONT);
  textStyle(BOLD);
  textSize(size);
  textAlign(CENTER, BOTTOM);
  noStroke();
  // Lowest heads first; a label that would cover one already placed goes up.
  const placed = [];
  for (const p of [...people].sort((a, b) => b.y - a.y)) {
    const a = nameFade.get(p.r.id).at(now);
    if (a <= 0.01) continue;
    const label = p.label || p.r.name;
    const w = textWidth(label) + size * 0.7, h = size * 1.05;
    let y = p.y - 10;
    while (placed.some(q => Math.abs(q.x - p.x) < (q.w + w) / 2 + 4 && Math.abs(q.y - y) < h + 4)) y -= 2;
    placed.push({ x: p.x, y, w });
    y -= 8 * (1 - a);   // rises a little as it fades in
    const pic = namePicture(label, size, p.r === me ? MY_NAME_FILL : NAME_FILL);
    const f = DreamAssets.frame(pic, now), pw = f.width / NAME_RES, ph = f.height / NAME_RES;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.drawImage(f, p.x - pw / 2, y + pic.pad / NAME_RES - ph, pw, ph);
    ctx.restore();
  }
}

// Each name drawn once as a picture, pink in a black outline, and put through the
// dreamcore filter like the drawings: grade, glow, grain, the few colours,
// 3 grain frames.
// NAME_RES pixels per unit, so it stays sharp.
const NAME_RES = 1.5;
const namePictures = new Map();
function namePicture(name, size, fill = NAME_FILL) {
  name = niceName(name);
  const key = name + "/" + size + "/" + fill;
  if (namePictures.has(key)) return namePictures.get(key);
  const px = size * NAME_RES, pad = Math.ceil(px * 0.3);
  const c = document.createElement("canvas");
  let g = c.getContext("2d");
  const font = `bold ${px}px "${FONT}"`;
  g.font = font;
  c.width = Math.ceil(g.measureText(name).width + 2 * pad);
  c.height = Math.ceil(px * 1.1 + 2 * pad);
  g = c.getContext("2d", { willReadFrequently: true });
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "bottom";
  // Pink letters with a black outline.
  const [x, y] = [c.width / 2, c.height - pad];
  g.lineJoin = "round";
  g.lineWidth = px * 0.18;
  g.strokeStyle = NAME_OUTLINE;
  g.strokeText(name, x, y);
  g.fillStyle = fill;
  g.fillText(name, x, y);
  let frames = [c];
  if (DreamAssets.on) {
    // soft: keep the halo's see-through edge instead of cutting it crisp.
    frames = DreamAssets.apply(g.getImageData(0, 0, c.width, c.height), NAME_RES, true).map(d => {
      const f = document.createElement("canvas");
      f.width = c.width; f.height = c.height;
      f.getContext("2d").putImageData(d, 0, 0);
      return f;
    });
  }
  const pic = { frames, pad };
  if (document.fonts.check(font)) namePictures.set(key, pic);   // try again once the font is in
  return pic;
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
      standing.push([sprites[FILE[r.colour] + "Standing"], tw.at(now), bob, r]);
      continue;
    }
    const isBack = r.lane === R.LANE.window;
    const s = sprites[FILE[r.colour] + (isBack ? "Sitting" : "SittingFront")];
    const dx = seatX[r.lane][r.row] - drawnOn[r.colour][r.lane];
    (isBack ? back : front).push([s, dx, isBack ? 0 : dropFor(r.colour, r.row), r]);
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
// marker for the bus. Drawn once per number of stops passed (and the marker
// once), each put through the dreamcore filter like the drawings.
// The pictures cover the route's box, x 40 to 1960 and y 50 to 250 of its
// own units, at ROUTE_RES pixels a unit.
const ROUTE_RES = 0.5, ROUTE_BOX = [40, 50, 1920, 200], MARKER_R = 36;
const routePictures = new Map();
function filtered(c, scale) {
  if (!DreamAssets.on) return { frames: [c] };
  const g = c.getContext("2d", { willReadFrequently: true });
  return { frames: DreamAssets.apply(g.getImageData(0, 0, c.width, c.height), scale, true).map(d => {
    const f = document.createElement("canvas");
    f.width = c.width; f.height = c.height;
    f.getContext("2d").putImageData(d, 0, 0);
    return f;
  }) };
}
// Pixels of the picture per unit of the bus canvas, for the filter's glow and grain.
const routeFilterScale = () => ROUTE_RES / (0.48 * VIEW_W / 1920);
function routePicture(passed) {
  if (routePictures.has(passed)) return routePictures.get(passed);
  const [bx, by, bw, bh] = ROUTE_BOX;
  const c = document.createElement("canvas");
  c.width = bw * ROUTE_RES; c.height = bh * ROUTE_RES;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.scale(ROUTE_RES, ROUTE_RES);
  g.translate(-bx, -by);
  g.strokeStyle = INK;
  g.lineCap = g.lineJoin = "round";
  g.lineWidth = 16;
  g.stroke(new Path2D(ROUTE));
  g.lineWidth = 14;
  STOP_RINGS.forEach(([cx, cy, rx, ry, deg], i) => {
    g.fillStyle = i < passed ? BLUE : PAPER;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, deg * Math.PI / 180, 0, 2 * Math.PI);
    g.fill();
    g.stroke();
  });
  const pic = filtered(c, routeFilterScale());
  routePictures.set(passed, pic);
  return pic;
}
let markerPic = null;
function markerPicture() {
  if (markerPic) return markerPic;
  const c = document.createElement("canvas");
  c.width = c.height = Math.ceil(2 * MARKER_R * ROUTE_RES);
  const g = c.getContext("2d", { willReadFrequently: true });
  g.scale(ROUTE_RES, ROUTE_RES);
  g.fillStyle = BLUE;
  g.strokeStyle = INK;
  g.lineWidth = 10;
  g.beginPath();
  g.arc(MARKER_R, MARKER_R, 26, 0, 2 * Math.PI);
  g.fill();
  g.stroke();
  return markerPic = filtered(c, routeFilterScale());
}
function drawRoute(t) {
  const p = R.progress(ride, t);
  const n = Math.floor(p);
  const xs = STOP_RINGS.map(s => s[0]);
  const mx = n >= xs.length - 1 ? xs.at(-1) : xs[n] + (xs[n + 1] - xs[n]) * (p - n);
  const now = millis(), ctx = drawingContext;
  const route = routePicture(ride.over ? STOP_RINGS.length : ride.nextStop), marker = markerPicture();
  const [bx, by, bw, bh] = ROUTE_BOX;
  push();
  toView();
  const w = 0.48 * VIEW_W, s = w / 1920;
  translate(VIEW_W / 2 - w / 2, 0.006 * VIEW_W);
  scale(s);
  translate(-40, -50);
  ctx.drawImage(DreamAssets.frame(route, now), bx, by, bw, bh);
  ctx.drawImage(DreamAssets.frame(marker, now), mx - MARKER_R, 140 - MARKER_R, 2 * MARKER_R, 2 * MARKER_R);
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
  const label = ride.over ? "next bus" : R.YOUR_ACTIONS[me.action];
  const enabled = ride.over || me.where === "bus";
  const size = (touch ? 3 : 2.4) * cqw;
  textFont(FONT);
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
  const lines = R.act(ride, clock());
  lines.forEach(write);
  if (lines.length) window.Live?.send({ lines: lines.map(l => ({ text: l.text, kind: l.kind, row: l.row })) });
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

// --- The other people, live ----------------------------------------------------
// live.js (playhtml) shares where each person is. Here: every frame, your own
// place goes out if it changed, and everyone on the same ride is put on your
// bus as a rider (brown or orange; only you are blue). When someone presses
// their action, their lines arrive in your window.
const others = new Map();                // their playhtml id -> their rider here
let sentState = "";
const colourOf = pid => R.COLOURS[[...pid].reduce((h, c) => h + c.charCodeAt(0), 0) % R.COLOURS.length];

// Your place goes out when it changes: from draw(), and once a second, so it
// still goes out while your tab is in the background (draw() pauses then).
function sendMe() {
  if (!window.Live || !LIVE || !ready) return;
  const state = { name: me.name, action: me.action, boardAt: boardStop, where: me.where, row: me.row, lane: me.lane };
  const json = JSON.stringify(state);
  if (json !== sentState) { sentState = json; window.Live.setMe(state); }
}
// In a background tab the ride also moves on here (you still get on the bus).
setInterval(() => {
  if (!ready) return;
  if (document.hidden) { syncPeople(); R.tick(ride, clock()).forEach(write); }
  sendMe();
}, 1000);

function syncPeople() {
  const live = window.Live;
  if (!live || !LIVE) return;
  sendMe();

  const here = new Set();
  for (const { pid, state: st } of live.people) {
    if (!st || st.boardAt == null) continue;
    here.add(pid);
    let r = others.get(pid);
    if (!r) {
      r = R.newRider(ride, true);
      r.fake = false;                     // the rules leave them alone: they move themselves
      r.colour = colourOf(pid);
      others.set(pid, r);
    }
    r.name = st.name;
    r.action = st.action;
    r.boardAt = st.boardAt - boardStop;   // counted from your stop, like the rules count them
    if (st.where === "queue" && r.where !== "bus") {
      r.where = "queue";
      if (!ride.queue.includes(r.id)) ride.queue.push(r.id);
    } else if (st.where !== "queue") {
      ride.queue = ride.queue.filter(id => id !== r.id);
      r.where = st.where;
      r.row = st.row;
      r.lane = st.lane;
      r.target = null;
    }
  }
  for (const [pid, r] of others) {
    if (here.has(pid)) continue;          // left the page: off the bus
    r.where = "gone";
    ride.queue = ride.queue.filter(id => id !== r.id);
    others.delete(pid);
  }
}

// Someone else pressed their action: their lines, in your window.
window.onLiveAct = ({ pid, loop, lines }) => {
  if (!ready || !others.has(pid)) return;
  for (const l of lines) write({ t: clock(), text: l.text, row: l.row, kind: l.kind, mine: l.kind === "mix" && l.text.includes(me.name) });
};
