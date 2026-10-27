/* =========================== BACKGROUND MAPS =========================== */
/* A street map or aerial photo under the model, for bearings only (it plays no
   part in the calculation). Shown once the project has a real location (MGA
   origin). Web Mercator tiles are drawn onto the MGA view with an affine fit
   per tile – exact enough at street scale. The browser asks the tile server
   for the area in view; no addresses or project data are sent. Attribution is
   shown on the map. Offline or blocked: nothing is drawn, and the log says so
   once.
   OpenStreetMap's tile servers require a Referer header, which a page opened
   from disk (file://) never sends – they answer "Access blocked". So OSM tiles
   are only requested when the app is served over http(s), e.g. the hosted copy
   on GitHub Pages; from disk the NSW Spatial Services maps can be used. */
const APP_URL = 'https://damon-croxton.github.io/noise-modelling/';
const BASEMAPS = {
  osm: {
    label: 'OpenStreetMap street map', maxZ: 19, grey: true, needsHttp: true,
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    attrib: 'Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors (ODbL)'
  },
  nswbase: {
    label: 'NSW base map (Spatial Services)', maxZ: 19, grey: true, nswOnly: true,
    url: (z, x, y) => `https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Base_Map/MapServer/tile/${z}/${y}/${x}`,
    attrib: 'Map © <a href="https://www.spatial.nsw.gov.au/" target="_blank" rel="noopener">Spatial Services NSW</a> (CC BY 4.0)'
  },
  nswimg: {
    label: 'NSW aerial imagery (Spatial Services)', maxZ: 20, grey: false, nswOnly: true,
    url: (z, x, y) => `https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/tile/${z}/${y}/${x}`,
    attrib: 'Imagery © <a href="https://www.spatial.nsw.gov.au/" target="_blank" rel="noopener">Spatial Services NSW</a> (CC BY 4.0)'
  }
};
const TILES = { cache: new Map(), fails: {}, loaded: {}, warned: {}, drawn: false, blocked: false, max: 400 };
const fromDisk = () => location.protocol === 'file:';
/* 'auto': OpenStreetMap when served online, the NSW base map when opened from disk. */
function basemapKey() { return BASEMAPS[UI.basemap] ? UI.basemap : fromDisk() ? 'nswbase' : 'osm'; }
function lon2tx(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
function lat2ty(lat, z) { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z); }
function tx2lon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
function ty2lat(y, z) { const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }
function tileImg(bm, z, x, y) {
  const key = bm + '/' + z + '/' + x + '/' + y;
  let t = TILES.cache.get(key);
  if (t) { t.used = performance.now(); return t; }
  t = { img: new Image(), ok: false, bad: false, used: performance.now() };
  t.img.onload = () => { t.ok = true; TILES.loaded[bm] = (TILES.loaded[bm] || 0) + 1; requestRender(); };
  t.img.onerror = () => {
    t.bad = true; TILES.fails[bm] = (TILES.fails[bm] || 0) + 1;
    if (!TILES.warned[bm] && TILES.fails[bm] >= 3 && !TILES.loaded[bm]) { TILES.warned[bm] = true; log(`${BASEMAPS[bm].label} could not be loaded (offline, blocked on this network${BASEMAPS[bm].nswOnly ? ', or outside NSW' : ''}). The model works without it; pick another background map or none under View → Map layers.`, 'warn'); }
  };
  t.img.src = BASEMAPS[bm].url(z, x, y);
  TILES.cache.set(key, t);
  if (TILES.cache.size > TILES.max) {   // forget the least recently used tiles
    const old = [...TILES.cache.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, TILES.cache.size - TILES.max);
    for (const [k] of old) TILES.cache.delete(k);
  }
  return t;
}
function basemapOn() { const o = state.origin; return UI.layers.osm && !!(o && o.type === 'projected' && o.zone); }
/* Draws the tiles for the current view. Returns true when anything was drawn. */
function drawOsmUnderlay() {
  TILES.drawn = false; TILES.blocked = false;
  if (!basemapOn()) return false;
  const bm = basemapKey(), B = BASEMAPS[bm];
  if (B.needsHttp && fromDisk()) {   // OSM refuses pages opened from disk: don't ask
    TILES.blocked = true;
    if (!TILES.warned.disk) { TILES.warned.disk = true; log(`The OpenStreetMap street map only works in the online copy of the app (${APP_URL}) – OSM's servers refuse pages opened from disk. From disk, choose the NSW base map or NSW aerial imagery under View → Map layers.`, 'warn'); }
    return false;
  }
  const v = state.view, c = local2ll(v.cx, v.cy), coslat = Math.cos(c[0] * Math.PI / 180);
  // zoom where one tile pixel ≈ one screen pixel (×1.4 for sharper text), within the server's range
  let z = Math.max(2, Math.min(B.maxZ, Math.round(Math.log2(156543.034 * coslat * v.scale * 1.4))));
  const corners = [[0, 0], [cssW, 0], [0, cssH], [cssW, cssH]].map(p => { const w = s2w(p[0], p[1]); return local2ll(w[0], w[1]); });
  let x0, x1, y0, y1;
  for (;;) {
    x0 = Math.floor(Math.min(...corners.map(p => lon2tx(p[1], z)))); x1 = Math.floor(Math.max(...corners.map(p => lon2tx(p[1], z))));
    y0 = Math.floor(Math.min(...corners.map(p => lat2ty(p[0], z)))); y1 = Math.floor(Math.max(...corners.map(p => lat2ty(p[0], z))));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 80 || z <= 2) break;
    z--;
  }
  const scr = (tx, ty) => { const l = ll2local(ty2lat(ty, z), tx2lon(tx, z)); return w2s(l[0], l[1]); };
  ctx.save();
  ctx.globalAlpha = B.grey ? (UI.theme === 'dark' ? 0.55 : 0.6) : 0.75;
  ctx.filter = !B.grey ? 'none' : UI.theme === 'dark' ? 'invert(1) hue-rotate(180deg) grayscale(0.6)' : 'grayscale(0.7)';
  const n = Math.pow(2, z);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (ty < 0 || ty >= n) continue;
    const t = tileImg(bm, z, ((tx % n) + n) % n, ty);
    if (!t.ok) continue;
    const a = scr(tx, ty), b = scr(tx + 1, ty), d = scr(tx, ty + 1);
    ctx.setTransform(dpr * (b[0] - a[0]) / 256, dpr * (b[1] - a[1]) / 256, dpr * (d[0] - a[0]) / 256, dpr * (d[1] - a[1]) / 256, dpr * a[0], dpr * a[1]);
    ctx.drawImage(t.img, 0, 0, 257, 257);   // 1 px overlap hides seams
    TILES.drawn = true;
  }
  ctx.restore();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return TILES.drawn;
}
/* Attribution line on the map: background map and/or OSM buildings. */
let attribHtml = null;
function updateAttribution() {
  const parts = [];
  if (TILES.drawn) parts.push(BASEMAPS[basemapKey()].attrib);
  if (state.buildings.some(b => b.osmId)) parts.push('Buildings © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors (ODbL)');
  if (TILES.blocked) parts.push(`OSM street map: use the <a href="${APP_URL}" target="_blank" rel="noopener">online copy</a> or pick an NSW map under View`);
  const h = parts.join(' · ');
  if (h === attribHtml) return;
  attribHtml = h; $('attrib').innerHTML = h; $('attrib').hidden = !h;
}
