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
function computeGrid(cellPx, quiet) {
  const t0 = performance.now();
  // fast redraws while dragging skip reflections (the full pass follows)
  const S = quiet ? Object.assign({}, state.settings, { _fast: true }) : state.settings, B = state.buildings, srcs = activeSources();
  prep(srcs);
  const gw = Math.ceil(cssW / cellPx), gh = Math.ceil(cssH / cellPx);
  off.width = gw; off.height = gh;
  const img = offctx.createImageData(gw, gh), data = img.data;
  const v = state.view, inv = 1 / v.scale;
  let maxL = -Infinity, masked = 0;
  if (srcs.length) {
    for (let j = 0; j < gh; j++) {
      const wy = v.cy - ((j + 0.5) * cellPx - cssH / 2) * inv;
      for (let i = 0; i < gw; i++) {
        const wx = v.cx + ((i + 0.5) * cellPx - cssW / 2) * inv;
        if (B.length && buildingAt(wx, wy)) { masked++; continue; }
        const gr = ground(wx, wy);
        let e = 0;
        for (let s = 0; s < srcs.length; s++) e += Math.pow(10, contrib(srcs[s], wx, wy, S, B, false, gr) / 10);
        const L = 10 * Math.log10(e);
        if (L > maxL) maxL = L;
        if (!(L >= S.minDb) || L < BANDS[0][0]) continue;
        const c = BAND_RGB[Math.min(BANDS.length - 1, Math.floor((L - BANDS[0][0]) / 5))], k = (j * gw + i) * 4;
        data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2]; data[k + 3] = 255;
      }
    }
  }
  offctx.putImageData(img, 0, 0);
  grid = { cellPx, gw, gh };
  const ms = performance.now() - t0;
  $('busy').textContent = `${gw}×${gh} receivers · ${srcs.length} src · ${B.length} bldg · ${ms.toFixed(0)} ms · cell ≈ ${fmt(cellPx / v.scale, 2)} m`;
  if (!quiet) log(`Grid ${gw}×${gh} (${(gw * gh).toLocaleString()} rcv, ${masked} masked) × ${srcs.length} src, ${B.length} bldg, ${state.hoardings.length} hoarding${state.terrain ? ', terrain' : ''}: ${ms.toFixed(0)} ms. Max ${fmt(maxL)} dB(A).`);
}

/* ============================== SCHEDULER ============================== */
let rafId = 0, needCompute = false, computeFast = false, fullTimer = 0;
function requestCompute(fast) {
  needCompute = true; computeFast = fast;
  clearTimeout(fullTimer);
  if (fast) fullTimer = setTimeout(() => requestCompute(false), 250);
  schedule();
}
function requestRender() { schedule(); }
function schedule() { if (!rafId) rafId = requestAnimationFrame(frame); }
function frame() {
  rafId = 0;
  try {
    if (needCompute) { needCompute = false; const cp = state.settings.cellPx; computeGrid(computeFast ? Math.max(cp * 2, 10) : cp, computeFast); if (!computeFast) assessStatusTick(); }
    render(); updateProbe();
  } catch (err) { log('Frame error: ' + err.message, 'fail'); console.error(err); }
}

