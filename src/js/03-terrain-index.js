/* ============================ TERRAIN MODEL ============================ */
function ground(x, y) {
  const T = state.terrain;
  if (!T) return 0;
  let fx = (x - T.x0) / T.cx - 0.5, fy = (T.yTop - y) / T.cy - 0.5;
  if (fx < 0) fx = 0; else if (fx > T.w - 1) fx = T.w - 1;
  if (fy < 0) fy = 0; else if (fy > T.h - 1) fy = T.h - 1;
  const i = Math.min(Math.floor(fx), T.w - 2 < 0 ? 0 : T.w - 2), j = Math.min(Math.floor(fy), T.h - 2 < 0 ? 0 : T.h - 2);
  const u = fx - i, v = fy - j, w = T.w, z = T.z;
  const i1 = T.w > 1 ? i + 1 : i, j1 = T.h > 1 ? j + 1 : j;
  const a = z[j * w + i], b = z[j * w + i1], c = z[j1 * w + i], d = z[j1 * w + i1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function terrainInside(x, y) {
  const T = state.terrain; if (!T) return false;
  return x >= T.x0 && x <= T.x0 + T.w * T.cx && y <= T.yTop && y >= T.yTop - T.h * T.cy;
}

/* ============================ SPATIAL INDEX ============================ */
const IDX = { cs: 25, map: new Map(), dirty: true, stamp: 1, built: 0 };
function ikey(i, j) { return (i + 60000) * 120001 + (j + 60000); }
function rebuildIndex() {
  IDX.map.clear();
  let span = 0;
  for (const b of state.buildings) span = Math.max(span, b.bbox[2] - b.bbox[0], b.bbox[3] - b.bbox[1]);
  IDX.cs = Math.max(10, Math.min(100, span * 0.75 || 25));
  state.buildings.forEach((b, k) => { b._ix = k; });
  for (const b of state.buildings) {
    const cs = IDX.cs;
    for (let i = Math.floor(b.bbox[0] / cs); i <= Math.floor(b.bbox[2] / cs); i++)
      for (let j = Math.floor(b.bbox[1] / cs); j <= Math.floor(b.bbox[3] / cs); j++) {
        const k = ikey(i, j); let a = IDX.map.get(k); if (!a) IDX.map.set(k, a = []); a.push(b);
      }
  }
  IDX.dirty = false; IDX.built++;
}
function idx() { if (IDX.dirty) rebuildIndex(); return IDX; }
function buildingsOnSegment(x0, y0, x1, y1, out) {
  const I = idx(), cs = I.cs, st = ++I.stamp;
  out.length = 0;
  let i = Math.floor(x0 / cs), j = Math.floor(y0 / cs);
  const ie = Math.floor(x1 / cs), je = Math.floor(y1 / cs);
  const dx = x1 - x0, dy = y1 - y0, si = dx > 0 ? 1 : -1, sj = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(cs / dx) : Infinity, tdy = dy !== 0 ? Math.abs(cs / dy) : Infinity;
  let tmx = dx !== 0 ? (dx > 0 ? (i + 1) * cs - x0 : x0 - i * cs) / Math.abs(dx) : Infinity;
  let tmy = dy !== 0 ? (dy > 0 ? (j + 1) * cs - y0 : y0 - j * cs) / Math.abs(dy) : Infinity;
  let guard = 0;
  for (;;) {
    const a = I.map.get(ikey(i, j));
    if (a) for (const b of a) if (b._st !== st) { b._st = st; out.push(b); }
    if ((i === ie && j === je) || guard++ > 20000) break;
    if (tmx < tmy) { tmx += tdx; i += si; } else { tmy += tdy; j += sj; }
  }
  return out;
}
function buildingAt(x, y) {
  const I = idx(), a = I.map.get(ikey(Math.floor(x / I.cs), Math.floor(y / I.cs)));
  if (a) for (let k = a.length - 1; k >= 0; k--) { const b = a[k]; if (inBox(x, y, b.bbox) && pip(x, y, b.pts)) return b; }
  return null;
}

/* Buildings whose bounding box comes within r of (x, y). */
function buildingsNear(x, y, r, out) {
  const I = idx(), cs = I.cs, st = ++I.stamp;
  out.length = 0;
  for (let i = Math.floor((x - r) / cs); i <= Math.floor((x + r) / cs); i++)
    for (let j = Math.floor((y - r) / cs); j <= Math.floor((y + r) / cs); j++) {
      const a = I.map.get(ikey(i, j)); if (!a) continue;
      for (const b of a) if (b._st !== st) { b._st = st; if (b.bbox[0] - r <= x && x <= b.bbox[2] + r && b.bbox[1] - r <= y && y <= b.bbox[3] + r) out.push(b); }
    }
  return out;
}
