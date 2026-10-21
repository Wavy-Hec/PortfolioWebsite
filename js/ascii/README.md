# js/ascii — the halftone engine (self-hosted copy of ascii-magic)

The runtime that draws the `<ascii-art>` elements (the 404's torii; the night page loads it again when a piece returns to it): `ascii.js` (the custom element), `player.js`
(plays a piece into a canvas, only while on screen, holds the first frame under `prefers-reduced-motion`), `glyphs.js` (the
"looks"), `canvas.js` (the halftone painters) and `lib/kit.js` (the toolbox the pieces are built from). The layout mirrors the
upstream one so the "pieces sit next to this file" resolution in `ascii.js` works: pieces live in `pieces/`, the kit in `lib/`.

Copied on 2026-10-20 from `https://www.ascii-magic.com/ascii/` (`ascii.js`, `player.js`, `glyphs.js`, `canvas.js`,
`lib/kit.js`, `pieces/sea-torii-sunset.js`, `pieces/autumn-pagoda-maples.js`; the other upstream pieces were copied and later removed). Nothing is loaded from
ascii-magic.com at runtime: every request the page makes for the engine is same-origin.

One local change, in `ascii.js` only (marked in the file): `start()` is coalesced. On a custom-element upgrade the browser fires
`attributeChangedCallback` once per attribute already present and `connectedCallback` once more; upstream each call awaited the
same import and then started its own player, so an element with six attributes ran six or seven rAF loops on one canvas and only the
last was stoppable. Here every call in a tick folds into one `_start()` (a microtask), and a generation token checked after the
await lets only the latest call play. Everything else is byte-identical to the fetched copies.

## License

The ascii-magic runtime and its pieces are © ascii-magic.com (ASCII Magic), used here with credit: the 404 says "halftone engine: ascii-magic.com" and
the site README credits it. The licence is MIT per the owner's brief, as stated by the author; the site itself
exposes no LICENSE file and the package is not on npm, so verify the terms at ascii-magic.com (or get a line from the author) before
this goes to GitHub Pages. MIT, in short: the copyright notice and the permission notice shall be included in all copies or
substantial portions of the software; the software is provided "as is", without warranty of any kind.

## Our pieces

`pieces/autumn-pagoda-maples.js` (upstream, unchanged byte for byte, 13,474 bytes; ascii-magic.com, MIT as above, copied 2026-10-20; its
import of `../lib/kit.js` already matches this layout) is the night page's second scene (v7.2): the band between About and the footer, drawn in
`look="dots" mono` so its red maples, lanterns and sun come out as paper brightness only. The page names its piece only when the band is within
~800 px of the screen (js/sumi.js, `data-piece`), so the module is not part of the first view. Note: the `LICENSE` fetched from the site
alongside these copies is ascii-magic.com's 404 page, not a licence text; the MIT terms still rest on the owner's brief (see License above); confirm them on ascii-magic.com before publishing.

`pieces/sea-torii-sunset.js` (upstream, unchanged) is the 404's torii. The footer's v7 field, `pieces/wind-grass-paper.js` (a derived
work of ascii-magic's `wind-grass`), was removed in v8: the fold now draws its own grass (`js/sumi-fold.js`, tapered curves on a canvas),
and the night page's only piece is the autumn pagoda above. The upstream `moonlit-sea` and `wind-grass`
pieces and the site's own v6 pieces (the Big Shell, the heliport, the Go2 trot, the low moon) were removed in v7: nothing used them.
Credit as above.
