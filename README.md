# Hector Lugo III: portfolio

Live: [wavy-hec.github.io/PortfolioWebsite](https://wavy-hec.github.io/PortfolioWebsite/)

The site of Hector Lugo III, M.S. Computer Science student at UTRGV (expected December 2026), who works on reinforcement
learning and vision systems for robots. Plain HTML, CSS and JavaScript: no build step, no framework, no runtime
dependencies.

## Files

| Path                                                    | What it is                                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `index.html`                                            | The page: the fold, Work, Experience, Research, About and the footer                                                           |
| `css/sumi.css`                                          | The one stylesheet                                                                                                             |
| `js/sumi.js`                                            | The page's frame loop, the scripts that load as their section nears, the footer's secret                                       |
| `js/sumi-fold.js`                                       | The fold: the moon, the fog and the grass on one wind                                                                          |
| `js/sumi-clips.js`                                      | The drone reel and the poker clip                                                                                              |
| `js/sumi-track.js`                                      | FlowCount's tracker, running live on its plate                                                                                 |
| `js/sumi-xray.js`                                       | The Go2 sketch you can drive                                                                                                   |
| `js/sumi-results.js`                                    | The ICMLA paper's results                                                                                                      |
| `js/sumi-search.js`                                     | The search toy: one room, three memories                                                                                       |
| `js/sumi-ridge.js`                                      | The mountains before the footer                                                                                                |
| `js/game.js`                                            | A hidden game, fetched only when someone finds it                                                                              |
| `img/`                                                  | The fold's Go2, the project plates, the About photograph, the résumé page, the game's codec portrait and the link-preview card |
| `media/`                                                | The drone reel's four clips and the poker clip, each with its poster                                                           |
| `papers/`                                               | The ICMLA 2026 paper, the accepted version with IEEE's notice                                                                  |
| `resume.html`                                           | The résumé as an image with its links laid over it                                                                             |
| `Hector_Lugo_III_Resume.pdf`                            | The résumé, linked from `resume.html`                                                                                          |
| `404.html`                                              | Served by GitHub Pages at any missing path                                                                                     |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` | The seal, as the tab and home-screen icon                                                                                      |
| `sitemap.xml`                                           | The one page, for search engines                                                                                               |
| `_config.yml`                                           | Keeps `tools/` and this README out of the published site                                                                       |
| `.editorconfig`, `.prettierrc.json`, `.prettierignore`  | How the files are formatted: Prettier for the CSS and JS, the HTML by hand                                                     |
| `tools/`                                                | Scripts that make the images and clips                                                                                         |

## Run it locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. The page also works opened straight from disk.

## Tools

Each one says at the top how to run it.

- `make-go2.py`: the Go2 plates in the fold, rendered from MuJoCo Menagerie's model and printed in two colors.
- `make-plate.py`: the G1, RL in Isaac Lab and planet.txt project plates.
- `make-media.sh`: the clips in `media/`, from the drone and poker repositories.
- `make-about-photo.py`: the About photograph, in grayscale, from the original.
- `build-resume-view.py`: `resume.html`'s two images and its links, from the PDF.
- `make-night.py`: the hidden game's codec portrait, `img/raiden-night.png`.
- `og-card.html`: the link-preview card, a still of the fold.

## Deploy

GitHub Pages builds `main` with Jekyll, which copies the pages unchanged and leaves out `tools/` and this README
(`_config.yml`). After changing a file, add or bump the `?v=` where it is loaded: in `index.html` for the stylesheet,
`js/sumi.js`, `js/sumi-fold.js` and the images; in `resume.html` for its two images and the PDF; in `js/sumi.js` for
the scripts in `LAZY_SCRIPTS` and for `js/game.js`; in `js/game.js` for the codec portrait.
