/* ================================ RENDER =============================== */
function niceStep(target) { for (const s of [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]) if (s >= target) return s; return 10000; }
function polyPath(pts, close) {
  ctx.beginPath();
  pts.forEach((p, i) => { const [sx, sy] = w2s(p[0], p[1]); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
  if (close) ctx.closePath();
}
function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const v = state.view, S = state.settings, T = state.terrain, L = UI.layers;
  ctx.fillStyle = MT.bg; ctx.fillRect(0, 0, cssW, cssH);
  drawOsmUnderlay(); updateAttribution();

  if (T && S.shade) {
    const [a, b] = w2s(T.x0, T.yTop);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(shadeCv, a, b, T.w * T.cx * v.scale, T.h * T.cy * v.scale);
  }
  const step = niceStep(60 / v.scale);
  const [x0, y1] = s2w(0, 0), [x1, y0] = s2w(cssW, cssH);
  ctx.strokeStyle = T && S.shade ? MT.gridShade : MT.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { const sx = Math.round(w2s(x, 0)[0]) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, cssH); }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { const sy = Math.round(w2s(0, y)[1]) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(cssW, sy); }
  ctx.stroke();

  const AR = state.assess.results, showRes = L.impact && state.assess.display === 'respite' && state.respite, showCat = L.impact && AR && !showRes && state.assess.display !== 'heat';
  if (L.heat && grid && state.sources.length && !(showCat && state.assess.display === 'cat') && !showRes) {
    ctx.save(); ctx.globalAlpha = S.opacity; ctx.imageSmoothingEnabled = false;
    drawGrid();
    ctx.restore();
  }

  if (state.dsm && state.dsm.kind === 'lidar' && $('setLazShow').checked) {
    const D = state.dsm, [a, b] = w2s(D.x0, D.yTop);
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(lazCv, a, b, D.w * D.cx * v.scale, D.h * D.cy * v.scale);
    ctx.restore();
  }
  for (const n of L.ncas ? state.ncas : []) {
    const sel = state.sel && state.sel.type === 'nca' && state.sel.id === n.id;
    polyPath(n.pts, true);
    ctx.fillStyle = sel ? 'rgba(13,148,136,0.10)' : 'rgba(13,148,136,0.04)'; ctx.fill();
    ctx.lineWidth = sel ? 3 : 2; ctx.strokeStyle = '#0f766e'; ctx.setLineDash([10, 5]); ctx.stroke(); ctx.setLineDash([]);
    const label = `${n.name} · ${ncaSummary(n)}`;
    ctx.font = '600 11px Segoe UI, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    const w = ctx.measureText(label).width;
    // label at the top vertex, kept inside the view (and inside the NCA's on-screen extent)
    const top = n.pts.reduce((a, p) => (p[1] > a[1] ? p : a)), sb = bboxOf(n.pts.map(p => w2s(p[0], p[1])));
    let [lx, ly] = w2s(top[0], top[1]);
    lx = Math.min(Math.max(lx, Math.max(sb[0], 0) + 4), Math.min(sb[2], cssW) - w - 8);
    ly = Math.max(ly, Math.max(sb[1], 0) + 20, 46);   // clear of the status box at the top left
    ctx.fillStyle = MT.boxBg; ctx.fillRect(lx - 2, ly - 16, w + 6, 15);
    ctx.fillStyle = '#0f766e'; ctx.fillText(label, lx + 1, ly - 2);
  }
  const showLabels = L.blabels && state.buildings.length < 400;
  for (const b of state.buildings) {
    const bb = b.bbox;
    if (bb[2] < x0 || bb[0] > x1 || bb[3] < y0 || bb[1] > y1) continue;
    const sel = state.sel && state.sel.type === 'building' && state.sel.id === b.id;
    polyPath(b.pts, true);
    const cat = showCat ? AR.byBuilding.get(b.id) : null, rsp = showRes ? state.respite.byBuilding.get(b.id) : null;
    const catFill = cat ? categoryColor(cat.worst) : rsp ? respiteColor(rsp.occ) : showRes ? '#d6dbe3' : null;
    ctx.fillStyle = sel ? 'rgba(37,99,235,0.55)' : catFill || MT.bfill; ctx.fill();
    if (rsp && rsp.issues && !sel) { ctx.lineWidth = 3; ctx.strokeStyle = '#b91c1c'; ctx.stroke(); }
    else if (isEstimated(b) && !sel) { ctx.lineWidth = 1.5; ctx.strokeStyle = '#f59e0b'; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]); }
    else { ctx.lineWidth = sel ? 2.5 : MT.bw; ctx.strokeStyle = sel ? '#1d4ed8' : MT.bstroke; ctx.stroke(); }
    if (showLabels && (bb[2] - bb[0]) * v.scale > 34) {
      let cx = b.pts.reduce((a, p) => a + p[0], 0) / b.pts.length, cy = b.pts.reduce((a, p) => a + p[1], 0) / b.pts.length;
      if (!pip(cx, cy, b.pts)) { const p = b.pts; cx = (p[0][0] + p[1][0] + p[2][0]) / 3; cy = (p[0][1] + p[1][1] + p[2][1]) / 3; }
      const [lx, ly] = w2s(cx, cy);
      ctx.font = '11px Segoe UI, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (showRes) { if (rsp && rsp.occ) { ctx.fillStyle = rsp.occ >= 4 && !sel ? '#fff' : '#111827'; ctx.fillText(`${rsp.occ}×${rsp.issues ? ' !' : ''}`, lx, ly); } continue; }
      ctx.fillStyle = catFill && !sel && cat.worst !== 'Moderately intrusive' && cat.worst !== 'Highly intrusive' ? '#111827' : catFill || sel ? '#fff' : MT.blabel;
      ctx.fillText(cat ? `${cat.floors}F · ${cat.worst === 'Not assessed' ? 'n/a' : cat.maxLeq != null ? fmt(cat.maxLeq, 0) + ' dB' : '< NML'}` : `${fmt(b.h, 1)} m${isEstimated(b) ? '?' : ''}`, lx, ly);
    }
  }
  for (const ho of L.hoard ? state.hoardings : []) {
    const sel = state.sel && state.sel.type === 'hoarding' && state.sel.id === ho.id;
    polyPath(ho.pts, false);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = sel ? 7 : 5; ctx.strokeStyle = sel ? '#1d4ed8' : '#111827'; ctx.stroke();
    polyPath(ho.pts, false); ctx.lineWidth = sel ? 3 : 2; ctx.strokeStyle = '#facc15'; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
  }

  if (state.draft.length) {
    polyPath(state.draft, false);
    if (state.mouse) ctx.lineTo(state.mouse.x, state.mouse.y);
    ctx.strokeStyle = state.mode === 'hoarding' ? '#b45309' : state.mode === 'nca' ? '#0f766e' : '#1d4ed8'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
    state.draft.forEach((p, i) => { const [sx, sy] = w2s(p[0], p[1]); ctx.beginPath(); ctx.arc(sx, sy, i ? 3.5 : 6, 0, 7); ctx.fillStyle = i ? '#1d4ed8' : '#fff'; ctx.fill(); ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 2; ctx.stroke(); });
  }

  drawCalibration();
  for (const s of state.sources) {
    const [sx, sy] = w2s(s.x, s.y), excl = isExcluded(s);
    const sel = state.sel && state.sel.type === 'source' && state.sel.id === s.id;
    ctx.save(); if (excl) ctx.globalAlpha = 0.45;
    ctx.beginPath(); ctx.arc(sx, sy, sel ? 9 : 7, 0, 7);
    ctx.fillStyle = '#111827'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = sel ? '#60a5fa' : '#fff'; ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 7); ctx.fillStyle = '#ef4444'; ctx.fill();
    ctx.font = '600 11px Segoe UI, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (L.slabels || sel) {
      const label = `${s.name} · Lw ${fmt(effectiveLw(s), 0)}${overMax(s) != null ? ' ⚠' : ''}${excl ? ' (not in worst case)' : ''}`, w = ctx.measureText(label).width;
      ctx.fillStyle = MT.boxBg; ctx.fillRect(sx + 11, sy - 8, w + 6, 16);
      ctx.fillStyle = MT.boxText; ctx.fillText(label, sx + 14, sy);
    }
    ctx.restore();
  }

  // scale bar and north arrow, bottom right above the read-out
  const sb = niceStep(110 / v.scale), sbPx = sb * v.scale, bx = cssW - sbPx - 60, by = cssH - 94;
  ctx.fillStyle = MT.boxBg; ctx.fillRect(bx - 8, by, sbPx + 58, 26);
  ctx.fillStyle = MT.boxText; ctx.fillRect(bx, by + 18, sbPx, 4);
  ctx.font = '11px Segoe UI, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${sb} m`, bx, by + 13);
  ctx.textAlign = 'center'; ctx.font = '600 12px Segoe UI, sans-serif';
  ctx.fillText('N ↑', bx + sbPx + 26, by + 18);
  syncPlantList();
}

/* Respite map: dates (or shifts without dates) above NML, worst floor. */
const RESPITE_RAMP = [[1, '#fde68a'], [2, '#fbbf24'], [4, '#f97316'], [7, '#dc2626'], [11, '#7e22ce']];
function respiteColor(n) { let c = '#d6dbe3'; for (const [k, v] of RESPITE_RAMP) if (n >= k) c = v; return c; }

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
  if (hb) {
    const ph = probeBuildingHtml(hb);
    el.innerHTML = ph || `<p class="muted">Inside “${esc(hb.name)}” (base RL ${fmt(hb.base, 2)}, roof RL ${fmt(topOf(hb), 2)}) – grid receivers masked. Run the assessment for façade results.</p>`;
    $('hud').textContent = hud + ' · ' + (ph ? `${hb.name}: ${(state.assess.results.byBuilding.get(hb.id) || {}).worst}` : 'inside building'); return;
  }
  const srcsA = activeSources(); prep(srcsA);
  let e = 0, rows = '';
  const paths = [];
  for (const s of srcsA) {
    const r = contrib(s, wx, wy, S, B, true, gr);
    e += Math.pow(10, r.Lp / 10);
    paths.push({ s, r });
    const bt = v => (r.bands ? '<span class="muted">bands</span>' : fmt(v));
    rows += `<tr><td>${esc(s.name)}</td><td>${fmt(r.Lw)}</td><td>${fmt(r.d)}</td><td>${fmt(r.Adiv)}</td><td>${bt(r.Aatm)}</td><td>${bt(r.Agr)}</td><td>${bt(r.Abar)}</td><td><b>${fmt(r.Lp)}</b></td></tr>`;
    let note = `${lwBreakdown(s)} · src RL ${fmt(s._z, 1)} · rcv RL ${fmt(r.zr, 1)}${r.Domega ? ` · DΩ +${fmt(r.Domega)}` : ''}`;
    if (r.bar) {
      const k = r.bar.kinds, parts = [];
      if (k.terrain) parts.push(k.terrain + ' terrain'); if (k.building) parts.push(k.building + ' building'); if (k.hoarding) parts.push(k.hoarding + ' hoarding');
      note += ` · over the top: ${parts.join(', ')} edge(s), δ ${fmt(r.bar.delta, 2)} m, Dz ${fmt(r.bar.top.Dz)}${r.bands ? ' at 500 Hz' : ''}`;
      if (r.bar.lat && r.bar.lat.length) note += ` · side paths: ${r.bar.lat.map(l => `${l.n} edge(s), δ ${fmt(l.delta, 1)} m, Dz ${fmt(l.Dz)}`).join('; ')}`;
      else if (S.lateral !== false) note += r.bar.terrainEdge ? ' · no side paths (terrain in the path)' : ' · no side paths (receiver or source enclosed)';
      note += ` · combined Dz ${fmt(r.bar.Dz)}${r.bands ? ' at 500 Hz' : ''}${r.bar.capped ? ` (capped at ${fmt(r.bar.cap, 0)})` : ''}`;
    } else note += ' · line of sight';
    if (r.refl) note += r.refl.length
      ? ` · reflections: ${r.refl.map(f => `${esc((state.buildings.find(b => b.id === f.b) || {}).name || 'building')} ${fmt(f.Lp)}`).join(', ')} (loss ${fmt(S.reflLoss == null ? 1 : S.reflLoss)} dB each); direct ${fmt(r.Ldir)} → total ${fmt(r.Lp)} (+${fmt(r.Lp - r.Ldir)})`
      : ' · no reflecting façade';
    if (r.bands) {
      const sp = sourceSpectrum(s), hz = f => (f < 1000 ? f : f / 1000 + 'k');
      note += `<br>Octave bands (${esc(sp.name)}${sp.auto ? ', auto' : ''}; A<sub>div</sub> ${fmt(r.Adiv)} in every band):<table class="bands"><tr><th>Hz</th>${r.bands.map(b => `<th>${hz(b.f)}</th>`).join('')}</tr>` +
        [['L<sub>w</sub>(A)', 'Lw'], ['A<sub>atm</sub>', 'Aatm'], ['A<sub>gr</sub>', 'Agr'], ['D<sub>z</sub>', 'Dz'], ['A<sub>bar</sub>', 'Abar'], ['L<sub>p</sub>', 'Lp']]
          .map(([h, k]) => `<tr><td>${h}</td>${r.bands.map(b => `<td>${fmt(b[k])}</td>`).join('')}</tr>`).join('') + '</table>';
    }
    rows += `<tr class="note"><td colspan="8">${note}</td></tr>`;
  }
  const L = 10 * Math.log10(e);
  const basis = S.method === 'iso' ? `ISO 9613-2: A<sub>div</sub> = 20·lg d + 11${S.bands ? ', octave bands 63 Hz – 8 kHz' : ''}` : 'TfNSW estimator basis: A<sub>div</sub> = 20·lg d + 8';
  el.innerHTML = `<table><tr><th>Source</th><th>L<sub>w</sub></th><th>d m</th><th>A<sub>div</sub></th><th>A<sub>atm</sub></th><th>A<sub>gr</sub></th><th>A<sub>bar</sub></th><th>L<sub>p</sub></th></tr>${rows}</table>
    <div class="tot">Total: ${fmt(L)} dB(A) L<sub>Aeq,15min</sub> <span class="muted" style="font-weight:400;font-size:11px">(at ${fmt(S.hr)} m above ground)</span></div>
    <p class="kv muted">${basis} · ${PERIODS[S.period]} · air ${!S.air ? 'off' : S.method === 'iso' && S.bands ? 'ISO 9613-1 per band' : fmt(airAlpha(S), 2) + ' dB/km'} · ${Math.round(S.soft * 100)} % soft ground</p>`;
  $('hud').textContent = `${hud} · ${fmt(L)} dB(A)`;
  if (UI.layers.paths) drawProbePaths(paths, wx, wy);
}


/* Propagation paths for the probe point: direct (grey), side paths around
   obstacles (orange dashed) and reflections (blue dashed). Drawn over the map
   after render(). */
function drawProbePaths(paths, wx, wy) {
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineWidth = 1.5;
  const line = (pts, color, dash) => {
    ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = w2s(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.stroke();
  };
  for (const { s, r } of paths) {
    line([[s.x, s.y], [wx, wy]], r.bar ? 'rgba(17,24,39,0.35)' : 'rgba(17,24,39,0.6)', r.bar ? [3, 3] : []);
    if (r.bar && r.bar.lat) for (const l of r.bar.lat) line([[s.x, s.y]].concat(l.pts, [[wx, wy]]), 'rgba(234,88,12,0.9)', [6, 4]);
    if (r.refl) for (const f of r.refl) line([[s.x, s.y], f.p, [wx, wy]], 'rgba(37,99,235,0.9)', [2, 3]);
  }
  ctx.restore();
}
