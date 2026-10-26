/* ================================ RENDER =============================== */
function niceStep(target) { for (const s of [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]) if (s >= target) return s; return 10000; }
function polyPath(pts, close) {
  ctx.beginPath();
  pts.forEach((p, i) => { const [sx, sy] = w2s(p[0], p[1]); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
  if (close) ctx.closePath();
}
function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#f4f5f7'; ctx.fillRect(0, 0, cssW, cssH);
  const v = state.view, S = state.settings, T = state.terrain;

  if (T && S.shade) {
    const [a, b] = w2s(T.x0, T.yTop);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(shadeCv, a, b, T.w * T.cx * v.scale, T.h * T.cy * v.scale);
  }
  const step = niceStep(60 / v.scale);
  const [x0, y1] = s2w(0, 0), [x1, y0] = s2w(cssW, cssH);
  ctx.strokeStyle = T && S.shade ? 'rgba(0,0,0,0.06)' : '#e1e4e9'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { const sx = Math.round(w2s(x, 0)[0]) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, cssH); }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { const sy = Math.round(w2s(0, y)[1]) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(cssW, sy); }
  ctx.stroke();

  if (grid && state.sources.length) {
    ctx.save(); ctx.globalAlpha = S.opacity; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, grid.gw * grid.cellPx, grid.gh * grid.cellPx);
    ctx.restore();
  }

  if (state.dsm && state.dsm.kind === 'lidar' && $('setLazShow').checked) {
    const D = state.dsm, [a, b] = w2s(D.x0, D.yTop);
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(lazCv, a, b, D.w * D.cx * v.scale, D.h * D.cy * v.scale);
    ctx.restore();
  }
  const showLabels = state.buildings.length < 400;
  for (const b of state.buildings) {
    const bb = b.bbox;
    if (bb[2] < x0 || bb[0] > x1 || bb[3] < y0 || bb[1] > y1) continue;
    const sel = state.sel && state.sel.type === 'building' && state.sel.id === b.id;
    polyPath(b.pts, true);
    ctx.fillStyle = sel ? 'rgba(37,99,235,0.55)' : 'rgba(55,60,72,0.78)'; ctx.fill();
    if (isEstimated(b) && !sel) { ctx.lineWidth = 1.5; ctx.strokeStyle = '#f59e0b'; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]); }
    else { ctx.lineWidth = sel ? 2.5 : 1; ctx.strokeStyle = sel ? '#1d4ed8' : '#1f2937'; ctx.stroke(); }
    if (showLabels && (bb[2] - bb[0]) * v.scale > 34) {
      let cx = b.pts.reduce((a, p) => a + p[0], 0) / b.pts.length, cy = b.pts.reduce((a, p) => a + p[1], 0) / b.pts.length;
      if (!pip(cx, cy, b.pts)) { const p = b.pts; cx = (p[0][0] + p[1][0] + p[2][0]) / 3; cy = (p[0][1] + p[1][1] + p[2][1]) / 3; }
      const [lx, ly] = w2s(cx, cy);
      ctx.font = '11px Segoe UI, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.fillText(`${fmt(b.h, 1)} m${isEstimated(b) ? '?' : ''}`, lx, ly);
    }
  }
  for (const ho of state.hoardings) {
    const sel = state.sel && state.sel.type === 'hoarding' && state.sel.id === ho.id;
    polyPath(ho.pts, false);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = sel ? 7 : 5; ctx.strokeStyle = sel ? '#1d4ed8' : '#111827'; ctx.stroke();
    polyPath(ho.pts, false); ctx.lineWidth = sel ? 3 : 2; ctx.strokeStyle = '#facc15'; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
  }

  if (state.draft.length) {
    polyPath(state.draft, false);
    if (state.mouse) ctx.lineTo(state.mouse.x, state.mouse.y);
    ctx.strokeStyle = state.mode === 'hoarding' ? '#b45309' : '#1d4ed8'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
    state.draft.forEach((p, i) => { const [sx, sy] = w2s(p[0], p[1]); ctx.beginPath(); ctx.arc(sx, sy, i ? 3.5 : 6, 0, 7); ctx.fillStyle = i ? '#1d4ed8' : '#fff'; ctx.fill(); ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 2; ctx.stroke(); });
  }

  for (const s of state.sources) {
    const [sx, sy] = w2s(s.x, s.y);
    const sel = state.sel && state.sel.type === 'source' && state.sel.id === s.id;
    ctx.beginPath(); ctx.arc(sx, sy, sel ? 9 : 7, 0, 7);
    ctx.fillStyle = '#111827'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = sel ? '#60a5fa' : '#fff'; ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 7); ctx.fillStyle = '#ef4444'; ctx.fill();
    ctx.font = '600 11px Segoe UI, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const label = `${s.name} · Lw ${fmt(s.lw, 0)}`, w = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(sx + 11, sy - 8, w + 6, 16);
    ctx.fillStyle = '#111827'; ctx.fillText(label, sx + 14, sy);
  }

  const sb = niceStep(110 / v.scale), sbPx = sb * v.scale;
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(8, cssH - 34, sbPx + 16, 26);
  ctx.fillStyle = '#111827'; ctx.fillRect(16, cssH - 16, sbPx, 4);
  ctx.font = '11px Segoe UI, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${sb} m`, 16, cssH - 21);
  ctx.textAlign = 'center'; ctx.font = '600 12px Segoe UI, sans-serif';
  ctx.fillText('N ↑', cssW - 24, 40);
}

/* ================================ PROBE ================================ */
function coordText(wx, wy) {
  const o = state.origin;
  if (o && o.type === 'projected') return `E ${fmt(wx + o.x0, 1)}  N ${fmt(wy + o.y0, 1)}`;
  return `x ${fmt(wx)}  y ${fmt(wy)} m`;
}
function updateProbe() {
  const m = state.mouse; if (!m) return;
  const [wx, wy] = s2w(m.x, m.y), B = state.buildings, S = state.settings;
  const gr = ground(wx, wy);
  let hud = coordText(wx, wy) + (state.terrain ? `  RL ${fmt(gr, 2)}${terrainInside(wx, wy) ? '' : ' (edge)'}` : '');
  const el = $('probe');
  if (!state.sources.length) { el.innerHTML = '<p class="muted">Add a source to see levels.</p>'; $('hud').textContent = hud; return; }
  const hb = buildingAt(wx, wy);
  if (hb) { el.innerHTML = `<p class="muted">Inside “${esc(hb.name)}” (base RL ${fmt(hb.base, 2)}, roof RL ${fmt(topOf(hb), 2)}) – receivers masked.</p>`; $('hud').textContent = hud + ' · inside building'; return; }
  prep(state.sources);
  let e = 0, rows = '';
  for (const s of state.sources) {
    const r = contrib(s, wx, wy, S, B, true, gr);
    e += Math.pow(10, r.Lp / 10);
    rows += `<tr><td>${esc(s.name)}</td><td>${fmt(r.d)}</td><td>${fmt(r.Adiv)}</td><td>${fmt(r.Agr)}</td><td>${fmt(r.Abar)}</td><td><b>${fmt(r.Lp)}</b></td></tr>`;
    let note = `Lw ${fmt(s.lw, 0)} · src RL ${fmt(s._z, 1)} · rcv RL ${fmt(r.zr, 1)}`;
    if (r.bar) {
      const k = r.bar.kinds, parts = [];
      if (k.terrain) parts.push(k.terrain + ' terrain'); if (k.building) parts.push(k.building + ' building'); if (k.hoarding) parts.push(k.hoarding + ' hoarding');
      note += ` · edges: ${parts.join(', ')} · δ ${fmt(r.bar.delta, 2)} m · Dz ${fmt(r.bar.Dz)}${r.bar.capped ? ' (cap)' : ''}`;
    } else note += ' · line of sight';
    rows += `<tr class="note"><td colspan="6">${note}</td></tr>`;
  }
  const L = 10 * Math.log10(e);
  el.innerHTML = `<table><tr><th>Source</th><th>d m</th><th>A<sub>div</sub></th><th>A<sub>gr</sub></th><th>A<sub>bar</sub></th><th>L<sub>p</sub></th></tr>${rows}</table>
    <div class="tot">Total: ${fmt(L)} dB(A) <span class="muted" style="font-weight:400;font-size:11px">(at ${fmt(S.hr)} m above ground)</span></div>`;
  $('hud').textContent = `${hud} · ${fmt(L)} dB(A)`;
}

