/* ============================== CALIBRATION ============================ */
/* Compare this tool with measured levels or another tool's receiver results.
   CSV rows are matched by receiver ID (e.g. B12-L2 from this tool's property
   list) or placed by coordinates (easting/northing or lat/lon) with a height,
   floor or RL. For every row the tool's own level is calculated at that point,
   and the differences (this tool − imported) are summarised. */
const CAL_COLS = {
  id: ['id', 'receiver', 'receiverid', 'rid', 'point', 'location', 'name'],
  x: ['x', 'easting', 'e', 'east', 'mgae'], y: ['y', 'northing', 'n', 'north', 'mgan'],
  lat: ['lat', 'latitude'], lon: ['lon', 'lng', 'long', 'longitude'],
  h: ['height', 'heightagl', 'hagl', 'h', 'z'], rl: ['rl', 'zrl', 'elevation'], floor: ['floor', 'storey', 'floorlevel'],
  level: ['laeq', 'laeq15', 'laeq15min', 'leq', 'level', 'measured', 'predicted', 'db', 'dba', 'spl', 'result', 'value', 'noiselevel']
};
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0], delim = ['\t', ';', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(c => c.trim() !== '')) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}
function calColumns(header) {
  const norm = header.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '')), cols = {};
  for (const [k, names] of Object.entries(CAL_COLS)) { const i = norm.findIndex(h => names.includes(h)); if (i >= 0) cols[k] = i; }
  return cols;
}
function floorIndex(v) {
  const s = String(v).trim().toUpperCase();
  if (s === 'G' || s === 'GF' || s === 'GROUND') return 0;
  const m = s.match(/^L?(\d+)$/); return m ? +m[1] : null;
}
/* Level at a point (all active sources), dB(A). */
function levelAt(x, y, zAbs) {
  const S = state.settings, B = state.buildings, srcs = activeSources(), gr = ground(x, y);
  prep(srcs);
  let e = 0; for (const s of srcs) e += Math.pow(10, contrib(s, x, y, S, B, false, gr, zAbs) / 10);
  return 10 * Math.log10(e);
}
/* Worst façade level for a building floor, calculated in full (the assessment
   may only hold an upper bound for floors below the NML). */
function floorLevelExact(b, floor) {
  const A = state.assess, z = b.base + 1.5 + floor * A.floorH, fp = facadePoints(b, A.spacing, A.offset);
  let best = -Infinity, bp = null;
  for (const p of fp.pts) { const L = levelAt(p.x, p.y, z); if (L > best) { best = L; bp = p; } }
  return { L: best, p: bp, z };
}
function nearestBuilding(x, y, maxD) {
  let best = null, bd = maxD;
  for (const b of state.buildings) {
    if (x < b.bbox[0] - maxD || x > b.bbox[2] + maxD || y < b.bbox[1] - maxD || y > b.bbox[3] + maxD) continue;
    if (pip(x, y, b.pts)) return { b, d: 0 };
    for (let i = 0, j = b.pts.length - 1; i < b.pts.length; j = i++) { const d = distSeg(x, y, b.pts[j], b.pts[i]); if (d < bd) { bd = d; best = b; } }
  }
  return best ? { b: best, d: bd } : null;
}

function runCalibration(text, name) {
  const t0 = performance.now(), rows = parseCsv(text);
  if (rows.length < 2) throw new Error('no data rows');
  const C = calColumns(rows[0]);
  if (C.level == null) throw new Error(`no level column (looked for ${CAL_COLS.level.join(', ')})`);
  if (C.id == null && !((C.x != null && C.y != null) || (C.lat != null && C.lon != null))) throw new Error('needs a receiver ID column, or easting/northing or lat/lon columns');
  const R = state.assess.results, byId = new Map(R ? R.receivers.map(r => [r.id, r]) : []), period = state.settings.period;
  const nums = rows.slice(1).map(r => r.map(c => c.trim()));
  if ((C.x != null || C.lat != null) && !state.origin) {
    const first = nums.find(r => isFinite(parseFloat(r[C.x ?? C.lat])));
    if (first && C.x != null) ensureOrigin(+first[C.x], +first[C.y], null, null, 'calibration file');
    else if (first) { const lat = +first[C.lat], lon = +first[C.lon], z = zoneOf(lon), c = ll2mga(lat, lon, z); ensureOrigin(c[0], c[1], null, z, 'calibration file'); }
  }
  const out = []; let skipped = 0;
  for (const r of nums) {
    const theirs = parseFloat(r[C.level]);
    if (!isFinite(theirs)) { skipped++; continue; }
    const id = C.id != null ? r[C.id] : '', rec = byId.get(id);
    let ours = null, nml = null, how = '', x = null, y = null, z = null, bId = null;
    if (rec) {
      const b = state.buildings.find(q => q.id === rec.bId);
      if (!b) { skipped++; continue; }
      const ex = rec.Leq != null ? { L: rec.Leq, p: { x: rec.x, y: rec.y }, z: rec.z } : floorLevelExact(b, rec.floor);
      ours = ex.L; nml = rec.nml; how = 'receiver ID'; x = ex.p ? ex.p.x : null; y = ex.p ? ex.p.y : null; z = ex.z; bId = b.id;
    } else if (C.x != null || C.lat != null) {
      if (C.x != null) { const E = parseFloat(r[C.x]), N = parseFloat(r[C.y]); if (!isFinite(E) || !isFinite(N)) { skipped++; continue; } x = E - state.origin.x0; y = N - state.origin.y0; }
      else { const la = parseFloat(r[C.lat]), lo = parseFloat(r[C.lon]); if (!isFinite(la) || !isFinite(lo)) { skipped++; continue; } [x, y] = ll2local(la, lo); }
      const nb = nearestBuilding(x, y, 3), fl = C.floor != null ? floorIndex(r[C.floor]) : null;
      if (C.rl != null && isFinite(parseFloat(r[C.rl]))) z = parseFloat(r[C.rl]);
      else if (fl != null && nb) z = nb.b.base + 1.5 + fl * state.assess.floorH;
      else z = ground(x, y) + (C.h != null && isFinite(parseFloat(r[C.h])) ? parseFloat(r[C.h]) : 1.5);
      if (nb && nb.d === 0) {   // a point inside a footprint (e.g. another tool's building centroid): use the nearest façade point
        const fp = facadePoints(nb.b, state.assess.spacing, state.assess.offset).pts;
        if (fp.length) { const p = fp.reduce((a, q) => (Math.hypot(q.x - x, q.y - y) < Math.hypot(a.x - x, a.y - y) ? q : a)); x = p.x; y = p.y; how = 'coordinates → nearest façade'; }
      } else how = 'coordinates';
      ours = levelAt(x, y, z);
      if (nb) { const N = nmlFor(luOf(nb.b).lu, ncaOf(nb.b), period); nml = N.nml; bId = nb.b.id; }
    } else { skipped++; continue; }
    const row = { id: id || `row ${out.length + 1}`, theirs, ours, diff: ours - theirs, nml, how, x, y, z, bId };
    if (nml != null) { row.ourCat = classify(ours, nml, period, 'residential').label; row.theirCat = classify(theirs, nml, period, 'residential').label; }
    out.push(row);
  }
  if (!out.length) throw new Error(`no usable rows (${skipped} skipped)`);
  const d = out.map(r => r.diff), n = d.length, mean = d.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0, rms = Math.sqrt(d.reduce((a, b) => a + b * b, 0) / n);
  const cats = out.filter(r => r.ourCat != null), agree = cats.filter(r => r.ourCat === r.theirCat).length;
  const st = { name, n, skipped, mean, sd, rms, min: Math.min(...d), max: Math.max(...d), within1: d.filter(v => Math.abs(v) <= 1).length / n, within3: d.filter(v => Math.abs(v) <= 3).length / n, catN: cats.length, catAgree: agree, ms: performance.now() - t0 };
  state.calib = { rows: out, stats: st, period, method: state.settings.method, at: new Date().toISOString() };
  log(`Calibration ${name}: ${n} point(s)${skipped ? `, ${skipped} skipped` : ''}. This tool − imported: mean ${fmt(mean, 1)} dB, SD ${fmt(sd, 1)}, RMS ${fmt(rms, 1)}, range ${fmt(st.min, 1)} to ${fmt(st.max, 1)}; ${Math.round(100 * st.within3)} % within ±3 dB${cats.length ? `; same impact category ${agree} of ${cats.length}` : ''}.`, 'pass');
  renderCalPanel(); requestRender();
  return st;
}
function renderCalPanel() {
  const c = state.calib, el = $('calInfo');
  if (!c) { el.innerHTML = '<span class="muted">No comparison loaded.</span>'; return; }
  const s = c.stats;
  el.innerHTML = `<b>${esc(s.name)}</b> · ${s.n} point(s) · ${esc(PERIODS[c.period])}<br>
    This tool − imported: mean <b>${fmt(s.mean, 1)} dB</b>, SD ${fmt(s.sd, 1)}, RMS ${fmt(s.rms, 1)}, range ${fmt(s.min, 1)} to ${fmt(s.max, 1)}<br>
    Within ±1 dB: ${Math.round(100 * s.within1)} % · within ±3 dB: <b>${Math.round(100 * s.within3)} %</b>${s.catN ? `<br>Same impact category: ${s.catAgree} of ${s.catN}` : ''}
    <br><span class="muted">Points are drawn on the map: red = this tool higher, blue = lower.</span>`;
}
function drawCalibration() {
  const c = state.calib; if (!c) return;
  for (const r of c.rows) {
    if (r.x == null) continue;
    const [sx, sy] = w2s(r.x, r.y), t = Math.max(-1, Math.min(1, r.diff / 5));
    ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 7);
    ctx.fillStyle = t >= 0 ? `rgba(220,38,38,${0.35 + 0.65 * t})` : `rgba(37,99,235,${0.35 - 0.65 * t})`; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#111827'; ctx.stroke();
  }
}
$('btnCalImport').addEventListener('click', () => $('fileCal').click());
$('fileCal').addEventListener('change', () => {
  const input = $('fileCal'), f = input.files[0]; if (!f) return; input.value = '';
  const rd = new FileReader();
  rd.onload = () => { try { runCalibration(String(rd.result), f.name); } catch (err) { log(`Calibration ${f.name} FAILED: ${err.message}`, 'fail'); console.error(err); } };
  rd.readAsText(f);
});
$('btnCalExport').addEventListener('click', () => {
  const c = state.calib; if (!c) { log('Import levels to compare first.', 'warn'); return; }
  const o = state.origin, head = ['Point', 'Imported LAeq (dBA)', 'This tool LAeq (dBA)', 'Difference (dB)', 'NML (dBA)', 'Imported category', 'This tool category', 'Matched by', 'Easting', 'Northing', 'RL (m)'];
  const lines = [head.join(',')].concat(c.rows.map(r => [r.id, fmt(r.theirs, 1), fmt(r.ours, 1), fmt(r.diff, 1), r.nml ?? '', r.theirCat || '', r.ourCat || '', r.how,
    r.x != null && o ? fmt(r.x + o.x0, 1) : '', r.y != null && o ? fmt(r.y + o.y0, 1) : '', r.z != null ? fmt(r.z, 1) : ''].map(csvCell).join(',')));
  const s = c.stats;
  lines.push('', csvCell(`Summary: n ${s.n}; mean ${fmt(s.mean, 2)} dB; SD ${fmt(s.sd, 2)}; RMS ${fmt(s.rms, 2)}; within ±3 dB ${Math.round(100 * s.within3)} %; ${PERIODS[c.period]}; ${c.method === 'iso' ? 'ISO 9613-2' : 'TfNSW estimator basis'}; noise_poc v${VERSION}`));
  download(`calibration_${c.at.slice(0, 10)}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
  log(`Exported calibration comparison (${c.rows.length} rows).`);
});
$('btnCalClear').addEventListener('click', () => { state.calib = null; renderCalPanel(); requestRender(); });
