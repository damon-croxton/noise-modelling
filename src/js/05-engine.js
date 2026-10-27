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
  if (S.method !== 'iso' && S.barCap > 0) cap = Math.min(cap, S.barCap);
  const Kmet = Math.exp(-(1 / 2000) * Math.sqrt(dss * dsr * direct / (2 * delta)));
  let Dz = 10 * Math.log10(3 + (20 / LAMBDA) * C3 * delta * Kmet);
  const capped = Dz > cap; if (capped) Dz = cap;
  if (detail) for (let k = 1; k <= n; k++) { const kd = H[k][2]; if (kd === 0) kinds.terrain++; else if (kd === 1) kinds.building++; else if (kd === 2) kinds.hoarding++; }
  return { Dz, delta, n, e, Kmet, C3, capped, kinds };
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

