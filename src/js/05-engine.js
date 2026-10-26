/* ============================ ACOUSTIC ENGINE ========================== */
function segPolyIntervals(sx, sy, rx, ry, pts) {
  const dx = rx - sx, dy = ry - sy, ts = [0, 1];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const ax = pts[j][0], ay = pts[j][1], ex = pts[i][0] - ax, ey = pts[i][1] - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = ax - sx, wy = ay - sy;
    const t = (wx * ey - wy * ex) / den;
    if (t <= 0 || t >= 1) continue;
    const u = (wx * dy - wy * dx) / den;
    if (u < 0 || u > 1) continue;
    ts.push(t);
  }
  if (ts.length === 2) return null;
  ts.sort((a, b) => a - b);
  const out = [];
  for (let k = 0; k < ts.length - 1; k++) {
    const a = ts[k], c = ts[k + 1];
    if (c - a < 1e-9) continue;
    const m = (a + c) * 0.5;
    if (pip(sx + dx * m, sy + dy * m, pts)) {
      if (out.length && Math.abs(out[out.length - 1][1] - a) < 1e-9) out[out.length - 1][1] = c;
      else out.push([a, c]);
    }
  }
  return out.length ? out : null;
}
function upperHull(P) {
  const H = [];
  for (const p of P) {
    while (H.length >= 2) {
      const o = H[H.length - 2], a = H[H.length - 1];
      if ((a[0] - o[0]) * (p[1] - o[1]) - (a[1] - o[1]) * (p[0] - o[0]) >= 0) H.pop(); else break;
    }
    H.push(p);
  }
  return H;
}

const _cand = [];
function screening(src, rx, ry, d2, zs, zr, S, buildings, detail) {
  const prof = [];
  const above = (s, z) => z > zs + (zr - zs) * (s / d2) + 1e-6;
  const dx = rx - src.x, dy = ry - src.y;
  let kinds = detail ? { terrain: 0, building: 0, hoarding: 0 } : null;

  if (S.terrain && state.terrain) {
    const T = state.terrain, step = Math.max(Math.min(T.cx, T.cy), 0.5);
    const n = Math.min(MAX_TERRAIN_SAMPLES, Math.ceil(d2 / step));
    for (let k = 1; k < n; k++) {
      const t = k / n, z = ground(src.x + dx * t, src.y + dy * t), s = t * d2;
      if (above(s, z)) { prof.push([s, z, 0]); }
    }
  }
  if (S.barriers) {
    if (buildings.length) {
      const list = buildingsOnSegment(src.x, src.y, rx, ry, _cand);
      for (const b of list) {
        if (src._inside && src._inside.has(b.id)) continue;
        const iv = segPolyIntervals(src.x, src.y, rx, ry, b.pts);
        if (!iv) continue;
        const top = topOf(b);
        for (const [t0, t1] of iv) {
          if (above(t0 * d2, top)) prof.push([t0 * d2, top, 1]);
          if (above(t1 * d2, top)) prof.push([t1 * d2, top, 1]);
        }
      }
    }
    for (const ho of state.hoardings) {
      const bb = ho.bbox;
      if (bb[2] < Math.min(src.x, rx) || bb[0] > Math.max(src.x, rx) || bb[3] < Math.min(src.y, ry) || bb[1] > Math.max(src.y, ry)) continue;
      for (let i = 0; i < ho.pts.length - 1; i++) {
        const a = ho.pts[i], ex = ho.pts[i + 1][0] - a[0], ey = ho.pts[i + 1][1] - a[1];
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const wx = a[0] - src.x, wy = a[1] - src.y;
        const t = (wx * ey - wy * ex) / den, u = (wx * dy - wy * dx) / den;
        if (t <= 0 || t >= 1 || u < 0 || u > 1) continue;
        const top = ground(src.x + dx * t, src.y + dy * t) + ho.h;
        if (above(t * d2, top)) prof.push([t * d2, top, 2]);
      }
    }
  }
  if (!prof.length) return null;
  prof.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const P = [[0, zs, -1]]; for (const p of prof) P.push(p); P.push([d2, zr, -1]);
  const H = upperHull(P);
  if (H.length <= 2) return null;
  let L = 0; for (let k = 0; k < H.length - 1; k++) L += hyp(H[k], H[k + 1]);
  const direct = Math.hypot(d2, zs - zr), delta = L - direct;
  if (delta <= 0) return null;
  const n = H.length - 2;
  const dss = hyp(H[0], H[1]), dsr = hyp(H[n], H[n + 1]);
  const e = hyp(H[1], H[n]) > 0 ? (function () { let s = 0; for (let k = 1; k < n; k++) s += hyp(H[k], H[k + 1]); return s; })() : 0;
  let C3 = 1, cap = 20;
  if (n >= 2) { cap = 25; if (e > 1e-6) { const q = Math.pow(5 * LAMBDA / e, 2); C3 = (1 + q) / (1 / 3 + q); } }
  const Kmet = Math.exp(-(1 / 2000) * Math.sqrt(dss * dsr * direct / (2 * delta)));
  let Dz = 10 * Math.log10(3 + (20 / LAMBDA) * C3 * delta * Kmet);
  const capped = Dz > cap; if (capped) Dz = cap;
  if (detail) for (let k = 1; k <= n; k++) { const kd = H[k][2]; if (kd === 0) kinds.terrain++; else if (kd === 1) kinds.building++; else if (kd === 2) kinds.hoarding++; }
  return { Dz, delta, n, e, Kmet, C3, capped, kinds };
}

function contrib(src, rx, ry, S, buildings, detail, gr) {
  const hs = src.h, hr = S.hr;
  const zs = src._z, zr = (gr == null ? ground(rx, ry) : gr) + hr;
  const d2 = Math.max(Math.hypot(rx - src.x, ry - src.y), 0.01);
  const d = Math.max(Math.hypot(d2, zs - zr), 1);
  const Adiv = 20 * Math.log10(d) + 11;
  const Aatm = S.air ? ALPHA_DBKM * d / 1000 : 0;
  let Agr = 0;
  if (S.ground === 'soft') { const hm = (hs + hr) / 2, dg = Math.max(d2, 1); Agr = Math.max(0, 4.8 - (2 * hm / dg) * (17 + 300 / dg)); }
  let Abar = 0, bar = null;
  if ((S.barriers && (buildings.length || state.hoardings.length)) || (S.terrain && state.terrain)) {
    bar = screening(src, rx, ry, d2, zs, zr, S, buildings, detail);
    if (bar) Abar = Math.max(0, bar.Dz - Agr);
  }
  const Lp = src.lw - Adiv - Aatm - Agr - Abar;
  return detail ? { Lp, d, Adiv, Aatm, Agr, Abar, bar, zr } : Lp;
}
function prep(sources) {
  for (const s of sources) {
    s._inside = new Set();
    const b = buildingAt(s.x, s.y);
    if (b) for (const c of state.buildings) if (inBox(s.x, s.y, c.bbox) && pip(s.x, s.y, c.pts)) s._inside.add(c.id);
    s._z = ground(s.x, s.y) + s.h;
  }
}

