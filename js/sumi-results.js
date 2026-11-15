// The results figure: the ICMLA paper's four comparisons, each bar a column of dots lit from the
// bottom up to its value. Tabs switch the view; a table beside the canvas carries the numbers.
(() => {
  'use strict';

  const S = window.SUMI;
  const root = document.querySelector('.results');
  if (!root) return;

  const PAPER = '#e9e7e2';
  const DPR = Math.min(2, devicePixelRatio || 1);
  const forcedColors = matchMedia('(forced-colors: active)');
  const ROWS = 40;
  const BAR_GAP_DOTS = 3;
  const SETTLE_S = 0.45;
  const LABEL_GAP_PX = 5;
  // the value labels' line height in the css
  const LABEL_PX = 14;
  const LINE_CLEAR_PX = 4;
  const NOTCH_PX = 22;
  const TICK_DOT_GAP_PX = 4;
  // dot radii, in pitches
  const SOLID_R = 0.36;
  const SCREEN_R = 0.235;
  const UNLIT_R = 0.1;
  const LIT_ALPHA = 0.92;
  const FAINT_ALPHA = 0.65;
  const TICKS = [50, 100];

  const GROUPS = [
    { name: 'Easy', scenarios: 18 },
    { name: 'Moderate', scenarios: 12 },
    { name: 'Hard', scenarios: 30 },
  ];
  const BARS = 2 * GROUPS.length;
  // the bars beside each run of a reference line: before, between and after the groups
  const RUNS = [[0], [1, 2], [3, 4], [5]];
  // percent success for easy, moderate, hard: Figs. 4 to 7 of the paper
  const VIEWS = [
    {
      series: ['Bounding box', 'Direct'],
      panels: [{ measure: 'Stopping', solid: [82.2, 86.4, 78.9], screen: [14.4, 8.2, 10.9] }],
    },
    {
      series: ['Continuous', 'Discrete'],
      panels: [{ measure: 'Steering', solid: [100.0, 95.8, 63.3], screen: [98.3, 92.5, 52.3] }],
    },
    {
      series: ['Multi-pass', 'Single-pass'],
      panels: [
        { measure: 'Steering', solid: [100.0, 95.8, 63.3], screen: [100.0, 93.3, 60.3] },
        { measure: 'Stopping', solid: [82.2, 86.4, 78.9], screen: [85.6, 94.5, 80.7] },
      ],
    },
    {
      series: ['Every 20 steps', 'Every 50 steps'],
      panels: [
        { measure: 'Steering', solid: [99.7, 91.7, 62.2], screen: [99.2, 94.2, 57.8] },
        { measure: 'Stopping', solid: [45.7, 50.0, 51.7], screen: [48.3, 48.3, 43.8] },
      ],
    },
  ];

  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panel = root.querySelector('[role="tabpanel"]');
  const findings = [...root.querySelectorAll('.res-finding p')];
  const notes = [...root.querySelectorAll('.res-note p')];
  const keys = [...root.querySelectorAll('.res-key')];
  const tableBox = root.querySelector('.res-table');
  const table = tableBox.querySelector('table');

  function label(parent, className, text) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    parent.append(span);
    return span;
  }

  // a plot's bars run group by group, the solid one first
  const plots = [...root.querySelectorAll('.res-plot')].map(el => {
    const canvas = el.querySelector('canvas');
    const groups = GROUPS.map((group, g) => {
      const span = label(el, 'res-group', group.name);
      label(span, 'res-count', g ? group.scenarios : `${group.scenarios} scenarios`);
      return span;
    });
    const values = [];
    for (let i = 0; i < BARS; i++) values.push(label(el, 'res-value', ''));
    return {
      el,
      canvas,
      ctx: canvas.getContext('2d'),
      measure: label(el, 'res-measure', ''),
      ticks: TICKS.map(tick => label(el, 'res-tick', tick)),
      groups,
      values,
      level: new Array(BARS).fill(0),
      from: new Array(BARS).fill(0),
      to: new Array(BARS).fill(0),
    };
  });
  const shownPlots = () => plots.filter(plot => !plot.el.hidden);

  let view = 0;
  let ink = PAPER;
  let width = 0;
  let height = 0;
  let pitch = 0;
  let barDots = 0;
  let groupWidth = 0;
  let groupLeft = [];
  let progress = 1;
  let risen = false;

  // on a pixel centre, so a one-pixel dot stays one pixel
  const centre = i => Math.floor((i + 0.5) * pitch) + 0.5;
  const barLeft = i => groupLeft[Math.floor(i / 2)] + (i % 2) * (barDots + BAR_GAP_DOTS) * pitch;

  function dot(path, x, y, r) {
    path.moveTo(x + r, y);
    path.arc(x, y, r, 0, 2 * Math.PI);
  }

  function fillDots(ctx, path, alpha) {
    ctx.fillStyle = ink;
    ctx.globalAlpha = alpha;
    ctx.fill(path);
  }

  function labelCovers(value, y) {
    const bottom = height * (1 - value / 100) - LABEL_GAP_PX;
    return y > bottom - LABEL_PX - LINE_CLEAR_PX && y < bottom + LINE_CLEAR_PX;
  }

  function drawPlot(plot) {
    const lit = new Path2D();
    const faint = new Path2D();
    for (const tick of TICKS) {
      const y = Math.round(height * (1 - tick / 100)) + 0.5;
      // a run beside a value label on the line would read as a dot leader
      const covered = RUNS.map(bars => risen && bars.some(i => labelCovers(plot.to[i], y)));
      for (let x = 0.5; x < width; x += TICK_DOT_GAP_PX) {
        const inGroup = groupLeft.some(left => x > left - pitch && x < left + groupWidth + pitch);
        const run = groupLeft.filter(left => x > left).length;
        if (!inGroup && !covered[run]) dot(faint, x, y, 0.5);
      }
    }
    plot.level.forEach((level, i) => {
      const litRows = (level / 100) * ROWS;
      const litR = (i % 2 ? SCREEN_R : SOLID_R) * pitch;
      const unlitR = UNLIT_R * pitch;
      for (let row = 0; row < ROWS; row++) {
        const fill = Math.max(0, Math.min(1, litRows - row));
        // the value sits on its column: leave it a notch in the unlit dots
        if (!fill && risen && (row - litRows) * pitch < NOTCH_PX) continue;
        const y = height - centre(row);
        const r = unlitR + (litR - unlitR) * fill;
        for (let col = 0; col < barDots; col++) {
          dot(fill ? lit : faint, barLeft(i) + centre(col), y, r);
        }
      }
    });
    plot.ctx.clearRect(0, 0, width, height);
    fillDots(plot.ctx, lit, LIT_ALPHA);
    fillDots(plot.ctx, faint, FAINT_ALPHA);
  }

  function paint() {
    for (const plot of shownPlots()) {
      drawPlot(plot);
      plot.values.forEach((el, i) => {
        const y = height * (1 - plot.level[i] / 100) - LABEL_GAP_PX;
        el.style.transform = `translate(-50%, ${y.toFixed(1)}px)`;
      });
    }
  }

  function drawKeys() {
    keys.forEach((key, s) => {
      const canvas = key.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const sample = new Path2D();
      canvas.width = Math.round(canvas.clientWidth * DPR);
      canvas.height = Math.round(canvas.clientHeight * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          dot(sample, centre(col), centre(row), (s ? SCREEN_R : SOLID_R) * pitch);
        }
      }
      fillDots(ctx, sample, LIT_ALPHA);
    });
  }

  function layout() {
    // forced colours repaint the page but not a canvas: the dots take the system's text colour
    ink = forcedColors.matches ? getComputedStyle(root).color : PAPER;
    width = plots[0].el.clientWidth;
    height = plots[0].canvas.clientHeight;
    // css sets the canvas height: a whole number of pixels per row
    pitch = height / ROWS;
    const slot = width / GROUPS.length;
    // a group's slot is 3.5 bars wide: its two bars, the gap between them, and air
    barDots = Math.max(4, Math.min(11, Math.floor(slot / pitch / 3.5)));
    groupWidth = (2 * barDots + BAR_GAP_DOTS) * pitch;
    groupLeft = GROUPS.map((_, g) => Math.round(slot * (g + 0.5) - groupWidth / 2));
    for (const plot of plots) {
      // a whole number of css pixels wide, so the bitmap is never resampled
      plot.canvas.style.width = width + 'px';
      plot.canvas.width = Math.round(width * DPR);
      plot.canvas.height = Math.round(height * DPR);
      plot.ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      plot.ticks.forEach((el, i) => {
        el.style.top = height * (1 - TICKS[i] / 100) + 'px';
      });
      plot.groups.forEach((el, g) => {
        el.style.left = slot * (g + 0.5) + 'px';
      });
      plot.values.forEach((el, i) => {
        el.style.left = barLeft(i) + (barDots * pitch) / 2 + 'px';
      });
    }
    drawKeys();
    paint();
  }

  function renderTable() {
    const { series, panels } = VIEWS[view];
    const heading = (row, scope, text) => {
      const th = document.createElement('th');
      th.scope = scope;
      th.textContent = text;
      row.append(th);
    };
    table.replaceChildren();
    table.createCaption().textContent = findings[view].textContent;
    const head = table.createTHead().insertRow();
    heading(head, 'col', 'Scenarios');
    for (const { measure } of panels) {
      for (const name of series) heading(head, 'col', `${measure} success, ${name.toLowerCase()}`);
    }
    const body = table.createTBody();
    GROUPS.forEach((group, g) => {
      const row = body.insertRow();
      heading(row, 'row', `${group.name}, ${group.scenarios} scenarios`);
      for (const { solid, screen } of panels) {
        row.insertCell().textContent = solid[g].toFixed(1) + '%';
        row.insertCell().textContent = screen[g].toFixed(1) + '%';
      }
    });
  }

  function select(index) {
    view = index;
    const { series, panels } = VIEWS[view];
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', i === view);
      tab.tabIndex = i === view ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', tabs[view].id);
    findings.forEach((p, i) => p.classList.toggle('on', i === view));
    notes.forEach((p, i) => p.classList.toggle('on', i === view));
    keys.forEach((key, s) => {
      key.lastElementChild.textContent = series[s];
    });
    plots.forEach((plot, p) => {
      plot.el.hidden = !panels[p];
      if (!panels[p]) {
        plot.level.fill(0);
        return;
      }
      const { measure, solid, screen } = panels[p];
      plot.measure.textContent = `${measure} success, %`;
      plot.to = GROUPS.flatMap((_, g) => [solid[g], screen[g]]);
    });
    renderTable();
  }

  function setLevels(e) {
    for (const plot of shownPlots()) {
      plot.level = plot.from.map((from, i) => from + (plot.to[i] - from) * e);
    }
    paint();
  }

  function step(dt) {
    progress = Math.min(1, progress + dt / SETTLE_S);
    setLevels(progress * progress * (3 - 2 * progress));
    if (progress === 1) S.remove(step);
  }

  function settle() {
    risen = true;
    for (const plot of shownPlots()) {
      plot.from = plot.level.slice();
      plot.values.forEach((el, i) => {
        el.textContent = plot.to[i].toFixed(1);
      });
    }
    if (S.REDUCED) {
      setLevels(1);
      return;
    }
    progress = 0;
    paint();
    S.add(step);
  }

  function show(index) {
    if (index === view && risen) return;
    select(index);
    // a lone panel takes the whole measure: when the width changes, the columns start from empty
    if (plots[0].el.clientWidth !== width) {
      for (const plot of plots) plot.level.fill(0);
      layout();
    }
    settle();
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => show(i));
    tab.addEventListener('keydown', e => {
      const last = tabs.length - 1;
      let next;
      if (e.key === 'ArrowRight') next = i === last ? 0 : i + 1;
      else if (e.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = last;
      else return;
      e.preventDefault();
      tabs[next].focus();
      show(next);
    });
  });

  tableBox.classList.add('sr-only');
  root.classList.add('ready');
  select(0);
  layout();

  if (S.REDUCED) {
    settle();
  } else {
    // the columns rise the first time the chart is seen
    const io = new IntersectionObserver(
      entries => {
        if (!entries[entries.length - 1].isIntersecting) return;
        io.disconnect();
        if (!risen) settle();
      },
      { threshold: 0.4 },
    );
    io.observe(plots[0].el);
  }

  forcedColors.addEventListener('change', layout);

  let resizeTimer;
  addEventListener(
    'resize',
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (plots[0].el.clientWidth !== width) layout();
      }, 150);
    },
    { passive: true },
  );
})();
