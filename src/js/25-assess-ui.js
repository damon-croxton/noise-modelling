/* ============================ ASSESSMENT UI ============================ */
function catOptions(sel) {
  return Object.entries(RULES.noiseAreaCategories).map(([k, c]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
}
function luOptions(sel) {
  return Object.entries(RULES.landUses).map(([k, L]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(L.label)}</option>`).join('');
}
const optNum = v => (v === '' || v == null ? null : num(v, 20, 80));

function updateAssessButtons() {
  const A = state.assess, has = !!A.results;
  $('btnAssess').disabled = A.running; $('btnAssess').textContent = A.running ? 'Running…' : 'Run this shift';
  $('btnTable').disabled = !has || A.running; $('btnCsv').disabled = !has || A.running; $('btnCsvCard').disabled = !has || A.running;
  $('asAuto').checked = UI.auto;
}
function syncAssessUI() {
  const A = state.assess, r = A.defNca.rbl;
  $('asDefCat').innerHTML = catOptions(A.defNca.cat);
  $('asRblD').value = r.day ?? ''; $('asRblE').value = r.evening ?? ''; $('asRblN').value = r.night ?? '';
  $('asFloorH').value = A.floorH; $('asSpacing').value = A.spacing; $('asOffset').value = A.offset; $('asDisplay').value = A.display;
  $('bulkTo').innerHTML = luOptions('residential');
  $('rulesSet').innerHTML = Object.entries(RULESETS).map(([k, r]) => `<option value="${k}">${esc(r.label)}</option>`).join('') +
    (state.rulesEdited ? `<option value="imported">Imported: ${esc(RULES.name || 'unnamed')}</option>` : '');
  $('rulesSet').value = state.rulesEdited ? 'imported' : (state.rulesSet || 'cnvg');
  $('rulesInfo').innerHTML = `<b>${esc(RULES.name)}</b>${state.rulesEdited ? ' <span class="muted">(imported / edited)</span>' : ''}<br><span class="muted">${esc(RULES._note || '')}</span>`;
  refreshBulkSelects(); updateAssessButtons(); renderAssessPanel();
}
function refreshBulkSelects() {
  const from = $('bulkFrom').value, within = $('bulkIn').value;
  $('bulkFrom').innerHTML = `<option value="*">Any</option><option value="?">Assumed (no land use data)</option>` + luOptions(null);
  $('bulkIn').innerHTML = `<option value="*">All buildings</option><option value="view">Buildings in view</option><option value="outside">Outside all NCAs</option>` +
    state.ncas.map(n => `<option value="nca:${n.id}">${esc(n.name)}</option>`).join('');
  if (from) $('bulkFrom').value = from;
  if (within && [...$('bulkIn').options].some(o => o.value === within)) $('bulkIn').value = within;
}

/* Status line and summary: building-floors per land use and category. */
function renderAssessPanel() {
  const A = state.assess, R = A.results;
  updateRunState(); buildLegend();
  if (!R) { $('asStatus').innerHTML = `<span class="muted">Not run yet for “${esc(curShift().name)}”. Click <b>Run this shift</b>${UI.auto ? ' – after that, results update automatically' : ''}.</span>`; $('asSummary').innerHTML = ''; return; }
  const stale = assessStale();
  const st = R.stats, t = new Date(R.at);
  $('asStatus').innerHTML = (stale ? '<div class="stale">Inputs have changed since this run – run the assessment again.</div>' : '') +
    `Run ${t.toLocaleTimeString()} · ${esc(PERIODS[R.period])} · ${R.method === 'iso' ? 'ISO 9613-2' : 'TfNSW estimator basis'}<br>` +
    `${st.assessed.toLocaleString()} buildings, ${st.receivers.toLocaleString()} building-floors · <b>${st.above}</b> above NML in <b>${new Set(R.receivers.filter(r => r.exc > 0).map(r => r.bId)).size}</b> building(s)`;
  const cats = categoryList(R.period), rows = new Map(), meas = new Map();
  for (const r of R.receivers) {
    if (!rows.has(r.lu)) rows.set(r.lu, new Array(cats.length).fill(0));
    const k = cats.indexOf(r.label); if (k >= 0) rows.get(r.lu)[k]++;
    for (const m of r.measures) meas.set(m, (meas.get(m) || 0) + 1);
  }
  let html = '<table class="mini"><tr><th>Land use</th>' + cats.map(c => `<th title="${esc(c)}"><span class="chip" style="background:${categoryColor(c)}"></span>${esc(c.replace('intrusive', 'intr.').replace('Below NML', '≤ NML'))}</th>`).join('') + '</tr>';
  for (const [lu, v] of rows) html += `<tr><td>${esc(landUseLabel(lu))}</td>${v.map(n => `<td>${n || ''}</td>`).join('')}</tr>`;
  html += '</table>';
  if (meas.size) html += `<p class="kv">Measures triggered (building-floors): ${[...meas].map(([m, n]) => `<b title="${esc((RULES.measureCodes || {})[m] || m)}">${esc(m)}</b> ${n}`).join(' · ')}</p>`;
  const sl = R.receivers.filter(r => r.sleep && (r.sleep.overScreen || r.sleep.awakening));
  if (sl.length) html += `<p class="kv">Sleep disturbance screening (indicative, L<sub>Amax</sub> ≈ L<sub>Aeq</sub> + ${RULES.sleep.lmaxOffset}): ${sl.filter(r => r.sleep.overScreen).length} above RBL + ${RULES.sleep.screeningAdd}, ${sl.filter(r => r.sleep.awakening).length} at or above ${RULES.sleep.awakening} dBA.</p>`;
  $('asSummary').innerHTML = html + '<p class="kv muted">Building-floors = one result per floor of each building (worst façade point). Screening estimate only.</p>';
}
let staleTimer = 0;
let autoTimer = 0;
function assessStatusTick() {   // called after full recomputes; debounced check that keeps the stale warning current
  clearTimeout(staleTimer);
  staleTimer = setTimeout(() => {
    updateRunState();
    if (autoWanted()) { clearTimeout(autoTimer); autoTimer = setTimeout(() => { if (autoWanted()) runAssessment({ auto: true }); }, 900); }
    if (!state.assess.results || state.assess.running) return;
    if (assessStale() !== !!$('asStatus').querySelector('.stale')) renderAssessPanel();
  }, 300);
}
/* Update automatically: once something has been assessed this session, re-run the
   current shift when its results are missing or out of date, if a run is quick. */
function autoWanted() {
  const A = state.assess;
  return UI.auto && A.everRun && !A.running && !state.batch && (A.lastMs || 0) < 3000 && state.sources.length > 0 && state.buildings.length > 0 && (!A.results || assessStale());
}

/* -------- panel bindings -------- */
$('btnAssess').addEventListener('click', () => runAssessment());
$('asAuto').addEventListener('change', e => { UI.auto = e.target.checked; savePrefs(); log(`Update automatically ${UI.auto ? 'ON' : 'OFF'}.`); if (UI.auto) assessStatusTick(); });
$('asDefCat').addEventListener('change', e => { state.assess.defNca.cat = e.target.value; log(`Noise area outside NCAs: ${e.target.value}.`); renderAssessPanel(); requestRender(); });
[['asRblD', 'day'], ['asRblE', 'evening'], ['asRblN', 'night']].forEach(([id, k]) => $(id).addEventListener('input', e => {
  const v = optNum(e.target.value); e.target.classList.toggle('bad', e.target.value !== '' && v === null);
  if (e.target.value === '' || v !== null) { state.assess.defNca.rbl[k] = v; renderAssessPanel(); }
}));
bindNum($('asFloorH'), 2, 6, v => { state.assess.floorH = v; });
bindNum($('asSpacing'), 2, 50, v => { state.assess.spacing = v; });
bindNum($('asOffset'), 0.1, 5, v => { state.assess.offset = v; });
$('asDisplay').addEventListener('change', e => {
  state.assess.display = e.target.value;
  buildLegend();
  if (e.target.value === 'respite') { const rs = computeRespite(); log(`Respite map: ${rs.shifts.length} shift(s) with results; colour = dates above NML at the worst floor (shifts without dates count once), red outline = respite issue.`); }
  requestRender();
});
$('btnBulk').addEventListener('click', () => {
  const from = $('bulkFrom').value, within = $('bulkIn').value, to = $('bulkTo').value, vb = viewBoxLocal();
  let n = 0;
  for (const b of state.buildings) {
    const cur = luOf(b), c = insidePoint(b);
    if (from === '?' ? !cur.assumed : from !== '*' && cur.lu !== from) continue;
    if (within === 'view' && !inBox(c[0], c[1], vb)) continue;
    if (within === 'outside' && ncaAt(c[0], c[1])) continue;
    if (within.startsWith('nca:') && (ncaAt(c[0], c[1]) || {}).id !== +within.slice(4)) continue;
    b.landUse = to; b.luSrc = 'manual'; n++;
  }
  log(`Land use set to “${landUseLabel(to)}” for ${n} building(s).`, n ? 'pass' : 'warn');
  renderAssessPanel(); renderSelPanel(); requestRender();
});

/* -------- rules import / export -------- */
$('btnRulesExport').addEventListener('click', () => { download('assessment_rules.json', JSON.stringify(RULES, null, 1)); log('Exported assessment rules.'); });
$('btnRulesImport').addEventListener('click', () => $('fileRules').click());
readJSONFile($('fileRules'), (d, name) => {
  try { validateRules(d); } catch (e) { log(`Rules ${name} rejected: ${e.message}`, 'fail'); return; }
  RULES = d; state.rulesEdited = true;
  log(`Imported assessment rules “${d.name || name}”. Run the assessment again to apply them.`, 'pass');
  syncAssessUI(); renderSelPanel();
});
$('btnRulesReset').addEventListener('click', () => { setRuleSet('cnvg'); log('Assessment rules reset to the TfNSW CNVG-PTI defaults.'); syncAssessUI(); renderSelPanel(); });
$('rulesSet').addEventListener('change', e => {
  if (e.target.value === 'imported') return;
  setRuleSet(e.target.value);
  log(`Assessment rules: ${RULESETS[e.target.value].label}. Run the assessment again to apply them.`);
  syncAssessUI(); renderSelPanel();
});

/* -------- NCA import (GeoJSON polygons) -------- */
$('btnNcaImport').addEventListener('click', () => $('fileNca').click());
readJSONFile($('fileNca'), (gj, name) => {
  const feats = gj.type === 'FeatureCollection' ? gj.features : gj.type === 'Feature' ? [gj] : [];
  const polys = [];
  for (const f of feats) {
    const g = f && f.geometry; if (!g) continue;
    if (g.type === 'Polygon') polys.push({ ring: g.coordinates[0], pr: f.properties || {} });
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(pc => polys.push({ ring: pc[0], pr: f.properties || {} }));
  }
  if (!polys.length) throw new Error('no Polygon features found');
  const all = []; polys.forEach(p => p.ring.forEach(c => all.push(c)));
  const bb = bboxOf(all), lonlat = bb[0] >= -180 && bb[2] <= 180 && bb[1] >= -90 && bb[3] <= 90;
  let tf;
  if (lonlat) { const lon = (bb[0] + bb[2]) / 2, lat = (bb[1] + bb[3]) / 2, z = (state.origin && state.origin.zone) || zoneOf(lon), c = ll2mga(lat, lon, z); ensureOrigin(c[0], c[1], null, z, 'NCA file (lat/lon)'); tf = p => ll2local(p[1], p[0]); }
  else { const o = ensureOrigin((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, null, null, 'NCA file (projected)'); tf = p => [p[0] - o.x0, p[1] - o.y0]; }
  const val = (pr, keys) => { for (const k of Object.keys(pr)) if (keys.includes(k.toLowerCase())) return pr[k]; return undefined; };
  let n = 0;
  for (const { ring, pr } of polys) {
    let pts = validPts(ring); if (!pts) continue;
    pts = pts.map(tf); if (hyp(pts[0], pts[pts.length - 1]) < 1e-6) pts.pop();
    if (pts.length < 3) continue;
    const nc = makeNca(pts, String(val(pr, ['name', 'nca', 'nca_name', 'id']) ?? '').slice(0, 40) || undefined);
    const cat = String(val(pr, ['category', 'cat', 'noise_area', 'nac', 'area_category']) ?? '').toUpperCase();
    if (RULES.noiseAreaCategories[cat]) nc.cat = cat;
    nc.rbl = { day: optNum(val(pr, ['rbl_day', 'day', 'rbl_d'])), evening: optNum(val(pr, ['rbl_evening', 'rbl_eve', 'evening', 'rbl_e'])), night: optNum(val(pr, ['rbl_night', 'night', 'rbl_n'])) };
    state.ncas.push(nc); n++;
  }
  if (n) noteSource('Noise catchment areas', name, `${n} NCA(s)`, null);
  log(`Imported ${n} NCA(s) from ${name}.`, n ? 'pass' : 'warn');
  refreshBulkSelects(); requestCompute(false);
});

/* -------- selection panels -------- */
function renderNcaPanel(body, o) {
  const inside = state.buildings.filter(b => { const c = insidePoint(b); return ncaAt(c[0], c[1]) === o; }).length;
  body.innerHTML = `
    <div class="row"><label for="nName">Name</label><input type="text" id="nName" value="${esc(o.name)}" maxlength="40"></div>
    <div class="row"><label for="nCat">Noise area category</label><select id="nCat">${catOptions(o.cat)}</select></div>
    <div class="row rbl3"><label>Measured RBL (day / eve / night)</label><span><input type="number" id="nRblD" min="20" max="80" step="1" placeholder="–" value="${o.rbl.day ?? ''}"><input type="number" id="nRblE" min="20" max="80" step="1" placeholder="–" value="${o.rbl.evening ?? ''}"><input type="number" id="nRblN" min="20" max="80" step="1" placeholder="–" value="${o.rbl.night ?? ''}"></span></div>
    <p class="kv muted">Blank RBLs use the category. Measured RBLs below the minimum (day ${RULES.measuredRblFloor.day}, evening/night ${RULES.measuredRblFloor.night}) are raised to it.</p>
    <p class="kv" id="nInfo"></p>
    <div class="row"><span class="muted">${inside} building(s) inside</span><button type="button" id="nDel" class="danger">Delete</button></div>`;
  const info = () => {
    $('nInfo').textContent = Object.keys(PERIODS).map(p => { const N = nmlFor('residential', o, p); return `${PERIODS[p]}: NML ${N.nml}`; }).join(' · ');
    requestRender();
  };
  info();
  $('nName').addEventListener('input', e => { o.name = e.target.value.slice(0, 40) || 'NCA'; refreshBulkSelects(); requestRender(); });
  $('nCat').addEventListener('change', e => { o.cat = e.target.value; info(); });
  [['nRblD', 'day'], ['nRblE', 'evening'], ['nRblN', 'night']].forEach(([id, k]) => $(id).addEventListener('input', e => {
    const v = optNum(e.target.value); e.target.classList.toggle('bad', e.target.value !== '' && v === null);
    if (e.target.value === '' || v !== null) { o.rbl[k] = v; info(); }
  }));
  $('nDel').addEventListener('click', () => { deleteSel(); refreshBulkSelects(); });
}
/* Extra rows for the building panel: land use, floors, address and results. */
function buildingAssessHtml(o) {
  const lu = luOf(o), fl = floorsOf(o), auto = o.landUse ? null : lu;
  return `
    <div class="row"><label for="bLu">Land use</label><select id="bLu"><option value="">Auto – ${esc(landUseLabel((auto || luOf(Object.assign({}, o, { landUse: null }))).lu))}</option>${luOptions(o.landUse)}</select></div>
    <p class="kv muted">Land use: ${esc(lu.src)}${lu.assumed ? ' – <b>check</b>' : ''} · NCA: ${esc(ncaOf(o).name)}</p>
    <div class="row"><label for="bFloors">Floors</label><input type="number" id="bFloors" min="1" max="200" step="1" placeholder="${fl.n}" value="${o.floors ?? ''}"></div>
    <p class="kv muted">Floors: ${fl.n} (${esc(fl.src)})</p>
    <div class="row"><label for="bAddr">Address</label><input type="text" id="bAddr" maxlength="120" placeholder="${esc(addressOf(Object.assign({}, o, { address: null })) || '–')}" value="${esc(o.address || '')}"></div>
    ${floorTableHtml(o)}`;
}
function bindBuildingAssess(o) {
  $('bLu').addEventListener('change', e => { o.landUse = e.target.value || null; o.luSrc = 'manual'; log(`“${o.name}” land use → ${o.landUse ? landUseLabel(o.landUse) : 'auto'}.`); renderSelPanel(); renderAssessPanel(); });
  $('bFloors').addEventListener('input', e => { const v = e.target.value === '' ? null : num(e.target.value, 1, 200); e.target.classList.toggle('bad', e.target.value !== '' && v === null); if (e.target.value === '' || v !== null) { o.floors = v; renderAssessPanel(); } });
  $('bAddr').addEventListener('input', e => { o.address = e.target.value.trim().slice(0, 120) || null; });
}
/* Per-floor results for a building (worst façade point per floor). */
function floorTableHtml(b) {
  const R = state.assess.results; if (!R) return '';
  const bb = R.byBuilding.get(b.id); if (!bb) return '<p class="kv muted">Not in the last assessment run.</p>';
  if (bb.worst === 'Not assessed') return `<p class="kv muted">Not assessed: ${esc(bb.reason || '')}.</p>`;
  const rows = R.receivers.filter(r => r.bId === b.id).sort((a, c) => c.floor - a.floor);
  return `<table class="mini"><tr><th>Floor</th><th>NML</th><th>L<sub>Aeq</sub></th><th>Exc.</th><th>Category</th><th>Measures</th></tr>` +
    rows.map(r => `<tr><td>${r.floorLabel}</td><td>${r.nml}</td><td>${r.Leq != null ? fmt(r.Leq, 0) : '< ' + fmt(r.ub, 0)}</td><td>${r.exc != null ? (r.exc > 0 ? '+' : '') + r.exc : '–'}</td>` +
      `<td><span class="chip" style="background:${categoryColor(r.label)}"></span>${esc(r.label)}</td><td>${esc(r.measures.join(', ') || '–')}</td></tr>`).join('') +
    `</table><p class="kv muted">${esc(rows[0] ? rows[0].nmlBasis : '')}${assessStale() ? ' · <b>results out of date</b>' : ''}</p>`;
}
/* Probe over a building: per-floor results plus the full term breakdown at
   the worst façade point of the worst floor. */
function probeBuildingHtml(b) {
  const R = state.assess.results; if (!R || !R.byBuilding.has(b.id)) return null;
  let html = `<p class="kv"><b>${esc(addressOf(b) || b.name)}</b> · ${esc(landUseLabel(luOf(b).lu))} · ${esc(ncaOf(b).name)}</p>` + floorTableHtml(b);
  const worst = R.receivers.filter(r => r.bId === b.id && r.Leq != null).sort((a, c) => c.Leq - a.Leq)[0];
  if (worst && worst.x != null) {
    const srcsA = activeSources(); prep(srcsA);
    const gr = ground(worst.x, worst.y);
    html += `<p class="kv">Worst point: floor ${worst.floorLabel}, ${coordText(worst.x, worst.y)}, RL ${fmt(worst.z, 1)}</p><table><tr><th>Source</th><th>L<sub>w</sub></th><th>d m</th><th>A<sub>div</sub></th><th>A<sub>atm</sub></th><th>A<sub>gr</sub></th><th>A<sub>bar</sub></th><th>L<sub>p</sub></th></tr>`;
    for (const s of srcsA) {
      const r = contrib(s, worst.x, worst.y, state.settings, state.buildings, true, gr, worst.z);
      html += `<tr><td>${esc(s.name)}</td><td>${fmt(r.Lw)}</td><td>${fmt(r.d)}</td><td>${fmt(r.Adiv)}</td><td>${fmt(r.Aatm)}</td><td>${fmt(r.Agr)}</td><td>${fmt(r.Abar)}</td><td><b>${fmt(r.Lp)}</b></td></tr>`;
    }
    html += '</table>';
  }
  return html;
}

/* -------- property table and CSV -------- */
function propertyRows() {
  const R = state.assess.results; if (!R) return [];
  const byId = new Map(state.buildings.map(b => [b.id, b])), o = state.origin;
  return R.receivers.map(r => {
    const b = byId.get(r.bId);
    return Object.assign({}, r, {
      addr: b ? (addressOf(b) || b.name) : `building ${r.bId} (deleted)`, luLabel: landUseLabel(r.lu),
      measuresStr: r.measures.join(', '), hsrc: b ? b.hsrc : '', height: b ? b.h : null,
      E: r.x != null && o ? r.x + o.x0 : r.x, N: r.y != null && o ? r.y + o.y0 : r.y,
      rank: categoryRank(r.label, R.period)
    });
  });
}
const PT_COLS = [
  ['id', 'Receiver'], ['addr', 'Address / building'], ['floorLabel', 'Floor'], ['luLabel', 'Land use'], ['nca', 'NCA'],
  ['nml', 'NML', 1], ['Leq', 'LAeq,15min', 1], ['exc', 'Exceed.', 1], ['label', 'Category'], ['measuresStr', 'Measures'], ['sleepTxt', 'Sleep (indicative)']
];
const ptState = { sort: 'exc', dir: -1, q: '', cat: 'above', lu: '*' };
function openPropertyTable() {
  const R = state.assess.results; if (!R) return;
  const cats = categoryList(R.period), lus = [...new Set(R.receivers.map(r => r.lu))];
  const el = $('ptable');
  el.innerHTML = `<div class="bar"><h2>Property table – ${esc(PERIODS[R.period])}</h2>
    <input type="search" id="ptQ" placeholder="Search address, ID, NCA…" value="${esc(ptState.q)}">
    <select id="ptCat"><option value="above">Above NML</option><option value="*">All</option>${cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select>
    <select id="ptLu"><option value="*">All land uses</option>${lus.map(k => `<option value="${esc(k)}">${esc(landUseLabel(k))}</option>`).join('')}</select>
    <button type="button" id="ptCsv">Export CSV</button><button type="button" id="ptClose">Close</button></div>
    <div class="scroll"><table><thead><tr>${PT_COLS.map(([k, t]) => `<th data-k="${k}">${t}${ptState.sort === k ? (ptState.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody id="ptBody"></tbody></table></div>
    <div class="foot" id="ptFoot"></div>`;
  $('ptCat').value = ptState.cat; $('ptLu').value = lus.includes(ptState.lu) ? ptState.lu : '*';
  el.hidden = false;
  $('ptQ').addEventListener('input', e => { ptState.q = e.target.value; fillPropertyTable(); });
  $('ptCat').addEventListener('change', e => { ptState.cat = e.target.value; fillPropertyTable(); });
  $('ptLu').addEventListener('change', e => { ptState.lu = e.target.value; fillPropertyTable(); });
  $('ptCsv').addEventListener('click', exportCsv);
  $('ptClose').addEventListener('click', () => { el.hidden = true; });
  el.querySelectorAll('th').forEach(th => th.addEventListener('click', () => {
    const k = th.dataset.k; if (ptState.sort === k) ptState.dir = -ptState.dir; else { ptState.sort = k; ptState.dir = k === 'exc' || k === 'Leq' ? -1 : 1; }
    openPropertyTable();
  }));
  fillPropertyTable();
}
function filteredRows() {
  const q = ptState.q.trim().toLowerCase();
  let rows = propertyRows().filter(r =>
    (ptState.cat === '*' || (ptState.cat === 'above' ? r.exc != null && r.exc > 0 : r.label === ptState.cat)) &&
    (ptState.lu === '*' || r.lu === ptState.lu) &&
    (!q || `${r.id} ${r.addr} ${r.nca} ${r.luLabel} ${r.measuresStr}`.toLowerCase().includes(q)));
  const k = ptState.sort, d = ptState.dir, key = r => (k === 'label' ? r.rank : k === 'exc' ? (r.exc ?? -1e9) : k === 'Leq' ? (r.Leq ?? r.ub ?? -1e9) : r[k]);
  rows.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * d || a.id.localeCompare(b.id); });
  return rows;
}
function sleepText(r) { return r.sleep ? `${fmt(r.sleep.lmax, 0)}${r.sleep.awakening ? ' ≥ ' + RULES.sleep.awakening : r.sleep.overScreen ? ' > ' + fmt(r.sleep.screen, 0) : ''}` : ''; }
function fillPropertyTable() {
  const rows = filteredRows(), MAX = 3000, show = rows.slice(0, MAX);
  $('ptBody').innerHTML = show.map(r => `<tr data-b="${r.bId}"><td>${esc(r.id)}</td><td>${esc(r.addr)}</td><td>${r.floorLabel}</td><td>${esc(r.luLabel)}</td><td>${esc(r.nca)}</td>` +
    `<td class="num">${r.nml}</td><td class="num">${r.Leq != null ? fmt(r.Leq, 0) : '< ' + fmt(r.ub, 0)}</td><td class="num">${r.exc != null ? (r.exc > 0 ? '+' : '') + r.exc : '–'}</td>` +
    `<td><span class="chip" style="background:${categoryColor(r.label)}"></span>${esc(r.label)}</td><td>${esc(r.measuresStr)}</td><td>${esc(sleepText(r))}</td></tr>`).join('');
  $('ptFoot').textContent = `${rows.length.toLocaleString()} row(s)${rows.length > MAX ? ` – first ${MAX.toLocaleString()} shown; the CSV has all` : ''}. Click a row to show the building. Levels rounded to whole dB; screening estimate only.`;
  $('ptBody').querySelectorAll('tr').forEach(tr => tr.addEventListener('click', () => {
    const b = state.buildings.find(x => x.id === +tr.dataset.b); if (!b) return;
    $('ptable').hidden = true;
    const c = insidePoint(b); state.view.cx = c[0]; state.view.cy = c[1]; state.view.scale = Math.max(state.view.scale, 4);
    select('building', b.id); requestCompute(false);
  }));
}
function csvCell(v) { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function exportCsv() {
  const R = state.assess.results; if (!R) return;
  if (!window.confirm('The property list can contain addresses. Keep the file on this computer or approved project storage, and share it only through approved channels.\n\nExport the CSV?')) { log('CSV export cancelled.'); return; }
  const rows = filteredRows();
  const cols = [
    ['Receiver ID', r => r.id], ['Building ID', r => r.bId], ['Address / building', r => r.addr], ['Floor', r => r.floorLabel], ['Receiver RL (m)', r => fmt(r.z, 1)],
    ['Land use', r => r.luLabel], ['Land use source', r => r.luSrc], ['NCA', r => r.nca], ['NML (dBA)', r => r.nml], ['NML basis', r => r.nmlBasis],
    ['Predicted LAeq,15min (dBA)', r => (r.Leq != null ? fmt(r.Leq, 1) : '')], ['Upper bound if not calculated (dBA)', r => (r.Leq == null ? fmt(r.ub, 1) : '')],
    ['Exceedance (dB)', r => r.exc ?? ''], ['Category', r => r.label], ['Impact', r => r.impact], ['Additional measures', r => r.measuresStr], ['Highly noise affected', r => (r.highly ? 'yes' : '')],
    ['LAmax estimate (dBA)', r => (r.sleep ? fmt(r.sleep.lmax, 1) : '')], ['Sleep screening level (dBA)', r => (r.sleep ? fmt(r.sleep.screen, 0) : '')],
    ['Above sleep screening', r => (r.sleep ? (r.sleep.overScreen ? 'yes' : 'no') : '')], ['Awakening level reached', r => (r.sleep ? (r.sleep.awakening ? 'yes' : 'no') : '')],
    ['Floors source', r => r.floorsSrc], ['Building height (m)', r => (r.height != null ? fmt(r.height, 1) : '')], ['Height source', r => r.hsrc],
    ['Easting', r => (r.E != null ? fmt(r.E, 1) : '')], ['Northing', r => (r.N != null ? fmt(r.N, 1) : '')]
  ];
  const meta = `Period: ${PERIODS[R.period]}; method: ${R.method === 'iso' ? 'ISO 9613-2' : 'TfNSW estimator basis'}; rules: ${RULES.name}; run ${R.at}; noise_poc v${VERSION}. Screening estimate only – not a substitute for an assessment by a qualified acoustic consultant.`;
  const lines = [cols.map(c => csvCell(c[0])).join(',')].concat(rows.map(r => cols.map(c => csvCell(c[1](r))).join(',')));
  lines.push('', csvCell(meta));
  download(`property_list_${R.period}_${R.at.slice(0, 10)}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
  log(`Exported property list CSV: ${rows.length} row(s) (current table filter). Contains addresses – keep it on approved storage.`, 'warn');
}
$('btnTable').addEventListener('click', openPropertyTable);
$('btnCsv').addEventListener('click', exportCsv);
