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
