// The dreamcore filter from ../dreamcore/, laid live over the whole p5 canvas.
//
// p5 draws the bus as usual; after every frame this copies the picture to a
// WebGL canvas on top and runs the same steps as the filter tool there, on
// the graphics card: colour grade (contrast, brightness, saturation, fade,
// split tone), glow, chromatic aberration, grain and vignette.
// The p5 canvas stays underneath, so clicks and taps still reach it.
//
// Not used by default: the game filters each drawing on its own instead
// (dreamcore-assets.js), like the GIFs were made. To try the whole-screen
// version: ?filter=screen (Sarah's settings), or ?filter=dreamcore, drawing,
// pastel, weirdcore or liminal for one of the tool's presets. ?filter=off
// turns every filter off. The F key switches this one on and off.
//
// Left out: Low-res at 1 (too small to see) and the wobble animation at 10
// (it moves things by less than a pixel).

(() => {
  // The presets of ../dreamcore/ (only what a live picture needs).
  const PRESETS = {
    // Sarah's settings. Number of colors 8 on the slider = a palette of 24.
    ours: { glow: 17, glowSize: 36, fade: 12, contrast: 31, brightness: 1, saturation: 19, tint: 42,
      aberration: 0, grain: 46, vignette: 0, shadow: "#ffffff", highlight: "#a67fb5", vigMode: "white", colors: 24 },
    dreamcore: { glow: 55, glowSize: 40, fade: 30, contrast: -15, brightness: 8, saturation: 25, tint: 35,
      aberration: 3, grain: 20, vignette: 35, shadow: "#3fc8e0", highlight: "#ffb3e6", vigMode: "dark" },
    pastel: { glow: 70, glowSize: 60, fade: 45, contrast: -30, brightness: 15, saturation: 10, tint: 50,
      aberration: 1, grain: 10, vignette: 45, shadow: "#b9a7ff", highlight: "#ffe3f1", vigMode: "white" },
    weirdcore: { glow: 30, glowSize: 25, fade: 15, contrast: 10, brightness: 5, saturation: 60, tint: 30,
      aberration: 7, grain: 35, vignette: 50, shadow: "#2040ff", highlight: "#ffff80", vigMode: "dark" },
    liminal: { glow: 25, glowSize: 30, fade: 25, contrast: -10, brightness: 10, saturation: -30, tint: 40,
      aberration: 1, grain: 25, vignette: 45, shadow: "#4f5d45", highlight: "#fff2b0", vigMode: "dark" },
    drawing: { glow: 35, glowSize: 20, fade: 10, contrast: 0, brightness: 5, saturation: 15, tint: 20,
      aberration: 0, grain: 6, vignette: 30, shadow: "#7fd0e8", highlight: "#ffd6f0", vigMode: "white" },
  };
  const name = (new URLSearchParams(location.search).get("filter") || "").toLowerCase();
  const S = PRESETS[name === "screen" ? "ours" : name];
  if (!S) return;                                      // ?filter=off, or a name we don't know

  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

  const VERT = `
    attribute vec2 p;
    varying vec2 uv;
    void main() { uv = vec2(p.x, -p.y) * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

  // Same maths as grade() and render() in ../dreamcore/index.html.
  const FRAG = `
    precision mediump float;
    varying vec2 uv;
    uniform sampler2D pic, glowPic;
    uniform vec2 res;
    uniform float br, ct, fade, sat, ti, glow, off, grain, vig, seed;
    uniform vec3 shadow, highlight, vigCol;
    uniform vec3 pal[24];
    uniform float palN;

    vec3 grade(vec3 c) {
      c = (c - 0.5) * ct + 0.5 + br;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = l + (c - l) * sat;
      c = fade + c * (1.0 - fade);
      // split tone: shadows lean to one colour, highlights to the other
      l = clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
      c += (shadow - c) * ((1.0 - l) * (1.0 - l) * ti * 0.7);
      c += (highlight - c) * (l * l * ti * 0.55);
      return c;
    }
    vec3 lit(vec2 at) {
      vec3 c = clamp(grade(texture2D(pic, at).rgb), 0.0, 1.0);
      vec3 g = clamp(grade(texture2D(glowPic, at).rgb), 0.0, 1.0);
      return 1.0 - (1.0 - c) * (1.0 - g * glow);       // "screen", like the tool
    }
    float hash(vec2 q) { return fract(sin(dot(q, vec2(12.9898, 78.233)) + seed) * 43758.5453); }

    void main() {
      vec2 d = vec2(off / res.x, 0.0);
      vec3 c = vec3(lit(uv - d).r, lit(uv).g, lit(uv + d).b);
      c += (hash(uv * res) - 0.5) * grain;
      // an oval that follows the screen's shape
      float r = length((uv - 0.5) * 2.0);
      c = mix(c, vigCol, clamp((r - 0.55) / (1.41421 - 0.55), 0.0, 1.0) * vig);
      // fewer colours: the nearest one in the palette, weighted like the tool
      if (palN > 0.0) {
        vec3 best = c;
        float bd = 1e9;
        for (int i = 0; i < 24; i++) {
          if (float(i) >= palN) break;
          vec3 e = c - pal[i];
          float dd = 2.0 * e.r * e.r + 4.0 * e.g * e.g + 3.0 * e.b * e.b;
          if (dd < bd) { bd = dd; best = pal[i]; }
        }
        c = best;
      }
      gl_FragColor = vec4(c, 1.0);
    }`;

  let gl, out, prog, picTex, glowTex, glowCanvas, glowCtx, on = true, u = {};

  function setUp(src) {
    out = document.createElement("canvas");
    out.style.cssText = "position:fixed;left:0;top:0;pointer-events:none;";
    document.body.appendChild(out);
    gl = out.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) { out.remove(); return false; }
    const shader = (type, text) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, text);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(p);
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["pic", "glowPic", "res", "br", "ct", "fade", "sat", "ti", "glow", "off", "grain", "vig", "seed", "shadow", "highlight", "vigCol", "pal", "palN"]) {
      u[n] = gl.getUniformLocation(prog, n);
    }
    const texture = unit => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    picTex = texture(0);
    glowTex = texture(1);
    gl.uniform1i(u.pic, 0);
    gl.uniform1i(u.glowPic, 1);
    // The settings, turned into the numbers grade() uses.
    gl.uniform1f(u.br, S.brightness / 100 * 0.3);
    gl.uniform1f(u.ct, 1 + S.contrast / 100);
    gl.uniform1f(u.fade, S.fade / 100 * 0.4);
    gl.uniform1f(u.sat, 1 + S.saturation / 100);
    gl.uniform1f(u.ti, S.tint / 100);
    gl.uniform1f(u.glow, S.glow / 100);
    gl.uniform1f(u.grain, S.grain / 100 * 70 / 255);
    gl.uniform1f(u.vig, S.vignette / 100 * 0.85);
    gl.uniform3fv(u.shadow, hex(S.shadow));
    gl.uniform3fv(u.highlight, hex(S.highlight));
    gl.uniform3fv(u.vigCol, S.vigMode === "white" ? [1, 1, 1] : [0, 0, 0]);
    gl.uniform1f(u.palN, 0);
    // The glow is a blurred copy at a quarter size: cheap, and it's blurry anyway.
    glowCanvas = document.createElement("canvas");
    glowCtx = glowCanvas.getContext("2d");
    return true;
  }

  function apply(src) {
    if (!gl && !setUp(src)) { apply.broken = true; return; }
    out.style.display = on ? "block" : "none";
    if (!on) return;
    const w = src.width, h = src.height;
    if (out.width !== w || out.height !== h) {
      out.width = w; out.height = h;
      out.style.width = src.style.width || src.clientWidth + "px";
      out.style.height = src.style.height || src.clientHeight + "px";
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.res, w, h);
    }
    // Effect sizes follow the picture's average side, like in the tool.
    const size = Math.sqrt(w * h);
    gl.uniform1f(u.off, Math.round(S.aberration * size / 1000));
    // New grain every 220 ms, like the 10-frame GIFs the tool makes (jittery, 1x).
    const tick = Math.floor(performance.now() / 220);
    if (tick !== apply.tick) { apply.tick = tick; gl.uniform1f(u.seed, Math.random() * 100); }

    const q = 4, gw = Math.max(1, Math.round(w / q)), gh = Math.max(1, Math.round(h / q));
    if (glowCanvas.width !== gw || glowCanvas.height !== gh) { glowCanvas.width = gw; glowCanvas.height = gh; }
    glowCtx.filter = `blur(${Math.max(1, S.glowSize / 100 * 0.075 * size / q)}px)`;
    glowCtx.clearRect(0, 0, gw, gh);
    glowCtx.drawImage(src, 0, 0, gw, gh);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, picTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, glowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, glowCanvas);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (S.colors) pickPalette(w, h);
  }

  // The palette, made like the tool's (gifenc's quantize) from what is on
  // screen, filtered but before the colours are reduced. It is made again
  // every few seconds, as the picture changes.
  let quantize = null, palAt = -1e9;
  if (S && S.colors) import("https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm").then(m => { quantize = m.quantize; }, () => {});
  function pickPalette(w, h) {
    const now = performance.now();
    // Not from the loading screen: it is only sky and text, and would squash
    // every colour into those.
    if (!quantize || now - palAt < 4000 || typeof ready === "undefined" || !ready) return;
    palAt = now;
    // Draw once more without the palette and read it back, a pixel in 16.
    gl.uniform1f(u.palN, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const step = 4, sample = new Uint8Array(Math.ceil(w / step) * Math.ceil(h / step) * 4);
    let k = 0;
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      sample[k++] = px[i]; sample[k++] = px[i + 1]; sample[k++] = px[i + 2]; sample[k++] = 255;
    }
    const pal = quantize(sample.subarray(0, k), S.colors, { format: "rgb444" });
    const flat = new Float32Array(24 * 3);
    pal.slice(0, 24).forEach((c, n) => { flat[n * 3] = c[0] / 255; flat[n * 3 + 1] = c[1] / 255; flat[n * 3 + 2] = c[2] / 255; });
    gl.uniform3fv(u.pal, flat);
    gl.uniform1f(u.palN, Math.min(24, pal.length));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  addEventListener("keydown", e => { if (e.key === "f" || e.key === "F") on = !on; });

  // After every p5 frame.
  p5.prototype.registerMethod("post", function () {
    if (apply.broken || !this.drawingContext) return;
    try { apply(this.drawingContext.canvas); } catch (e) { apply.broken = true; if (out) out.remove(); console.warn("dreamcore filter off:", e); }
  });
})();
