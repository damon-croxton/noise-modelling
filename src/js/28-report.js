/* ================================ REPORT =============================== */
/* Printable report for the current shift, as one self-contained HTML file
   (open it in Edge and print to PDF). Sections follow the generic structure
   of an OOHW noise assessment: introduction, method, works description,
   results, then appendices with the buildings (height source per building),
   the rules applied and the data sources. */
const REPORT_DISCLAIMER = 'Screening and planning aid only. This report was produced by a screening tool. It does not replace an assessment by a qualified acoustic consultant and is not a validated compliance model. Plant levels and assessment defaults come from Transport for NSW documents – verify them against the current client strategy, project approval and EPL conditions.';

/* Map for the report on its own canvas: 'works' (plant locations) or
   'impact' (buildings by worst category). Returns a PNG data URL. */
function reportMap(kind, W, H) {
  const R = state.assess.results, srcs = state.sources, pts = srcs.map(s => [s.x, s.y]);
  if (kind === 'impact' && R) for (const b of state.buildings) { const bb = R.byBuilding.get(b.id); if (bb && bb.maxLeq != null && bb.worst !== 'Below NML' && bb.worst !== 'Not assessed') pts.push([b.bbox[0], b.bbox[1]], [b.bbox[2], b.bbox[3]]); }
  if (!pts.length) state.buildings.forEach(b => pts.push([b.bbox[0], b.bbox[1]], [b.bbox[2], b.bbox[3]]));
  if (!pts.length) pts.push([0, 0]);
  const bb = bboxOf(pts), span = Math.max(bb[2] - bb[0], bb[3] - bb[1], 60), pad = kind === 'works' ? Math.max(60, span * 0.5) : Math.max(25, span * 0.08);
  const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2, sc = Math.min(W / (bb[2] - bb[0] + 2 * pad), H / (bb[3] - bb[1] + 2 * pad));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), tf = (x, y) => [(x - cx) * sc + W / 2, H / 2 - (y - cy) * sc];
  const path = (P, close) => { g.beginPath(); P.forEach((p, i) => { const [x, y] = tf(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); if (close) g.closePath(); };
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  for (const n of state.ncas) { path(n.pts, true); g.fillStyle = 'rgba(13,148,136,0.05)'; g.fill(); g.setLineDash([10, 5]); g.lineWidth = 2; g.strokeStyle = '#0f766e'; g.stroke(); g.setLineDash([]); }
  const cats = new Set();
  for (const b of state.buildings) {
    path(b.pts, true);
    const r = kind === 'impact' && R ? R.byBuilding.get(b.id) : null;
    if (r && r.worst !== 'Not assessed') cats.add(r.worst);
    g.fillStyle = r && r.worst !== 'Not assessed' ? categoryColor(r.worst) : '#e5e7eb'; g.fill();
    g.lineWidth = 1; g.strokeStyle = '#4b5563'; g.stroke();
  }
  for (const ho of state.hoardings) { path(ho.pts, false); g.lineWidth = 4; g.strokeStyle = '#111827'; g.stroke(); path(ho.pts, false); g.lineWidth = 2; g.strokeStyle = '#facc15'; g.setLineDash([6, 5]); g.stroke(); g.setLineDash([]); }
  g.font = '600 13px Segoe UI, Arial, sans-serif'; g.textBaseline = 'middle';
  srcs.forEach((s, i) => {
    const [x, y] = tf(s.x, s.y), excl = isExcluded(s);
    g.globalAlpha = excl ? 0.45 : 1;
    g.beginPath(); g.arc(x, y, kind === 'works' ? 10 : 6, 0, 7); g.fillStyle = '#dc2626'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
    if (kind === 'works') { g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(String(i + 1), x, y + 0.5); }
    g.globalAlpha = 1;
  });
  // legend
  const items = kind === 'works' ? [['src', 'Plant item (number = row in the works table)'], ['hoard', 'Hoarding'], ['nca', 'NCA boundary']]
    : categoryList(R ? R.period : state.settings.period).filter(c => cats.has(c)).map(c => ['cat', c]).concat([['src', 'Plant']]);
  g.font = '12px Segoe UI, Arial, sans-serif'; g.textAlign = 'left';
  const lw = Math.max(...items.map(i => g.measureText(i[1]).width)) + 40, lh = 18 * items.length + 10;
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(10, 10, lw, lh); g.strokeStyle = '#9ca3af'; g.lineWidth = 1; g.strokeRect(10, 10, lw, lh);
  items.forEach(([t, label], i) => {
    const y = 24 + i * 18;
    if (t === 'cat') { g.fillStyle = categoryColor(label); g.fillRect(18, y - 6, 16, 12); g.strokeStyle = '#4b5563'; g.strokeRect(18, y - 6, 16, 12); }
    else if (t === 'src') { g.beginPath(); g.arc(26, y, 6, 0, 7); g.fillStyle = '#dc2626'; g.fill(); }
    else if (t === 'hoard') { g.fillStyle = '#111827'; g.fillRect(18, y - 2, 16, 4); }
    else { g.setLineDash([5, 3]); g.strokeStyle = '#0f766e'; g.lineWidth = 2; g.beginPath(); g.moveTo(18, y); g.lineTo(34, y); g.stroke(); g.setLineDash([]); g.lineWidth = 1; }
    g.fillStyle = '#111827'; g.fillText(label, 40, y);
  });
  // scale bar, north arrow, attribution
  const step = niceStep(120 / sc), px = step * sc;
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(10, H - 38, px + 20, 28);
  g.fillStyle = '#111827'; g.fillRect(20, H - 18, px, 4); g.font = '12px Segoe UI, Arial, sans-serif'; g.textAlign = 'left'; g.fillText(`${step} m`, 20, H - 28);
  g.textAlign = 'center'; g.font = '600 14px Segoe UI, Arial, sans-serif'; g.fillText('N ↑', W - 28, 26);
  if (state.buildings.some(b => b.osmId)) { g.font = '11px Segoe UI, Arial, sans-serif'; g.textAlign = 'right'; g.fillStyle = '#374151'; g.fillText('Buildings © OpenStreetMap contributors (ODbL)', W - 10, H - 10); }
  return cv.toDataURL('image/png');
}

function reportCss() {
  return `body{font:13px/1.45 "Segoe UI",Arial,sans-serif;color:#111827;margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
main{max-width:1000px;margin:0 auto;padding:24px 28px 60px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;border-bottom:2px solid #111827;padding-bottom:3px;break-after:avoid}h3{font-size:14px;margin:16px 0 6px;break-after:avoid}
table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:11.5px}th,td{border:1px solid #d1d5db;padding:3px 5px;text-align:left;vertical-align:top}th{background:#f3f4f6}td.n{text-align:right;font-variant-numeric:tabular-nums}
tr{break-inside:avoid}.disc{border:1px solid #f59e0b;background:#fffbeb;color:#78350f;padding:8px 10px;margin:10px 0}.muted{color:#6b7280}.chip{display:inline-block;width:10px;height:10px;border:1px solid #6b7280;margin-right:4px;vertical-align:-1px}
img.map{width:100%;border:1px solid #9ca3af}.meta td:first-child{width:28%;font-weight:600;background:#f9fafb}.stmt{font-weight:600;padding:8px 10px;border-left:4px solid #111827;background:#f9fafb}
.toolbar{position:sticky;top:0;background:#111827;color:#fff;padding:8px 28px;display:flex;gap:12px;align-items:center}.toolbar button{font:inherit;padding:4px 12px}
footer{max-width:1000px;margin:0 auto 24px;padding:6px 28px;font-size:10px;color:#6b7280;border-top:1px solid #d1d5db}
@media print{.toolbar{display:none}main{padding:0;max-width:none}footer{padding:6px 0}.pb{break-before:page}}
@page{margin:14mm 12mm 18mm;@bottom-left{content:"Screening estimate only – not a substitute for an assessment by a qualified acoustic consultant · noise_poc v${VERSION}";font:8pt Arial,sans-serif;color:#6b7280}@bottom-right{content:"Page " counter(page) " of " counter(pages);font:8pt Arial,sans-serif;color:#6b7280}}`;
}
const td = (v, n) => `<td${n ? ' class="n"' : ''}>${esc(v == null || v === '' ? '–' : String(v))}</td>`;
const catCell = l => `<td><span class="chip" style="background:${categoryColor(l)}"></span>${esc(l)}</td>`;

/* Builds the report HTML for the current shift and its results. */
function buildReport() {
  const R = state.assess.results, S = state.settings, sh = curShift(), now = new Date(), iso = S.method === 'iso';
  const byB = new Map(state.buildings.map(b => [b.id, b])), rows = propertyRows(), above = rows.filter(r => r.exc != null && r.exc > 0).sort((a, b) => b.exc - a.exc || a.id.localeCompare(b.id));
  const cats = categoryList(R.period), active = activeSources(), period = PERIODS[R.period];
  // properties (buildings) per land use and worst category
  const sum = new Map();
  for (const [id, x] of R.byBuilding) { if (x.worst === 'Not assessed') continue; const b = byB.get(id); if (!b) continue; const lu = luOf(b).lu; if (!sum.has(lu)) sum.set(lu, new Array(cats.length).fill(0)); const k = cats.indexOf(x.worst); if (k >= 0) sum.get(lu)[k]++; }
  const nB = new Set(above.map(r => r.bId)).size, meas = new Map(), highly = above.filter(r => r.highly).length;
  above.forEach(r => r.measures.forEach(m => meas.set(m, (meas.get(m) || 0) + 1)));
  const codes = RULES.measureCodes || {}, worst = above.length ? above.reduce((a, r) => (categoryRank(r.label, R.period) > categoryRank(a.label, R.period) ? r : a)).label : null;
  const sleep = R.receivers.filter(r => r.sleep && (r.sleep.overScreen || r.sleep.awakening));
  const stmt = !above.length
    ? `No assessed receiver is predicted to exceed its noise management level for this shift. No additional management measures are triggered under “${RULES.name}”.`
    : `${nB} propert${nB === 1 ? 'y' : 'ies'} (${above.length} building-floor${above.length === 1 ? '' : 's'}) are predicted to exceed the noise management level, by up to ${Math.max(...above.map(r => r.exc))} dB (worst category: ${worst}). ` +
      `Additional management measures are required: ${[...meas.keys()].sort().map(m => `${m} (${codes[m] || m})`).join(', ') || 'none listed for these categories'}.` +
      (highly ? ` ${highly} building-floor(s) are highly noise affected (≥ ${RULES.highlyAffected ? RULES.highlyAffected.level : 75} dBA).` : '');
  const HS = { manual: 'entered by hand', 'osm-height': 'OSM height tag', 'osm-levels': 'OSM levels', 'type-default': 'type estimate', dsm: 'DSM', lidar: 'LiDAR', file: 'imported file' }, heights = new Map();
  for (const b of state.buildings) { const k = HS[b.hsrc] || b.hsrc || 'unknown'; heights.set(k, (heights.get(k) || 0) + 1); }
  const est = state.buildings.filter(isEstimated).length;
  const RS = sh.dates.length ? `${sh.dates.length} date(s): ${datesText(sh.dates)}` : 'not set';
  const multi = state.shifts.filter(s => s.results).length > 1;
  // Appendix A: every building in smaller scenes; above 300, the buildings with a floor above NML
  const APP_MAX = 300, aboveB = new Set(above.map(r => r.bId)), listAll = state.buildings.length <= APP_MAX;
  const appB = state.buildings.filter(b => listAll || aboveB.has(b.id));
  const rsp = multi ? computeRespite() : null;
  const band = (RULES.bandSets[RULES.periods[R.period].bands] || []);
  const esc2 = v => esc(v == null ? '' : String(v));
  let lower = null;
  const bandRows = band.map(b => { const lo = lower; lower = b.above; const conv = RULES.boundary === 'lower';
    const range = b.above == null ? `> ${lo}` : lo == null ? `≤ ${b.above}` : conv ? `${lo} to < ${b.above}` : `> ${lo} to ${b.above}`;
    return `<tr>${td(range)}${catCell(b.label)}${td(b.impact)}${td(b.measures.join(', ') || '–')}</tr>`; }).join('');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Construction noise assessment – ${esc2(sh.name)}</title><style>${reportCss()}</style></head><body>
<div class="toolbar"><b>Construction noise assessment</b><button onclick="window.print()">Print / save as PDF</button><span class="muted" style="color:#d1d5db">Contains addresses – keep on approved storage.</span></div>
<main>
<h1>Construction noise assessment – ${esc2(sh.name)}</h1>
<p class="muted">${esc2(state.project.name || 'Project not named')} · ${esc2(period)} · generated ${now.toLocaleString()}${state.project.by ? ' · prepared by ' + esc2(state.project.by) : ''}</p>
<div class="disc"><b>Screening estimate.</b> ${esc(REPORT_DISCLAIMER)}</div>

<h2>1. Introduction</h2>
<table class="meta">
<tr><td>Activity</td><td>${esc2(sh.name)}${sh.notes ? '<br><span class="muted">' + esc2(sh.notes) + '</span>' : ''}</td></tr>
<tr><td>Time period</td><td>${esc2(period)}</td></tr>
<tr><td>Dates</td><td>${esc2(RS)}</td></tr>
<tr><td>Assessment basis</td><td>${esc2(RULES.name)}${state.rulesEdited ? ' (imported / edited)' : ''}<br><span class="muted">${esc2(RULES._note || '')}</span></td></tr>
<tr><td>Results</td><td>Run ${esc2(new Date(R.at).toLocaleString())}${R.sig !== inputsSignature() ? ' – <b>inputs have changed since this run</b>' : ''}</td></tr>
</table>

<h2>2. Method</h2>
<p>${esc(METHOD_NOTES[R.method])}</p>
<table class="meta">
<tr><td>Prediction</td><td>${iso ? 'ISO 9613-2' : 'TfNSW Construction Noise Estimator basis'}${iso && S.bands ? ', octave bands 63 Hz – 8 kHz with generic source spectra' : ', single band (A-weighted)'}</td></tr>
<tr><td>Levels</td><td>L<sub>Aeq,15min</sub> dB(A), free-field, at 1.5 m above each floor, ${fmt(state.assess.offset, 1)} m in front of each exposed façade, points about ${state.assess.spacing} m apart; worst point per building and floor. Floor height ${fmt(state.assess.floorH, 1)} m unless the building's floors are known.</td></tr>
<tr><td>Plant</td><td>Sound power with 10·lg(% time on), annoyance penalty and mitigation applied; ${S.combine === 'estimator' ? 'loudest 1–3 plant rows (TfNSW estimator realistic worst case)' : 'all plant operating together (conservative)'}.</td></tr>
<tr><td>Propagation</td><td>Air absorption ${S.air ? (iso && S.bands ? 'ISO 9613-1 per band' : fmt(airAlpha(S), 2) + ' dB/km') : 'off'} (${S.season === 'warm' ? 'Oct–Apr' : 'May–Sep'}); ${Math.round(S.soft * 100)} % soft ground; screening by buildings and hoarding ${S.barriers ? 'on' : 'off'}${state.terrain ? ', terrain ' + (S.terrain ? 'on' : 'off') : ', no terrain loaded'}${!iso ? `, capped at ${S.barCap} dB` : ''}; side diffraction ${S.lateral !== false ? 'on' : 'off'}; façade reflections ${reflectionsOn(S) ? `on (first order, ${fmt(S.reflLoss == null ? 1 : S.reflLoss, 1)} dB loss)` : 'off'}.</td></tr>
<tr><td>Noise management levels</td><td>RBL + ${RULES.periods[R.period].nmlAdd} dB in this period (${esc2(RULES.periods[R.period].rbl)} RBL); measured RBLs where an NCA has them, otherwise the noise area category. Non-residential land uses use the guideline's objectives.</td></tr>
<tr><td>Rule set</td><td>${esc2(RULES.name)}; band boundaries: ${RULES.boundary === 'lower' ? 'a band includes its lower limit' : 'a band includes its upper limit'}; exceedance rounded to whole dB.</td></tr>
</table>
<h3>Noise catchment areas</h3>
<table><tr><th>NCA</th><th>Category</th><th>Measured RBL day / evening / night</th><th>Residential NML, this period</th></tr>
${state.ncas.concat([Object.assign({ name: state.assess.defNca.name + ' (default)' }, state.assess.defNca)]).map(n => `<tr>${td(n.name)}${td((RULES.noiseAreaCategories[n.cat] || {}).label || n.cat)}${td(['day', 'evening', 'night'].map(k => n.rbl[k] ?? '–').join(' / '))}${td(nmlFor('residential', n, R.period).nml, 1)}</tr>`).join('')}</table>

<h2>3. Works description</h2>
<img class="map" alt="Plant locations" src="${reportMap('works', 1100, 650)}">
<table><tr><th>#</th><th>Activity / plant</th><th>% time operating in 15 min</th><th>Equipment</th><th>Sound power dB(A)</th><th>Annoyance penalty dB</th><th>Mitigation reduction dB</th><th>Effective Lw dB(A)</th><th>Height m</th><th>Notes</th></tr>
${state.sources.map((s, i) => `<tr>${td(i + 1, 1)}${td(s.name)}${td(s.on, 1)}${td(libItem(s.eq).name)}${td(fmt(s.lw, 1), 1)}${td(s.pen || 0, 1)}${td(fmt(s.mit || 0, 1), 1)}${td(fmt(effectiveLw(s), 1), 1)}${td(fmt(s.h, 1), 1)}${td([s.notes, active.includes(s) ? '' : 'not in the realistic worst case', overMax(s) != null ? `above the CNVG-PTI maximum of ${overMax(s)} dB(A)` : ''].filter(Boolean).join('; '))}</tr>`).join('')}
</table>

<h2 class="pb">4. Results</h2>
<h3>Properties per land use and impact category</h3>
<table><tr><th>Land use</th>${cats.map(c => `<th><span class="chip" style="background:${categoryColor(c)}"></span>${esc(c)}</th>`).join('')}<th>Total</th></tr>
${[...sum].map(([lu, v]) => `<tr>${td(landUseLabel(lu))}${v.map(n => td(n || '', 1)).join('')}${td(v.reduce((a, b) => a + b, 0), 1)}</tr>`).join('')}</table>
<p class="muted">A property is counted once, in the category of its worst floor. ${R.stats.receivers} building-floors in ${R.stats.assessed} buildings were assessed.</p>
<h3>Overall statement</h3>
<p class="stmt">${esc(stmt)}</p>
${sleep.length ? `<p>Sleep disturbance screening (indicative, L<sub>Amax</sub> ≈ L<sub>Aeq</sub> + ${RULES.sleep.lmaxOffset} dB): ${sleep.filter(r => r.sleep.overScreen).length} building-floor(s) above the screening level, ${sleep.filter(r => r.sleep.awakening).length} at or above ${RULES.sleep.awakening} dBA.</p>` : ''}
<h3>Impacted properties</h3>
<img class="map" alt="Impacted properties" src="${reportMap('impact', 1100, 700)}">
<h3>Receivers above the noise management level</h3>
${above.length ? `<table><tr><th>Receiver</th><th>Address and floor</th><th>NCA</th><th>NML</th><th>Predicted L<sub>Aeq</sub></th><th>Exceed.</th><th>Category</th><th>Measures</th><th>Land use</th><th>Notes</th></tr>
${above.map(r => { const b = byB.get(r.bId), notes = [r.highly ? 'highly noise affected' : '', r.sleep && r.sleep.awakening ? 'LAmax at awakening level' : r.sleep && r.sleep.overScreen ? 'above sleep screening' : '', luOf(b || {}).assumed ? 'land use assumed' : '', b && isEstimated(b) ? 'height estimated' : ''].filter(Boolean);
  return `<tr>${td(r.id)}${td(`${r.addr}, floor ${r.floorLabel}`)}${td(r.nca)}${td(r.nml, 1)}${td(fmt(r.Leq, 0), 1)}${td('+' + r.exc, 1)}${catCell(r.label)}${td(r.measuresStr || '–')}${td(r.luLabel)}${td(notes.join('; '))}</tr>`; }).join('')}</table>` : '<p>None.</p>'}
${rsp ? `<h2>5. All shifts and respite</h2>
<table><tr><th>Shift</th><th>Period</th><th>Dates</th><th>Floors above NML</th><th>Buildings</th>${IMPACTS.map(k => `<th>${k}</th>`).join('')}<th>Max dB(A)</th></tr>
${state.shifts.filter(s => s.results).map(s => { const x = shiftSummary(s); return `<tr>${td(s.name)}${td(PERIODS[s.period])}${td(s.dates.length ? datesText(s.dates) : '–')}${td(x.above, 1)}${td(x.buildings, 1)}${IMPACTS.map(k => td(x.impact[k] || '', 1)).join('')}${td(fmt(x.max, 0), 1)}</tr>`; }).join('')}</table>
<p>Respite check (${esc(respiteRules().source)}): ${rsp.list.filter(x => x.issues.length).length} building-floor(s) exceed the respite limits.</p>
${rsp.list.filter(x => x.issues.length).length ? `<table><tr><th>Receiver</th><th>Address and floor</th><th>NCA</th><th>Issues</th></tr>${rsp.list.filter(x => x.issues.length).slice(0, 500).map(x => { const b = byB.get(x.bId); return `<tr>${td(x.id)}${td(`${b ? addressOf(b) || b.name : ''}, floor ${x.floorLabel}`)}${td(x.nca)}${td(x.issues.join('; '))}</tr>`; }).join('')}</table>` : ''}` : ''}

<h2 class="pb">Appendix A – Buildings assessed and height sources</h2>
<p>Heights of all ${state.buildings.length} buildings: ${[...heights].map(([k, n]) => `${esc(k)} ${n}`).join(' · ')}.${est ? ` <b>${est} height(s) are type estimates</b> – check those near the works.` : ''}${listAll ? '' : ` Listed below: the ${appB.length} building(s) with a floor above the NML; the property CSV gives the height source for every building-floor.`}</p>
<table><tr><th>Building</th><th>Name / address</th><th>Land use (source)</th><th>NCA</th><th>Floors (source)</th><th>Height m</th><th>Height source</th><th>Worst category</th><th>Max L<sub>Aeq</sub></th></tr>
${appB.map(b => ({ b, x: R.byBuilding.get(b.id) })).sort((p, q) => ((q.x && q.x.maxLeq) ?? -1) - ((p.x && p.x.maxLeq) ?? -1)).map(({ b, x }) => { const lu = luOf(b), fl = floorsOf(b);
  return `<tr>${td('B' + b.id)}${td(addressOf(b) || b.name)}${td(`${landUseLabel(lu.lu)} (${lu.src})`)}${td(ncaOf(b).name)}${td(`${fl.n} (${fl.src})`)}${td(fmt(b.h, 1), 1)}${td(heightSource(b))}${x ? catCell(x.worst) : td('–')}${td(x && x.maxLeq != null ? fmt(x.maxLeq, 0) : '–', 1)}</tr>`; }).join('')}</table>

<h2>Appendix B – Rules applied (${esc2(period)})</h2>
<table><tr><th>Exceedance of NML (dB)</th><th>Category</th><th>Impact</th><th>Additional measures</th></tr>${bandRows}</table>
<table><tr><th>Code</th><th>Measure</th></tr>${Object.entries(codes).map(([k, v]) => `<tr>${td(k)}${td(v)}</tr>`).join('')}</table>

<h2>Appendix C – Data sources</h2>
<table><tr><th>Data</th><th>Source</th><th>Details</th><th>File date</th><th>Loaded</th></tr>
${state.provenance.map(p => `<tr>${td(p.kind)}${td(p.name)}${td(p.detail)}${td(p.fileDate ? p.fileDate.slice(0, 10) : '–')}${td(p.loaded ? p.loaded.slice(0, 16).replace('T', ' ') : '–')}</tr>`).join('') || '<tr><td colspan="5">No external data loaded: buildings, NCAs and terrain were drawn or entered in the tool.</td></tr>'}
<tr>${td('Plant sound power')}${td('Equipment library')}${td(state.libraryEdited ? 'Project library (edited or imported)' : 'CNVG-PTI v4.6 Appendix C Table 19 and the TfNSW Construction Noise Estimator plant list (Transport for NSW, non-commercial use with acknowledgement)')}${td('–')}${td('–')}</tr>
<tr>${td('Assessment rules')}${td(RULES.name)}${td(RULES.id)}${td('–')}${td('–')}</tr>
</table>
${state.buildings.some(b => b.osmId) ? '<p class="muted">Building footprints © OpenStreetMap contributors, available under the Open Database Licence (ODbL).</p>' : ''}
</main>
<footer>${esc(REPORT_DISCLAIMER)} · noise_poc v${VERSION} · ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC</footer>
</body></html>`;
  return html;
}

async function exportReport() {
  let R = state.assess.results;
  if (!R || assessStale()) { log(R ? 'Results are out of date – running the assessment for the report…' : 'Running the assessment for the report…'); R = await runAssessment(); if (!R) return null; }
  const addrs = state.buildings.filter(b => addressOf(b)).length;
  if (!window.confirm(`The report lists the affected properties${addrs ? ` and can include ${addrs} address(es)` : ''}. Keep it on this computer or approved project storage, and share it only through approved channels.\n\nCreate the report?`)) { log('Report cancelled.'); return null; }
  const t0 = performance.now(), html = buildReport(), sh = curShift();
  const slug = sh.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'shift';
  download(`noise_report_${slug}_${new Date().toISOString().slice(0, 10)}.html`, html, 'text/html');
  log(`Report created for “${sh.name}” (${(html.length / 1024).toFixed(0)} KB, ${(performance.now() - t0).toFixed(0)} ms). Open the file in Edge and use Print → Save as PDF. Contains addresses – keep it on approved storage.`, 'warn');
  return html;
}
$('btnReport').addEventListener('click', guarded('Report', exportReport));
