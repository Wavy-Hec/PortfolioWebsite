# js/ascii — the halftone engine (self-hosted copy of ascii-magic)

The runtime that draws the `<ascii-art>` elements on the night page and the 404: `ascii.js` (the custom element), `player.js`
(plays a piece into a canvas, only while on screen, holds the first frame under `prefers-reduced-motion`), `glyphs.js` (the
"looks"), `canvas.js` (the halftone painters) and `lib/kit.js` (the toolbox the pieces are built from). The layout mirrors the
upstream one so the "pieces sit next to this file" resolution in `ascii.js` works: pieces live in `pieces/`, the kit in `lib/`.

Copied on 2026-10-20 from `https://www.ascii-magic.com/ascii/` (`ascii.js`, `player.js`, `glyphs.js`, `canvas.js`,
`lib/kit.js`, `pieces/wind-grass.js`, `pieces/sea-torii-sunset.js`, `pieces/moonlit-sea.js`). Nothing is loaded from
ascii-magic.com at runtime: every request the page makes for the engine is same-origin.

One local change, in `ascii.js` only (marked in the file): `start()` is coalesced. On a custom-element upgrade the browser fires
`attributeChangedCallback` once per attribute already present and `connectedCallback` once more; upstream each call awaited the
same import and then started its own player, so an element with six attributes ran six or seven rAF loops on one canvas and only the
last was stoppable. Here every call in a tick folds into one `_start()` (a microtask), and a generation token checked after the
await lets only the latest call play. Everything else is byte-identical to the fetched copies.

## License

The ascii-magic runtime and its pieces are © ascii-magic.com (ASCII Magic), used here with credit: the footer's legal row and the
404 both say "halftone engine: ascii-magic.com". The licence is MIT per the owner's brief, as stated by the author; the site itself
exposes no LICENSE file and the package is not on npm, so verify the terms at ascii-magic.com (or get a line from the author) before
this goes to GitHub Pages. MIT, in short: the copyright notice and the permission notice shall be included in all copies or
substantial portions of the software; the software is provided "as is", without warranty of any kind.

## Our pieces

`pieces/big-shell-sea.js`, `pieces/heliport-snow.js`, `pieces/go2-trot.js` and `pieces/low-moon.js` are original pieces
written for this site in the ascii-magic piece format (`export const meta`, `export default function create()` returning
`(t) => frame`), monochrome paper-on-sumi palettes of eight tones. They import only `lib/kit.js`. Same license as the site.
`pieces/wind-grass-paper.js` is a derived work: ascii-magic's `wind-grass` (its gust field and blade model) redrawn at 192 x 72
square cells with every cell a paper brightness, so the dots look halftones the blades themselves (the upstream piece draws its
blades as line-work glyphs, which the dots look keeps as text unless `all`, and `all` makes them darker than the ground). It is
the footer's field. Credit as above.
