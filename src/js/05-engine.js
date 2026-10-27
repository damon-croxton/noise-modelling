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

/* Barrier attenuation of one diffracted path, ISO 9613-2 eq. 14:
   Dz = 10·lg(3 + (C2/λ)·C3·z·Kmet), C2 = 20; C3 for two or more edges from
   their spread e (eq. 15); capped. Kmet = 1 for lateral paths. */
function dzPath(delta, n, e, kmet, lambda, cap) {
  let C3 = 1;
  if (n >= 2 && e > 1e-6) { const q = Math.pow(5 * lambda / e, 2); C3 = (1 + q) / (1 / 3 + q); }
  return Math.min(10 * Math.log10(3 + (20 / lambda) * C3 * delta * kmet), cap);
}
/* Convex hull (anticlockwise) of [x, y, tag] points; collinear points kept so
   that S and R stay on the hull when they sit on an edge. */
function hullTagged(P) {
  const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) < -1e-9) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) < -1e-9) hi.pop(); hi.push(p); }
  lo.pop(); hi.pop();
  return lo.concat(hi);
}
/* Lateral (side) paths in plan around the obstacles that block the direct
   path: the two chains of the convex hull of S, R and the corners of those
   obstacles (as CNOSSOS-EU). Further buildings that a side path runs through
   are not added: that would only lower the side path's contribution, so
   ignoring them is conservative (and keeps the cost small in dense areas).
   Returns [{ n, e, delta, pts }] for the two sides, or null when S or R lies
   inside the hull (e.g. an enclosed yard). */
function lateralGeom(sx, sy, rx, ry, zs, zr, d2, blockB, blockH) {
  const P = [[sx, sy, 'S'], [rx, ry, 'R']];
  for (const b of blockB) for (const p of b.pts) P.push([p[0], p[1], 0]);
  for (const ho of blockH) for (const p of ho.pts) P.push([p[0], p[1], 0]);
  const H = hullTagged(P), m = H.length;
  const iS = H.findIndex(p => p[2] === 'S'), iR = H.findIndex(p => p[2] === 'R');
  if (iS < 0 || iR < 0) return null;
  const dz = zs - zr, direct = Math.hypot(d2, dz), out = [];
  for (const step of [1, -1]) {
    const ch = [];
    for (let k = (iS + step + m) % m; k !== iR; k = (k + step + m) % m) ch.push(H[k]);
    if (!ch.length) continue;
    let Lh = hyp([sx, sy], ch[0]) + hyp(ch[ch.length - 1], [rx, ry]);
    for (let k = 0; k < ch.length - 1; k++) Lh += hyp(ch[k], ch[k + 1]);
    const e = ch.length >= 2 ? Lh - hyp([sx, sy], ch[0]) - hyp(ch[ch.length - 1], [rx, ry]) : 0;
    out.push({ n: ch.length, e, delta: Math.hypot(Lh, dz) - direct, pts: ch.map(p => [p[0], p[1]]) });
  }
  return out;
}

/* Screening between source and receiver. The path over the top is the upper
   convex hull of everything above the line of sight in the vertical section
   (terrain, roofs, hoarding). When buildings or hoarding (not terrain) form
   that path and side diffraction is on, the two lateral paths are added.
   Returns the path geometry (so it can be evaluated per frequency) and the
   single-band (500 Hz) values. */
const _cand = [];
function screening(src, rx, ry, d2, zs, zr, S, buildings, detail) {
  const prof = [], blockB = new Set(), blockH = new Set();
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
          if (above(t0 * d2, top)) prof.push([t0 * d2, top, 1, b]);
          if (above(t1 * d2, top)) prof.push([t1 * d2, top, 1, b]);
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
        if (above(t * d2, top)) prof.push([t * d2, top, 2, ho]);
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
  const e = n >= 2 ? (function () { let s = 0; for (let k = 1; k < n; k++) s += hyp(H[k], H[k + 1]); return s; })() : 0;
  const Kmet = Math.exp(-(1 / 2000) * Math.sqrt(dss * dsr * direct / (2 * delta)));
  let terrainEdge = false;
  for (let k = 1; k <= n; k++) { const kd = H[k][2]; if (kd === 0) terrainEdge = true; else if (kd === 1) blockB.add(H[k][3]); else if (kd === 2) blockH.add(H[k][3]); }
  // blocking obstacles = every building / hoarding with a crossing above the line of sight
  for (const p of prof) { if (p[2] === 1) blockB.add(p[3]); else if (p[2] === 2) blockH.add(p[3]); }
  const iso = S.method === 'iso', cap = Math.min(n >= 2 ? 25 : 20, !iso && S.barCap > 0 ? S.barCap : Infinity);
  const top = { delta, n, e, Kmet, Dz: dzPath(delta, n, e, Kmet, LAMBDA, Infinity) };
  let lat = null;
  if (S.lateral !== false && !terrainEdge && (blockB.size || blockH.size)) {
    lat = lateralGeom(src.x, src.y, rx, ry, zs, zr, d2, blockB, blockH);
    if (lat) for (const l of lat) l.Dz = dzPath(l.delta, l.n, l.e, 1, LAMBDA, Infinity);
  }
  if (detail) for (let k = 1; k <= n; k++) { const kd = H[k][2]; if (kd === 0) kinds.terrain++; else if (kd === 1) kinds.building++; else if (kd === 2) kinds.hoarding++; }
  const r = { delta, n, e, Kmet, cap, top, lat, kinds, terrainEdge };
  r.Dz = combineDz(r, LAMBDA); r.capped = r.raw > cap;
  return r;
}
/* Barrier term from all diffracted paths at one wavelength: the uncapped Dz of
   the path over the top (with Kmet) and of each side path (Kmet = 1) are summed
   by energy, then the cap (20 dB single / 25 dB multiple edges in ISO, the
   screening cap on the TfNSW basis) is applied once to the result. Capping each
   path first would make a long wall screen less than a short one. */
function combineDz(r, lambda) {
  const t = r.top;
  let raw = dzPath(t.delta, t.n, t.e, t.Kmet, lambda, Infinity);
  if (r.lat && r.lat.length) {
    let e = Math.pow(10, -raw / 10);
    for (const l of r.lat) e += Math.pow(10, -dzPath(l.delta, l.n, l.e, 1, lambda, Infinity) / 10);
    raw = -10 * Math.log10(e);
  }
  r.raw = raw;
  return Math.min(raw, r.cap);
}

/* Air absorption coefficient (dB/km) for the season and time period. */
function airAlpha(S) {
  const t = (AIR_ATTEN[S.season] || AIR_ATTEN.warm)[S.period === 'p2night' ? 'night' : 'day'];
  return (t[0] + t[1] + t[2]) / 3;
}
/* CONCAWE category-4 ground attenuation for fully soft ground, mean of the
   250 / 500 / 1000 Hz fits, each floored at 0 (as in the TfNSW estimator). */
function concaweGround(d) {
  const L = Math.log10(Math.max(d, 1));
  let s = 0;
  for (const c of CONCAWE_CAT4) s += Math.max(0, c[0] + c[1] * L + c[2] * L * L + c[3] * L * L * L);
  return s / 3;
}
/* Ground attenuation kept alongside screening, TfNSW convention. The estimator
   keeps ground absorption with 5 dB screening and drops it with 10 or 15 dB
   (enclosed works / receivers behind buildings). A continuous screening value
   is tapered linearly between 5 and 10 dB so the result matches the estimator
   at 0, 5, 10 and 15 dB without a step in the map. */
function groundUnderScreening(agr, abar) {
  if (abar <= 5) return agr;
  if (abar >= 10) return 0;
  return agr * (10 - abar) / 5;
}

/* Contribution of one source at one receiver, dB(A).
   method 'tfnsw' (default, reconciles with the TfNSW Construction Noise
   Estimator):  Lp = Lw − (20·lg d + 8) − Aatm − Agr − Abar
     20·lg d + 8 is hemispherical spreading over hard ground, Agr = %soft ×
     CONCAWE cat 4 (horizontal distance), Abar = Dz capped at S.barCap.
   method 'iso' (ISO 9613-2 detailed):  Lp = Lw + DΩ − (20·lg d + 11) − Aatm − Agr − Abar
     hard ground: Agr = As + Ar + Am = −1.5 − 1.5 − 3q (G = 0, §7.3.1);
     soft ground: eq. 10 with DΩ (§7.3.2); mixed: linear blend by %soft;
     Abar = Dz − Agr ≥ 0 with the 20/25 dB caps.
   Side diffraction (S.lateral, default on): Dz is the energy sum of the path
   over the top and the two side paths around the blocking buildings / hoarding
   (see combineDz), then capped and combined with ground as above.
   Lw is the effective level from prep(): time-on, penalty and mitigation applied.
   gr: ground RL at the receiver if already known; zrAbs: absolute receiver RL
   (default ground + S.hr). */
function contrib(src, rx, ry, S, buildings, detail, gr, zrAbs) {
  const iso = S.method === 'iso', soft = Math.max(0, Math.min(1, S.soft || 0));
  const zg = gr == null ? ground(rx, ry) : gr, zr = zrAbs != null ? zrAbs : zg + S.hr;   // zrAbs: absolute receiver RL (façade receivers)
  const hs = src.h, hr = Math.max(0, zr - zg), zs = src._z;
  const d2 = Math.max(Math.hypot(rx - src.x, ry - src.y), 0.01);
  const d = Math.max(Math.hypot(d2, zs - zr), 1);
  const Adiv = 20 * Math.log10(d) + (iso ? 11 : 8);
  const Aatm = S.air ? airAlpha(S) * d / 1000 : 0;
  let Agr = 0, Domega = 0;
  if (iso) {
    const dp = Math.max(d2, 1), hsum = hs + hr, q = dp <= 30 * hsum ? 0 : 1 - 30 * hsum / dp;
    const hard = -3 - 3 * q;
    let sft = 0, dOm = 0;
    if (soft > 0) {
      const hm = (hs + hr) / 2;
      sft = Math.max(0, 4.8 - (2 * hm / dp) * (17 + 300 / dp));
      dOm = 10 * Math.log10(1 + (dp * dp + (hs - hr) ** 2) / (dp * dp + hsum * hsum));
    }
    Agr = (1 - soft) * hard + soft * sft; Domega = soft * dOm;
  } else if (soft > 0) Agr = soft * concaweGround(d2);
  let Abar = 0, bar = null;
  if ((S.barriers && (buildings.length || state.hoardings.length)) || (S.terrain && state.terrain)) {
    bar = screening(src, rx, ry, d2, zs, zr, S, buildings, detail);
    if (bar) {
      if (iso) Abar = Math.max(0, bar.Dz - Agr);
      else { Abar = bar.Dz; Agr = groundUnderScreening(Agr, Abar); }
    }
  }
  const Lw = src._lw != null ? src._lw : src.lw;
  const Lp = Lw + Domega - Adiv - Aatm - Agr - Abar;
  return detail ? { Lp, Lw, d, Adiv, Aatm, Agr, Abar, Domega, bar, zr } : Lp;
}
function prep(sources) {
  for (const s of sources) {
    s._inside = new Set();
    const b = buildingAt(s.x, s.y);
    if (b) for (const c of state.buildings) if (inBox(s.x, s.y, c.bbox) && pip(s.x, s.y, c.pts)) s._inside.add(c.id);
    s._z = ground(s.x, s.y) + s.h;
    s._lw = effectiveLw(s);
  }
}

