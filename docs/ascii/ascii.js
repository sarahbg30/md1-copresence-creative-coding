// Everything you see is drawn with characters. Each function returns text,
// or HTML when some characters need to be bold.


export const escape = (text) => text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// Splits text into lines of at most `width` characters, breaking between words.
export function wrap(text, width) {
  const lines = [];
  let line = '';
  for (let word of text.split(' ')) {
    while (word.length > width) {
      if (line) { lines.push(line); line = ''; }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

// Draws `art` onto `canvas` (an array of character arrays). Spaces in the art are see-through.
function stamp(canvas, art, row, col) {
  art.forEach((line, r) => {
    [...line].forEach((char, c) => {
      const y = row + r;
      const x = col + c;
      if (char !== ' ' && canvas[y] && x >= 0 && x < canvas[y].length) canvas[y][x] = char;
    });
  });
}

const blank = (rows, cols) => Array.from({ length: rows }, () => Array(cols).fill(' '));
const toText = (canvas) => canvas.map((row) => row.join('')).join('\n');

// --- the sky -------------------------------------------------------------

const CLOUDS = [
  ['   .--.    ', ' .(    ).  ', '(___.__)__)'],
  ['     _  _      ', '   ( `   )_    ', '  (    )    `) ', '(_   (_ .  _) _)'],
  ['  .-~~~-.   ', ' (       )  ', '(  .   .  ) ', ' `-.___.-`  '],
  ['  _   ', ' ( )_ ', '(_ _ )'],
];

// Always the same sky, so it doesn't jump when you reload. It is drawn twice
// side by side, so it can scroll forever.
export function drawSky(rows = 70, cols = 220) {
  const canvas = blank(rows, cols);
  let seed = 7;
  const next = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < (rows * cols) / 260; i++) {
    const cloud = CLOUDS[Math.floor(next() * CLOUDS.length)];
    stamp(canvas, cloud, Math.floor(next() * rows), Math.floor(next() * (cols - 16)));
  }
  return canvas.map((row) => row.join('').repeat(2)).join('\n');
}

// --- the stop ------------------------------------------------------------

const SIGN = [
  '  .-----.  ',
  ' |  BUS  | ',
  ' | 1  15 | ',
  "  '-----'  ",
  '     |     ',
  '     |     ',
  '     |     ',
  '     |     ',
  '     |     ',
  '     |     ',
  '   __|__   ',
];

const SHELTER = [
  ' ______________________________ ',
  '|______________________________|',
  ' ||                        ||   ',
  ' ||   .----------.         ||   ',
  ' ||   |  ~ map ~ |         ||   ',
  ' ||   | -o--o--o |         ||   ',
  " ||   '----------'         ||   ",
  ' ||                        ||   ',
  ' ||    ________________    ||   ',
  ' ||   |________________|   ||   ',
  ' ||    ||            ||    ||   ',
];

const SCENE_COLS = 160;

// The pavement, the sign and the shelter, standing still.
export function drawStopScene() {
  const height = SHELTER.length + 4;
  const canvas = blank(height, SCENE_COLS);
  const ground = height - 4;
  const middle = SCENE_COLS / 2;
  stamp(canvas, SIGN, ground - SIGN.length + 1, middle - 26);
  stamp(canvas, SHELTER, ground - SHELTER.length + 1, middle - 4);
  canvas[ground + 1] = [...'_'.repeat(SCENE_COLS)];
  canvas[ground + 3] = [...'    ----'.repeat(SCENE_COLS / 8)];
  return toText(canvas);
}

// The departure board: line, platform, where it goes, and how long.
export function drawBoard(time) {
  const inside = 34;
  const left = '  1   15   the bus';
  const line = `${left}${time.padStart(inside - left.length - 2)}  `;
  return [`+${'-'.repeat(inside)}+`, `|${line}|`, `+${'-'.repeat(inside)}+`].join('\n');
}

// --- the bus -------------------------------------------------------------

import { POSES } from './data.js';

// A, B: the near side of the aisle in the back and front windows. C, D: the far side.
// W: the wheels. The bus faces right. Each seat is 7 characters: a face like (o_o)
// with room on both sides for arms.
const SLOT = 7;
const SMALL_BUS = [
  '  ____________________________________________________  ',
  ' |  ____________    _____   __________________   ____ \\ ',
  ' | |AAAAAAAAAA  |  |     | |BBBBBBBBBBBBBBBB  | |    \\ \\',
  ' | |CCCCCCCCCC  |  |     | |DDDDDDDDDDDDDDDD  | |_____\\|',
  ' | |____________|  |     | |__________________|        |',
  ' |                 |     |                    [the bus]|',
  ' |___(W)___________|_____|______________(W)____________|',
  "      '                                   '             ",
];
// Widens the windows of the drawing above so each seat fits a face:
// 5 back seats and 8 front seats go from 2 characters to SLOT.
const widen = (line, col, extra) => line.slice(0, col) + line[col].repeat(extra) + line.slice(col);
const BUS = SMALL_BUS.map((line) => widen(widen(line, 35, 8 * (SLOT - 2)), 10, 5 * (SLOT - 2)));
export const BUS_WIDTH = BUS[0].length;
export const WHEEL = ['-', '\\', '|', '/'];

// How long arms stay out after doing your action.
export const ARMS_MS = 4000;

// The back bench has 5 seats in a row, in the near back window. The last
// row before it (y = 4) is in the far back window, with a gap for the aisle.
// The front windows have 8 (4 rows of 2). Row 0 is at the front, so it is
// drawn at the right end of the front windows.
function windowSlot(seat) {
  if (seat.y === 5) return { part: 'A', index: seat.x };
  if (seat.y === 4) return { part: 'C', index: seat.x };
  const farSide = seat.x >= 3;
  const index = (3 - seat.y) * 2 + (farSide ? seat.x - 3 : seat.x);
  return { part: farSide ? 'D' : 'B', index };
}

// Rides saved before faces had heads only kept the inside, like o_o.
export const wholeFace = (face) => (!face ? '(o_o)' : face.length === 3 ? `(${face})` : face);

// (o_o), or the rider's pose for a few seconds after they acted.
export function drawFace(rider, now = Date.now()) {
  const face = wholeFace(rider.face);
  const acting = rider.actedAt != null && now - rider.actedAt < ARMS_MS;
  const pose = (acting && POSES[rider.actionId]) || ' X ';
  return pose.replace('X', face).padEnd(SLOT).slice(0, SLOT);
}

// Who has their arms out right now. When this changes, the bus is redrawn.
export const armsKey = (riders, now = Date.now()) =>
  riders.filter((r) => r.actedAt != null && now - r.actedAt < ARMS_MS).map((r) => r.seat).join(',');

const EMPTY_WINDOW = ' '.repeat(SLOT);

// Riders are faces. Free seats are buttons: click one to sit there.
function drawSeat(rider, i, now) {
  return rider
    ? `<span class="${rider.me ? 'rider me' : 'rider'}" title="${escape(rider.me ? `you (${rider.name})` : rider.name)}">${escape(drawFace(rider, now))}</span>`
    : `<button type="button" class="seat" data-seat="${i}" title="sit here" aria-label="sit here">${'_'.padStart(4).padEnd(SLOT)}</button>`;
}
const WHEEL_SPAN = '<span class="wheel">-</span>';

// Fills a template in one pass, so letters in riders' names (now in capitals)
// are never mistaken for window or wheel placeholders.
function fillTemplate(template, windows) {
  const parts = Object.keys(windows).join('');
  const slots = new RegExp(`([${parts}])\\1*|W`, 'g');
  return template
    .map((line) => escape(line).replace(slots, (run, part) => (part ? windows[part].join('') : WHEEL_SPAN)))
    .join('\n');
}

// The bus from the side, driving right. Wide: for computers.
export function drawBus(riders, allSeats, now = Date.now()) {
  const windows = { A: Array(5).fill(EMPTY_WINDOW), C: Array(5).fill(EMPTY_WINDOW), B: Array(8).fill(EMPTY_WINDOW), D: Array(8).fill(EMPTY_WINDOW) };
  const bySeat = new Map(riders.map((rider) => [rider.seat, rider]));
  allSeats.forEach((seat, i) => {
    const { part, index } = windowSlot(seat);
    windows[part][index] = drawSeat(bySeat.get(i), i, now);
  });
  return fillTemplate(BUS, windows);
}

// A double decker, driving right: narrow enough for a phone. Each window
// line has 7 seats. Downstairs: the front rows (y 0 to 2), with the stairs at
// the back. Upstairs: rows 3 and 4 and the back bench.
const DECK = 7 * SLOT;
const DOUBLE_DECKER = [
  `  ${'_'.repeat(DECK + 4)}  `,
  ` |  ${'_'.repeat(DECK)}  | `,
  ` | |${'P'.repeat(DECK)}| | `,
  ` | |${'Q'.repeat(DECK)}| | `,
  ` | |${'_'.repeat(DECK)}| | `,
  ` |${'[the bus] '.padStart(DECK + 4)}| `,
  ` |  ${'_'.repeat(DECK)}  | `,
  ` | |${'R'.repeat(DECK)}| | `,
  ` | |${'S'.repeat(DECK)}| | `,
  ` | |${'_'.repeat(DECK)}| | `,
  ` |____(W)${'_'.repeat(DECK - 12)}(W)_____| `,
  `       '${' '.repeat(DECK - 12)}  '       `,
];
export const DOUBLE_DECKER_WIDTH = DOUBLE_DECKER[0].length;

function deckSlot(seat) {
  const far = seat.x >= 3;
  const side = far ? seat.x - 3 : seat.x;
  if (seat.y <= 2) return { part: far ? 'S' : 'R', index: 1 + (2 - seat.y) * 2 + side };
  if (seat.y === 5) return { part: far ? 'Q' : 'P', index: far ? side : seat.x };
  const bench = far ? 2 : 3; // the bench has 3 seats on the near side, 2 on the far side
  return { part: far ? 'Q' : 'P', index: bench + (4 - seat.y) * 2 + side };
}

export function drawDoubleDecker(riders, allSeats, now = Date.now()) {
  const windows = Object.fromEntries(['P', 'Q', 'R', 'S'].map((part) => [part, Array(7).fill(EMPTY_WINDOW)]));
  const bySeat = new Map(riders.map((rider) => [rider.seat, rider]));
  allSeats.forEach((seat, i) => {
    const { part, index } = deckSlot(seat);
    windows[part][index] = drawSeat(bySeat.get(i), i, now);
  });
  return fillTemplate(DOUBLE_DECKER, windows);
}

// The road slides left while the bus drives right.
export function drawRoad(frame, cols = 240) {
  const shift = frame % 8;
  const dashes = '----    '.repeat(cols / 8 + 1).slice(shift, shift + cols);
  // The first line is the ground: style.css lays it on the bus's last line, under the wheels.
  return ['_'.repeat(cols), dashes, '_'.repeat(cols)].join('\n');
}

// --- tickets -------------------------------------------------------------

const STUB = '012345';

// rows: [{ text, bold }]. The text column is `width` characters wide.
// The title is spaced out, like letters printed on a real ticket.
export function drawTicket(title, rows, width) {
  const spaced = title.toUpperCase().split('').join(' ');
  const lines = [{ text: '' }, { text: spaced }, { rule: true }, ...rows, { text: '' }];
  const stub = (i) => `   ${STUB[i % STUB.length]}  `;
  const out = [` ${'_'.repeat(width + 3)}${'_'.repeat(6)} `];
  lines.forEach((line, i) => {
    const middle = line.rule ? '- '.repeat(width).slice(0, width + 2) : ` ${escape(line.text.padEnd(width))} `;
    const shown = line.bold ? middle.replace(escape(line.text), `<b>${escape(line.text)}</b>`) : middle;
    out.push(`|${shown}|${stub(i)}|`);
  });
  out.push(`|${'_'.repeat(width + 2)}|${'_'.repeat(6)}|`);
  return out.join('\n');
}
