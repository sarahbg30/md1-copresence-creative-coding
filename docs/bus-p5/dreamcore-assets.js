// The dreamcore filter from ../dreamcore/, applied to each drawing on its own
// while the game loads, the way the GIFs in ../bus/ were made: same steps,
// same order, Sarah's settings. The sky, the frosted glass and the text are
// left alone. Each drawing gets 3 frames with different grain, shown 220 ms
// each, like the tool's jittery 10-frame GIFs.
//
// ?filter=off (or any other ?filter=, see dreamcore-filter.js) leaves the
// drawings as they are.

const DreamAssets = (() => {
  const S = { glow: 17, glowSize: 36, fade: 12, contrast: 31, brightness: 1, saturation: 19, tint: 42,
    grain: 46, shadow: "#ffffff", highlight: "#a67fb5", colors: 24 };
  const FRAMES = 3, DELAY = 220;
  // The tool sizes the glow from the picture's average side: the drawings were
  // filtered on their whole 2544 x 590 canvas.
  const SIZE = Math.sqrt(2544 * 590);

  const on = !new URLSearchParams(location.search).get("filter");
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  function mulberry32(a) {
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  let quantize = null;
  const ready = on
    ? import("https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm").then(m => { quantize = m.quantize; }, () => {})
    : Promise.resolve();

  // grade() from the tool.
  function grade(d) {
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
  }

  // reduceColors() from the tool: the nearest of the palette, crisp edges.
  function reduce(d, pal) {
    const lut = new Uint8Array(32768);
    for (let k = 0; k < 32768; k++) {
      const r = (k >> 10) * 8 + 4, g = (k >> 5 & 31) * 8 + 4, b = (k & 31) * 8 + 4;
      let best = 0, bd = Infinity;
      for (let p = 0; p < pal.length; p++) {
        const c = pal[p], dr = r - c[0], dg = g - c[1], db = b - c[2];
        const dd = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
        if (dd < bd) { bd = dd; best = p; }
      }
      lut[k] = best;
    }
    for (let i = 0; i < d.length; i += 4) {
      const c = pal[lut[(d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | d[i + 2] >> 3]];
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
      d[i + 3] = d[i + 3] >= 128 ? 255 : 0;
    }
  }
  function palette(d) {
    let k = 0;
    const sample = new Uint8ClampedArray(d.length);
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 128) {
      sample[k] = d[i]; sample[k + 1] = d[i + 1]; sample[k + 2] = d[i + 2]; sample[k + 3] = 255; k += 4;
    }
    return quantize(sample.subarray(0, Math.max(4, k)), S.colors, { format: "rgb444" });
  }

  // One drawing (ImageData, already cut down) in, FRAMES filtered ImageData out.
  // `scale`: how many of its pixels make one pixel of the 2544 x 590 canvas
  // (the driver and the bird are drawn bigger), so the glow spreads as far.
  function apply(src, scale = 1) {
    const w = src.width, h = src.height;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const img = new ImageData(new Uint8ClampedArray(src.data), w, h);
    grade(img.data);
    ctx.putImageData(img, 0, 0);
    // Glow: a blurred copy laid over with "screen".
    const b = document.createElement("canvas");
    b.width = w; b.height = h;
    const bx = b.getContext("2d");
    bx.filter = `blur(${Math.max(1, S.glowSize / 100 * 0.075 * SIZE * scale)}px)`;
    bx.drawImage(c, 0, 0);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = S.glow / 100;
    ctx.drawImage(b, 0, 0);
    const lit = ctx.getImageData(0, 0, w, h).data;

    const out = [], grain = S.grain / 100 * 70;
    let pal = null;
    for (let f = 0; f < FRAMES; f++) {
      const rnd = mulberry32(7 + f * 101);
      const d = new Uint8ClampedArray(lit);
      for (let i = 0; i < d.length; i += 4) {
        const n = (rnd() - .5) * grain;
        d[i] += n; d[i + 1] += n; d[i + 2] += n;
      }
      if (quantize) { pal = pal || palette(d); reduce(d, pal); }
      out.push(new ImageData(d, w, h));
    }
    return out;
  }

  // A picture file filtered the same way, for drawings that aren't loaded with
  // the others (the bird, the driver). Gives { frames, w, h } once it's ready;
  // until then, or with the filter off, frames holds the plain picture.
  function picture(src, scale) {
    const p = { frames: [], w: 0, h: 0 };
    const img = new Image();
    img.onload = () => ready.then(() => {
      p.w = img.naturalWidth; p.h = img.naturalHeight;
      if (!on) { p.frames = [img]; return; }
      const c = document.createElement("canvas");
      c.width = p.w; c.height = p.h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      p.frames = apply(ctx.getImageData(0, 0, p.w, p.h), scale).map(d => {
        const f = document.createElement("canvas");
        f.width = p.w; f.height = p.h;
        f.getContext("2d").putImageData(d, 0, 0);
        return f;
      });
    });
    img.src = src;
    return p;
  }
  // The frame to show now.
  const frame = (p, now) => p.frames[Math.floor(now / DELAY) % p.frames.length];

  return { on, ready, apply, picture, frame, DELAY };
})();
