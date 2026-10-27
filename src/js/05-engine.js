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
  r.raw = dzRaw(r, lambda);
  return Math.min(r.raw, r.cap);
}
function dzRaw(r, lambda) {
  const t = r.top;
  let raw = dzPath(t.delta, t.n, t.e, t.Kmet, lambda, Infinity);
  if (r.lat && r.lat.length) {
    let e = Math.pow(10, -raw / 10);
    for (const l of r.lat) e += Math.pow(10, -dzPath(l.delta, l.n, l.e, 1, lambda, Infinity) / 10);
    raw = -10 * Math.log10(e);
  }
  return raw;
}

/* Air absorption coefficient (dB/km) for the season and time period. */
function airAlpha(S) {
  const t = (AIR_ATTEN[S.season] || AIR_ATTEN.warm)[S.period === 'p2night' ? 'night' : 'day'];
  return (t[0] + t[1] + t[2]) / 3;
}
/* ISO 9613-1 pure-tone air absorption (dB/km) at frequency f for t °C and
   rh % relative humidity, standard pressure. At the exact mid-band
   frequencies it gives the estimator's 250 / 500 / 1000 Hz values above. */
function airIso(f, t, rh) {
  const T = t + 273.15, T0 = 293.15, h = rh * Math.pow(10, -6.8346 * Math.pow(273.16 / T, 1.261) + 4.6151);
  const frO = 24 + 4.04e4 * h * (0.02 + h) / (0.391 + h);
  const frN = Math.pow(T / T0, -0.5) * (9 + 280 * h * Math.exp(-4.170 * (Math.pow(T / T0, -1 / 3) - 1)));
  return 8686 * f * f * (1.84e-11 * Math.sqrt(T / T0) + Math.pow(T / T0, -2.5) *
    (0.01275 * Math.exp(-2239.1 / T) / (frO + f * f / frO) + 0.1068 * Math.exp(-3352 / T) / (frN + f * f / frN)));
}
const _airB = new Map();
function airBands(S) {
  const key = S.season + (S.period === 'p2night' ? 'n' : 'd');
  let a = _airB.get(key);
  if (!a) { const c = (AIR_COND[S.season] || AIR_COND.warm)[S.period === 'p2night' ? 'night' : 'day']; a = OCT_FM.map(f => airIso(f, c[0], c[1])); _airB.set(key, a); }
  return a;
}
/* ISO 9613-2 §7.3.1 general method, per octave band (Table 3): source,
   receiver and middle regions, all with G = fraction of soft ground. With
   G = 0 every band gives −3 − 3q, the same as the single-band hard case. */
function groundBands(S, dp, hs, hr, out) {
  const G = Math.max(0, Math.min(1, S.soft || 0)), e50 = 1 - Math.exp(-dp / 50);
  const q = dp <= 30 * (hs + hr) ? 0 : 1 - 30 * (hs + hr) / dp;
  const region = (h, k) => {
    if (k === 0) return -1.5;
    if (k >= 5) return -1.5 * (1 - G);
    const f = k === 1 ? 1.5 + 3 * Math.exp(-0.12 * (h - 5) * (h - 5)) * e50 + 5.7 * Math.exp(-0.09 * h * h) * (1 - Math.exp(-2.8e-6 * dp * dp))
      : k === 2 ? 1.5 + 8.6 * Math.exp(-0.09 * h * h) * e50
        : k === 3 ? 1.5 + 14 * Math.exp(-0.46 * h * h) * e50
          : 1.5 + 5 * Math.exp(-0.9 * h * h) * e50;
    return -1.5 + G * f;
  };
  for (let k = 0; k < 8; k++) out[k] = region(hs, k) + region(hr, k) + (k === 0 ? -3 * q : -3 * q * (1 - G));
  return out;
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
/* Spreading, air and ground terms for an unobstructed path of horizontal
   length d2 and 3D length d (source and receiver heights hs, hr above ground). */
function pathTerms(S, d2, d, hs, hr) {
  const iso = S.method === 'iso', soft = Math.max(0, Math.min(1, S.soft || 0));
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
  return { Adiv, Aatm, Agr, Domega };
}

function contrib(src, rx, ry, S, buildings, detail, gr, zrAbs) {
  const iso = S.method === 'iso';
  const zg = gr == null ? ground(rx, ry) : gr, zr = zrAbs != null ? zrAbs : zg + S.hr;   // zrAbs: absolute receiver RL (façade receivers)
  const hs = src.h, hr = Math.max(0, zr - zg), zs = src._z;
  const d2 = Math.max(Math.hypot(rx - src.x, ry - src.y), 0.01);
  const d = Math.max(Math.hypot(d2, zs - zr), 1);
  let bar = null;
  if ((S.barriers && (buildings.length || state.hoardings.length)) || (S.terrain && state.terrain))
    bar = screening(src, rx, ry, d2, zs, zr, S, buildings, detail);
  const Lw = src._lw != null ? src._lw : src.lw, bands = iso && S.bands;
  const refl = reflectionsOn(S) ? reflections(src, rx, ry, zs, zr, bands ? OCT_FM[7] : F_BAND) : null;
  if (bands) return contribBands(src, d2, d, hs, hr, zr, bar, refl, Lw, S, detail);
  let { Adiv, Aatm, Agr, Domega } = pathTerms(S, d2, d, hs, hr);
  let Abar = 0;
  if (bar) {
    if (iso) Abar = Math.max(0, bar.Dz - Agr);
    else { Abar = bar.Dz; Agr = groundUnderScreening(Agr, Abar); }
  }
  const Ldir = Lw + Domega - Adiv - Aatm - Agr - Abar;
  let Lp = Ldir;
  if (refl && refl.length) {
    const loss = S.reflLoss == null ? 1 : S.reflLoss;
    let e = Math.pow(10, Ldir / 10);
    for (const f of refl) { const T = pathTerms(S, f.d2, f.d, hs, hr); f.Lp = Lw + T.Domega - T.Adiv - T.Aatm - T.Agr - loss; e += Math.pow(10, f.Lp / 10); }
    Lp = 10 * Math.log10(e);
  }
  return detail ? { Lp, Ldir, Lw, d, Adiv, Aatm, Agr, Abar, Domega, bar, zr, refl } : Lp;
}

/* Octave-band evaluation (ISO 9613-2 only, S.bands): the path geometry above
   is evaluated in each band from 63 Hz to 8 kHz with ISO 9613-1 air absorption,
   the general ground method (Table 3, no DΩ), Dz at the band's wavelength (same
   caps), and reflections from walls large enough at that frequency (eq. 19).
   The source's A-weighted spectrum (src._spec, relative to Lw) spreads Lw over
   the bands; the A-weighted bands are summed. */
const _gB = new Array(8), _gR = new Array(8);
function contribBands(src, d2, d, hs, hr, zr, bar, refl, Lw, S, detail) {
  const air = airBands(S), spec = src._spec || SPECTRA.engine.rel, loss = S.reflLoss == null ? 1 : S.reflLoss;
  const Adiv = 20 * Math.log10(d) + 11, gB = groundBands(S, Math.max(d2, 1), hs, hr, _gB);
  const rows = detail ? [] : null;
  let eDir = 0, eTot = 0;
  if (refl) for (const f of refl) { f.gr = groundBands(S, Math.max(f.d2, 1), hs, hr, []); f.Lp = -Infinity; f._e = 0; }
  for (let k = 0; k < 8; k++) {
    const Lk = Lw + spec[k], Aatm = S.air ? air[k] * d / 1000 : 0, Agr = gB[k];
    const Dz = bar ? Math.min(dzRaw(bar, C_AIR / OCT_FM[k]), bar.cap) : 0, Abar = bar ? Math.max(0, Dz - Agr) : 0;
    const Ld = Lk - Adiv - Aatm - Agr - Abar;
    let e = Math.pow(10, Ld / 10), er = 0;
    if (refl) for (const f of refl) {
      if (f.fmin >= OCT_FM[k]) continue;                                  // wall too small at this frequency
      const Lr = Lk - (20 * Math.log10(f.d) + 11) - (S.air ? air[k] * f.d / 1000 : 0) - f.gr[k] - loss, x = Math.pow(10, Lr / 10);
      er += x; f._e += x;
    }
    eDir += e; eTot += e + er;
    if (rows) rows.push({ f: OCT_F[k], Lw: Lk, Aatm, Agr, Dz, Abar, Ldir: Ld, Lp: 10 * Math.log10(e + er) });
  }
  const Lp = 10 * Math.log10(eTot);
  if (!detail) return Lp;
  if (refl) for (const f of refl) { f.Lp = f._e > 0 ? 10 * Math.log10(f._e) : -Infinity; delete f.gr; delete f._e; }
  return { Lp, Ldir: 10 * Math.log10(eDir), Lw, d, Adiv, Aatm: null, Agr: null, Abar: null, Domega: 0, bar, zr, refl: refl && refl.filter(f => f.Lp > -Infinity), bands: rows };
}

/* ---------------- first-order reflections (image sources) ---------------- */
/* 'auto' = on for ISO 9613-2, off on the TfNSW basis (the estimator has no
   reflections). Skipped during fast redraws while dragging. */
function reflectionsOn(S) { return !S._fast && (S.reflect === 'on' || (S.reflect !== 'off' && S.method === 'iso')); }
const REFL_RADIUS = 60, OWN_FACADE = 2, _cand3 = [];
/* Clear line of sight between two 3D points (buildings except `skip`, hoarding). */
function clearLeg(x0, y0, z0, x1, y1, z1, skip, src) {
  for (const b of buildingsOnSegment(x0, y0, x1, y1, _cand3)) {
    if (b === skip || (src._inside && src._inside.has(b.id))) continue;
    const iv = segPolyIntervals(x0, y0, x1, y1, b.pts); if (!iv) continue;
    for (const [t0, t1] of iv) if (topOf(b) > z0 + (z1 - z0) * t0 || topOf(b) > z0 + (z1 - z0) * t1) return false;
  }
  const dx = x1 - x0, dy = y1 - y0;
  for (const ho of state.hoardings) for (let i = 0; i < ho.pts.length - 1; i++) {
    const a = ho.pts[i], ex = ho.pts[i + 1][0] - a[0], ey = ho.pts[i + 1][1] - a[1], den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = a[0] - x0, wy = a[1] - y0, t = (wx * ey - wy * ex) / den, u = (wx * dy - wy * dx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1 && ground(x0 + dx * t, y0 + dy * t) + ho.h > z0 + (z1 - z0) * t) return false;
  }
  return true;
}
/* Reflections of one source off building façades within REFL_RADIUS of the
   source or receiver (ISO 9613-2 §7.5). A wall reflects when source and
   receiver are both in front of it, the reflection point lies on the wall and
   below its top, the wall is large enough for the wavelength (eq. 19), and
   both legs have a clear line of sight. The façade the receiver stands in
   front of (within OWN_FACADE m) is left out, so levels stay free-field.
   Returns the image paths that reflect below fmax; the caller gives each one
   the path's own spreading, air and ground terms, less the reflection loss
   S.reflLoss (dB).
   Per source, the walls facing it and their image sources are cached
   (src._walls, rebuilt when the building index changes), and the buildings
   near the receiver are found once for all sources. */
let reflMark = 0;
const _own = [], rcvNear = { x: NaN, y: NaN, stamp: -1, list: [] };
function sourceWalls(src, b) {
  let W = src._walls[b._ix];
  if (W) return W;
  W = [];
  const P = b.pts, n = P.length;
  let a2 = 0; for (let i = 0, j = n - 1; i < n; j = i++) a2 += P[j][0] * P[i][1] - P[i][0] * P[j][1];
  const sgn = a2 > 0 ? 1 : -1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = P[j], wx = P[i][0] - a[0], wy = P[i][1] - a[1], L = Math.hypot(wx, wy);
    if (L < 1) continue;
    const nx = sgn * wy / L, ny = -sgn * wx / L;                         // outward normal
    const ds = (src.x - a[0]) * nx + (src.y - a[1]) * ny;
    if (ds <= 0.01) continue;                                             // source behind this wall
    W.push({ ax: a[0], ay: a[1], wx, wy, L, nx, ny, ds, ix: src.x - 2 * ds * nx, iy: src.y - 2 * ds * ny });
  }
  src._walls[b._ix] = W;
  return W;
}
function reflections(src, rx, ry, zs, zr, fmax) {
  const out = [], mark = ++reflMark;
  // the receiver's own building(s): any wall within OWN_FACADE m
  for (const b of buildingsNear(rx, ry, OWN_FACADE, _own)) {
    const P = b.pts;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) if (distSeg(rx, ry, P[j], P[i]) < OWN_FACADE) { b._rm = mark; break; }
  }
  if (src._wallsAt !== IDX.built) { src._walls = []; src._nearB = null; src._wallsAt = IDX.built; }   // first call, or geometry changed
  if (!src._nearB) src._nearB = buildingsNear(src.x, src.y, REFL_RADIUS, []).slice();
  const visit = b => {
    if (b._rm === mark || (src._inside && src._inside.has(b.id))) return;
    b._rm = mark;
    const top = topOf(b);
    for (const w of sourceWalls(src, b)) {
      const dr = (rx - w.ax) * w.nx + (ry - w.ay) * w.ny;
      if (dr <= 0.01) continue;                                           // receiver behind this wall
      const t = w.ds / (w.ds + dr), px = w.ix + (rx - w.ix) * t, py = w.iy + (ry - w.iy) * t;
      const u = ((px - w.ax) * w.wx + (py - w.ay) * w.wy) / (w.L * w.L);
      if (u < 0 || u > 1) continue;
      const pz = zs + (zr - zs) * t;
      if (pz >= top) continue;                                            // passes over the wall
      const h2s = Math.hypot(px - src.x, py - src.y), dso = Math.hypot(h2s, pz - zs), dor = Math.hypot(rx - px, ry - py, zr - pz);
      const cosb = w.ds / h2s, lmin = Math.min(w.L, top - b.base);
      // ISO 9613-2 eq. 19: reflects when 1/λ > (2 / (lmin·cos β)²)·(dso·dor / (dso + dor)), i.e. above fmin
      const fmin = C_AIR * (2 / Math.pow(lmin * cosb, 2)) * (dso * dor / (dso + dor));
      if (fmin >= fmax) continue;
      if (!clearLeg(src.x, src.y, zs, px, py, pz, b, src) || !clearLeg(px, py, pz, rx, ry, zr, b, src)) continue;
      const d2 = Math.hypot(rx - w.ix, ry - w.iy);
      out.push({ p: [px, py], z: pz, d2, d: Math.max(Math.hypot(d2, zs - zr), 1), b: b.id, fmin });
    }
  };
  // the same receiver point is usually asked for every source in turn
  if (rcvNear.x !== rx || rcvNear.y !== ry || rcvNear.stamp !== IDX.built) { buildingsNear(rx, ry, REFL_RADIUS, rcvNear.list); rcvNear.x = rx; rcvNear.y = ry; rcvNear.stamp = IDX.built; }
  for (const b of rcvNear.list) visit(b);
  for (const b of src._nearB) visit(b);
  return out;
}
function prep(sources) {
  for (const s of sources) {
    s._inside = new Set(); s._wallsAt = -1;
    const b = buildingAt(s.x, s.y);
    if (b) for (const c of state.buildings) if (inBox(s.x, s.y, c.bbox) && pip(s.x, s.y, c.pts)) s._inside.add(c.id);
    s._z = ground(s.x, s.y) + s.h;
    s._lw = effectiveLw(s);
    s._spec = sourceSpectrum(s).rel;
  }
}

