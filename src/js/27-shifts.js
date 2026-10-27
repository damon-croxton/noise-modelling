/* ================================ SHIFTS =============================== */
/* A project holds one or more shifts. A shift is one activity in one time
   period: its own plant (sources and positions), period, season, the dates it
   is planned for, and notes. Buildings, hoarding, NCAs, terrain, model
   settings and rules are shared by every shift. The current shift's plant is
   state.sources; its period and season are state.settings.period / season. */
let nextShiftId = 1;
function makeShift(name, sources, o) {
  o = o || {};
  return { id: nextShiftId++, name: name || 'Shift', period: o.period || state.settings.period, season: o.season || state.settings.season, dates: o.dates || [], notes: o.notes || '', sources: sources || [], results: null };
}
/* The current shift, adopting state.sources if it was replaced (a source
   deleted, an example loaded, a test scene). */
function curShift() {
  let sh = state.shifts.find(s => s.id === state.shiftId);
  if (!sh) { sh = makeShift('Shift 1', state.sources); state.shifts = [sh]; state.shiftId = sh.id; }
  sh.sources = state.sources; sh.period = state.settings.period; sh.season = state.settings.season;
  return sh;
}
/* Start again with a single shift holding the current plant (new scene). */
function resetShifts(name) {
  state.shifts = []; state.shiftId = null; state.respite = null;
  const sh = curShift(); if (name) sh.name = name;
  return sh;
}
/* Make shift `id` current: its plant, period and season, and its last results. */
function switchShift(id, quiet) {
  const old = curShift(), sh = state.shifts.find(s => s.id === id);
  if (!sh || sh === old) return old;
  old.results = state.assess.results;
  state.shiftId = sh.id; state.sources = sh.sources;
  state.settings.period = sh.period; state.settings.season = sh.season;
  state.assess.results = sh.results || null; activeCache.sig = '';
  if (!quiet) { log(`Shift: “${sh.name}” (${PERIODS[sh.period]}, ${sh.sources.length} source(s)).`); select(null); syncSettingsUI(); renderShiftPanel(true); renderAssessPanel(); requestCompute(false); }
  return sh;
}
/* Evaluate fn with shift sh temporarily current (no UI updates). */
function withShift(sh, fn) {
  const cur = curShift();
  if (sh === cur) return fn();
  const keep = { sources: state.sources, period: state.settings.period, season: state.settings.season, results: state.assess.results, id: state.shiftId };
  state.sources = sh.sources; state.settings.period = sh.period; state.settings.season = sh.season; state.shiftId = sh.id; activeCache.sig = '';
  try { return fn(); } finally {
    state.sources = keep.sources; state.settings.period = keep.period; state.settings.season = keep.season; state.assess.results = keep.results; state.shiftId = keep.id; activeCache.sig = '';
  }
}
function shiftStatus(sh) {
  if (!sh.results) return 'not run';
  return withShift(sh, () => (sh.results.sig === inputsSignature() ? 'current' : 'out of date'));
}
function cloneSource(s) { return Object.assign({}, s, { id: nextId++, spec: Array.isArray(s.spec) ? s.spec.slice() : s.spec }); }

/* ---- dates: "2026-11-03, 2026-11-05..2026-11-07" (ranges with .. or "to") ---- */
const DAY_MS = 86400000;
function dayNum(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); if (!m) return null; const t = Date.UTC(+m[1], +m[2] - 1, +m[3]); const d = new Date(t); return d.getUTCMonth() === +m[2] - 1 ? t / DAY_MS : null; }
function isoOf(n) { return new Date(n * DAY_MS).toISOString().slice(0, 10); }
function parseDates(text) {
  const out = new Set(), bad = [];
  for (const part of String(text || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean)) {
    const r = part.split(/\s*(?:\.\.|\bto\b|–)\s*/);
    const a = dayNum(r[0]), b = r.length > 1 ? dayNum(r[1]) : a;
    if (a == null || b == null || b < a || b - a > 366 || r.length > 2) { bad.push(part); continue; }
    for (let n = a; n <= b; n++) out.add(n);
  }
  return { dates: [...out].sort((x, y) => x - y).map(isoOf).slice(0, 732), bad };
}
function datesText(dates) {
  const n = dates.map(dayNum), parts = [];
  for (let i = 0; i < n.length;) { let j = i; while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++; parts.push(j > i + 1 ? `${isoOf(n[i])}..${isoOf(n[j])}` : j === i + 1 ? `${isoOf(n[i])}, ${isoOf(n[j])}` : isoOf(n[i])); i = j + 1; }
  return parts.join(', ');
}
/* Oct–Apr = warm, May–Sep = cool (air absorption seasons). */
function seasonOfDate(iso) { const m = +iso.slice(5, 7); return m >= 5 && m <= 9 ? 'cool' : 'warm'; }

/* ---- respite (CNVG-PTI Table 10, RP) ---- */
/* Runs of consecutive dates (day numbers, sorted). */
function dateRuns(days) {
  const runs = [];
  for (const d of days) { const r = runs[runs.length - 1]; if (r && d === r.end + 1) r.end = d; else if (!r || d > r.end) runs.push({ start: d, end: d }); }
  return runs.map(r => ({ start: r.start, end: r.end, n: r.end - r.start + 1 }));
}
/* Checks one receiver's impacted dates of one kind (evenings or nights)
   against the limits: at most maxConsecutive in a row, and at least minBreak
   free evenings / nights between runs. */
function respiteCheck(days, lim) {
  const runs = dateRuns(days), issues = [];
  runs.forEach((r, i) => {
    if (r.n > lim.maxConsecutive) issues.push(`${r.n} in a row from ${isoOf(r.start)} (limit ${lim.maxConsecutive})`);
    const nx = runs[i + 1];
    if (nx) { const gap = nx.start - r.end - 1; if (gap < lim.minBreak) issues.push(`${gap} free between ${isoOf(r.end)} and ${isoOf(nx.start)} (minimum ${lim.minBreak})`); }
  });
  return { count: days.length, longest: runs.reduce((a, r) => Math.max(a, r.n), 0), issues };
}
function respiteRules() { return RULES.respite || DATA.rules.respite; }
/* Respite and frequency for every receiver across the shifts with results.
   A receiver counts on a date when a shift planned for that date, in an
   evening or night period, triggers the rule's measure (RP by default) there.
   Shifts without dates count towards "shifts affected" only. */
function computeRespite() {
  curShift().results = state.assess.results;
  const R = respiteRules(), kinds = Object.entries(R.kinds), shifts = state.shifts.filter(s => s.results);
  const rec = new Map();
  for (const sh of shifts) for (const r of sh.results.receivers) {
    let x = rec.get(r.id);
    if (!x) rec.set(r.id, x = { id: r.id, bId: r.bId, floorLabel: r.floorLabel, nca: r.nca, lu: r.lu, per: new Map(), above: 0, occ: 0, days: Object.fromEntries(kinds.map(([k]) => [k, new Set()])) });
    x.per.set(sh.id, r);
    if (r.exc != null && r.exc > 0) { x.above++; x.occ += sh.dates.length || 1; }
    const trig = R.trigger === 'above' ? r.exc != null && r.exc > 0 : r.measures.includes(R.trigger);
    if (trig) for (const [k, K] of kinds) if (K.periods.includes(sh.period)) for (const d of sh.dates) x.days[k].add(dayNum(d));
  }
  for (const x of rec.values()) {
    x.check = {};
    for (const [k, K] of kinds) x.check[k] = respiteCheck([...x.days[k]].sort((a, b) => a - b), K);
    x.issues = kinds.flatMap(([k]) => x.check[k].issues.map(t => `${R.kinds[k].label}: ${t}`));
  }
  const list = [...rec.values()];
  state.respite = { at: new Date().toISOString(), shifts: shifts.map(s => s.id), list, byBuilding: new Map() };
  for (const x of list) { const b = state.respite.byBuilding.get(x.bId) || { occ: 0, above: 0, issues: 0 }; b.occ = Math.max(b.occ, x.occ); b.above = Math.max(b.above, x.above); b.issues += x.issues.length ? 1 : 0; state.respite.byBuilding.set(x.bId, b); }
  return state.respite;
}

/* ---- batch run ---- */
/* onlyStale: skip shifts whose results already match their inputs (used by Compare). */
async function runAllShifts(onlyStale) {
  const orig = curShift(), t0 = performance.now();
  if (state.assess.running) return null;
  orig.results = state.assess.results;
  const todo = state.shifts.filter(sh => !onlyStale || shiftStatus(sh) !== 'current');
  if (onlyStale && !todo.length) return computeRespite();
  log(onlyStale ? `Running ${todo.length} shift(s) that are not up to date…` : `Running all ${state.shifts.length} shift(s)…`);
  let n = 0;
  state.batch = true;
  try {
    for (const sh of todo) {
      switchShift(sh.id, true);
      $('busy').textContent = `Shift ${n + 1} of ${todo.length}: ${sh.name}…`;
      const R = await runAssessment();
      sh.results = R; if (R) n++;
    }
  } finally { state.batch = false; switchShift(orig.id, true); syncSettingsUI(); renderShiftPanel(true); renderAssessPanel(); requestCompute(false); }
  const rs = computeRespite();
  log(`${onlyStale ? 'Shifts brought up to date' : 'All shifts'}: ${n} of ${todo.length} run in ${((performance.now() - t0) / 1000).toFixed(1)} s. ${rs.list.filter(x => x.above).length} building-floor(s) above NML in at least one shift; ${rs.list.filter(x => x.issues.length).length} with a respite-period issue.`, 'pass');
  return rs;
}

/* ---- comparison: per shift, and per receiver across shifts ---- */
function shiftSummary(sh) {
  const R = sh.results; if (!R) return null;
  const above = R.receivers.filter(r => r.exc != null && r.exc > 0), impact = {}, meas = {};
  for (const r of above) { impact[r.impact] = (impact[r.impact] || 0) + 1; for (const m of r.measures) meas[m] = (meas[m] || 0) + 1; }
  const L = R.receivers.filter(r => r.Leq != null).map(r => r.Leq);
  return { above: above.length, buildings: new Set(above.map(r => r.bId)).size, impact, meas, highly: R.receivers.filter(r => r.highly).length, max: L.length ? Math.max(...L) : null, floors: R.receivers.length };
}
const IMPACTS = ['Negligible', 'Low', 'Medium', 'High'];
function openShiftCompare() {
  const rs = computeRespite(), shifts = state.shifts.filter(s => s.results), byB = new Map(state.buildings.map(b => [b.id, b]));
  const el = $('ptable');
  const sumRows = state.shifts.map(sh => {
    const s = shiftSummary(sh), st = shiftStatus(sh);
    return `<tr><td>${esc(sh.name)}${sh.id === state.shiftId ? ' <span class="muted">(current)</span>' : ''}</td><td>${esc(PERIODS[sh.period])}</td><td class="num">${sh.dates.length || '–'}</td><td>${st}</td>` +
      (s ? `<td class="num">${s.above}</td><td class="num">${s.buildings}</td>${IMPACTS.map(k => `<td class="num">${s.impact[k] || ''}</td>`).join('')}<td class="num">${s.highly || ''}</td><td class="num">${fmt(s.max, 0)}</td><td>${Object.entries(s.meas).sort().map(([k, v]) => `${k} ${v}`).join(' · ')}</td>`
        : `<td colspan="${IMPACTS.length + 5}" class="muted">Run all shifts to compare.</td>`) + '</tr>';
  }).join('');
  const rows = rs.list.filter(x => x.above).sort((a, b) => b.issues.length - a.issues.length || b.occ - a.occ || a.id.localeCompare(b.id));
  const R = respiteRules(), kinds = Object.keys(R.kinds);
  el.innerHTML = `<div class="bar"><h2>Shift comparison and respite</h2>
    <button type="button" id="cmpRun">Run all shifts</button><button type="button" id="cmpCsv">Export CSV</button><button type="button" id="cmpClose">Close</button></div>
    <div class="scroll">
    <table><thead><tr><th>Shift</th><th>Period</th><th>Dates</th><th>Results</th><th>Floors above NML</th><th>Buildings</th>${IMPACTS.map(k => `<th>${k}</th>`).join('')}<th>Highly affected</th><th>Max dBA</th><th>Measures (building-floors)</th></tr></thead><tbody>${sumRows}</tbody></table>
    <p class="kv" style="padding:0 6px">Respite check (${esc(R.source)}): a receiver counts on a date when a shift planned for that date triggers <b>${esc(R.trigger)}</b> there. Limits: ${kinds.map(k => `${esc(R.kinds[k].label)} – at most ${R.kinds[k].maxConsecutive} in a row, at least ${R.kinds[k].minBreak} free between runs`).join('; ')}. ${shifts.some(s => !s.dates.length) ? 'Shifts without dates count only towards “shifts above NML”.' : ''}</p>
    <table id="cmpTbl"><thead><tr><th>Receiver</th><th>Address / building</th><th>Floor</th><th>NCA</th>${shifts.map(s => `<th title="${esc(PERIODS[s.period])}">${esc(s.name)}</th>`).join('')}<th>Shifts above NML</th><th>Dates above NML</th>${kinds.map(k => `<th>${esc(R.kinds[k].label)} (longest run)</th>`).join('')}<th>Respite issues</th></tr></thead><tbody>
    ${rows.slice(0, 3000).map(x => { const b = byB.get(x.bId); return `<tr data-b="${x.bId}"><td>${esc(x.id)}</td><td>${esc(b ? addressOf(b) || b.name : '')}</td><td>${esc(x.floorLabel)}</td><td>${esc(x.nca)}</td>` +
      shifts.map(s => { const r = x.per.get(s.id); return `<td>${r ? `<span class="chip" style="background:${categoryColor(r.label)}"></span>${r.exc != null ? (r.exc > 0 ? '+' : '') + r.exc : '–'}` : '–'}</td>`; }).join('') +
      `<td class="num">${x.above}</td><td class="num">${x.occ}</td>${kinds.map(k => `<td class="num">${x.check[k].count ? `${x.check[k].count} (${x.check[k].longest})` : ''}</td>`).join('')}<td>${x.issues.length ? '<b style="color:#b91c1c">' + esc(x.issues.join('; ')) + '</b>' : ''}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="foot">${rows.length.toLocaleString()} building-floor(s) above NML in at least one shift${rows.length > 3000 ? ' – first 3,000 shown; the CSV has all' : ''}; ${rows.filter(x => x.issues.length).length} with a respite issue. Cells show the exceedance in dB, coloured by category. Screening estimate only.</div>`;
  el.hidden = false;
  $('cmpClose').addEventListener('click', () => { el.hidden = true; });
  $('cmpRun').addEventListener('click', guarded('Run all shifts', async () => { await runAllShifts(); openShiftCompare(); }));
  $('cmpCsv').addEventListener('click', guarded('Comparison CSV', exportShiftCsv));
  el.querySelectorAll('#cmpTbl tbody tr').forEach(tr => tr.addEventListener('click', () => {
    const b = byB.get(+tr.dataset.b); if (!b) return;
    el.hidden = true; const c = insidePoint(b); state.view.cx = c[0]; state.view.cy = c[1]; state.view.scale = Math.max(state.view.scale, 4);
    select('building', b.id); requestCompute(false);
  }));
  requestRender();
}
function exportShiftCsv() {
  if (!window.confirm('The comparison can contain addresses. Keep the file on this computer or approved project storage, and share it only through approved channels.\n\nExport the CSV?')) { log('Comparison CSV export cancelled.'); return; }
  const rs = state.respite || computeRespite(), shifts = state.shifts.filter(s => rs.shifts.includes(s.id)), byB = new Map(state.buildings.map(b => [b.id, b])), R = respiteRules(), kinds = Object.keys(R.kinds);
  const head = ['Receiver ID', 'Address / building', 'Floor', 'NCA', 'Land use'].concat(shifts.flatMap(s => [`${s.name}: LAeq`, `${s.name}: exceedance`, `${s.name}: category`, `${s.name}: measures`]),
    ['Shifts above NML', 'Dates above NML'], kinds.flatMap(k => [`${R.kinds[k].label} impacted`, `${R.kinds[k].label} longest run`]), ['Respite issues']);
  const lines = [head.map(csvCell).join(',')];
  for (const x of rs.list) {
    const b = byB.get(x.bId);
    lines.push([x.id, b ? addressOf(b) || b.name : '', x.floorLabel, x.nca, landUseLabel(x.lu)].concat(
      shifts.flatMap(s => { const r = x.per.get(s.id); return r ? [r.Leq != null ? fmt(r.Leq, 1) : '', r.exc ?? '', r.label, r.measures.join(' ')] : ['', '', '', '']; }),
      [x.above, x.occ], kinds.flatMap(k => [x.check[k].count, x.check[k].longest]), [x.issues.join('; ')]).map(csvCell).join(','));
  }
  lines.push('', csvCell(`Shift comparison; rules: ${RULES.name}; respite: ${R.source}; noise_poc v${VERSION}; ${new Date().toISOString()}. Screening estimate only – not a substitute for an assessment by a qualified acoustic consultant.`));
  download(`shift_comparison_${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
  log(`Exported shift comparison CSV: ${rs.list.length} row(s), ${shifts.length} shift(s). Contains addresses – keep it on approved storage.`, 'warn');
}

/* ---- panel ---- */
/* Button handlers that log a failure instead of failing silently. */
const guarded = (what, fn) => async () => { try { await fn(); } catch (e) { log(`${what} FAILED: ${e.message}`, 'fail'); console.error(e); } };
/* Shift chips: one per shift, coloured by period, with a results-status dot. */
let chipSig = '';
function renderShiftChips() {
  const cur = curShift(), DOT = { current: 'd-ok', 'out of date': 'd-stale', 'not run': 'd-none' };
  const info = state.shifts.map(s => [s, shiftStatus(s)]);
  const sig = info.map(([s, st]) => [s.id, s.name, s.period, s.sources.length, s.dates.length, st, s === cur].join(':')).join('|');
  if (sig === chipSig) return;
  chipSig = sig;
  $('shChips').innerHTML = info.map(([s, st]) =>
    `<button type="button" role="tab" aria-selected="${s === cur}" class="${s === cur ? 'on' : ''}" data-id="${s.id}" style="--pc:${PERIOD_COLOR[s.period]}" title="${esc(PERIODS[s.period])} · ${s.sources.length} plant item(s) · results ${st}${s === cur ? ' – shown on the map' : ' – click to show this shift'}">` +
    `<span><span class="dot ${DOT[st]}"></span>${esc(s.name)}</span><small>${esc(PERIOD_SHORT[s.period])} · ${s.sources.length} plant${s.dates.length ? ` · ${s.dates.length} date${s.dates.length > 1 ? 's' : ''}` : ''}</small></button>`).join('');
  $('shChips').querySelectorAll('button').forEach(b => b.addEventListener('click', () => switchShift(+b.dataset.id)));
}
function renderShiftPanel(force) {
  const cur = curShift(), keep = el => !force && document.activeElement === el;
  renderShiftChips();
  if (!keep($('shName'))) $('shName').value = cur.name;
  if (!keep($('shDates'))) { $('shDates').value = datesText(cur.dates); $('shDates').classList.remove('bad'); }
  if (!keep($('shNotes'))) $('shNotes').value = cur.notes;
  $('shDel').disabled = state.shifts.length < 2;
  const hint = cur.dates.length && cur.dates.some(d => seasonOfDate(d) !== cur.season) ? ` <b>Season under Prediction method (${cur.season === 'warm' ? 'Oct–Apr' : 'May–Sep'}) doesn't match all the dates.</b>` : '';
  $('shInfo').innerHTML = `${state.shifts.length} shift(s). Results: <span class="dot d-ok"></span>up to date <span class="dot d-stale"></span>out of date <span class="dot d-none"></span>not run.${hint}`;
  if (!keep($('prjName'))) $('prjName').value = state.project.name;
  if (!keep($('prjBy'))) $('prjBy').value = state.project.by;
  renderSources(); updateRunState();
}
$('shNew').addEventListener('click', () => {
  const sh = makeShift(`Shift ${state.shifts.length + 1}`, []); curShift(); state.shifts.push(sh);
  switchShift(sh.id); log(`New shift “${sh.name}” – add its plant on the map.`);
});
$('shDup').addEventListener('click', () => {
  const cur = curShift(), sh = makeShift(`${cur.name} (copy)`, cur.sources.map(cloneSource), { period: cur.period, season: cur.season, dates: cur.dates.slice(), notes: cur.notes });
  state.shifts.splice(state.shifts.indexOf(cur) + 1, 0, sh); switchShift(sh.id);
  log(`Duplicated shift → “${sh.name}” (${sh.sources.length} source(s)).`);
});
$('shDel').addEventListener('click', () => {
  const cur = curShift(); if (state.shifts.length < 2) return;
  if (!window.confirm(`Delete shift “${cur.name}” and its ${cur.sources.length} source(s)?`)) return;
  const i = state.shifts.indexOf(cur), next = state.shifts[i ? i - 1 : 1];
  switchShift(next.id, true); state.shifts.splice(i, 1);
  log(`Deleted shift “${cur.name}”.`); syncSettingsUI(); renderShiftPanel(true); renderAssessPanel(); requestCompute(false);
});
$('shName').addEventListener('input', e => { curShift().name = e.target.value.slice(0, 60) || 'Shift'; renderShiftPanel(); renderAssessPanel(); });
$('shNotes').addEventListener('input', e => { curShift().notes = e.target.value.slice(0, 500); });
$('shDates').addEventListener('change', e => {
  const { dates, bad } = parseDates(e.target.value), cur = curShift();
  e.target.classList.toggle('bad', bad.length > 0);
  if (bad.length) log(`Dates not understood: ${bad.join(', ')} – use YYYY-MM-DD, with ranges as 2026-11-03..2026-11-07.`, 'warn');
  cur.dates = dates; renderShiftPanel();
  log(`Shift “${cur.name}”: ${dates.length} date(s)${dates.length ? ` (${datesText(dates)})` : ''}.`);
});
$('shRunAll').addEventListener('click', guarded('Run all shifts', async () => { await runAllShifts(); openShiftCompare(); }));
$('shCompare').addEventListener('click', guarded('Shift comparison', async () => { await runAllShifts(true); openShiftCompare(); }));
$('prjName').addEventListener('input', e => { state.project.name = e.target.value.slice(0, 120); });
$('prjBy').addEventListener('input', e => { state.project.by = e.target.value.slice(0, 120); });
