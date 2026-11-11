// Everything you see is drawn with characters. Each function returns text,
// or HTML when some characters need to be bold.

export const SHAPE_CHAR = { triangle: '^', circle: 'o', square: '#' };

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

// A, B: the near side of the aisle in the back and front windows. C, D: the far side.
// W: the wheels. The bus faces right.
const BUS = [
  '  ____________________________________________________  ',
  ' |  ____________    _____   __________________   ____ \\ ',
  ' | |AAAAAAAAAA  |  |     | |BBBBBBBBBBBBBBBB  | |    \\ \\',
  ' | |CCCCCCCCCC  |  |     | |DDDDDDDDDDDDDDDD  | |_____\\|',
  ' | |____________|  |     | |__________________|        |',
  ' |                 |     |                    [the bus]|',
  ' |___(W)___________|_____|______________(W)____________|',
  "      '                                   '             ",
];
export const BUS_WIDTH = BUS[0].length;
const WHEEL = ['-', '\\', '|', '/'];
const ME_MARK = '\u0001';

// The back bench has 5 seats in a row, all in the near back window.
// The front windows have 8 (4 rows of 2).
// Row 0 is at the front, so it is drawn at the right end of the front windows.
function windowSlot(seat) {
  if (seat.y === 5) return { part: 'A', index: seat.x };
  const farSide = seat.x >= 3;
  const index = (3 - seat.y) * 2 + (farSide ? seat.x - 3 : seat.x);
  return { part: farSide ? 'D' : 'B', index };
}

export function drawBus(seats, frame) {
  const windows = { A: Array(5).fill(' '), C: Array(5).fill(' '), B: Array(8).fill(' '), D: Array(8).fill(' ') };
  let myChar = '@';
  for (const seat of seats) {
    const { part, index } = windowSlot(seat);
    const char = SHAPE_CHAR[seat.shape] ?? 'o';
    windows[part][index] = seat.me ? ME_MARK : char;
    if (seat.me) myChar = char;
  }

  const fill = (line, part) => line.replace(new RegExp(`${part}+`), windows[part].map((c) => `${c} `).join(''));
  const text = BUS.map((line) => ['A', 'B', 'C', 'D'].reduce(fill, line))
    .join('\n')
    .replaceAll('W', WHEEL[frame % WHEEL.length]);
  return escape(text).replace(ME_MARK, `<b class="me" title="you">${escape(myChar)}</b>`);
}

// The road slides left while the bus drives right.
export function drawRoad(frame, cols = 240) {
  const shift = frame % 8;
  const dashes = '----    '.repeat(cols / 8 + 1).slice(shift, shift + cols);
  return [' '.repeat(cols), dashes, '_'.repeat(cols)].join('\n');
}

// --- tickets -------------------------------------------------------------

const STUB = '012345';

// rows: [{ text, bold }]. The text column is `width` characters wide.
export function drawTicket(rows, width) {
  const lines = [{ text: '' }, { text: 'T E R M I N A L   S T O P' }, { rule: true }, ...rows, { text: '' }];
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
