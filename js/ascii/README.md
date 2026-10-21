# js/ascii — the halftone engine (self-hosted copy of ascii-magic)

The runtime that draws the `<ascii-art>` elements (the night page's autumn pagoda and the 404's torii): `ascii.js` (the custom element), `player.js`
(plays a piece into a canvas, only while on screen, holds the first frame under `prefers-reduced-motion`), `glyphs.js` (the
"looks"), `canvas.js` (the halftone painters) and `lib/kit.js` (the toolbox the pieces are built from). The layout mirrors the
upstream one so the "pieces sit next to this file" resolution in `ascii.js` works: pieces live in `pieces/`, the kit in `lib/`.

Copied on 2026-10-20 from `https://www.ascii-magic.com/ascii/` (`ascii.js`, `player.js`, `glyphs.js`, `canvas.js`,
`lib/kit.js`, `pieces/sea-torii-sunset.js`, `pieces/autumn-pagoda-maples.js`; the other upstream pieces were copied and later removed). Nothing is loaded from
ascii-magic.com at runtime: every request the page makes for the engine is same-origin.

Local change 1, in `ascii.js` (marked in the file): `start()` is coalesced. On a custom-element upgrade the browser fires
`attributeChangedCallback` once per attribute already present and `connectedCallback` once more; upstream each call awaited the
same import and then started its own player, so an element with six attributes ran six or seven rAF loops on one canvas and only the
last was stoppable. Here every call in a tick folds into one `_start()` (a microtask), and a generation token checked after the
await lets only the latest call play.

Local changes 2-7 (2026-10-21, for the night page's frame budget; each is marked in its file):

2. `ascii.js`: an `fps` attribute, read at start, caps the frame rate (`play(..., { maxFps })`). The 404's torii and the night page's pagoda are both drawn once (`still`); the fps attribute is available for a piece that plays.
3. `player.js`: between two renders the loop sleeps on a timer instead of requesting an animation frame every display frame, and off
   screen it sleeps altogether until its IntersectionObserver wakes it (upstream kept a 60 Hz requestAnimationFrame running while hidden).
   The timer wakes 4 ms short of the next step, so the one animation frame after it lands past the step: one wake per redraw.
4. `canvas.js` (`paintTone` with the pixel stamper, `stampTone`, `stampOne`): a live player re-stamps only the grid cells whose dot changed
   since its last frame (the pagoda: ~125 of 20,736), clearing each changed dot's box and stamping every dot that reaches into it, clipped to
   the box; the result is pixel-identical to a full redraw (checked) and a frame costs about half as much. Over a quarter of the cells
   changing, a new size or a new grid takes the full path.
5. `player.js` (`play`): a still piece (the `still` attribute, a piece's own `meta.still`, or reduced motion) renders its one frame in a
   later task (`requestIdleCallback`, 1 s timeout; `setTimeout` where there is none) instead of right after the piece's set-up, so the
   two are separate tasks: the pagoda at 4x CPU throttling went from one ~160 ms task to ~41 ms + ~115 ms.
6. `player.js` and `canvas.js` (`play`'s still branch, `render`, `paintTone`, `stampDots`): a halftone-dot still is painted in several
   horizontal slices, one idle callback each (`paint(..., { r0, r1 })` paints only those source rows; the tone curve still reads the whole
   frame, and each slice after the first stamps into the same pixel buffer and puts back only its own rows), so the one render is four
   short tasks instead of one long one. The result is pixel-identical to a single render.
7. `player.js` and `canvas.js` (`play`'s still branch, `render`, `paintTone`): the still's head (building the frame, sizing and clearing
   the canvas) is an idle task of its own; a second, empty slice runs the frame-wide tone pass (every source cell's brightness, the
   curve's percentiles) and clears the pixel buffer, both kept on the slice record (`opts.cache`) for the rest; then six slices instead of
   four. Still pixel-identical.

The engine's internal imports carry a `?v=` cache key (`./player.js?v=13`, `./canvas.js?v=11`) so a browser never mixes an old cached
module with a new one. Everything else is byte-identical to the fetched copies.

## License

The ascii-magic runtime and its pieces are © ascii-magic.com (ASCII Magic), credited in this file and the site README
(the pages themselves carry no credit line). The licence is MIT, as stated by the author. MIT, in short: the copyright notice and the permission notice shall be included in all copies or
substantial portions of the software; the software is provided "as is", without warranty of any kind.

## Our pieces

`pieces/autumn-pagoda-maples.js` (upstream, unchanged byte for byte, 13,474 bytes; ascii-magic.com, MIT as above, copied 2026-10-20; its
import of `../lib/kit.js` already matches this layout) is the night page's second scene (v7.2): the band between About and the footer, drawn in
`look="dots" mono` so its red maples, lanterns and sun come out as paper brightness only. js/sumi.js imports the engine and names the piece
(`data-piece`) 2.5 s after load, or when the band comes within 1600 px of the screen if that is sooner, so the module is not part of the first view.

`pieces/sea-torii-sunset.js` (upstream, unchanged) is the 404's torii. The footer's v7 field, `pieces/wind-grass-paper.js` (a derived
work of ascii-magic's `wind-grass`), was removed in v8: the fold now draws its own grass (`js/sumi-fold.js`, tapered curves on a canvas),
and the night page's only piece is the autumn pagoda above. The upstream `moonlit-sea` and `wind-grass`
pieces and the site's own v6 pieces (the Big Shell, the heliport, the Go2 trot, the low moon) were removed in v7: nothing used them.
Credit as above.
