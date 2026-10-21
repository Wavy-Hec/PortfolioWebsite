# Hector Lugo — Portfolio

**Live site → [wavy-hec.github.io/PortfolioWebsite](https://wavy-hec.github.io/PortfolioWebsite/)**

Personal portfolio of **Hector Lugo** — M.S. Computer Science @ UTRGV; AI/ML research
intern at the Air Force Research Laboratory (summer 2026). Reinforcement learning,
computer vision, and vision-language models for robotics.

Vanilla HTML/CSS/JS. No build step, no frameworks, no runtime dependencies.

## The page (sumi v9 — the samurai fold)

One page, monochrome: sumi ground (`#141416`), paper type (`#e9e7e2`, Shippori Mincho + Share Tech Mono) and a silver grain. The fold is one
scene and a two-line headline: Raiden (illustrated by Yoji Shinkawa, cut out as paper) in front of a full moon printed in his own halftone, standing in tall pampas
grass that bends in gusts rolling left to right, with fog drifting on the same wind (all procedural, `js/sumi-fold.js`). Then four
chapters on a left rail (一 Work, 二 Experience, 三 Research, 四 About) and the footer.

| File | Purpose |
| --- | --- |
| `index.html` | The page: the fold, the ten project plates as lit prints, the five résumé entries, the research stack and the papers, the About print and the Go2 sketch, the footer |
| `css/sumi.css` | The one stylesheet (tokens, the weather, every chapter, the responsive pass: 390 first, then 768, 1440, 1920) |
| `js/sumi.js` | The frame loop (~30 fps; each drawing subscribes only while on screen, and the loop sleeps when none is, when the tab is hidden, while the game is open and under reduced motion), the two chapter drawings and the halftone engine loaded on approach, the "!" over Raiden, the secret |
| `js/sumi-fold.js` | The fold's weather: the moon (a flat halftone disc in his plate's Bayer screen behind his head, drawn once), three fog layers and the grass on one wind; only while the fold is on screen; one still frame under reduced motion |
| `js/sumi-stack.js` | Research: four isometric plates as a cursor-lit dot grid, each a button |
| `js/sumi-xray.js` | About: the Unitree Go2 in side elevation, drawn from forward kinematics (proportions from the `go2_description` URDF), with hardware tags |
| `js/ascii/` | A self-hosted copy of the [ascii-magic](https://www.ascii-magic.com/) halftone runtime (MIT, `js/ascii/README.md`, four marked local changes): draws the autumn pagoda band between About and the footer (`pieces/autumn-pagoda-maples.js`, imported and named only when the band nears the screen; a fine screen drawn once and held, never animated) and the 404's torii (`pieces/sea-torii-sunset.js`) |
| `js/game.js` | The hidden mini-game (three ops on the Big Shell, in moonlit steel blue on navy), loaded only when the footer's `140.85` is dialed (or the Konami code, or `140.85` typed) |
| `img/` | `raiden-night.png` + `raiden-shade.png` (the fold: his paper plate and, under it, his ink as a sumi silhouette, its back torn into dry brush, so the moon never shows through him, `tools/make-night.py`), `ink-raiden-snake.png` (About), `proj-*-ink.png` + `-2x` (the plates: 640 and 1280, 1-bit ink on paper), `resume-page1.png`, `og-card.png`. No portrait files: the game's codec call masks `raiden-night.png` in steel blue for Raiden and draws the Colonel in code |
| `papers/lugo-icmla-2026.pdf` | The ICMLA 2026 paper (IEEE's reuse notice sits under its entry in the publications list). Note: the file carries the proceedings footer (page 640, the IEEE copyright line, the DOI), i.e. the publisher's version; IEEE's policy lets authors post the accepted manuscript, so swap in that version before publishing |
| `resume.html` | The résumé page: the PDF's first page as an image with its links re-created as hotspots (`tools/build-resume-view.py`) |
| `404.html` | Self-contained night 404 with the torii |
| `Hector_Lugo_Fall_Resume.pdf` | Résumé (downloads from `resume.html`) |

The mark is a paper disc with the H+L cut as sumi strokes: the `#seal` symbol in `index.html` / `resume.html`, `favicon.svg` (the
favicon), `favicon-32.png` and `apple-touch-icon.png` are the same drawing (the 404 inlines it, since it is served at any path). `tools/og-card.html` is the source of the link-preview
card.

Accessible (keyboard-reachable everything, `prefers-reduced-motion` turns every movement off) and light (the first view is the page, one
stylesheet, two small scripts, one 14 KB cutout and its 4 KB silhouette; the two chapter drawings, the halftone engine with its piece and
the game load lazily).

## Run locally

```bash
python -m http.server 8000
# open http://localhost:8000
```

On a local host, `?at=all&vh=840` lays the whole page out at once for screenshots, `?stack=1,x,y` sets the research stack's light and
`?xray=9` the sketch's clock, `?wind=<seconds>` composes the fold's wind at that instant and `?perf=1` writes the fold's frame cost to
`document.documentElement.dataset.foldPerf`.

## Deploy

GitHub Pages, straight from `main` — no build. Cache-busting is manual: bump the `?v=` query on any CSS/JS file you change
(referenced in `index.html`; `js/game.js` is referenced in `js/sumi.js`).
