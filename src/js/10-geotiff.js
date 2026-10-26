/* ===================== TIFF / GeoTIFF READER (local) ==================== */
const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };
const COMP_NAMES = { 1: 'none', 5: 'LZW', 7: 'JPEG', 8: 'Deflate', 32946: 'Deflate (old)', 32773: 'PackBits', 34887: 'LERC', 50000: 'ZSTD', 50001: 'WebP', 34925: 'LZMA' };

function readIFD(dv, off, le, big) {
  const tags = {};
  const count = big ? Number(dv.getBigUint64(off, le)) : dv.getUint16(off, le);
  let p = off + (big ? 8 : 2);
  const es = big ? 20 : 12, inl = big ? 8 : 4;
  for (let k = 0; k < count; k++, p += es) {
    const tag = dv.getUint16(p, le), type = dv.getUint16(p + 2, le);
    const cnt = big ? Number(dv.getBigUint64(p + 4, le)) : dv.getUint32(p + 4, le);
    const sz = TYPE_SIZE[type]; if (!sz) continue;
    const total = sz * cnt;
    const vp = total <= inl ? p + (big ? 12 : 8) : (big ? Number(dv.getBigUint64(p + 12, le)) : dv.getUint32(p + 8, le));
    if (vp + total > dv.byteLength) { tags[tag] = null; continue; }
    tags[tag] = readVals(dv, vp, type, cnt, le);
  }
  return tags;
}
function readVals(dv, p, type, cnt, le) {
  if (type === 2) { let s = ''; for (let i = 0; i < cnt; i++) { const c = dv.getUint8(p + i); if (c) s += String.fromCharCode(c); } return s; }
  const out = new Array(cnt);
  for (let i = 0; i < cnt; i++) {
    switch (type) {
      case 1: case 7: out[i] = dv.getUint8(p + i); break;
      case 6: out[i] = dv.getInt8(p + i); break;
      case 3: out[i] = dv.getUint16(p + i * 2, le); break;
      case 8: out[i] = dv.getInt16(p + i * 2, le); break;
      case 4: out[i] = dv.getUint32(p + i * 4, le); break;
      case 9: out[i] = dv.getInt32(p + i * 4, le); break;
      case 5: out[i] = dv.getUint32(p + i * 8, le) / (dv.getUint32(p + i * 8 + 4, le) || 1); break;
      case 10: out[i] = dv.getInt32(p + i * 8, le) / (dv.getInt32(p + i * 8 + 4, le) || 1); break;
      case 11: out[i] = dv.getFloat32(p + i * 4, le); break;
      case 12: out[i] = dv.getFloat64(p + i * 8, le); break;
      case 16: case 18: out[i] = Number(dv.getBigUint64(p + i * 8, le)); break;
      case 17: out[i] = Number(dv.getBigInt64(p + i * 8, le)); break;
    }
  }
  return out;
}
function lzwDecode(input, expected) {
  const out = new Uint8Array(expected);
  const prefix = new Int32Array(4096), suffix = new Uint8Array(4096), first = new Uint8Array(4096), len = new Uint16Array(4096);
  for (let i = 0; i < 256; i++) { prefix[i] = -1; suffix[i] = i; first[i] = i; len[i] = 1; }
  let op = 0, bitPos = 0, width = 9, next = 258, old = -1;
  const nbits = input.length * 8;
  function write(code) {
    const L = len[code];
    let end = op + L;
    if (end > expected) {
      let c = code, pos = op + L - 1;
      while (c >= 0) { if (pos < expected) out[pos] = suffix[c]; pos--; c = prefix[c]; }
      op = expected; return;
    }
    let c = code, pos = end - 1;
    while (c >= 0) { out[pos--] = suffix[c]; c = prefix[c]; }
    op = end;
  }
  while (bitPos + width <= nbits && op < expected) {
    let code = 0;
    for (let b = 0; b < width; b++, bitPos++) code = (code << 1) | ((input[bitPos >> 3] >> (7 - (bitPos & 7))) & 1);
    if (code === 257) break;
    if (code === 256) { width = 9; next = 258; old = -1; continue; }
    if (old === -1) { if (code > 255) throw new Error('LZW: bad first code ' + code); write(code); old = code; continue; }
    if (code < next) {
      write(code);
      if (next < 4096) { prefix[next] = old; suffix[next] = first[code]; first[next] = first[old]; len[next] = len[old] + 1; next++; }
    } else if (code === next) {
      if (next < 4096) { prefix[next] = old; suffix[next] = first[old]; first[next] = first[old]; len[next] = len[old] + 1; next++; }
      write(code);
    } else throw new Error('LZW: invalid code ' + code);
    old = code;
    if (next >= (1 << width) - 1 && width < 12) width++;
  }
  return out;
}
function packBitsDecode(input, expected) {
  const out = new Uint8Array(expected); let ip = 0, op = 0;
  while (ip < input.length && op < expected) {
    const n = (input[ip++] << 24) >> 24;
    if (n >= 0) { for (let k = 0; k <= n && op < expected; k++) out[op++] = input[ip++]; }
    else if (n !== -128) { const v = input[ip++]; for (let k = 0; k < 1 - n && op < expected; k++) out[op++] = v; }
  }
  return out;
}
async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('this browser has no DecompressionStream (Deflate). Use Edge/Chrome 80+ or export as .asc');
  try {
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  } catch (e) {
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
}

/* Resolve a GeoKeyDirectory (flat array of shorts, 4-short header included)
   to { epsg, modelType, pixelIsPoint }. Keys are stored in numeric order, so
   GeographicTypeGeoKey (2048) comes before ProjectedCSTypeGeoKey (3072). A
   projected file may carry both; the projected code is the one that places it. */
function crsFromGeoKeys(k) {
  const out = { epsg: null, modelType: null, pixelIsPoint: false };
  if (!k || k.length < 4) return out;
  let proj = null, geog = null;
  for (let i = 4; i + 3 < k.length; i += 4) {
    if (k[i + 1] !== 0) continue;           // value held in another tag, not inline
    const id = k[i], v = k[i + 3];
    if (id === 1024) out.modelType = v;
    else if (id === 1025) out.pixelIsPoint = v === 2;
    else if (id === 2048) geog = v;
    else if (id === 3072) proj = v;
  }
  const code = v => (v && v !== 32767 ? v : null);
  out.epsg = out.modelType === 2 ? code(geog) : code(proj) || (out.modelType == null ? code(geog) : null);
  return out;
}
function epsgFromText(cite, what) {
  if (!cite) return null;
  const zm = cite.match(/zone\s*_?(\d{2})/i) || cite.match(/MGA\s*_?(\d{2})/i), z = zm ? +zm[1] : null;
  const datum = /GDA\s*_?2020|7844|1168/i.test(cite) ? 'GDA2020' : /GDA\s*_?94|4283|6283/i.test(cite) ? 'GDA94' : null;
  if (z >= 48 && z <= 58 && datum) { const e = (datum === 'GDA2020' ? 7800 : 28300) + z; log(`${what}: CRS identified from description: ${datum} / MGA zone ${z} → EPSG ${e}.`, 'pass'); return e; }
  if (z >= 48 && z <= 58) { const e = 7800 + z; log(`${what}: CRS description gives MGA zone ${z} but no datum – assuming GDA2020 (EPSG ${e}). GDA94 vs GDA2020 differs by ~1.8 m.`, 'warn'); return e; }
  return null;
}
async function parseGeoTIFF(buf) {
  const dv = new DataView(buf);
  const bo = dv.getUint16(0, false);
  if (bo !== 0x4949 && bo !== 0x4D4D) throw new Error('not a TIFF file (bad byte-order mark)');
  const le = bo === 0x4949, magic = dv.getUint16(2, le), big = magic === 43;
  if (!big && magic !== 42) throw new Error('not a TIFF file (magic ' + magic + ')');
  const ifd0 = big ? Number(dv.getBigUint64(8, le)) : dv.getUint32(4, le);
  const t = readIFD(dv, ifd0, le, big);
  const g = (k, d) => (t[k] != null ? t[k] : d);
  const W = g(256)[0], H = g(257)[0];
  const bps = g(258, [1])[0], comp = g(259, [1])[0], spp = g(277, [1])[0];
  const planar = g(284, [1])[0], pred = g(317, [1])[0], fmtS = g(339, [1])[0];
  const tiled = t[322] != null;
  log(`TIFF: ${big ? 'BigTIFF' : 'classic'} ${le ? 'II' : 'MM'}, ${W}×${H}, ${bps}-bit ${({ 1: 'uint', 2: 'int', 3: 'float' })[fmtS] || '?'}, ${spp} band(s), ${tiled ? 'tiled ' + g(322)[0] + '×' + g(323)[0] : 'strips'}, compression ${COMP_NAMES[comp] || comp}, predictor ${pred}.`);
  if (![1, 5, 8, 32946, 32773].includes(comp)) throw new Error(`compression "${COMP_NAMES[comp] || comp}" not supported – re-export as LZW/Deflate/uncompressed GeoTIFF or .asc`);
  if (![8, 16, 32, 64].includes(bps)) throw new Error(bps + '-bit samples not supported');
  if (fmtS === 3 && bps !== 32 && bps !== 64) throw new Error('float ' + bps + '-bit not supported');
  const bpsB = bps / 8, pixStride = planar === 1 ? spp : 1;

  let ox, oy, sx, sy;
  if (t[33550] && t[33922]) {
    sx = t[33550][0]; sy = t[33550][1];
    const tp = t[33922]; ox = tp[3] - tp[0] * sx; oy = tp[4] + tp[1] * sy;
  } else if (t[34264]) {
    const m = t[34264]; sx = m[0]; sy = -m[5]; ox = m[3]; oy = m[7];
    if (Math.abs(m[1]) > 1e-9 || Math.abs(m[4]) > 1e-9) log('DEM has rotation terms – ignored.', 'warn');
  } else throw new Error('no georeferencing tags (not a GeoTIFF). Export with a .tfw-free GeoTIFF or use .asc');
  let { epsg, modelType, pixelIsPoint } = crsFromGeoKeys(t[34735]);
  const cite = [t[34737], t[270]].filter(v => typeof v === 'string').map(v => v.replace(/\|/g, ' ').trim()).filter(Boolean).join(' · ');
  if (cite.trim()) log(`GeoTIFF CRS text: “${cite.replace(/\s+/g, ' ').slice(0, 160)}”`);
  if (!epsg) epsg = epsgFromText(cite, 'GeoTIFF');
  if (pixelIsPoint) { ox -= sx / 2; oy += sy / 2; }
  let nodata = null;
  if (typeof t[42113] === 'string' && t[42113].trim() !== '') { const v = parseFloat(t[42113]); if (isFinite(v)) nodata = v; }

  const out = new Float32Array(W * H).fill(NaN);
  function decodeSamples(bytes, cw, ch, bigEndianOverride) {
    const n = cw * ch * pixStride, vals = new Float64Array(n);
    const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), L = bigEndianOverride ? false : le;
    const avail = Math.min(n, Math.floor(bytes.byteLength / bpsB));
    for (let i = 0; i < avail; i++) {
      const p = i * bpsB;
      if (fmtS === 3) vals[i] = bps === 32 ? d.getFloat32(p, L) : d.getFloat64(p, L);
      else if (bps === 8) vals[i] = d.getUint8(p);
      else if (bps === 16) vals[i] = d.getUint16(p, L);
      else if (bps === 32) vals[i] = d.getUint32(p, L);
      else vals[i] = Number(d.getBigUint64(p, L));
    }
    for (let i = avail; i < n; i++) vals[i] = NaN;
    if (pred === 2 && fmtS !== 3) {
      const mod = Math.pow(2, bps);
      for (let r = 0; r < ch; r++) {
        const base = r * cw * pixStride;
        for (let c = pixStride; c < cw * pixStride; c++) vals[base + c] = (vals[base + c] + vals[base + c - pixStride]) % mod;
      }
    }
    if (fmtS === 2) { const half = Math.pow(2, bps - 1), mod = Math.pow(2, bps); for (let i = 0; i < n; i++) if (vals[i] >= half) vals[i] -= mod; }
    return vals;
  }
  function undoFloatPredictor(bytes, cw, ch) {
    const rowB = cw * pixStride * bpsB, res = new Uint8Array(rowB * ch);
    for (let r = 0; r < ch; r++) {
      const row = bytes.subarray(r * rowB, (r + 1) * rowB);
      const tmp = new Uint8Array(row);
      for (let i = pixStride; i < rowB; i++) tmp[i] = (tmp[i] + tmp[i - pixStride]) & 255;
      const nS = cw * pixStride;
      for (let s = 0; s < nS; s++) for (let b = 0; b < bpsB; b++) res[r * rowB + s * bpsB + b] = tmp[b * nS + s];
    }
    return res;
  }
  async function decompress(raw, expected) {
    if (comp === 1) return raw;
    if (comp === 5) return lzwDecode(raw, expected);
    if (comp === 32773) return packBitsDecode(raw, expected);
    return inflate(raw);
  }

  const offs = tiled ? t[324] : t[273], cnts = tiled ? t[325] : t[279];
  if (!offs || !cnts) throw new Error('missing strip/tile offsets');
  let chunks;
  if (tiled) {
    const tw = t[322][0], th = t[323][0], ta = Math.ceil(W / tw), td = Math.ceil(H / th);
    chunks = []; for (let r = 0; r < td; r++) for (let c = 0; c < ta; c++) chunks.push({ i: r * ta + c, x: c * tw, y: r * th, cw: tw, ch: th, vw: Math.min(tw, W - c * tw), vh: Math.min(th, H - r * th) });
  } else {
    const rps = Math.min(g(278, [H])[0], H), ns = Math.ceil(H / rps);
    chunks = []; for (let s = 0; s < ns; s++) { const vh = Math.min(rps, H - s * rps); chunks.push({ i: s, x: 0, y: s * rps, cw: W, ch: vh, vw: W, vh }); }
  }
  let done = 0, lastPct = -1;
  for (const c of chunks) {
    if (c.i >= offs.length) break;
    const raw = new Uint8Array(buf, offs[c.i], Math.min(cnts[c.i], buf.byteLength - offs[c.i]));
    const expected = c.cw * c.ch * pixStride * bpsB;
    let bytes = await decompress(raw, expected);
    let be = false;
    if (pred === 3) { bytes = undoFloatPredictor(bytes, c.cw, c.ch); be = true; }
    const vals = decodeSamples(bytes, c.cw, c.ch, be);
    for (let r = 0; r < c.vh; r++) for (let q = 0; q < c.vw; q++) out[(c.y + r) * W + c.x + q] = vals[(r * c.cw + q) * pixStride];
    done++;
    const pct = Math.floor(100 * done / chunks.length / 25) * 25;
    if (pct !== lastPct && chunks.length > 8) { lastPct = pct; $('busy').textContent = `Decoding DEM… ${pct}%`; await new Promise(r => setTimeout(r, 0)); }
  }
  return { W, H, z: out, ox, oy, sx, sy, nodata, epsg, modelType };
}

function parseASC(text) {
  const lines = text.split(/\r?\n/);
  const hdr = {}; let li = 0;
  for (; li < lines.length && li < 10; li++) {
    const m = lines[li].trim().match(/^([a-zA-Z_]+)\s+(\S+)/);
    if (!m || !/^(ncols|nrows|xllcorner|yllcorner|xllcenter|yllcenter|cellsize|nodata_value|dx|dy)$/i.test(m[1])) break;
    hdr[m[1].toLowerCase()] = parseFloat(m[2]);
  }
  const W = hdr.ncols, H = hdr.nrows, cs = hdr.cellsize || hdr.dx;
  if (!(W > 0 && H > 0 && cs > 0)) throw new Error('ASC header missing ncols/nrows/cellsize');
  const sy = hdr.cellsize || hdr.dy || cs;
  let ox = hdr.xllcorner, oyb = hdr.yllcorner;
  if (ox == null) ox = hdr.xllcenter - cs / 2;
  if (oyb == null) oyb = hdr.yllcenter - sy / 2;
  const z = new Float32Array(W * H).fill(NaN);
  const body = lines.slice(li).join(' ').trim().split(/\s+/);
  const n = Math.min(body.length, W * H);
  for (let i = 0; i < n; i++) z[i] = parseFloat(body[i]);
  if (body.length < W * H) log(`ASC: expected ${W * H} values, found ${body.length}.`, 'warn');
  return { W, H, z, ox, oy: oyb + H * sy, sx: cs, sy, nodata: hdr.nodata_value ?? null, epsg: null };
}
function parseXYZ(text) {
  const xs = [], ys = [], zs = [];
  for (const line of text.split(/\r?\n/)) {
    const p = line.trim().split(/[\s,;]+/);
    if (p.length < 3) continue;
    const x = +p[0], y = +p[1], z = +p[2];
    if (isFinite(x) && isFinite(y) && isFinite(z)) { xs.push(x); ys.push(y); zs.push(z); }
  }
  if (xs.length < 4) throw new Error('XYZ: fewer than 4 numeric points');
  const ux = [...new Set(xs.map(v => +v.toFixed(3)))].sort((a, b) => a - b);
  const uy = [...new Set(ys.map(v => +v.toFixed(3)))].sort((a, b) => a - b);
  let cs = Infinity; for (let i = 1; i < Math.min(ux.length, 5000); i++) cs = Math.min(cs, ux[i] - ux[i - 1]);
  let csy = Infinity; for (let i = 1; i < Math.min(uy.length, 5000); i++) csy = Math.min(csy, uy[i] - uy[i - 1]);
  if (!isFinite(cs) || !isFinite(csy)) throw new Error('XYZ: could not detect grid spacing');
  const W = Math.round((ux[ux.length - 1] - ux[0]) / cs) + 1, H = Math.round((uy[uy.length - 1] - uy[0]) / csy) + 1;
  if (W * H > 30e6) throw new Error(`XYZ: grid ${W}×${H} too large – XYZ must be a regular grid`);
  const z = new Float32Array(W * H).fill(NaN), x0 = ux[0], yMax = uy[uy.length - 1];
  for (let k = 0; k < xs.length; k++) {
    const i = Math.round((xs[k] - x0) / cs), j = Math.round((yMax - ys[k]) / csy);
    if (i >= 0 && i < W && j >= 0 && j < H) z[j * W + i] = zs[k];
  }
  log(`XYZ: ${xs.length.toLocaleString()} points → ${W}×${H} grid at ${cs} m.`);
  return { W, H, z, ox: x0 - cs / 2, oy: yMax + csy / 2, sx: cs, sy: csy, nodata: null, epsg: null };
}

