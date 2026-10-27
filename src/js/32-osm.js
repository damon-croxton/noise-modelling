/* ======================= FREE BUILDING DATA (OSM) ====================== */
const OSM_SKIP = new Set(['roof', 'carport', 'no', 'ruins', 'collapsed', 'demolished', 'proposed', 'canopy']);
const LEVEL_H = 3.0, ROOF_ALLOW = 1.0;
const TYPE_H = {
  house: 7, detached: 7, semidetached_house: 7, terrace: 8, bungalow: 5, residential: 7, cabin: 4, hut: 3,
  apartments: 13, dormitory: 13, hotel: 15,
  commercial: 8, retail: 6, office: 12, supermarket: 7, kiosk: 3,
  industrial: 8, warehouse: 8, manufacture: 8, service: 4, transformer_tower: 4,
  garage: 3, garages: 3, shed: 3, storage_tank: 6, toilets: 3,
  school: 8, university: 12, college: 10, kindergarten: 5, hospital: 15,
  church: 12, chapel: 8, train_station: 8, transportation: 6, public: 8, civic: 8, government: 10, sports_centre: 9, grandstand: 8,
  construction: 6, yes: 6
};
function parseHeight(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase().replace(',', '.');
  const ft = s.match(/^([\d.]+)\s*(ft|')/); if (ft) return parseFloat(ft[1]) * 0.3048;
  const m = s.match(/^([\d.]+)/); if (!m) return null;
  const h = parseFloat(m[1]); return isFinite(h) && h > 0 && h < 600 ? h : null;
}
function osmHeight(tags) {
  const h = parseHeight(tags.height) ?? parseHeight(tags['building:height']);
  if (h != null) return { h, src: 'osm-height' };
  const lv = parseFloat(tags['building:levels']);
  if (isFinite(lv) && lv > 0 && lv < 200) return { h: lv * LEVEL_H + ROOF_ALLOW, src: 'osm-levels', levels: lv };
  const t = tags.building || 'yes';
  return { h: TYPE_H[t] ?? TYPE_H.yes, src: 'type-default' };
}
function isEstimated(b) { return b.hsrc === 'type-default'; }
function assembleRings(segs) {
  const rings = [], open = segs.map(s => s.slice()).filter(s => s.length >= 2);
  const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  while (open.length) {
    let ring = open.shift(), guard = 0;
    while (!same(ring[0], ring[ring.length - 1]) && guard++ < 1000) {
      const end = ring[ring.length - 1];
      let k = open.findIndex(s => same(s[0], end) || same(s[s.length - 1], end));
      if (k < 0) break;
      let s = open.splice(k, 1)[0]; if (!same(s[0], end)) s = s.reverse();
      ring = ring.concat(s.slice(1));
    }
    if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}
function viewBoxLocal() { const a = s2w(0, 0), b = s2w(cssW, cssH); return [a[0], b[1], b[0], a[1]]; }
function osmApiUrl(W, S, E, N) { return `https://api.openstreetmap.org/api/0.6/map?bbox=${W.toFixed(6)},${S.toFixed(6)},${E.toFixed(6)},${N.toFixed(6)}`; }
async function fetchOsmApi(url) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 30000);
  try {
    log('OSM API: querying api.openstreetmap.org…');
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 400 ? ' (area too big or too many nodes – zoom in)' : r.status === 509 ? ' (bandwidth limit – wait)' : ''}`);
    return osmXmlToElements(await r.text());
  } catch (err) {
    clearTimeout(timer);
    throw err.name === 'AbortError' ? new Error('timed out after 30 s') : err;
  }
}
function osmXmlToElements(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('not valid OSM XML (proxy block page?)');
  const root = doc.documentElement;
  if (!root || root.nodeName !== 'osm') throw new Error(`expected <osm> XML, got <${root ? root.nodeName : '?'}>`);
  const nodes = new Map();
  for (const n of doc.getElementsByTagName('node')) nodes.set(n.getAttribute('id'), { lat: +n.getAttribute('lat'), lon: +n.getAttribute('lon') });
  const tagsOf = el => { const t = {}; for (const c of el.children) if (c.nodeName === 'tag') t[c.getAttribute('k')] = c.getAttribute('v'); return t; };
  const wayGeom = new Map(), out = [];
  let missing = 0;
  for (const w of doc.getElementsByTagName('way')) {
    const g = [];
    for (const c of w.children) if (c.nodeName === 'nd') { const p = nodes.get(c.getAttribute('ref')); if (p) g.push(p); else missing++; }
    wayGeom.set(w.getAttribute('id'), g);
    const tags = tagsOf(w);
    if (tags.building) out.push({ type: 'way', id: +w.getAttribute('id'), tags, geometry: g });
  }
  for (const r of doc.getElementsByTagName('relation')) {
    const tags = tagsOf(r);
    if (!tags.building || tags.type !== 'multipolygon') continue;
    const members = [];
    for (const c of r.children) if (c.nodeName === 'member' && c.getAttribute('type') === 'way') {
      const g = wayGeom.get(c.getAttribute('ref'));
      if (g) members.push({ type: 'way', role: c.getAttribute('role') || 'outer', geometry: g });
    }
    out.push({ type: 'relation', id: +r.getAttribute('id'), tags, members });
  }
  log(`OSM XML: ${nodes.size.toLocaleString()} nodes, ${out.length} building element(s)${missing ? `, ${missing} node refs outside file (edge buildings may be clipped)` : ''}.`);
  return { elements: out };
}
let osmBusy = false;
async function fetchOsmBuildings() {
  if (osmBusy) return;
  if (!state.origin || !state.origin.zone) { log('Set the site location first (lat, lon → Go to site) or load a DEM, so the app knows where the map is.', 'warn'); return; }
  const bb = viewBoxLocal(), w = bb[2] - bb[0], h = bb[3] - bb[1];
  if (w * h > 1e6) { log(`View is ${fmt(w / 1000, 2)} × ${fmt(h / 1000, 2)} km – zoom in to about 1 km × 1 km or less before fetching (OSM download limit).`, 'warn'); return; }
  const corners = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]]].map(p => local2ll(p[0], p[1]));
  const S = Math.min(...corners.map(c => c[0])), N = Math.max(...corners.map(c => c[0])), W = Math.min(...corners.map(c => c[1])), E = Math.max(...corners.map(c => c[1]));
  const bbox = [S, W, N, E].map(v => v.toFixed(6)).join(',');
  osmBusy = true; $('btnOsm').disabled = true; $('busy').textContent = 'Fetching OSM buildings…';
  const t0 = performance.now();
  try {
    log(`Fetching OSM buildings for ${fmt(w, 0)} × ${fmt(h, 0)} m view (bbox ${bbox}).`);
    const apiUrl = osmApiUrl(W, S, E, N);
    state.lastOsmUrl = apiUrl;
    const data = await fetchOsmApi(apiUrl);
    importOsm(data, t0, { name: `OpenStreetMap API, fetched ${new Date().toISOString().slice(0, 10)}, bbox ${bbox}` });
    log('Next: optionally load terrain (DEM) and LiDAR from ELVIS, then draw or import the noise catchment areas.');
  } catch (err) {
    log(`OSM fetch FAILED (${err.message}${err instanceof TypeError ? ' – blocked by the network or proxy, or offline' : ''}). Manual route: click “Copy OSM download link”, paste it into a new Edge tab, save the file it downloads (“map” → rename to map.osm), then use “Import buildings” and pick that file.`, 'fail');
    log(`Download link for this view: ${state.lastOsmUrl}`);
    $('busy').textContent = 'OSM fetch failed – see log';
  } finally { osmBusy = false; $('btnOsm').disabled = false; }
}
function importOsm(data, t0, from) {
  const els = (data && data.elements) || [];
  const byId = new Map(state.buildings.filter(b => b.osmId).map(b => [b.osmId, b]));
  const replace = $('osmReplace').checked;
  const cnt = { added: 0, replaced: 0, dup: 0, skipped: 0, bad: 0, 'osm-height': 0, 'osm-levels': 0, 'type-default': 0 };
  for (const el of els) {
    const tags = el.tags || {};
    if (OSM_SKIP.has(tags.building)) { cnt.skipped++; continue; }
    let rings = [];
    if (el.type === 'way' && Array.isArray(el.geometry)) rings = [el.geometry.map(g => [g.lon, g.lat])];
    else if (el.type === 'relation' && Array.isArray(el.members)) rings = assembleRings(el.members.filter(m => m.type === 'way' && m.role !== 'inner' && Array.isArray(m.geometry)).map(m => m.geometry.map(g => [g.lon, g.lat])));
    const hi = osmHeight(tags);
    rings.forEach((ring, ri) => {
      const id = `${el.type}/${el.id}${rings.length > 1 ? '#' + ri : ''}`;
      let pts = ring.map(p => ll2local(p[1], p[0]));
      if (pts.length > 1 && hyp(pts[0], pts[pts.length - 1]) < 1e-6) pts.pop();
      if (pts.length < 3) { cnt.bad++; return; }
      const old = byId.get(id);
      if (old && !replace) { cnt.dup++; return; }
      if (old) { state.buildings.splice(state.buildings.indexOf(old), 1); cnt.replaced++; }
      const name = (tags.name || tags['addr:housenumber'] && (tags['addr:housenumber'] + ' ' + (tags['addr:street'] || '')) || (tags.building !== 'yes' ? tags.building : '') || 'OSM ' + el.id).slice(0, 40);
      const b = makeBuilding(pts, hi.h, name, { hsrc: hi.src, osmId: id, btype: tags.building || 'yes', tags: keepTags(tags) });
      state.buildings.push(b); byId.set(id, b); cnt.added++; cnt[hi.src]++;
    });
  }
  geomChanged();
  if (state.dsm) applyDsmHeights(true);
  const ms = performance.now() - (t0 || performance.now());
  if (cnt.added || cnt.replaced) noteSource('Buildings (OpenStreetMap, ODbL)', from ? from.name : 'Fetched from ' + (data.generator || 'OSM'), `${cnt.added} building(s) added; heights: ${cnt['osm-height']} tagged, ${cnt['osm-levels']} from levels, ${cnt['type-default']} type estimates`, from && from.file);
  log(`OSM: ${els.length} elements → ${cnt.added} buildings added${cnt.replaced ? ` (${cnt.replaced} replaced)` : ''}${cnt.dup ? `, ${cnt.dup} already loaded` : ''}${cnt.skipped ? `, ${cnt.skipped} roofs/carports/etc skipped` : ''}. Heights: ${cnt['osm-height']} tagged, ${cnt['osm-levels']} from levels, ${cnt['type-default']} estimated by type. ${ms.toFixed(0)} ms.`, cnt.added ? 'pass' : 'warn');
  const nEst = state.buildings.filter(isEstimated).length;
  if (cnt.added && nEst / Math.max(1, state.buildings.length) > 0.5) log(`${nEst} building heights are type estimates (dashed). Load LiDAR (.laz) or edit key buildings near the works.`, 'warn');
  else if (cnt.added && nEst) log(`${nEst} building height(s) still estimated (dashed) – check those near the works.`, 'warn');
  if (!els.length) log('No buildings returned for this area.', 'warn');
  if (state.origin && datumOf(state.origin.epsg) === 'GDA94') log('OSM is GDA2020/WGS84 and your data is GDA94 – expect ~1.5–1.8 m offset (not significant for screening).', 'warn');
  select(null); requestCompute(false);
}

function installDsm(R, name) {
  let bad = 0;
  for (let i = 0; i < R.z.length; i++) { const v = R.z[i]; if (!isFinite(v) || (R.nodata != null && Math.abs(v - R.nodata) < 1e-6 * Math.max(1, Math.abs(R.nodata))) || v < -1e4 || v > 1e5) { R.z[i] = NaN; bad++; } }
  R = toScenarioZone(R, 'DSM');
  const P = rasterPlacement(R, 1);
  state.dsm = { w: R.W, h: R.H, z: R.z, x0: P.x0, yTop: P.yTop, cx: P.cx, cy: P.cy, name };
  log(`DSM loaded: ${name}, ${R.W}×${R.H} @ ${fmt(P.cx, 2)} m, ${bad.toLocaleString()} NoData cells.`, 'pass');
  noteSource('Roof heights (DSM)', name, `${R.W}×${R.H} cells @ ${fmt(P.cx, 2)} m`, state.dsmFile || null);
  applyDsmHeights();
}
function applyDsmHeights(quiet) {
  const D = state.dsm; if (!D) return;
  if (!state.terrain) { log('DSM needs a DEM (ground) to turn roof levels into building heights – load the DEM too.', 'warn'); return; }
  let set = 0, few = 0, keep = 0, manual = 0;
  const tag = D.kind === 'lidar' ? 'lidar' : 'dsm', what = D.kind === 'lidar' ? 'LiDAR' : 'DSM';
  for (const b of state.buildings) {
    if (b.hsrc === 'manual' || b.hsrc === 'file') { manual++; continue; }
    const vals = [];
    const i0 = Math.max(0, Math.floor((b.bbox[0] - D.x0) / D.cx)), i1 = Math.min(D.w - 1, Math.floor((b.bbox[2] - D.x0) / D.cx));
    const j0 = Math.max(0, Math.floor((D.yTop - b.bbox[3]) / D.cy)), j1 = Math.min(D.h - 1, Math.floor((D.yTop - b.bbox[1]) / D.cy));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = D.x0 + (i + 0.5) * D.cx, y = D.yTop - (j + 0.5) * D.cy;
      if (!pip(x, y, b.pts)) continue;
      const v = D.z[j * D.w + i]; if (v === v) vals.push(v);
    }
    if (vals.length < 4) { few++; b.lidarN = vals.length; continue; }
    vals.sort((a, c) => a - c);
    const p90 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.9))];
    updateBase(b);
    const h = p90 - b.base;
    if (h < 2) { keep++; continue; }
    b.h = Math.min(300, h); b.roofRL = null; b.hsrc = tag; b.lidarN = vals.length; set++;
  }
  geomChanged();
  if (!quiet || set) log(`${what} heights applied to ${set} building(s)${few ? `; ${few} with no/too few ${what} roof cells (outside tile, new, or demolished – check)` : ''}${keep ? `; ${keep} kept (roof < 2 m above ground)` : ''}${manual ? `; ${manual} hand-entered/file heights left alone` : ''}.`, set ? 'pass' : 'warn');
  renderSelPanel(); requestCompute(false);
}

function updateSiteInfo() {
  const o = state.origin, el = $('siteInfo'); if (!el) return;
  if (!o) { el.innerHTML = '<span class="muted">No location yet – enter the site lat, lon or load a DEM.</span>'; return; }
  const ll = mga2ll(o.x0, o.y0, o.zone || 56);
  el.textContent = `Origin E ${o.x0}, N ${o.y0} · MGA zone ${o.zone || '?'}${o.epsg ? ' · EPSG ' + o.epsg : ''} · ${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}`;
}
function goToSite() {
  const m = $('siteLL').value.trim().match(/^(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)$/);
  if (!m) { $('siteLL').classList.add('bad'); log('Enter the site as “lat, lon”, e.g. -33.8890, 151.2370 (right-click a spot in Google Maps to copy it).', 'warn'); return; }
  const lat = +m[1], lon = +m[2];
  if (!(lat >= -45 && lat <= -9 && lon >= 108 && lon <= 160)) { $('siteLL').classList.add('bad'); log('That location is outside Australia (MGA zones 49–56).', 'warn'); return; }
  $('siteLL').classList.remove('bad');
  if (state.example) {
    if (!window.confirm('Start your project at this site? The synthetic example (its buildings, hoarding, NCAs and plant) will be cleared.')) { log('Go to site cancelled – the example is still loaded.'); return; }
    newProject(); log('Example cleared – new project at the site.');
  }
  if (state.origin && state.origin.isDefault) {   // the opening view's location is just a view: move the origin to the site
    const empty = !state.sources.length && !state.buildings.length && !state.hoardings.length && !state.ncas.length && !state.terrain;
    if (empty) state.origin = null; else delete state.origin.isDefault;
  }
  const z = (state.origin && state.origin.zone) || zoneOf(lon), p = ll2mga(lat, lon, z);
  const first = !state.origin;
  ensureOrigin(p[0], p[1], null, z, 'site location');
  const loc = ll2local(lat, lon);
  if (first && state.sources.length && state.buildings.length && state.buildings.every(b => !b.osmId)) log('Tip: Clear → Buildings removes the demo blocks before you fetch real ones.', 'warn');
  // about 600 m across: inside the OSM download limit, wide enough for the nearby receivers
  state.view.cx = loc[0]; state.view.cy = loc[1]; state.view.scale = Math.min(60, Math.max(0.5, Math.min(cssW, cssH) / 600));
  log(`Moved to site ${lat.toFixed(5)}, ${lon.toFixed(5)} → E ${fmt(p[0] , 1)}, N ${fmt(p[1], 1)}. Next: Fetch OSM buildings.`);
  updateSiteInfo(); updateSiteSteps(); requestCompute(false);
}
$('btnSite').addEventListener('click', goToSite);
$('siteLL').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goToSite(); } });
$('btnOsm').addEventListener('click', fetchOsmBuildings);
$('btnOsmLink').addEventListener('click', async () => {
  if (!state.origin || !state.origin.zone) { log('Set the site location first (Go to site) or load a DEM.', 'warn'); return; }
  const bb = viewBoxLocal(), w = bb[2] - bb[0], h = bb[3] - bb[1];
  if (w * h > 1e6) { log('Zoom in to about 1 km × 1 km or less first (OSM download limit).', 'warn'); return; }
  const c = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]]].map(p => local2ll(p[0], p[1]));
  const url = osmApiUrl(Math.min(...c.map(p => p[1])), Math.min(...c.map(p => p[0])), Math.max(...c.map(p => p[1])), Math.max(...c.map(p => p[0])));
  state.lastOsmUrl = url;
  let copied = false;
  try { await navigator.clipboard.writeText(url); copied = true; } catch (e) { /* clipboard blocked */ }
  if (!copied) { const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); try { copied = document.execCommand('copy'); } catch (e) {} ta.remove(); }
  log(`${copied ? 'Copied' : 'Could not copy – select it here'}: ${url}`, copied ? 'pass' : 'warn');
  log('Paste into a new Edge tab → it downloads a file called “map” → rename to map.osm → Import buildings (GeoJSON / .osm).');
});
$('btnDsm').addEventListener('click', () => $('fileDsm').click());
$('fileDsm').addEventListener('change', async () => {
  const input = $('fileDsm'), f = input.files[0]; if (!f) return; input.value = '';
  log(`Reading DSM ${f.name} (${(f.size / 1048576).toFixed(1)} MB)…`);
  try {
    const ext = f.name.toLowerCase().split('.').pop(); let R;
    if (ext === 'tif' || ext === 'tiff') R = await parseGeoTIFF(await f.arrayBuffer());
    else { const txt = await f.text(); R = /^\s*ncols/i.test(txt) ? parseASC(txt) : parseXYZ(txt); }
    if (R.W * R.H > 16e6) throw new Error(`${R.W}×${R.H} is too large for a DSM – clip it to the site`);
    state.dsmFile = f; installDsm(R, f.name); state.dsmFile = null;
  } catch (err) { log(`DSM load FAILED: ${err.message}`, 'fail'); console.error(err); }
});

