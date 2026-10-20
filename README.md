# Hector Lugo — Portfolio

**Live site → [wavy-hec.github.io/PortfolioWebsite](https://wavy-hec.github.io/PortfolioWebsite/)**

Personal portfolio of **Hector Lugo** — M.S. Computer Science @ UTRGV, AI/ML research
intern at the Air Force Research Laboratory. Reinforcement learning, computer vision,
and vision-language models for robotics.

Vanilla HTML/CSS/JS. No build step, no frameworks, no runtime dependencies.

## The night page (v5)

`index.html` is the night page: sumi ground, paper type (Shippori Mincho + Share Tech Mono), one red. It is built from
`css/sumi.css`, `js/sumi.js` (the wind, the loop, the opening, the chapter numerals, the secret), `js/sumi-field.js` (the live
ASCII pampas field in the hero and the footer), `js/sumi-xray.js` (the Unitree Go2 kinematic sketch in About) and `js/radar.js` (the Soliton radar, drawn at 108 px inside the page's
one frame loop; `legacy.html` runs it on its own). The mark is a round red seal with the H+L cut as paper strokes: the `#seal` symbol in
`index.html` / `resume.html`, the inline favicon, `favicon.svg`, `favicon-32.png` and `apple-touch-icon.png` are the same drawing.
`resume.html` and `404.html` wear the same palette. The previous four-theme site is kept whole as `legacy.html` (with
`style.css`, `js/script.js`, `js/dither.js`), linked from the footer. `sumi.html` only redirects to `./`.

### The halftone pass (v6)

`js/ascii/` is a self-hosted copy of the [ascii-magic](https://www.ascii-magic.com/) runtime (MIT; `js/ascii/README.md`), which draws the
page's `<ascii-art>` pieces as mono paper dots: the Big Shell on the hero's horizon (`pieces/big-shell-sea.js`), the Shadow Moses heliport
behind Work (`pieces/heliport-snow.js`), the Go2 trotting behind About (`pieces/go2-trot.js`) and `wind-grass-paper` (ascii-magic's
`wind-grass` redrawn as paper brightness, one dot per cell) with a `low-moon` in the footer; `404.html` wears its `sea-torii-sunset` in mono (the engine loaded by an absolute URL, probing both the live
`/PortfolioWebsite/` path and the repo root). The first three are original pieces in the ascii-magic piece format, under 8 KB each, that
also read in `look="ascii"`. The research stack is `js/sumi-stack.js`: four isometric plates as a cursor-lit dot grid with sparks, each plate
a button. `js/sumi.js` sizes every piece to its CSS box (`data-cols`) and carries the dev hooks for headless screenshots (`?at=all`,
`?stack=`, `?focus=`, `?xray=`; they answer only on localhost / 127.0.0.1). Nothing is fetched from ascii-magic.com at runtime; the
engine's `start()` is coalesced locally (one player per element, `js/ascii/README.md`).

## Features

- **Four switchable themes** (picker in the header, persisted per visitor):
  | Theme | Look |
  | --- | --- |
  | `ink` | Blue-ink editorial with a dithered, drifting noise background (default) |
  | `codec` | MGS2 green phosphor — codec HUD, Soliton radar, reticle cursor |
  | `holonet` | Star Wars deep space — holo-glass panels, hyperspace jump on switch, lightsaber dividers, Death Star limb |
  | `gotham` | Batman: TAS storm-sky noir — black deco skyline, searchlight, drifting clouds, distant lightning |
- **Codec Infiltration** — a hidden MGS-style stealth mini-game. Enter the Konami code
  (↑ ↑ ↓ ↓ ← → ← → B A) or use the footer `CODEC 140.85` button. Per-theme chrome,
  personal best times, touch controls.
- **Per-theme everything** — dithered hero portraits, project plates, codec-call quotes,
  corner widget (Soliton radar / targeting computer / GCPD bat-signal tracker), and a
  handful of curated easter eggs worth finding.
- Accessible (WCAG AA contrast, keyboard-first picker and game, `prefers-reduced-motion`
  respected throughout) and fast (inline SVG icon sprite, idle-deferred background,
  ~80 KB compressed first load).

## Files

| File | Purpose |
| --- | --- |
| `index.html` | All markup + the inline SVG icon sprite and pre-paint theme scripts |
| `style.css` | Every component and all four theme scopes |
| `js/script.js` | Theme system, picker, Konami/game loader, easter eggs, contact form, nav |
| `js/game.js` | Codec Infiltration mini-game (lazy-loaded on first launch) |
| `js/radar.js` | Corner widget — per-theme canvas instrument |
| `js/dither.js` | Animated dithered noise background (ink/codec) |
| `404.html` | Self-contained themed 404 page |
| `img/` | All site images: dithered portrait renders (per-theme hero + codec-call), `proj-*` blueprint project plates (four palettes each), résumé page render |
| `Hector_Lugo_Fall_Resume.pdf` | Résumé (opens in-browser from the site) |

## Run locally

```bash
python -m http.server 8000
# open http://localhost:8000
```

## Deploy

GitHub Pages, straight from `main` — no build. Cache-busting is manual: bump the
`?v=` query on any CSS/JS file you change (`style.css` and the `js/` scripts are
referenced in `index.html`; `js/game.js` is referenced in `js/script.js`).
