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
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
$('btnSave').addEventListener('click', () => {
  const data = {
    app: 'noise-poc', version: VERSION, saved: new Date().toISOString(), origin: state.origin,
    dem: state.terrain ? state.terrain.name : null, settings: state.settings, view: state.view,
    sources: state.sources.map(s => ({ name: s.name, eq: s.eq, lw: s.lw, h: s.h, x: s.x, y: s.y })),
    buildings: state.buildings.map(b => ({ name: b.name, h: b.h, baseRL: b.baseFixed, roofRL: b.roofRL, hsrc: b.hsrc, osmId: b.osmId, btype: b.btype, pts: b.pts })),
    hoardings: state.hoardings.map(h => ({ name: h.name, h: h.h, pts: h.pts }))
  };
  download('noise_scenario.json', JSON.stringify(data));
  log(`Saved scenario (${data.sources.length} sources, ${data.buildings.length} buildings, ${data.hoardings.length} hoardings).`);
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
  state.settings = Object.assign({}, state.settings, d.settings || {});
  state.sources = d.sources.filter(s => isFinite(s.x) && isFinite(s.y)).map(s => {
    const [x, y] = sh([s.x, s.y]);
    const o = makeSource(x, y, Number.isInteger(s.eq) && EQUIP[s.eq] ? s.eq : CUSTOM_EQ);
    o.name = String(s.name || o.name).slice(0, 40); o.lw = num(s.lw, 40, 150) ?? o.lw; o.h = num(s.h, 0, 200) ?? 1.5; return o;
  });
  state.buildings = d.buildings.map(b => { const p = validPts(b.pts); return p ? makeBuilding(p.map(sh), num(b.h, 0.5, 300) ?? state.settings.newH, String(b.name || '').slice(0, 40) || undefined, { baseRL: isFinite(b.baseRL) && b.baseRL !== null ? +b.baseRL : null, roofRL: isFinite(b.roofRL) && b.roofRL !== null ? +b.roofRL : null, hsrc: typeof b.hsrc === 'string' ? b.hsrc : 'manual', osmId: typeof b.osmId === 'string' ? b.osmId : null, btype: typeof b.btype === 'string' ? b.btype : null }) : null; }).filter(Boolean);
  state.hoardings = (d.hoardings || []).map(h => { const p = validPts(h.pts, 2); return p ? makeHoarding(p.map(sh), num(h.h, 0.3, 20) ?? 2.4, String(h.name || '').slice(0, 40) || undefined) : null; }).filter(Boolean);
  geomChanged(); syncSettingsUI(); select(null); updateSiteInfo();
  $('attrib').hidden = !state.buildings.some(b => b.osmId);
  log(`Loaded ${name}: ${state.sources.length} sources, ${state.buildings.length} buildings, ${state.hoardings.length} hoardings.`);
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
        log(`Importing ${f.name} as OSM XML.`); importOsm(data, performance.now()); zoomExtents(); return;
      }
      const j = JSON.parse(txt);
      if (Array.isArray(j.elements)) { log(`Importing ${f.name} as Overpass JSON.`); importOsm(j, performance.now()); zoomExtents(); return; }
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
    state.buildings.push(makeBuilding(pts, h ?? state.settings.newH, String(pr.name || pr.NAME || '').slice(0, 40) || undefined, { baseRL: base, roofRL: roof, hsrc, btype: pr.building || null, osmId: isOsm ? String(pr['@id'] || r.fid || '') || null : null })); added++;
  }
  geomChanged(); if (state.dsm) applyDsmHeights(true);
  $('attrib').hidden = !state.buildings.some(b => b.osmId);
  log(`Imported ${added} building(s) from ${name}${withRoof ? `; ${withRoof} with roof RL` : ''}${defH ? `; ${defH} without height → ${state.settings.newH} m` : ''}.`);
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
    makeBuilding(rect(30, 10, 95, 24), 7, 'Terrace row'),
    makeBuilding(rect(-75, -30, -45, 25), 14, 'Apartment block'),
    makeBuilding(rect(6, -26, 18, -19), 3, 'Site shed'),
    makeBuilding([[20, -75], [65, -75], [65, -60], [35, -60], [35, -40], [20, -40]], 10, 'Office (L-shape)'),
    makeBuilding(rect(-30, 45, 10, 60), 5, 'Shops')
  ];
  state.hoardings = [makeHoarding([[-25, -15], [-25, 25], [5, 32]], 2.4, 'Site hoarding')];
  state.sources = [makeSource(0, 0, 0)];
  geomChanged(); select(null);
  log('Demo loaded: 1 excavator (Lw 105), 5 buildings, 1 hoarding (2.4 m).');
  requestCompute(false);
}

