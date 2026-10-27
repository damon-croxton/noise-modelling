/* ============================= VIEW / COORDS =========================== */
function s2w(sx, sy) { const v = state.view; return [v.cx + (sx - cssW / 2) / v.scale, v.cy - (sy - cssH / 2) / v.scale]; }
function w2s(x, y) { const v = state.view; return [(x - v.cx) * v.scale + cssW / 2, cssH / 2 - (y - v.cy) * v.scale]; }
function resize() {
  const r = wrap.getBoundingClientRect();
  cssW = Math.max(100, Math.floor(r.width)); cssH = Math.max(100, Math.floor(r.height));
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  requestCompute(false);
}

/* ============================ GRID COMPUTE ============================= */
/* The heat map is computed a few rows at a time across animation frames, so
   the page stays responsive on slow laptops. The last finished map stays on
   screen – moved and scaled with the view – until the new one is ready.
   Panning and zooming reuse it and recompute only once the view stops. */
let gridJob = null;
function startGrid(cellPx, quiet) {
  // fast redraws while dragging plant skip reflections (the full pass follows)
  const S = quiet ? Object.assign({}, state.settings, { _fast: true }) : state.settings, srcs = activeSources();
  prep(srcs);
  const gw = Math.ceil(cssW / cellPx), gh = Math.ceil(cssH / cellPx);
  gridJob = { cellPx, quiet, S, srcs, gw, gh, j: 0, i: 0, img: offctx.createImageData(gw, gh), view: Object.assign({}, state.view), W: cssW, H: cssH, t0: performance.now(), busy: 0, maxL: -Infinity, masked: 0 };
}
/* Works on the current job for up to `budget` ms; true when it is finished. */
function stepGrid(budget) {
  const J = gridJob; if (!J) return true;
  const t1 = performance.now(), tEnd = t1 + budget, B = state.buildings, S = J.S, srcs = J.srcs, data = J.img.data, v = J.view, inv = 1 / v.scale;
  let out = false;
  while (J.j < J.gh && srcs.length && !out) {
    const j = J.j, wy = v.cy - ((j + 0.5) * J.cellPx - J.H / 2) * inv;
    for (let i = J.i; i < J.gw; i++) {
      if ((i & 7) === 0 && i > J.i && performance.now() > tEnd) { J.i = i; out = true; break; }   // stop mid-row, carry on next frame
      const wx = v.cx + ((i + 0.5) * J.cellPx - J.W / 2) * inv;
      if (B.length && buildingAt(wx, wy)) { J.masked++; continue; }
      const gr = ground(wx, wy);
      let e = 0;
      for (let s = 0; s < srcs.length; s++) e += Math.pow(10, contrib(srcs[s], wx, wy, S, B, false, gr) / 10);
      const L = 10 * Math.log10(e);
      if (L > J.maxL) J.maxL = L;
      if (!(L >= S.minDb) || L < BANDS[0][0]) continue;
      const c = BAND_RGB[Math.min(BANDS.length - 1, Math.floor((L - BANDS[0][0]) / 5))], k = (j * J.gw + i) * 4;
      data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2]; data[k + 3] = 255;
    }
    if (out) break;
    J.j++; J.i = 0;
    if (performance.now() > tEnd) break;
  }
  J.busy += performance.now() - t1;
  if (J.j < J.gh && srcs.length) { $('busy').textContent = `Updating heat map… ${Math.round(100 * J.j / J.gh)} %`; return false; }
  off.width = J.gw; off.height = J.gh; offctx.putImageData(J.img, 0, 0);
  grid = { cellPx: J.cellPx, gw: J.gw, gh: J.gh, view: J.view, W: J.W, H: J.H };
  gridJob = null;
  const ms = J.busy, B2 = state.buildings;
  $('busy').textContent = `${J.gw}×${J.gh} receivers · ${srcs.length} src · ${B2.length} bldg · ${ms.toFixed(0)} ms · cell ≈ ${fmt(J.cellPx / v.scale, 2)} m`;
  if (!J.quiet && srcs.length) log(`Grid ${J.gw}×${J.gh} (${(J.gw * J.gh).toLocaleString()} rcv, ${J.masked} masked) × ${srcs.length} src, ${B2.length} bldg, ${state.hoardings.length} hoarding${state.terrain ? ', terrain' : ''}: ${ms.toFixed(0)} ms. Max ${fmt(J.maxL)} dB(A).`);
  return true;
}
/* Draws the last finished heat map where it belongs in the current view. */
function drawGrid() {
  const G = grid, v = state.view; if (!G || !G.view) return;
  const k = v.scale / G.view.scale;
  const dx = (G.view.cx - v.cx) * v.scale - G.W / 2 * k + cssW / 2, dy = cssH / 2 - (G.view.cy - v.cy) * v.scale - G.H / 2 * k;
  ctx.drawImage(off, dx, dy, G.gw * G.cellPx * k, G.gh * G.cellPx * k);
}

/* ============================== SCHEDULER ============================== */
let rafId = 0, needCompute = false, computeFast = false, fullTimer = 0;
/* fast: a coarse quick pass now (dragging plant), then the full pass. */
function requestCompute(fast) {
  needCompute = true; computeFast = fast;
  clearTimeout(fullTimer);
  if (fast) fullTimer = setTimeout(() => requestCompute(false), 250);
  schedule();
}
/* The view moved (pan / zoom): redraw now with the current heat map, recompute once it settles. */
function requestViewChange() {
  clearTimeout(fullTimer);
  fullTimer = setTimeout(() => requestCompute(false), 300);
  schedule();
}
function requestRender() { schedule(); }
function schedule() { if (!rafId) rafId = requestAnimationFrame(frame); }
/* Time spent in the last frame (ms), for the performance read-out. */
const PERF = { grid: 0, render: 0, probe: 0, frames: 0 };
function frame() {
  rafId = 0;
  try {
    let t = performance.now();
    if (needCompute) { needCompute = false; const cp = state.settings.cellPx; startGrid(computeFast ? Math.max(cp * 2, 16) : cp, computeFast); }
    if (gridJob) {
      const quiet = gridJob.quiet, done = stepGrid(quiet ? 40 : 25);
      PERF.grid = performance.now() - t;
      if (!done) schedule(); else if (!quiet) assessStatusTick();
    }
    t = performance.now(); render(); PERF.render = performance.now() - t;
    t = performance.now(); updateProbe(); PERF.probe = performance.now() - t; PERF.frames++;
  } catch (err) { log('Frame error: ' + err.message, 'fail'); console.error(err); }
}
