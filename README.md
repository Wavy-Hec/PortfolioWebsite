# Hector Lugo — Portfolio

Personal portfolio for **Hector Lugo** — MS Computer Science @ UTRGV, researching
**reinforcement learning, computer vision, and vision-language models (VLMs) for robotics**.

A static site with four switchable themes — **ink** (blue-ink editorial with a
dithered Nous-style background), **codec** (MGS2 green phosphor, with a hidden
Konami-code mini-game), **holonet** (Star Wars deep-space hologram), and
**gotham** (Batman: TAS red-sky deco) — plus per-theme portraits, corner
widgets, and easter eggs. Vanilla HTML/CSS/JS, zero build step, zero runtime
dependencies (icons are an inline SVG sprite).

## Stack
Plain HTML, CSS, and vanilla JavaScript — no build step, no dependencies
(Google Fonts via CDN; icons are a hand-authored inline SVG sprite in `index.html`).

| File | Purpose |
| --- | --- |
| `index.html` | Markup and content (incl. the icon sprite) |
| `style.css` | Theme + all component styles |
| `script.js` | Typing animation, mobile nav, scroll effects, terminal reveal, copy-to-clipboard |
| `Hector_Lugo_Resume_Spring_2026.pdf` | Résumé (linked from the hero, nav, and résumé section) |
| `*-dither.png` | Dithered portrait renders (per-theme hero + codec-call portraits) |

## Sections
Home · What I Do · About · Experience · Projects · Skills · Résumé · Beyond the Code · Contact

## Run locally
```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Deploy
Designed to be served as static files (e.g. **GitHub Pages**:
`https://wavy-hec.github.io/PortfolioWebsite/`). No build required — push to `main`.
