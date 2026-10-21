/*
 * player.js: draws a piece into a <pre>, plays it only while it is on screen,
 * and holds the first frame for anyone who prefers reduced motion.
 *
 *   import { play } from "./player.js";
 *   const stop = play(preElement, await import("./pieces/moonlit-sea.js"));
 */

import { withLook, restyle } from "./glyphs.js";
import { paint, renderMode, cellAspect, CELL_W, GlyphAtlas } from "./canvas.js?v=11"; // ?v: local cache key

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
// Braille and the long diagonals fall back to a wider font than the cell in
// Menlo and Consolas, so each one is boxed to exactly one cell.
const WIDE = /[\u2800-\u28FF\u27CB\u27CD]/g;
const BOX = 'display:inline-block;width:1ch;overflow:hidden;vertical-align:top';
const esc = (s) => s.replace(/[&<>]/g, (c) => ESC[c]).replace(WIDE, (c) => `<i style="${BOX};font-style:normal">${c}</i>`);

/** Frame (string or {text,color}) to HTML. Colour runs become one span each. */
export function frameHTML(frame, palette, ink) {
  if (typeof frame === "string") return esc(frame);
  const T = frame.text.split("\n"), C = frame.color.split("\n");
  let out = "";
  for (let y = 0; y < T.length; y++) {
    const t = [...T[y]], c = [...C[y]];
    let run = "", key = c[0];
    const flush = () => {
      if (!run) return;
      const hex = key !== " " && palette && palette[key];
      out += hex ? `<span style="color:${hex}">${esc(run)}</span>` : esc(run);
      run = "";
    };
    for (let x = 0; x < t.length; x++) {
      if (c[x] !== key) { flush(); key = c[x]; }
      run += t[x];
    }
    flush();
    if (y < T.length - 1) out += "\n";
  }
  return out;
}

export const frameText = (f) => (typeof f === "string" ? f : f.text);

/**
 * Play a piece module in a <pre>. Options: speed (1), still (false: honour
 * reduced motion), look ({ look, chars, all, mono, gamma }, see glyphs.js),
 * onFrame(frame, t).
 */
export function play(pre, mod, opts = {}) {
  const meta = mod.meta, look = { ...(opts.look || {}) };
  if (meta.cell === "square" && look.lift === undefined) look.lift = false; // photos keep their true colours
  if (meta.dots) for (const k in meta.dots) if (look[k] === undefined) look[k] = meta.dots[k]; // the piece's own halftone tuning
  const mode = renderMode(meta, look);
  const speed = opts.speed ?? 1;
  const reduce = opts.still ?? (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  // Square-cell pieces keep their shape as text by closing up the lines.
  pre.style.lineHeight = meta.cell === "square" ? String(CELL_W) : "";
  let render;
  if (opts.dom) { // the old way: rewrite the <pre> each frame (selectable text, slower)
    if (pre._canvas) { pre._canvas.remove(); pre._canvas = null; pre.style.display = ""; }
    const draw = withLook(mod.default(), meta.palette, look);
    render = (t) => {
      const f = draw(t);
      pre.innerHTML = frameHTML(f, f.palette || meta.palette);
      if (opts.onFrame) opts.onFrame(f, t);
    };
  } else {
    // Everything draws on a canvas over the <pre>: halftone looks as true
    // circles or squares, text looks through a glyph atlas. The <pre> keeps
    // its prerendered text for screen readers, search and no-JS visitors.
    const draw = mode === "text" ? withLook(mod.default(), meta.palette, look) : mod.default();
    // Pictures in a text look: below MERGE_PX a cell is too small to read, so k x k cells
    // merge into one glyph (see restyleMerged). Same look, a fraction of the draw calls.
    const raw = mode === "text" && meta.cell === "square" ? mod.default() : null, MERGE_PX = 5;
    if (!pre._canvas) {
      pre._canvas = document.createElement("canvas");
      pre._canvas.setAttribute("aria-hidden", "true");
      pre._canvas.style.display = "block";
      pre._canvas.style.maxWidth = "100%";
      pre.after(pre._canvas);
    }
    const cv = pre._canvas, ctx = cv.getContext("2d"), aspect = cellAspect(meta), atlas = new GlyphAtlas();
    // Read the font size and colour from CSS rarely, not every frame: getComputedStyle
    // forces a style pass, which is what made big pages stutter.
    let px = 12, color = "#e4e4e7", checked = -1;
    const measure = () => {
      pre.style.display = "";
      const cs = getComputedStyle(pre); px = parseFloat(cs.fontSize) || 12; color = cs.color;
      pre.style.display = "none";
    };
    measure();
    // sl (local change 6): one horizontal slice of a still frame ({ r0, r1, last }); the first call builds the frame, sizes and clears
    // the canvas, and keeps the frame on sl for the slices after it. Local change 7: an empty slice (r0 === r1) paints nothing, so the
    // head is a task of its own; then an empty slice with sl.prime runs the frame-wide tone pass and clears the pixel buffer (canvas.js,
    // opts.cache: both ride on sl to the slices after it), so no slice carries those fixed costs
    render = (t, sl) => {
      const head = !sl || !sl.f;
      const now = performance.now();
      if (head && now - checked > 500) { checked = now; measure(); }
      const cw = px * CELL_W, ch = cw * aspect, dpr = Math.min(2, window.devicePixelRatio || 1);
      const k = raw && cw < MERGE_PX ? Math.ceil(MERGE_PX / cw) : 1;
      const f = !head ? sl.f : k > 1 ? restyle(raw(t), meta.palette, { ...look, merge: k }) : draw(t);
      const W = Math.ceil(meta.cols * cw), H = Math.ceil(meta.rows * ch);
      if (head) {
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
          cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
          cv.style.width = W + "px"; cv.style.height = H + "px";
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        if (sl) sl.f = f;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (sl && sl.r0 === sl.r1 && !sl.prime) return;
      paint(ctx, f, f.palette || meta.palette, { ...look, cw: cw * k, ch: ch * k, mode, ink: color, atlas, dpr, ...(sl ? { r0: sl.r0, r1: sl.r1, cache: sl } : {}) });
      if (opts.onFrame && (!sl || sl.last)) opts.onFrame(f, t);
    };
  }
  // Local change 5 (js/ascii/README.md): a still piece (drawn once) renders in a later task, so the piece's set-up (mod.default()
  // above) and its first paint are two tasks, not one long one (the pagoda at 4x CPU: ~41 ms + ~115 ms instead of ~160 ms).
  // Local change 6: a halftone-dot still is also painted in SLICES horizontal bands, one idle callback each (the pagoda at 4x CPU: one
  // ~100-200 ms render became four tasks under ~50 ms each); the frame's own mask fades the band in, so bands landing a few frames apart
  // do not show. One `gone` guard covers every slice. Local change 7: the head (building the frame, sizing and clearing the canvas) is an
  // idle task of its own, the frame-wide tone pass and the buffer's clear another, then six slices, so no task is the old long first slice.
  if (reduce || meta.still) {
    let gone = false;
    const idle = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 1000 }) : setTimeout(f, 1));
    const t = opts.t0 ?? 0, SLICES = 6;
    if (opts.dom || mode !== "circle" || look.invert) { idle(() => { if (!gone) render(t); }); return () => { gone = true; }; }
    const sl = { f: null }; let i = 0;
    const next = () => {
      if (gone) return;
      sl.r0 = Math.round((meta.rows * i) / SLICES); sl.r1 = Math.round((meta.rows * (i + 1)) / SLICES); sl.last = i === SLICES - 1;
      render(t, sl);
      if (++i < SLICES) idle(next);
    };
    const prime = () => { if (gone) return; sl.prime = true; render(t, sl); sl.prime = false; idle(next); };
    idle(() => { if (gone) return; sl.r0 = sl.r1 = 0; sl.last = false; render(t, sl); idle(prime); });
    return () => { gone = true; };
  }
  render(opts.t0 ?? 0);
  let raf = 0, timer = 0, visible = true, elapsed = opts.t0 ?? 0, prev = 0, stopped = false;
  const step = 1000 / Math.min(meta.fps, opts.maxFps || 60);
  // A random phase per player: a page of cards started together would otherwise all
  // redraw on the same frame (one long frame, then idle ones), which reads as stutter.
  let last = (typeof performance !== "undefined" ? performance.now() : 0) - Math.random() * step;
  // Local change 3 (js/ascii/README.md): between two renders the loop sleeps on a timer (no requestAnimationFrame
  // every display frame), and off screen it sleeps altogether until the observer wakes it.
  const wake = () => { timer = 0; if (!raf && !stopped && visible) raf = requestAnimationFrame(loop); };
  const loop = (now) => {
    raf = 0;
    if (stopped || !visible) { prev = 0; return; }
    if (prev) elapsed += ((now - prev) / 1000) * speed;
    prev = now;
    if (now - last >= step) {
      last = now - ((now - last) % step); // keep the phase instead of snapping to this frame
      render(elapsed);
    }
    const wait = step - (performance.now() - last);
    if (wait > 24) timer = setTimeout(wake, Math.max(0, wait - 4)); // local: wake just short of the step, so one rAF lands past it (one wake per redraw, not two or three)
    else raf = requestAnimationFrame(loop);
  };
  let io;
  if (typeof IntersectionObserver !== "undefined") {
    io = new IntersectionObserver((es) => {
      visible = es[es.length - 1].isIntersecting;
      if (!visible) prev = 0;
      else if (!raf && !timer && !stopped) raf = requestAnimationFrame(loop);
    }, { rootMargin: "100px" });
    io.observe(pre._canvas || pre);
  }
  raf = requestAnimationFrame(loop);
  return () => { stopped = true; cancelAnimationFrame(raf); clearTimeout(timer); if (io) io.disconnect(); };
}
