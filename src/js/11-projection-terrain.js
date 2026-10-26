/* ===================== MGA / GDA projection (Krüger) =================== */
const GRS80 = (function () {
  const a = 6378137, f = 1 / 298.257222101, n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
  return {
    a, e: Math.sqrt(f * (2 - f)), k0: 0.9996,
    A: a / (1 + n) * (1 + n2 / 4 + n4 / 64),
    al: [n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180, 13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440, 61 * n3 / 240 - 103 * n4 / 140, 49561 * n4 / 161280],
    be: [n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360, n2 / 48 + n3 / 15 - 437 * n4 / 1440, 17 * n3 / 480 - 37 * n4 / 840, 4397 * n4 / 161280]
  };
})();
function zoneOf(lon) { return Math.floor((lon + 180) / 6) + 1; }
function ll2mga(lat, lon, zone) {
  const G = GRS80, phi = lat * Math.PI / 180, lam = (lon - (zone * 6 - 183)) * Math.PI / 180;
  const sp = Math.sin(phi), t = Math.sinh(Math.atanh(sp) - G.e * Math.atanh(G.e * sp));
  const xi1 = Math.atan2(t, Math.cos(lam)), eta1 = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  let xi = xi1, eta = eta1;
  for (let j = 1; j <= 4; j++) { xi += G.al[j - 1] * Math.sin(2 * j * xi1) * Math.cosh(2 * j * eta1); eta += G.al[j - 1] * Math.cos(2 * j * xi1) * Math.sinh(2 * j * eta1); }
  return [500000 + G.k0 * G.A * eta, 10000000 + G.k0 * G.A * xi];
}
function mga2ll(E, N, zone) {
  const G = GRS80, xi = (N - 10000000) / (G.k0 * G.A), eta = (E - 500000) / (G.k0 * G.A);
  let xi1 = xi, eta1 = eta;
  for (let j = 1; j <= 4; j++) { xi1 -= G.be[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); eta1 -= G.be[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
  const tp = Math.sin(xi1) / Math.sqrt(Math.sinh(eta1) ** 2 + Math.cos(xi1) ** 2), lam = Math.atan2(Math.sinh(eta1), Math.cos(xi1));
  const e = G.e, e2 = e * e; let tau = tp;
  for (let k = 0; k < 6; k++) {
    const sig = Math.sinh(e * Math.atanh(e * tau / Math.sqrt(1 + tau * tau)));
    const tpi = tau * Math.sqrt(1 + sig * sig) - sig * Math.sqrt(1 + tau * tau);
    const dt = (tp - tpi) / Math.sqrt(1 + tpi * tpi) * (1 + (1 - e2) * tau * tau) / ((1 - e2) * Math.sqrt(1 + tau * tau));
    tau += dt; if (Math.abs(dt) < 1e-13) break;
  }
  return [Math.atan(tau) * 180 / Math.PI, lam * 180 / Math.PI + (zone * 6 - 183)];
}
function zoneFromEpsg(epsg) {
  if (epsg >= 28348 && epsg <= 28358) return epsg - 28300;
  if (epsg >= 7848 && epsg <= 7858) return epsg - 7800;
  return null;
}
function datumOf(epsg) { return epsg >= 28348 && epsg <= 28358 ? 'GDA94' : epsg >= 7848 && epsg <= 7858 ? 'GDA2020' : null; }
function ensureOrigin(E, N, epsg, zone, why) {
  if (state.origin && state.origin.type === 'projected') {
    const fz = zone || zoneFromEpsg(epsg);
    if (!state.origin.zone && fz) state.origin.zone = fz;
    else if (fz && fz !== state.origin.zone) log(`${why}: data is MGA zone ${fz} but the scenario is zone ${state.origin.zone}.`, 'warn');
    if (!state.origin.epsg && epsg) state.origin.epsg = epsg;
    if (epsg && state.origin.epsg && epsg !== state.origin.epsg) log(`${why}: EPSG ${epsg} differs from scenario EPSG ${state.origin.epsg}.`, 'warn');
    return state.origin;
  }
  let z = zone || zoneFromEpsg(epsg);
  if (!z && isFinite(E) && E > 100000 && E < 900000 && N > 5000000 && N < 9000000) { z = 56; log(`${why}: CRS not recorded in file – coordinates look like MGA; assuming zone 56 (Sydney). Check the site location lines up.`, 'warn'); }
  if (!z) { z = 56; log(`${why}: no EPSG code found – assuming MGA zone 56 (Sydney).`, 'warn'); }
  state.origin = { type: 'projected', x0: Math.round(E), y0: Math.round(N), zone: z, epsg: epsg || null };
  log(`Local origin set to E ${state.origin.x0}, N ${state.origin.y0}, MGA zone ${z}${epsg ? ' (EPSG ' + epsg + ')' : ''} – ${why}.`);
  updateSiteInfo();
  return state.origin;
}
function ll2local(lat, lon) { const o = state.origin, p = ll2mga(lat, lon, o.zone); return [p[0] - o.x0, p[1] - o.y0]; }
function local2ll(x, y) { const o = state.origin; return mga2ll(x + o.x0, y + o.y0, o.zone); }

function isGeographic(R) { return R.modelType === 2 || (Math.abs(R.sx) < 0.01 && Math.abs(R.ox) <= 180 && Math.abs(R.oy) <= 90); }
function epsgInZone(epsg, zone) { return datumOf(epsg) === 'GDA94' ? 28300 + zone : 7800 + zone; }
/* E/N in MGA zone `zs` → E/N in zone `zd` (same datum). */
function mgaZoneToZone(E, N, zs, zd) { const ll = mga2ll(E, N, zs); return ll2mga(ll[0], ll[1], zd); }

/* Bring a projected raster into the scenario's MGA zone. A file in another zone
   (common near the 144°/150° boundaries) is resampled; without this it would be
   read as if it were in the scenario zone and land hundreds of km away. Exact
   transforms are computed on a lattice every LAT cells and interpolated in
   between (error well under 1 mm at these spacings). */
function toScenarioZone(R, what) {
  if (isGeographic(R)) return R;
  if (!state.origin) ensureOrigin(R.ox + R.W * R.sx / 2, R.oy - R.H * R.sy / 2, R.epsg, null, what);
  const zs = zoneFromEpsg(R.epsg), zd = state.origin.zone;
  if (!zs || !zd || zs === zd) return R;
  const t0 = performance.now(), LAT = 32, csx = R.sx, csy = R.sy;
  const edge = [];
  for (let k = 0; k <= 16; k++) {
    const fx = R.ox + k / 16 * R.W * csx, fy = R.oy - k / 16 * R.H * csy;
    edge.push(mgaZoneToZone(fx, R.oy, zs, zd), mgaZoneToZone(fx, R.oy - R.H * csy, zs, zd), mgaZoneToZone(R.ox, fy, zs, zd), mgaZoneToZone(R.ox + R.W * csx, fy, zs, zd));
  }
  const bb = bboxOf(edge), W = Math.ceil((bb[2] - bb[0]) / csx), H = Math.ceil((bb[3] - bb[1]) / csy);
  const ox = bb[0], oy = bb[3], lw = Math.ceil(W / LAT) + 1, lh = Math.ceil(H / LAT) + 1;
  const LX = new Float64Array(lw * lh), LY = new Float64Array(lw * lh);
  for (let b = 0; b < lh; b++) for (let a = 0; a < lw; a++) {
    const p = mgaZoneToZone(ox + (a * LAT + 0.5) * csx, oy - (b * LAT + 0.5) * csy, zd, zs);
    LX[b * lw + a] = (p[0] - R.ox) / csx - 0.5; LY[b * lw + a] = (R.oy - p[1]) / csy - 0.5;   // source col/row
  }
  const z = new Float32Array(W * H).fill(NaN), sz = R.z, SW = R.W, SH = R.H;
  let inside = 0;
  for (let j = 0; j < H; j++) {
    const b = Math.floor(j / LAT), v = j / LAT - b;
    for (let i = 0; i < W; i++) {
      const a = Math.floor(i / LAT), u = i / LAT - a, k = b * lw + a;
      const c = (LX[k] * (1 - u) + LX[k + 1] * u) * (1 - v) + (LX[k + lw] * (1 - u) + LX[k + lw + 1] * u) * v;
      const r = (LY[k] * (1 - u) + LY[k + 1] * u) * (1 - v) + (LY[k + lw] * (1 - u) + LY[k + lw + 1] * u) * v;
      if (c < -0.5 || r < -0.5 || c > SW - 0.5 || r > SH - 0.5) continue;
      const c0 = Math.max(0, Math.min(SW - 2, Math.floor(c))), r0 = Math.max(0, Math.min(SH - 2, Math.floor(r)));
      const fu = Math.max(0, Math.min(1, c - c0)), fv = Math.max(0, Math.min(1, r - r0));
      const q = r0 * SW + c0, z00 = sz[q], z01 = sz[q + 1], z10 = sz[q + SW], z11 = sz[q + SW + 1];
      let val = (z00 * (1 - fu) + z01 * fu) * (1 - fv) + (z10 * (1 - fu) + z11 * fu) * fv;
      if (val !== val) val = sz[Math.min(SH - 1, Math.round(r)) * SW + Math.min(SW - 1, Math.round(c))];   // NoData nearby: nearest cell
      z[j * W + i] = val; inside++;
    }
  }
  log(`${what}: file is MGA zone ${zs}, scenario is zone ${zd} – resampled ${R.W}×${R.H} → ${W}×${H} cells into zone ${zd} (${inside.toLocaleString()} cells with data, ${(performance.now() - t0).toFixed(0)} ms).`, 'warn');
  return Object.assign({}, R, { W, H, z, ox, oy, epsg: epsgInZone(R.epsg, zd), reprojectedFrom: zs });
}

/* Fill NoData cells from their nearest valid neighbours, breadth-first: each
   ring of holes takes the mean of its already-known 4-neighbours. Linear in the
   cell count (the old 400-pass sweep took ~16 s on a coastal tile). Returns the
   number of cells filled. */
function fillHoles(z, w, h) {
  const n = z.length, known = new Uint8Array(n), queue = new Int32Array(n);   // known: 0 hole, 1 value, 2 queued
  let qt = 0, holes = 0;
  for (let k = 0; k < n; k++) if (z[k] === z[k]) known[k] = 1; else holes++;
  if (!holes || holes === n) return 0;
  const push = k => { if (known[k] === 0) { known[k] = 2; queue[qt++] = k; } };
  const around = (k, fn) => { const i = k % w; if (i > 0) fn(k - 1); if (i < w - 1) fn(k + 1); if (k >= w) fn(k - w); if (k < n - w) fn(k + w); };
  for (let k = 0; k < n; k++) if (known[k] === 1) around(k, push);
  let qh = 0;
  while (qh < qt) {
    const end = qt;
    for (let q = qh; q < end; q++) {
      const k = queue[q]; let s = 0, c = 0;
      around(k, m => { if (known[m] === 1) { s += z[m]; c++; } });
      z[k] = s / c;
    }
    for (let q = qh; q < end; q++) known[queue[q]] = 1;
    for (let q = qh; q < end; q++) around(queue[q], push);
    qh = end;
  }
  return holes;
}

function rasterPlacement(R, f) {
  if (isGeographic(R)) {
    const lonC = R.ox + R.W * R.sx / 2, latC = R.oy - R.H * R.sy / 2;
    const z = zoneOf(lonC), c = ll2mga(latC, lonC, z);
    ensureOrigin(c[0], c[1], null, z, 'raster in degrees');
    const tl = ll2local(R.oy, R.ox), br = ll2local(R.oy - R.H * R.sy, R.ox + R.W * R.sx);
    log('Raster is in degrees (geographic) – placed approximately on MGA. Prefer an MGA (metres) raster.', 'warn');
    return { x0: tl[0], yTop: tl[1], cx: (br[0] - tl[0]) / R.W * f, cy: (tl[1] - br[1]) / R.H * f };
  }
  const o = ensureOrigin(R.ox + R.W * R.sx / 2, R.oy - R.H * R.sy / 2, R.epsg, null, 'raster');
  return { x0: R.ox - o.x0, yTop: R.oy - o.y0, cx: R.sx * f, cy: R.sy * f };
}

/* Clean, downsample and install a raster as terrain */
function installTerrain(R, fileName) {
  const t0 = performance.now();
  let bad = 0;
  const z = R.z;
  for (let i = 0; i < z.length; i++) {
    const v = z[i];
    if (!isFinite(v) || (R.nodata != null && Math.abs(v - R.nodata) < 1e-6 * Math.max(1, Math.abs(R.nodata))) || v < -1e4 || v > 1e5) { z[i] = NaN; bad++; }
  }
  if (bad === z.length) throw new Error('all cells are NoData');
  R = toScenarioZone(R, 'DEM');
  const f = Math.max(1, Math.ceil(Math.sqrt(R.W * R.H / MAX_DEM_CELLS)));
  const w = Math.ceil(R.W / f), h = Math.ceil(R.H / f), zz = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let s = 0, c = 0;
    for (let b = 0; b < f; b++) { const y = j * f + b; if (y >= R.H) break; for (let a = 0; a < f; a++) { const x = i * f + a; if (x >= R.W) break; const v = R.z[y * R.W + x]; if (v === v) { s += v; c++; } } }
    zz[j * w + i] = c ? s / c : NaN;
  }
  const holes0 = fillHoles(zz, w, h);
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < zz.length; i++) { if (zz[i] !== zz[i]) zz[i] = 0; else { if (zz[i] < zmin) zmin = zz[i]; if (zz[i] > zmax) zmax = zz[i]; } }

  const P = rasterPlacement(R, f);
  const { x0, yTop, cx, cy } = P;
  state.terrain = { w, h, cx, cy, x0, yTop, z: zz, zmin, zmax, name: fileName, srcW: R.W, srcH: R.H, srcCell: R.sx, factor: f, epsg: R.epsg, nodata: bad, filled: holes0 };
  buildHillshade();
  for (const b of state.buildings) updateBase(b);
  geomChanged();
  const ms = performance.now() - t0;
  log(`DEM installed: ${R.W}×${R.H} @ ${fmt(R.sx, R.sx < 0.01 ? 6 : 2)} → ${w}×${h} @ ${fmt(cx, 2)} m (factor ${f}). RL ${fmt(zmin, 2)} – ${fmt(zmax, 2)} m. NoData ${bad.toLocaleString()} cells, ${holes0} filled. ${ms.toFixed(0)} ms.`, 'pass');
  if (state.dsm) applyDsmHeights();
  updateDemInfo();
}
function updateDemInfo() {
  const T = state.terrain, el = $('demInfo');
  if (!T) { el.innerHTML = '<span class="muted">No DEM loaded – ground is flat at RL 0.</span>'; return; }
  el.innerHTML = `<b>${esc(T.name)}</b><br>${T.srcW}×${T.srcH} source cells → ${T.w}×${T.h} @ ${fmt(T.cx, 2)} m<br>Extent ${fmt(T.w * T.cx, 0)} × ${fmt(T.h * T.cy, 0)} m · RL ${fmt(T.zmin, 2)} – ${fmt(T.zmax, 2)} m${T.epsg ? '<br>EPSG ' + T.epsg : ''}`;
}

/* hillshade underlay */
const shadeCv = document.createElement('canvas'), shadeCtx = shadeCv.getContext('2d');
function buildHillshade() {
  const T = state.terrain; if (!T) return;
  shadeCv.width = T.w; shadeCv.height = T.h;
  const img = shadeCtx.createImageData(T.w, T.h), d = img.data, z = T.z, w = T.w, h = T.h;
  const L = [-0.5, 0.5, 0.707], ln = Math.hypot(...L); L[0] /= ln; L[1] /= ln; L[2] /= ln;
  const rng = Math.max(T.zmax - T.zmin, 0.01);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    const zl = z[j * w + Math.max(0, i - 1)], zr = z[j * w + Math.min(w - 1, i + 1)];
    const zu = z[Math.max(0, j - 1) * w + i], zd = z[Math.min(h - 1, j + 1) * w + i];
    const gx = (zr - zl) / (2 * T.cx), gy = (zu - zd) / (2 * T.cy) * 1;
    const nx = -gx * 2, ny = -gy * 2, nz = 1, nn = Math.hypot(nx, ny, nz);
    const sh = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / nn);
    const t = (z[k] - T.zmin) / rng;
    const base = [200 + 40 * t, 210 + 25 * t, 190 + 50 * t];
    const f = 0.55 + 0.5 * sh;
    d[k * 4] = Math.min(255, base[0] * f); d[k * 4 + 1] = Math.min(255, base[1] * f); d[k * 4 + 2] = Math.min(255, base[2] * f); d[k * 4 + 3] = 255;
  }
  shadeCtx.putImageData(img, 0, 0);
}

