/* ============================ OSM UNDERLAY ============================= */
/* OpenStreetMap street map under the model, for bearings only (it plays no
   part in the calculation). Shown once the project has a real location (MGA
   origin). Standard OSM tiles (Web Mercator) are drawn onto the MGA view with
   an affine fit per tile – exact enough at street scale. Tiles come from
   tile.openstreetmap.org, so the browser asks the OSM servers for the area in
   view (no addresses or project data are sent). Attribution is shown on the
   map. Offline or blocked: nothing is drawn, and the log says so once. */
const TILES = { cache: new Map(), fails: 0, loaded: 0, warned: false, drawn: false, max: 400 };
const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
function lon2tx(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
function lat2ty(lat, z) { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z); }
function tx2lon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
function ty2lat(y, z) { const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }
function tileImg(z, x, y) {
  const key = z + '/' + x + '/' + y;
  let t = TILES.cache.get(key);
  if (t) { t.used = performance.now(); return t; }
  t = { img: new Image(), ok: false, bad: false, used: performance.now() };
  t.img.onload = () => { t.ok = true; TILES.loaded++; requestRender(); };
  t.img.onerror = () => {
    t.bad = true; TILES.fails++;
    if (!TILES.warned && TILES.fails >= 3 && !TILES.loaded) { TILES.warned = true; log('OSM street map could not be loaded (offline, or tile.openstreetmap.org is blocked on this network). The model works without it; turn it off under View → Map layers.', 'warn'); }
  };
  t.img.src = TILE_URL(z, x, y);
  TILES.cache.set(key, t);
  if (TILES.cache.size > TILES.max) {   // forget the least recently used tiles
    const old = [...TILES.cache.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, TILES.cache.size - TILES.max);
    for (const [k] of old) TILES.cache.delete(k);
  }
  return t;
}
function osmUnderlayOn() { const o = state.origin; return UI.layers.osm && !!(o && o.type === 'projected' && o.zone); }
/* Draws the tiles for the current view. Returns true when anything was drawn. */
function drawOsmUnderlay() {
  TILES.drawn = false;
  if (!osmUnderlayOn()) return false;
  const v = state.view, c = local2ll(v.cx, v.cy), coslat = Math.cos(c[0] * Math.PI / 180);
  // zoom where one tile pixel ≈ one screen pixel (×1.4 for sharper text), within OSM's 0–19
  let z = Math.max(2, Math.min(19, Math.round(Math.log2(156543.034 * coslat * v.scale * 1.4))));
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
  ctx.globalAlpha = UI.theme === 'dark' ? 0.55 : 0.6;
  ctx.filter = UI.theme === 'dark' ? 'invert(1) hue-rotate(180deg) grayscale(0.6)' : 'grayscale(0.7)';
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (ty < 0 || ty >= Math.pow(2, z)) continue;
    const t = tileImg(z, ((tx % Math.pow(2, z)) + Math.pow(2, z)) % Math.pow(2, z), ty);
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
