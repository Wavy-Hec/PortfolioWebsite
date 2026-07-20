# Hector Lugo — Portfolio

**Live site → [wavy-hec.github.io/PortfolioWebsite](https://wavy-hec.github.io/PortfolioWebsite/)**

Personal portfolio of **Hector Lugo** — M.S. Computer Science @ UTRGV, AI/ML research
intern at the Air Force Research Laboratory. Reinforcement learning, computer vision,
and vision-language models for robotics.

Vanilla HTML/CSS/JS. No build step, no frameworks, no runtime dependencies.

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
| `script.js` | Theme system, picker, Konami/game loader, easter eggs, contact form, nav |
| `game.js` | Codec Infiltration mini-game (lazy-loaded on first launch) |
| `radar.js` | Corner widget — per-theme canvas instrument |
| `dither.js` | Animated dithered noise background (ink/codec) |
| `404.html` | Self-contained themed 404 page |
| `*-dither.png`, `cc-*.png` | Dithered portrait renders (per-theme hero + codec-call) |
| `proj-*.png` | Hand-drawn "blueprint plate" project art, four palettes each |
| `Hector_Lugo_Resume_Summer.pdf` | Résumé (opens in-browser from the site) |

## Run locally

```bash
python -m http.server 8000
# open http://localhost:8000
```

## Deploy

GitHub Pages, straight from `main` — no build. Cache-busting is manual: bump the
`?v=` query on any CSS/JS file you change (`style.css`/`script.js`/`radar.js`/`dither.js`
are referenced in `index.html`; `game.js` is referenced in `script.js`).
