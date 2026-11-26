// dreamcore-p5.js: the dreamcore filter (../dreamcore/) for p5.js sketches.
//
// Turns a p5.Image or p5.Graphics into a few p5.Graphics with the filter
// baked in: colour grade, glow, grain and fewer colours, with Sarah's
// settings by default. Each frame has different grain; show them in turn
// with dreamFrame() and the grain moves, like the tool's jittery GIFs.
//
// It's made for drawings you filter once (in setup), not for every frame:
// a 2544 x 590 drawing takes a moment.
//
//   <script src="p5.min.js"></script>
//   <script src="dreamcore-p5.js"></script>
//
//   let bus, busDream;
//   function preload() { bus = loadImage("BusCoque.png"); }
//   function setup() {
//     createCanvas(1272, 295);
//     busDream = dreamcore(bus);                 // 3 p5.Graphics
//   }
//   function draw() {
//     background("#7fa8cf");
//     image(dreamFrame(busDream), 0, 0, width, height);
//   }
//
// Settings: dreamcore(img, { grain: 20, highlight: "#ffd6f0" }). Every slider
// has the same name and range as in the tool: glow, glowSize, fade, contrast,
// brightness, saturation, tint, grain (0 to 100 or -100 to 100), shadow and
// highlight (colours), colors (how many colours, 0 = all). And:
//   frames: how many grain frames (3), delay: ms each (220)
//   size: the picture's "average side" the glow is measured from. The tool
//     uses sqrt(width * height) of the picture; pass the size of the whole
//     canvas if you filter a piece cut out of a bigger drawing.
//
// Colours are reduced with a median cut of its own, close to the tool's
// (which uses gifenc) but not exactly the same.

const DREAMCORE_SARAH = {
  glow: 17, glowSize: 36, fade: 12, contrast: 31, brightness: 1, saturation: 19, tint: 42,
  grain: 46, shadow: "#ffffff", highlight: "#a67fb5", colors: 24, frames: 3, delay: 220,
};

function dreamcore(src, options = {}) {
  const S = { ...DREAMCORE_SARAH, ...options };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const rand = seed => () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  // The picture's own pixels, at one pixel per pixel.
  const el = src.canvas || src.elt;
  const w = src.width, h = src.height;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(el, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h), d = img.data;

  // Colour grade.
  const br = S.brightness / 100 * 0.3, ct = 1 + S.contrast / 100, fade = S.fade / 100 * 0.4;
  const sat = 1 + S.saturation / 100, ti = S.tint / 100;
  const [sr, sg, sb] = hex(S.shadow), [hr, hg, hb] = hex(S.highlight);
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    r = (r - .5) * ct + .5 + br; g = (g - .5) * ct + .5 + br; b = (b - .5) * ct + .5 + br;
    let l = .2126 * r + .7152 * g + .0722 * b;
    r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    r = fade + r * (1 - fade); g = fade + g * (1 - fade); b = fade + b * (1 - fade);
    l = clamp(.2126 * r + .7152 * g + .0722 * b, 0, 1);
    const ws = (1 - l) * (1 - l) * ti * .7, wh = l * l * ti * .55;
    r += (sr - r) * ws; g += (sg - g) * ws; b += (sb - b) * ws;
    r += (hr - r) * wh; g += (hg - g) * wh; b += (hb - b) * wh;
    d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255;
  }
  ctx.putImageData(img, 0, 0);

  // Glow: a blurred copy laid over with "screen".
  if (S.glow > 0) {
    const size = S.size || Math.sqrt(w * h);
    const b = document.createElement("canvas");
    b.width = w; b.height = h;
    const bx = b.getContext("2d");
    bx.filter = `blur(${Math.max(1, S.glowSize / 100 * 0.075 * size)}px)`;
    bx.drawImage(c, 0, 0);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = S.glow / 100;
    ctx.drawImage(b, 0, 0);
  }
  const lit = ctx.getImageData(0, 0, w, h).data;

  // Fewer colours: a median cut over the visible pixels.
  function palette(px, n) {
    const all = [];
    for (let i = 0; i < px.length; i += 16) if (px[i + 3] >= 128) all.push([px[i], px[i + 1], px[i + 2]]);
    if (!all.length) return [[0, 0, 0]];
    let boxes = [all];
    while (boxes.length < n) {
      let best = -1, bi = 0, ch = 0;
      boxes.forEach((box, k) => {
        if (box.length < 2) return;
        for (let c = 0; c < 3; c++) {
          let lo = 255, hi = 0;
          for (const p of box) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
          if (hi - lo > best) { best = hi - lo; bi = k; ch = c; }
        }
      });
      if (best <= 0) break;
      const box = boxes[bi].sort((a, b) => a[ch] - b[ch]);
      const mid = box.length >> 1;
      boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
    }
    return boxes.map(box => [0, 1, 2].map(c => Math.round(box.reduce((s, p) => s + p[c], 0) / box.length)));
  }
  function reduce(px, pal) {
    const lut = new Uint8Array(32768);
    for (let k = 0; k < 32768; k++) {
      const r = (k >> 10) * 8 + 4, g = (k >> 5 & 31) * 8 + 4, b = (k & 31) * 8 + 4;
      let best = 0, bd = Infinity;
      for (let p = 0; p < pal.length; p++) {
        const q = pal[p], dr = r - q[0], dg = g - q[1], db = b - q[2];
        const dd = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
        if (dd < bd) { bd = dd; best = p; }
      }
      lut[k] = best;
    }
    for (let i = 0; i < px.length; i += 4) {
      const q = pal[lut[(px[i] >> 3) << 10 | (px[i + 1] >> 3) << 5 | px[i + 2] >> 3]];
      px[i] = q[0]; px[i + 1] = q[1]; px[i + 2] = q[2];
      px[i + 3] = px[i + 3] >= 128 ? 255 : 0;          // crisp edges, like the tool
    }
  }

  // The frames: same picture, new grain each time.
  const frames = [], grain = S.grain / 100 * 70;
  let pal = null;
  for (let f = 0; f < S.frames; f++) {
    const next = rand(7 + f * 101), px = new Uint8ClampedArray(lit);
    for (let i = 0; i < px.length; i += 4) {
      const n = (next() - .5) * grain;
      px[i] += n; px[i + 1] += n; px[i + 2] += n;
    }
    if (S.colors) { pal = pal || palette(px, S.colors); reduce(px, pal); }
    const g = createGraphics(w, h);
    g.pixelDensity(1);
    g.drawingContext.putImageData(new ImageData(px, w, h), 0, 0);
    frames.push(g);
  }
  frames.delay = S.delay;
  return frames;
}

// The frame of a dreamcore() result to show now.
function dreamFrame(frames, t = millis()) {
  return frames[Math.floor(t / (frames.delay || 220)) % frames.length];
}
