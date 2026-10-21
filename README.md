# Hector Lugo — Portfolio

**Live site → [wavy-hec.github.io/PortfolioWebsite](https://wavy-hec.github.io/PortfolioWebsite/)**

Personal portfolio of **Hector Lugo** — M.S. Computer Science @ UTRGV, AI/ML research
intern at the Air Force Research Laboratory. Reinforcement learning, computer vision,
and vision-language models for robotics.

Vanilla HTML/CSS/JS. No build step, no frameworks, no runtime dependencies.

## The page (sumi v7 — "poster")

One page, monochrome: sumi ground (`#141416`), paper type (`#e9e7e2`, Shippori Mincho + Share Tech Mono), a still fog bank (in the fold only) and a
silver grain. The fold is one figure — Raiden, illustrated by Yoji Shinkawa, cut out as paper — and a two-line headline. Then four
chapters on a left rail (一 Work, 二 Experience, 三 Research, 四 About) and the footer.

| File | Purpose |
| --- | --- |
| `index.html` | The page: the fold, the ten project plates as lit prints, the five résumé entries, the research stack and the papers, the About print and the Go2 sketch, the footer |
| `css/sumi.css` | The one stylesheet (tokens, the weather, every chapter, the responsive pass: 390 first, then 768, 1440, 1920) |
| `js/sumi.js` | The frame loop (~30 fps, asleep when hidden or under reduced motion), the "!" over Raiden, the halftone piece's sizing, the secret |
| `js/sumi-stack.js` | Research: four isometric plates as a cursor-lit dot grid, each a button |
| `js/sumi-xray.js` | About: the Unitree Go2 in side elevation, drawn from forward kinematics (proportions from the `go2_description` URDF), with hardware tags |
| `js/ascii/` | A self-hosted copy of the [ascii-magic](https://www.ascii-magic.com/) halftone runtime (MIT, `js/ascii/README.md`): draws the footer's field (`pieces/wind-grass-paper.js`) and the 404's torii (`pieces/sea-torii-sunset.js`) |
| `js/game.js` | The hidden mini-game, loaded only when the footer's `140.85` is dialed (or the Konami code, or `140.85` typed) |
| `img/` | `raiden-night.png` (the fold), `ink-raiden-snake.png` (About), `proj-*-ink.png` + `-2x` (the plates: 640 and 1280, 1-bit ink on paper), `resume-page1.png`, `og-card.png`, the two codec portraits the game uses |
| `papers/lugo-icmla-2026.pdf` | The accepted manuscript of the ICMLA 2026 paper (author-posted; the IEEE notice sits under the publications list) |
| `resume.html` | The résumé page: the PDF's first page as an image with its links re-created as hotspots (`tools/build-resume-view.py`) |
| `404.html` | Self-contained night 404 with the torii |
| `sumi.html` | A redirect stub to `./` (old links) |
| `Hector_Lugo_Fall_Resume.pdf` | Résumé (downloads from `resume.html`) |

The mark is a paper disc with the H+L cut as sumi strokes: the `#seal` symbol in `index.html` / `resume.html`, the inline favicon,
`favicon.svg`, `favicon-32.png` and `apple-touch-icon.png` are the same drawing. `tools/og-card.html` is the source of the link-preview
card.

Accessible (keyboard-reachable everything, `prefers-reduced-motion` turns every movement off) and light (the first view is the page, one
stylesheet, three small scripts, one 16 KB cutout and one 640 px plate; the halftone engine and the game load lazily).

## Run locally

```bash
python -m http.server 8000
# open http://localhost:8000
```

On a local host, `?at=all&vh=840` lays the whole page out at once for screenshots, `?stack=1,x,y` sets the research stack's light and
`?xray=9` the sketch's clock.

## Deploy

GitHub Pages, straight from `main` — no build. Cache-busting is manual: bump the `?v=` query on any CSS/JS file you change
(referenced in `index.html`; `js/game.js` is referenced in `js/sumi.js`).
