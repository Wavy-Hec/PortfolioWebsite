/*
 * ascii.js: one script tag, then <ascii-art piece="moonlit-sea"></ascii-art>
 * anywhere on the page. No install, no build step.
 *
 *   <script type="module" src="https://www.ascii-magic.com/ascii/ascii.js"></script>
 *   <ascii-art piece="spinning-torus"></ascii-art>
 *
 * Attributes: piece (slug), speed (1), still (no animation), size (font size
 * in px, default 12), bg (background colour, default transparent), look
 * (dots, ascii, dense, numbers, binary, letters, blocks, squares, lines, dither),
 * chars (your own characters, light to dark), mono (one colour), contrast
 * (0 to 100, default 0), dot-size (halftone dot size, 25 to 120, default 51),
 * steps (halftone dot sizes: 3, 5, or 0 for smooth), density (dot spacing, 40
 * to 250, default 131: more dots closer together, dot size unchanged), all
 * (redraw text and line work in the look too, not only shading); fps (local:
 * a frame-rate cap, read at start).
 */
import { play } from "./player.js?v=9"; // ?v: local cache key (js/ascii/README.md)

// Pieces sit next to this file on ascii-magic.com (/ascii/ascii.js, /ascii/pieces/) and one
// folder up in the npm package (runtime/ascii.js, pieces/), so self-hosting the package works too.
const BASE = new URL(/\/runtime\/[^/]*$/.test(new URL(import.meta.url).pathname) ? "../" : ".", import.meta.url).href;

class AsciiArt extends HTMLElement {
  static get observedAttributes() { return ["piece", "speed", "still", "size", "bg", "look", "chars", "mono", "contrast", "dot-size", "steps", "density", "all"]; }
  connectedCallback() { this.start(); }
  disconnectedCallback() { this.stop?.(); }
  attributeChangedCallback() { if (this.isConnected) this.start(); }
  // Local change (this site, js/ascii/README.md): at upgrade, attributeChangedCallback fires once per present attribute and
  // connectedCallback once more, and each call used to await the same import and then start its own player (6-7 rAF loops on one
  // canvas, only the last stoppable). start() now coalesces every call in a tick into one _start(), and a generation token after
  // the await makes sure only the latest call plays.
  start() { if (this._q) return; this._q = true; queueMicrotask(() => { this._q = false; this._start(); }); }
  async _start() {
    this.stop?.(); this.stop = null;
    const gen = this._gen = (this._gen || 0) + 1;
    const slug = (this.getAttribute("piece") || "").replace(/[^a-z0-9-]/g, "");
    if (!slug) return;
    if (!this.pre) {
      const root = this.attachShadow ? (this.shadowRoot || this.attachShadow({ mode: "open" })) : this;
      root.innerHTML = `<style>
        :host{display:inline-block;max-width:100%;overflow:hidden}
        pre{margin:0;font:var(--ascii-size,12px)/1 Menlo,Consolas,"DejaVu Sans Mono","Liberation Mono",monospace;letter-spacing:0;white-space:pre;color:var(--ascii-ink,currentColor)}
      </style><pre aria-hidden="true"></pre>`;
      this.pre = root.querySelector("pre");
    }
    this.style.setProperty("--ascii-size", (parseFloat(this.getAttribute("size")) || 12) + "px");
    if (this.getAttribute("bg")) this.style.background = this.getAttribute("bg");
    this.setAttribute("role", "img");
    try {
      const mod = await import(`${BASE}pieces/${slug}.js`);
      if (gen !== this._gen) return;
      if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", mod.meta.name + ", animated ASCII art");
      this.stop = play(this.pre, mod, {
        speed: parseFloat(this.getAttribute("speed")) || 1,
        still: this.hasAttribute("still") || undefined,
        maxFps: parseFloat(this.getAttribute("fps")) || undefined, // local change 2 (js/ascii/README.md): a frame-rate cap
        look: {
          look: this.getAttribute("look") || undefined,
          chars: this.getAttribute("chars") || undefined,
          mono: this.hasAttribute("mono"),
          all: this.hasAttribute("all") || undefined,
          gamma: this.hasAttribute("contrast") ? 0.35 + (parseFloat(this.getAttribute("contrast")) || 0) / 100 * 0.8 : undefined,
          size: this.hasAttribute("dot-size") ? (parseFloat(this.getAttribute("dot-size")) || 85) / 100 : undefined,
          density: this.hasAttribute("density") ? (parseFloat(this.getAttribute("density")) || 100) / 100 : undefined,
          steps: this.hasAttribute("steps") ? parseInt(this.getAttribute("steps"), 10) || 0 : undefined,
        },
      });
    } catch (e) {
      this.pre.textContent = `ascii-art: no piece "${slug}"`;
    }
  }
}
if (!customElements.get("ascii-art")) customElements.define("ascii-art", AsciiArt);
