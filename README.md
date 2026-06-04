# Hector Lugo — Portfolio

Personal portfolio for **Hector Lugo** — MS Computer Science @ UTRGV, researching
**reinforcement learning, computer vision, and vision-language models (VLMs) for robotics**.

A static site with a Hermes-inspired teal + cream theme (near-black teal `#041c1c`
+ warm cream `#ffe6cb`, flat panels, film grain, monospace terminal touches).

## Stack
Plain HTML, CSS, and vanilla JavaScript — no build step, no dependencies
(Font Awesome + Google Fonts via CDN).

| File | Purpose |
| --- | --- |
| `index.html` | Markup and content |
| `style.css` | Theme + all component styles |
| `script.js` | Typing animation, mobile nav, scroll effects, terminal reveal, copy-to-clipboard |
| `Hector_Lugo_Resume_Spring_2026-1.pdf` | Résumé (linked from the hero, nav, and résumé section) |
| `pfp.jpg` | Profile photo (optimized) |
| `raiden.png` | Metal Gear Solid 2 artwork (Beyond the Code section) |

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
