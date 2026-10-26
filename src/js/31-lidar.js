/* ===================== LiDAR → BUILDING HEIGHTS ===================== */
const LAZ_MAX_CELLS = 16e6;
let lazBusy = false, lazCancel = false, lazWorkerUrl = null;
const lazCv = document.createElement('canvas'), lazCtx = lazCv.getContext('2d');
function lazWorkerCount() { const hc = navigator.hardwareConcurrency || 2; return Math.max(1, Math.min(6, hc - 1)); }
function makeLazWorker() {
  if (!lazWorkerUrl) lazWorkerUrl = URL.createObjectURL(new Blob([lazWorkerSource()], { type: 'text/javascript' }));
  return new Worker(lazWorkerUrl);
}
const LAS_CLASS = { 0: 'never classified', 1: 'unclassified', 2: 'ground', 3: 'low veg', 4: 'medium veg', 5: 'high veg', 6: 'building', 7: 'low noise', 9: 'water', 10: 'rail', 11: 'road', 13: 'wire guard', 14: 'wire', 15: 'tower', 17: 'bridge', 18: 'high noise' };
async function loadLidar(file) {
  if (lazBusy) return;
  lazBusy = true; lazCancel = false;
  $('btnLaz').disabled = true; $('btnLazCancel').hidden = false;
  const t0 = performance.now();
  try {
    log(`Reading LiDAR ${file.name} (${(file.size / 1048576).toFixed(1)} MB)…`);
    const H = await LAZ.readHeader(file);
    const fmtName = H.laz ? `LAZ (${H.laz.compressor === 3 ? 'layered' : 'pointwise'}, LASzip ${H.laz.version}, items ${H.laz.items.map(i => i.type + 'v' + i.version).join(',')})` : 'uncompressed LAS';
    log(`LAS ${H.vMaj}.${H.vMin}, point format ${H.fmt}, ${H.count.toLocaleString()} points, ${fmtName}. Extent ${fmt(H.max[0] - H.min[0], 0)} × ${fmt(H.max[1] - H.min[1], 0)} m, Z ${fmt(H.min[2], 1)} – ${fmt(H.max[2], 1)}.`);
    if (!H.count) throw new Error('file contains no points');
    // CRS
    let epsg = H.epsg && H.epsg !== 32767 ? H.epsg : null;
    if (H.wkt) log(`LiDAR CRS text: “${H.wkt.replace(/\s+/g, ' ').slice(0, 140)}…”`);
    if (epsg && !zoneFromEpsg(epsg)) { log(`LiDAR EPSG ${epsg} is not GDA94/GDA2020 MGA – checking the description.`, 'warn'); epsg = null; }
    if (!epsg) epsg = epsgFromText(H.wkt, 'LiDAR');
    if (Math.abs(H.max[0]) <= 180 && Math.abs(H.max[1]) <= 90) throw new Error('LiDAR coordinates are in degrees – it must be in MGA (metres)');
    const o = ensureOrigin((H.min[0] + H.max[0]) / 2, (H.min[1] + H.max[1]) / 2, epsg, null, 'LiDAR');
    if (epsg && o.epsg && datumOf(epsg) && datumOf(o.epsg) && datumOf(epsg) !== datumOf(o.epsg)) log(`LiDAR is ${datumOf(epsg)} but the scenario is ${datumOf(o.epsg)} – positions differ by ~1.8 m.`, 'warn');
    if (state.terrain) {
      const T = state.terrain, lx0 = H.min[0] - o.x0, lx1 = H.max[0] - o.x0, ly0 = H.min[1] - o.y0, ly1 = H.max[1] - o.y0;
      if (lx1 < T.x0 || lx0 > T.x0 + T.w * T.cx || ly1 < T.yTop - T.h * T.cy || ly0 > T.yTop) log('LiDAR does not overlap the loaded DEM – check you picked the matching tile.', 'warn');
    }
    // grid
    let cs = 1; const W0 = H.max[0] - H.min[0], H0 = H.max[1] - H.min[1];
    while (Math.ceil(W0 / cs + 1) * Math.ceil(H0 / cs + 1) > LAZ_MAX_CELLS) cs *= 2;
    const gw = Math.ceil(W0 / cs) + 1, gh = Math.ceil(H0 / cs) + 1, gx0 = Math.floor(H.min[0] / cs) * cs, gyTop = Math.ceil(H.max[1] / cs) * cs;
    const roof = new Float32Array(gw * gh).fill(-Infinity), gsum = new Float32Array(gw * gh), gcnt = new Uint16Array(gw * gh);
    const hist = new Float64Array(256);
    const sx = H.scale[0], sy = H.scale[1], sz = H.scale[2], ox = H.offset[0], oy = H.offset[1], oz = H.offset[2];
    let lastLog = 0;
    const onChunk = (out, n) => {
      const X = out.X, Y = out.Y, Zz = out.Z, C = out.C;
      for (let i = 0; i < n; i++) {
        const c = C[i]; hist[c]++;
        if (c !== 6 && c !== 2) continue;
        const gi = Math.floor((X[i] * sx + ox - gx0) / cs), gj = Math.floor((gyTop - (Y[i] * sy + oy)) / cs);
        if (gi < 0 || gj < 0 || gi >= gw || gj >= gh) continue;
        const k = gj * gw + gi, z = Zz[i] * sz + oz;
        if (c === 6) { if (z > roof[k]) roof[k] = z; }
        else if (gcnt[k] < 65535) { gsum[k] += z; gcnt[k]++; }
      }
    };
    const progress = (d, N) => {
      const pct = Math.min(100, Math.floor(100 * d / N));
      $('busy').textContent = `Decoding LiDAR… ${pct}% (${(d / 1e6).toFixed(1)} M of ${(N / 1e6).toFixed(1)} M points)`;
      if (pct >= lastLog + 25) { lastLog = pct - pct % 25; log(`LiDAR ${lastLog}% – ${(d / 1e6).toFixed(1)} M points, ${((performance.now() - t0) / 1000).toFixed(1)} s`); }
    };
    const nW = H.laz ? lazWorkerCount() : 0;
    const opts = { workers: nW, makeWorker: makeLazWorker, log: m => log(m, 'warn') };
    if (nW) log(`Decoding with ${nW} background thread(s)…`);
    try { await LAZ.read(file, H, onChunk, progress, () => lazCancel, opts); }
    catch (e) {
      if (e.message === 'cancelled' || !/worker/i.test(e.message)) throw e;
      log(`Background threads failed (${e.message}) – retrying on the main thread.`, 'warn');
      roof.fill(-Infinity); gsum.fill(0); gcnt.fill(0); hist.fill(0); lastLog = 0;
      await LAZ.read(file, H, onChunk, progress, () => lazCancel, { workers: 0 });
    }
    const secs = (performance.now() - t0) / 1000;
    const total = hist.reduce((a, b) => a + b, 0);
    const top = [...hist].map((v, c) => [c, v]).filter(a => a[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 7)
      .map(([c, v]) => `${c} ${LAS_CLASS[c] || ''} ${(100 * v / total).toFixed(1)}%`).join(' · ');
    log(`LiDAR decoded: ${total.toLocaleString()} points in ${secs.toFixed(1)} s (${(total / secs / 1e6).toFixed(2)} M pts/s). Classes: ${top}.`, 'pass');
    let nRoof = 0; for (let i = 0; i < roof.length; i++) { if (roof[i] === -Infinity) roof[i] = NaN; else nRoof++; }
    if (!hist[6]) log('No class 6 (building) points in this file – it may be unclassified. Heights cannot be derived from it.', 'fail');
    // ground → terrain if no DEM
    if (!state.terrain && hist[2]) {
      const g = new Float32Array(gw * gh); for (let i = 0; i < g.length; i++) g[i] = gcnt[i] ? gsum[i] / gcnt[i] : NaN;
      log('No DEM loaded – building terrain from LiDAR ground (class 2) points.');
      installTerrain({ W: gw, H: gh, z: g, ox: gx0, oy: gyTop, sx: cs, sy: cs, nodata: null, epsg }, file.name + ' (LiDAR ground)');
    }
    state.dsm = { w: gw, h: gh, z: roof, x0: gx0 - o.x0, yTop: gyTop - o.y0, cx: cs, cy: cs, name: file.name, kind: 'lidar', cells: nRoof };
    buildLazOverlay();
    $('lazInfo').innerHTML = `<b>${esc(file.name)}</b><br>${total.toLocaleString()} points · format ${H.fmt} · ${(nRoof * cs * cs / 1e4).toFixed(1)} ha of building roof at ${cs} m<br>${secs.toFixed(1)} s · CRS ${epsg ? 'EPSG ' + epsg : 'not recorded (assumed MGA 56)'}`;
    if (hist[6]) applyDsmHeights();
    if (!state.buildings.some(b => b.osmId || b.hsrc !== 'manual')) log('Tip: fetch or import OSM footprints – LiDAR heights are applied to them automatically.');
    requestCompute(false);
  } catch (err) {
    log(err.message === 'cancelled' ? 'LiDAR load cancelled.' : `LiDAR load FAILED: ${err.message}`, err.message === 'cancelled' ? 'warn' : 'fail');
    console.error(err);
    $('busy').textContent = 'LiDAR load stopped – see log';
  } finally { lazBusy = false; $('btnLaz').disabled = false; $('btnLazCancel').hidden = true; }
}
function buildLazOverlay() {
  const D = state.dsm; if (!D || D.kind !== 'lidar') return;
  lazCv.width = D.w; lazCv.height = D.h;
  const img = lazCtx.createImageData(D.w, D.h), d = img.data;
  for (let i = 0; i < D.z.length; i++) if (D.z[i] === D.z[i]) { d[i * 4] = 168; d[i * 4 + 1] = 85; d[i * 4 + 2] = 247; d[i * 4 + 3] = 150; }
  lazCtx.putImageData(img, 0, 0);
}
$('btnLaz').addEventListener('click', () => $('fileLaz').click());
$('btnLazCancel').addEventListener('click', () => { lazCancel = true; log('Cancelling LiDAR load…', 'warn'); });
$('fileLaz').addEventListener('change', () => { const f = $('fileLaz').files[0]; $('fileLaz').value = ''; if (f) loadLidar(f); });
$('setLazShow').addEventListener('change', () => requestRender());

