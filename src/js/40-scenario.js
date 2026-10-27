/* =========================== SCENARIO / FILES ========================== */
function zoomExtents() {
  const pts = [];
  state.buildings.forEach(b => { pts.push([b.bbox[0], b.bbox[1]], [b.bbox[2], b.bbox[3]]); });
  state.hoardings.forEach(h => h.pts.forEach(p => pts.push(p)));
  state.sources.forEach(s => pts.push([s.x, s.y]));
  if (!pts.length && state.terrain) { const T = state.terrain; pts.push([T.x0, T.yTop], [T.x0 + T.w * T.cx, T.yTop - T.h * T.cy]); }
  if (!pts.length) { state.view = { cx: 0, cy: 0, scale: 3 }; requestCompute(false); return; }
  const bb = bboxOf(pts), w = Math.max(bb[2] - bb[0], 20), h = Math.max(bb[3] - bb[1], 20);
  state.view.cx = (bb[0] + bb[2]) / 2; state.view.cy = (bb[1] + bb[3]) / 2;
  state.view.scale = Math.min(60, Math.max(0.02, Math.min(cssW / (w * 1.4), cssH / (h * 1.4))));
  requestCompute(false);
}
function zoomTerrain() {
  const T = state.terrain; if (!T) return;
  const w = T.w * T.cx, h = T.h * T.cy;
  state.view.cx = T.x0 + w / 2; state.view.cy = T.yTop - h / 2;
  state.view.scale = Math.min(60, Math.max(0.02, Math.min(cssW / (w * 1.05), cssH / (h * 1.05))));
  requestCompute(false);
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
$('btnSave').addEventListener('click', () => {
  const addrs = state.buildings.filter(b => addressOf(b)).length;
  if (addrs && !window.confirm(`This scenario includes ${addrs} building address(es). Keep the file on this computer or approved project storage.\n\nSave the scenario?`)) { log('Scenario save cancelled.'); return; }
  const A = state.assess, cur = curShift();
  const data = {
    app: 'noise-poc', version: VERSION, saved: new Date().toISOString(), origin: state.origin,
    dem: state.terrain ? state.terrain.name : null, settings: state.settings, view: state.view,
    sources: state.sources.map(sourceOut),
    shifts: state.shifts.map(sh => ({ name: sh.name, period: sh.period, season: sh.season, dates: sh.dates, notes: sh.notes || undefined, sources: sh.sources.map(sourceOut) })),
    shift: state.shifts.indexOf(cur), project: state.project, provenance: state.provenance,
    library: state.libraryEdited ? LIBRARY : undefined,
    buildings: state.buildings.map(b => ({ name: b.name, h: b.h, baseRL: b.baseFixed, roofRL: b.roofRL, hsrc: b.hsrc, osmId: b.osmId, btype: b.btype,
      tags: b.tags || undefined, landUse: b.landUse || undefined, luSrc: b.landUse ? b.luSrc : undefined, floors: b.floors ?? undefined, address: b.address || undefined, pts: b.pts })),
    hoardings: state.hoardings.map(h => ({ name: h.name, h: h.h, pts: h.pts })),
    ncas: state.ncas.map(n => ({ name: n.name, cat: n.cat, rbl: n.rbl, pts: n.pts })),
    assess: { defNca: A.defNca, floorH: A.floorH, spacing: A.spacing, offset: A.offset, display: A.display },
    rules: state.rulesEdited ? RULES : undefined, rulesSet: state.rulesEdited ? undefined : state.rulesSet
  };
  download('noise_scenario.json', JSON.stringify(data));
  log(`Saved scenario (${data.shifts.length} shift(s), ${data.sources.length} sources in the current one, ${data.buildings.length} buildings, ${data.hoardings.length} hoardings, ${data.ncas.length} NCAs).`);
});
$('btnLoad').addEventListener('click', () => $('fileLoad').click());
$('btnGeo').addEventListener('click', () => $('fileGeo').click());
$('btnDem').addEventListener('click', () => $('fileDem').click());
function readJSONFile(input, cb) {
  input.addEventListener('change', () => {
    const f = input.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { cb(JSON.parse(r.result), f.name); } catch (err) { log(`Could not read ${f.name}: ${err.message}`, 'fail'); } input.value = ''; };
    r.readAsText(f);
  });
}
/* Record where input data came from, for the report (data sources and dates). */
function noteSource(kind, name, detail, file) {
  const e = { kind, name: String(name || '').slice(0, 200), detail: String(detail || '').slice(0, 300), loaded: new Date().toISOString(), fileDate: file && file.lastModified ? new Date(file.lastModified).toISOString() : null };
  state.provenance = state.provenance.filter(p => !(p.kind === kind && p.name === e.name)).concat(e);
  return e;
}
function sourceOut(s) {
  return Object.assign({ name: s.name, eq: s.eq, lw: s.lw, on: s.on, pen: s.pen, mit: s.mit, h: s.h, x: s.x, y: s.y }, s.spec ? { spec: s.spec } : {}, s.notes ? { notes: s.notes } : {});
}
function sourceIn(s, sh) {
  const [x, y] = sh([s.x, s.y]);
  const o = makeSource(x, y, typeof s.eq === 'string' ? s.eq : 'custom');   // v0.4 stored a numeric index
  if (typeof s.eq === 'string' && o.eq !== s.eq) log(`Source “${s.name}”: library item “${s.eq}” not found – kept its saved level as Custom.`, 'warn');
  o.name = String(s.name || o.name).slice(0, 40); o.lw = num(s.lw, 40, 150) ?? o.lw; o.h = num(s.h, 0, 200) ?? 1.5;
  o.on = num(s.on, 1, 100) ?? 100; o.pen = num(s.pen, 0, 10) ?? (typeof s.eq === 'string' ? o.pen : 0); o.mit = num(s.mit, 0, 30) ?? 0;
  if (s.spec != null) { if (validSpec(s.spec)) o.spec = Array.isArray(s.spec) ? s.spec.slice() : s.spec; else log(`Source “${o.name}”: spectrum ignored (expected a preset name or 8 band levels).`, 'warn'); }
  if (typeof s.notes === 'string' && s.notes) o.notes = s.notes.slice(0, 200);
  return o;
}
/* Merge saved settings over the current ones, keeping only known keys with
   valid values. v0.4 files stored ground as 'hard'/'soft'; that maps to 0 or
   100 % soft ground. */
function sanitizeSettings(raw, cur) {
  const out = Object.assign({}, cur);
  if (!raw || typeof raw !== 'object') return out;
  const pick = (k, ok) => { if (k in raw && ok(raw[k])) out[k] = raw[k]; else if (k in raw) log(`Scenario setting “${k}” ignored (invalid value ${JSON.stringify(raw[k])}).`, 'warn'); };
  const inR = (a, b) => v => typeof v === 'number' && isFinite(v) && v >= a && v <= b;
  const oneOf = (...vals) => v => vals.includes(v);
  const bool = v => typeof v === 'boolean';
  pick('method', oneOf('tfnsw', 'iso')); pick('combine', oneOf('all', 'estimator')); pick('season', oneOf('warm', 'cool')); pick('period', oneOf(...Object.keys(PERIODS)));
  pick('reflect', oneOf('auto', 'on', 'off')); pick('bands', bool); pick('reflLoss', inR(0, 10));
  pick('soft', inR(0, 1)); pick('barCap', inR(5, 25)); pick('hr', inR(0, 200));
  pick('air', bool); pick('lateral', bool); pick('barriers', bool); pick('terrain', bool); pick('shade', bool);
  pick('cellPx', oneOf(3, 5, 8)); pick('opacity', inR(0.2, 1)); pick('minDb', oneOf(30, 35, 40, 45, 50));
  pick('newH', inR(0.5, 300)); pick('newHo', inR(0.3, 20));
  if (!('soft' in raw) && (raw.ground === 'soft' || raw.ground === 'hard')) {
    out.soft = raw.ground === 'soft' ? 1 : 0;
    log(`Scenario from an older version: ground “${raw.ground}” → ${out.soft * 100} % soft ground. Levels now use the ${out.method === 'iso' ? 'ISO' : 'TfNSW'} basis and will differ from v0.4.`, 'warn');
  }
  return out;
}
/* name / category / measured RBLs of a saved NCA, validated */
function cleanNca(n, defName) {
  const r = n.rbl || {}, v = x => (x == null || x === '' ? null : num(x, 20, 80));
  return { name: String(n.name || defName).slice(0, 40), cat: RULES.noiseAreaCategories[n.cat] ? n.cat : DEFAULT_NCA_CAT, rbl: { day: v(r.day), evening: v(r.evening), night: v(r.night) } };
}
function validPts(pts, min) {
  if (!Array.isArray(pts)) return null;
  const out = pts.filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])).map(p => [+p[0], +p[1]]);
  return out.length >= (min || 3) ? out : null;
}
readJSONFile($('fileLoad'), (d, name) => {
  if (!d || !Array.isArray(d.sources) || !Array.isArray(d.buildings)) throw new Error('not a noise-poc scenario');
  let dx = 0, dy = 0;
  if (d.origin && d.origin.type === 'projected') {
    if (state.origin && state.origin.type === 'projected') { dx = d.origin.x0 - state.origin.x0; dy = d.origin.y0 - state.origin.y0; if (dx || dy) log(`Scenario shifted by (${dx}, ${dy}) m to match the loaded DEM.`); }
    else state.origin = d.origin;
  }
  const sh = p => [+p[0] + dx, +p[1] + dy];
  state.settings = sanitizeSettings(d.settings, state.settings);
  if (!d.rules && RULESETS[d.rulesSet]) setRuleSet(d.rulesSet);
  if (d.rules) {
    try { RULES = validateRules(d.rules); state.rulesEdited = true; log(`Scenario carries its own assessment rules (“${RULES.name || 'unnamed'}”).`); }
    catch (e) { log(`Scenario rules ignored (${e.message}) – using the current rules.`, 'warn'); }
  }
  if (d.assess && typeof d.assess === 'object') {
    const A = state.assess, a = d.assess;
    A.floorH = num(a.floorH, 2, 6) ?? A.floorH; A.spacing = num(a.spacing, 2, 50) ?? A.spacing; A.offset = num(a.offset, 0.1, 5) ?? A.offset;
    if (['both', 'cat', 'heat', 'respite'].includes(a.display)) A.display = a.display;
    if (a.defNca && typeof a.defNca === 'object') A.defNca = cleanNca(a.defNca, A.defNca.name);
  }
  if (d.library) {
    try { LIBRARY = cleanLibrary(d.library); state.libraryEdited = true; updateLibInfo(); log(`Scenario carries its own equipment library (${LIBRARY.length} items).`); }
    catch (e) { log(`Scenario library ignored: ${e.message}`, 'warn'); }
  }
  const srcs = list => (Array.isArray(list) ? list : []).filter(s => s && isFinite(s.x) && isFinite(s.y)).map(s => sourceIn(s, sh));
  state.sources = srcs(d.sources);
  state.shifts = []; state.shiftId = null; state.respite = null;
  if (Array.isArray(d.shifts) && d.shifts.length) {
    state.shifts = d.shifts.map((x, i) => makeShift(String(x.name || `Shift ${i + 1}`).slice(0, 60), srcs(x.sources), {
      period: PERIODS[x.period] ? x.period : state.settings.period, season: x.season === 'cool' || x.season === 'warm' ? x.season : state.settings.season,
      dates: parseDates((Array.isArray(x.dates) ? x.dates : []).join(',')).dates, notes: String(x.notes || '').slice(0, 500) }));
    const cur = state.shifts[Number.isInteger(d.shift) && state.shifts[d.shift] ? d.shift : 0];
    state.shiftId = cur.id; state.sources = cur.sources; state.settings.period = cur.period; state.settings.season = cur.season;
  } else resetShifts();
  state.project = { name: String((d.project && d.project.name) || '').slice(0, 120), by: String((d.project && d.project.by) || '').slice(0, 120) };
  state.provenance = (Array.isArray(d.provenance) ? d.provenance : []).filter(p => p && typeof p.kind === 'string').slice(0, 200)
    .map(p => ({ kind: p.kind.slice(0, 40), name: String(p.name || '').slice(0, 200), detail: String(p.detail || '').slice(0, 300), loaded: String(p.loaded || '').slice(0, 30), fileDate: p.fileDate ? String(p.fileDate).slice(0, 30) : null }));
  state.buildings = d.buildings.map(b => { const p = validPts(b.pts); return p ? makeBuilding(p.map(sh), num(b.h, 0.5, 300) ?? state.settings.newH, String(b.name || '').slice(0, 40) || undefined, { baseRL: isFinite(b.baseRL) && b.baseRL !== null ? +b.baseRL : null, roofRL: isFinite(b.roofRL) && b.roofRL !== null ? +b.roofRL : null, hsrc: typeof b.hsrc === 'string' ? b.hsrc : 'manual', osmId: typeof b.osmId === 'string' ? b.osmId : null, btype: typeof b.btype === 'string' ? b.btype : null,
    tags: b.tags && typeof b.tags === 'object' ? keepTags(b.tags) : null, landUse: typeof b.landUse === 'string' && RULES.landUses[b.landUse] ? b.landUse : null, luSrc: b.luSrc === 'file' ? 'file' : 'manual',
    floors: num(b.floors, 1, 200), address: typeof b.address === 'string' ? b.address.slice(0, 120) : null }) : null; }).filter(Boolean);
  state.hoardings = (d.hoardings || []).map(h => { const p = validPts(h.pts, 2); return p ? makeHoarding(p.map(sh), num(h.h, 0.3, 20) ?? 2.4, String(h.name || '').slice(0, 40) || undefined) : null; }).filter(Boolean);
  state.ncas = (Array.isArray(d.ncas) ? d.ncas : []).map(n => { const p = validPts(n && n.pts); return p ? Object.assign(makeNca(p.map(sh)), cleanNca(n, 'NCA')) : null; }).filter(Boolean);
  state.assess.results = null;
  geomChanged(); syncSettingsUI(); syncAssessUI(); renderShiftPanel(true); select(null); updateSiteInfo();
  $('attrib').hidden = !state.buildings.some(b => b.osmId);
  log(`Loaded ${name}: ${state.shifts.length} shift(s), ${state.sources.length} sources in “${curShift().name}”, ${state.buildings.length} buildings, ${state.hoardings.length} hoardings, ${state.ncas.length} NCAs.`);
  if (d.dem && !state.terrain) log(`This scenario used DEM “${d.dem}” – load it to restore terrain.`, 'warn');
  zoomExtents();
});
$('fileGeo').addEventListener('change', () => {
  const input = $('fileGeo'), f = input.files[0]; if (!f) return; input.value = '';
  const r = new FileReader();
  r.onload = () => {
    try {
      const txt = String(r.result), head = txt.slice(0, 400).trim();
      if (head.startsWith('<')) {
        const data = osmXmlToElements(txt);
        if (!state.origin || !state.origin.zone) {
          const all = []; data.elements.forEach(e => (e.geometry || []).forEach(p => all.push([p.lon, p.lat])));
          if (!all.length) throw new Error('no building geometry in the file');
          const bb = bboxOf(all), lon = (bb[0] + bb[2]) / 2, lat = (bb[1] + bb[3]) / 2, z = zoneOf(lon), c = ll2mga(lat, lon, z);
          ensureOrigin(c[0], c[1], null, z, 'OSM file');
        }
        log(`Importing ${f.name} as OSM XML.`); importOsm(data, performance.now(), { name: f.name, file: f }); zoomExtents(); return;
      }
      const j = JSON.parse(txt);
      if (Array.isArray(j.elements)) { log(`Importing ${f.name} as Overpass JSON.`); importOsm(j, performance.now(), { name: f.name, file: f }); zoomExtents(); return; }
      importGeoJSON(j, f.name);
    } catch (err) { log(`Could not read ${f.name}: ${err.message}`, 'fail'); console.error(err); }
  };
  r.readAsText(f);
});
function importGeoJSON(gj, name) {
  const feats = gj.type === 'FeatureCollection' ? gj.features : gj.type === 'Feature' ? [gj] : [];
  const rings = [];
  for (const f of feats) {
    const g = f && f.geometry; if (!g) continue;
    const props = f.properties || {};
    if (g.type === 'Polygon') rings.push({ ring: g.coordinates[0], props, fid: f.id });
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(pc => rings.push({ ring: pc[0], props }));
  }
  if (!rings.length) throw new Error('no Polygon / MultiPolygon features found');
  const all = []; rings.forEach(r => r.ring.forEach(p => all.push(p)));
  const bb = bboxOf(all), lonlat = bb[0] >= -180 && bb[2] <= 180 && bb[1] >= -90 && bb[3] <= 90;
  const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
  let tf, isOsm = feats.some(f => f && f.properties && (f.properties.building || f.properties['@id'] || f.id && /^(way|relation)\//.test(f.id)));
  if (lonlat) {
    const z = (state.origin && state.origin.zone) || zoneOf(cx), c = ll2mga(cy, cx, z);
    ensureOrigin(c[0], c[1], null, z, 'GeoJSON (lat/lon)');
    tf = p => ll2local(p[1], p[0]);
  } else {
    const o = ensureOrigin(cx, cy, null, null, 'GeoJSON (projected)'); tf = p => [p[0] - o.x0, p[1] - o.y0];
  }
  let added = 0, defH = 0, withRoof = 0;
  const luUnknown = new Set();
  const pick = (pr, keys) => { for (const k of keys) if (pr[k] != null && isFinite(+pr[k])) return +pr[k]; return null; };
  for (const r of rings) {
    let pts = validPts(r.ring); if (!pts) continue;
    pts = pts.map(tf);
    if (hyp(pts[0], pts[pts.length - 1]) < 1e-6) pts.pop();
    if (pts.length < 3) continue;
    const pr = r.props;
    const roof = pick(pr, ['roof_rl', 'ROOF_RL', 'roofRL', 'roof', 'max_z', 'MAX_Z']);
    const base = pick(pr, ['base_rl', 'BASE_RL', 'baseRL', 'ground_rl', 'min_z', 'MIN_Z']);
    let h = num(pick(pr, ['height', 'HEIGHT', 'h', 'bldg_height', 'Height']), 0.5, 300), hsrc = 'file';
    if (h === null && roof === null && isOsm) { const oh = osmHeight(pr); h = oh.h; hsrc = oh.src; }
    else if (h === null && roof === null) { h = state.settings.newH; defH++; hsrc = 'type-default'; }
    if (roof !== null) withRoof++;
    const luRaw = ['land_use', 'landuse', 'LAND_USE', 'LandUse', 'LU'].map(k => pr[k]).find(v => typeof v === 'string');
    const lu = luRaw && Object.keys(RULES.landUses).find(k => k.toLowerCase() === luRaw.toLowerCase() || RULES.landUses[k].label.toLowerCase() === luRaw.toLowerCase());
    if (luRaw && !lu) luUnknown.add(luRaw);
    const floors = num(pick(pr, ['floors', 'FLOORS', 'levels', 'storeys', 'building:levels']), 1, 200);
    const address = ['address', 'ADDRESS', 'Address'].map(k => pr[k]).find(v => typeof v === 'string');
    state.buildings.push(makeBuilding(pts, h ?? state.settings.newH, String(pr.name || pr.NAME || '').slice(0, 40) || undefined, {
      baseRL: base, roofRL: roof, hsrc, btype: pr.building || null, osmId: isOsm ? String(pr['@id'] || r.fid || '') || null : null,
      tags: isOsm ? keepTags(pr) : null, landUse: lu || null, luSrc: 'file', floors, address: address ? address.slice(0, 120) : null })); added++;
  }
  geomChanged(); if (state.dsm) applyDsmHeights(true);
  $('attrib').hidden = !state.buildings.some(b => b.osmId);
  noteSource('Buildings (GeoJSON)', name, `${added} building(s)${withRoof ? `, ${withRoof} with roof RL` : ''}`, null);
  log(`Imported ${added} building(s) from ${name}${withRoof ? `; ${withRoof} with roof RL` : ''}${defH ? `; ${defH} without height → ${state.settings.newH} m` : ''}.`);
  if (luUnknown.size) log(`Land use values not in the rules, ignored: ${[...luUnknown].slice(0, 8).join(', ')}. Known: ${Object.keys(RULES.landUses).join(', ')}.`, 'warn');
  zoomExtents();
}
$('fileDem').addEventListener('change', async () => {
  const input = $('fileDem'), f = input.files[0]; if (!f) return;
  input.value = '';
  log(`Reading DEM ${f.name} (${(f.size / 1048576).toFixed(1)} MB)…`);
  $('busy').textContent = 'Reading DEM…';
  try {
    const ext = f.name.toLowerCase().split('.').pop();
    let R;
    if (ext === 'tif' || ext === 'tiff') R = await parseGeoTIFF(await f.arrayBuffer());
    else { const txt = await f.text(); R = /^\s*ncols/i.test(txt) ? parseASC(txt) : parseXYZ(txt); }
    const hadTerrain = !!state.terrain;
    installTerrain(R, f.name);
    noteSource('Terrain (DEM)', f.name, `${R.W}×${R.H} cells @ ${fmt(state.terrain.cx, 2)} m${R.epsg ? ', EPSG ' + R.epsg : ''}`, f);
    if (!hadTerrain && state.sources.length && state.buildings.length && state.buildings.every(b => b.name && !b.name.startsWith('Building'))) log('Demo objects now sit at the DEM centre. Use “Clear buildings” and draw/import your own.', 'warn');
    zoomTerrain();
  } catch (err) {
    log(`DEM load FAILED: ${err.message}`, 'fail'); console.error(err);
    $('busy').textContent = 'DEM load failed – see log';
  }
});
$('btnDemClear').addEventListener('click', () => {
  if (!state.terrain) return;
  state.terrain = null; for (const b of state.buildings) updateBase(b);
  updateDemInfo(); log('DEM removed – ground flat at RL 0.'); requestCompute(false);
});
$('btnClearB').addEventListener('click', () => { const n = state.buildings.length; state.buildings = []; geomChanged(); select(null); log(`Cleared ${n} building(s).`); requestCompute(false); });
$('btnDemo').addEventListener('click', () => { loadDemo(); zoomExtents(); });
$('btnFit').addEventListener('click', zoomExtents);

function loadDemo() {
  state.buildings = [
    makeBuilding(rect(30, 10, 95, 24), 7, 'Terrace row', { landUse: 'residential' }),
    makeBuilding(rect(-75, -30, -45, 25), 14, 'Apartment block', { landUse: 'residential' }),
    makeBuilding(rect(6, -26, 18, -19), 3, 'Site shed', { landUse: 'none' }),
    makeBuilding([[20, -75], [65, -75], [65, -60], [35, -60], [35, -40], [20, -40]], 10, 'Office (L-shape)', { landUse: 'commercial' }),
    makeBuilding(rect(-30, 45, 10, 60), 5, 'Shops', { landUse: 'commercial' })
  ];
  state.hoardings = [makeHoarding([[-25, -15], [-25, 25], [5, 32]], 2.4, 'Site hoarding')];
  state.sources = [makeSource(0, 0, DEFAULT_EQ)]; state.ncas = []; state.assess.results = null;
  resetShifts('Demo shift'); state.provenance = [];
  geomChanged(); select(null);
  log('Demo loaded: 1 excavator (20 t, Lw 105), 5 buildings, 1 hoarding (2.4 m).');
  renderAssessPanel(); updateAssessButtons(); refreshBulkSelects(); requestCompute(false);
}

