/* ======================= LAS / LAZ READER (pure JS) ======================
   Port of the LASzip decoder (arithmetic coder by A. Said; LASzip by
   M. Isenburg, Apache-2.0). Supports:
     - uncompressed .las, formats 0-10
     - .laz pointwise-chunked (formats 0-5: POINT10 v2, GPSTIME11 v2, RGB12 v2, BYTE v2)
     - .laz layered-chunked (formats 6-10: POINT14 v3/v4) – only the XY, Z and
       classification layers are decoded, everything else is skipped.
   Output: per chunk, Int32 X/Y/Z (raw, apply scale/offset) and Uint8 class.
========================================================================== */
function lazFactory() {
  'use strict';
  const AC_MIN = 0x01000000, AC_MAX = 0xFFFFFFFF;
  const DM_SHIFT = 15, DM_MAX = 1 << 15, BM_SHIFT = 13, BM_MAX = 1 << 13;

  /* ---------- models ---------- */
  function Model(symbols) {
    this.symbols = symbols; this.last = symbols - 1;
    if (symbols > 16) {
      let tb = 3; while (symbols > (1 << (tb + 2))) ++tb;
      this.tsize = 1 << tb; this.tshift = DM_SHIFT - tb;
      this.table = new Uint32Array(this.tsize + 2);
    } else { this.table = null; this.tsize = 0; this.tshift = 0; }
    this.dist = new Uint32Array(symbols); this.count = new Uint32Array(symbols);
    this.init();
  }
  Model.prototype.init = function () {
    this.total = 0; this.cycle = this.symbols; this.count.fill(1);
    this.update();
    this.untilUpdate = this.cycle = (this.symbols + 6) >>> 1;
  };
  Model.prototype.update = function () {
    const n = this.symbols, cnt = this.count, dist = this.dist;
    if ((this.total += this.cycle) > DM_MAX) {
      let t = 0; for (let i = 0; i < n; i++) { cnt[i] = (cnt[i] + 1) >>> 1; t += cnt[i]; } this.total = t;
    }
    const scale = (0x80000000 / this.total) >>> 0;
    let sum = 0;
    if (!this.table) {
      for (let k = 0; k < n; k++) { dist[k] = (scale * sum / 65536) >>> 0; sum += cnt[k]; }
    } else {
      const tab = this.table, sh = this.tshift; let s = 0;
      for (let k = 0; k < n; k++) {
        dist[k] = (scale * sum / 65536) >>> 0; sum += cnt[k];
        const w = dist[k] >>> sh; while (s < w) tab[++s] = k - 1;
      }
      tab[0] = 0; while (s <= this.tsize) tab[++s] = n - 1;
    }
    this.cycle = (5 * this.cycle) >>> 2;
    const mx = (n + 6) << 3; if (this.cycle > mx) this.cycle = mx;
    this.untilUpdate = this.cycle;
  };
  function BitModel() { this.init(); }
  BitModel.prototype.init = function () { this.b0 = 1; this.bc = 2; this.p0 = 1 << (BM_SHIFT - 1); this.cycle = this.until = 4; };
  BitModel.prototype.update = function () {
    if ((this.bc += this.cycle) > BM_MAX) { this.bc = (this.bc + 1) >>> 1; this.b0 = (this.b0 + 1) >>> 1; if (this.b0 === this.bc) ++this.bc; }
    const scale = (0x80000000 / this.bc) >>> 0;
    this.p0 = (this.b0 * scale / 262144) >>> 0;
    this.cycle = (5 * this.cycle) >>> 2; if (this.cycle > 64) this.cycle = 64;
    this.until = this.cycle;
  };

  /* ---------- arithmetic decoder ---------- */
  function Decoder(buf, pos, end) { this.buf = buf; this.pos = pos; this.end = end; this.length = AC_MAX; this.value = 0; }
  Decoder.prototype.byte = function () { return this.pos < this.end ? this.buf[this.pos++] : (this.pos++, 0); };
  Decoder.prototype.start = function () { this.length = AC_MAX; this.value = ((this.byte() << 24) | (this.byte() << 16) | (this.byte() << 8) | this.byte()) >>> 0; };
  Decoder.prototype.renorm = function () {
    let v = this.value, l = this.length;
    do { v = ((v << 8) | this.byte()) >>> 0; l = l * 256; } while (l < AC_MIN);
    this.value = v; this.length = l;
  };
  Decoder.prototype.bit = function (m) {
    const x = m.p0 * (this.length >>> BM_SHIFT);
    let sym;
    if (this.value >= x) { sym = 1; this.value -= x; this.length -= x; } else { sym = 0; this.length = x; ++m.b0; }
    if (this.length < AC_MIN) this.renorm();
    if (--m.until === 0) m.update();
    return sym;
  };
  Decoder.prototype.symbol = function (m) {
    let n, sym, x, y = this.length;
    const dist = m.dist;
    if (m.table) {
      const len = this.length = this.length >>> DM_SHIFT;
      const dv = (this.value / len) >>> 0, t = dv >>> m.tshift;
      sym = m.table[t]; n = m.table[t + 1] + 1;
      while (n > sym + 1) { const k = (sym + n) >>> 1; if (dist[k] > dv) n = k; else sym = k; }
      x = dist[sym] * len;
      if (sym !== m.last) y = dist[sym + 1] * len;
    } else {
      x = sym = 0;
      const len = this.length = this.length >>> DM_SHIFT;
      n = m.symbols; let k = n >>> 1;
      do { const z = len * dist[k]; if (z > this.value) { n = k; y = z; } else { sym = k; x = z; } } while ((k = (sym + n) >>> 1) !== sym);
    }
    this.value -= x; this.length = y - x;
    if (this.length < AC_MIN) this.renorm();
    ++m.count[sym];
    if (--m.untilUpdate === 0) m.update();
    return sym;
  };
  Decoder.prototype.bits = function (b) {
    if (b > 19) { const lo = this.short(); const hi = this.bits(b - 16); return hi * 65536 + lo; }
    const len = this.length = this.length >>> b;
    const sym = (this.value / len) >>> 0;
    this.value -= len * sym;
    if (this.length < AC_MIN) this.renorm();
    return sym;
  };
  Decoder.prototype.short = function () {
    const len = this.length = this.length >>> 16;
    const sym = (this.value / len) >>> 0;
    this.value -= len * sym;
    if (this.length < AC_MIN) this.renorm();
    return sym;
  };
  Decoder.prototype.int = function () { const lo = this.short(); const hi = this.short(); return (hi * 65536 + lo) >>> 0; };

  /* ---------- integer compressor ---------- */
  function IC(dec, bits, contexts, bitsHigh) {
    this.dec = dec; bitsHigh = bitsHigh || 8; this.bh = bitsHigh;
    if (bits && bits < 32) { this.cb = bits; this.range = Math.pow(2, bits); this.cmin = -this.range / 2; }
    else { this.cb = 32; this.range = 0; this.cmin = -2147483648; }
    this.k = 0;
    this.mBits = []; for (let i = 0; i < (contexts || 1); i++) this.mBits.push(new Model(this.cb + 1));
    this.mCorr = [new BitModel()];
    for (let i = 1; i <= this.cb; i++) this.mCorr.push(new Model(i <= bitsHigh ? (1 << i) : (1 << bitsHigh)));
  }
  IC.prototype.corrector = function (m) {
    const dec = this.dec, k = this.k = dec.symbol(m);
    let c;
    if (k) {
      if (k < 32) {
        if (k <= this.bh) c = dec.symbol(this.mCorr[k]);
        else { const k1 = k - this.bh; c = dec.symbol(this.mCorr[k]); const c1 = dec.bits(k1); c = c * P2[k1] + c1; }
        if (c >= P2[k - 1]) c += 1; else c -= (P2[k] - 1);
      } else c = this.cmin;
    } else c = dec.bit(this.mCorr[0]);
    return c;
  };
  IC.prototype.decompress = function (pred, ctx) {
    let real = pred + this.corrector(this.mBits[ctx || 0]);
    if (this.range) { if (real < 0) real += this.range; else if (real >= this.range) real -= this.range; }
    else real = real | 0;
    return real;
  };

  /* ---------- streaming median ---------- */
  function Median5() { this.v = [0, 0, 0, 0, 0]; this.high = true; }
  Median5.prototype.add = function (x) {
    const v = this.v;
    if (this.high) {
      if (x < v[2]) {
        v[4] = v[3]; v[3] = v[2];
        if (x < v[0]) { v[2] = v[1]; v[1] = v[0]; v[0] = x; }
        else if (x < v[1]) { v[2] = v[1]; v[1] = x; }
        else v[2] = x;
      } else {
        if (x < v[3]) { v[4] = v[3]; v[3] = x; } else v[4] = x;
        this.high = false;
      }
    } else {
      if (v[2] < x) {
        v[0] = v[1]; v[1] = v[2];
        if (v[4] < x) { v[2] = v[3]; v[3] = v[4]; v[4] = x; }
        else if (v[3] < x) { v[2] = v[3]; v[3] = x; }
        else v[2] = x;
      } else {
        if (v[1] < x) { v[0] = v[1]; v[1] = x; } else v[0] = x;
        this.high = true;
      }
    }
  };
  const P2 = []; for (let i = 0; i <= 32; i++) P2.push(Math.pow(2, i));
  const fold = n => n < 0 ? n + 256 : n > 255 ? n - 256 : n;
  const clamp = n => n <= 0 ? 0 : n >= 255 ? 255 : n;

  /* ---------- context tables ---------- */
  const NRM = [[15,14,13,12,11,10,9,8],[14,0,1,3,6,10,10,9],[13,1,2,4,7,11,11,10],[12,3,4,5,8,12,12,11],[11,6,7,8,9,13,13,12],[10,10,11,12,13,14,14,13],[9,10,11,12,13,14,15,14],[8,9,10,11,12,13,14,15]];
  const NRL = [[0,1,2,3,4,5,6,7],[1,0,1,2,3,4,5,6],[2,1,0,1,2,3,4,5],[3,2,1,0,1,2,3,4],[4,3,2,1,0,1,2,3],[5,4,3,2,1,0,1,2],[6,5,4,3,2,1,0,1],[7,6,5,4,3,2,1,0]];
  const NRM6 = [
    [0,1,2,3,4,5,3,4,4,5,5,5,5,5,5,5],[1,0,1,3,3,3,3,3,3,3,3,3,3,3,3,3],[2,1,2,4,4,4,4,4,4,4,4,3,3,3,3,3],[3,3,4,5,4,4,4,4,4,4,4,4,4,4,4,4],
    [4,3,4,4,5,4,4,4,4,4,4,4,4,4,4,4],[5,3,4,4,4,5,4,4,4,4,4,4,4,4,4,4],[3,3,4,4,4,4,5,4,4,4,4,4,4,4,4,4],[4,3,4,4,4,4,4,5,4,4,4,4,4,4,4,4],
    [4,3,4,4,4,4,4,4,5,4,4,4,4,4,4,4],[5,3,4,4,4,4,4,4,4,5,4,4,4,4,4,4],[5,3,4,4,4,4,4,4,4,4,5,4,4,4,4,4],[5,3,3,4,4,4,4,4,4,4,4,5,5,4,4,4],
    [5,3,3,4,4,4,4,4,4,4,4,5,5,5,4,4],[5,3,3,4,4,4,4,4,4,4,4,4,5,5,5,4],[5,3,3,4,4,4,4,4,4,4,4,4,4,5,5,5],[5,3,3,4,4,4,4,4,4,4,4,4,4,4,5,5]];
  const NRL8 = [];
  for (let n = 0; n < 16; n++) { NRL8.push([]); for (let r = 0; r < 16; r++) NRL8[n].push(Math.min(7, Math.abs(n - r))); }

  /* ---------- POINT10 v2 ---------- */
  function Point10(dec) {
    this.dec = dec;
    this.mChanged = new Model(64); this.icInt = new IC(dec, 16, 4);
    this.mScan = [new Model(256), new Model(256)]; this.icPsid = new IC(dec, 16, 1);
    this.mBitByte = new Array(256); this.mClass = new Array(256); this.mUser = new Array(256);
    this.icDx = new IC(dec, 32, 2); this.icDy = new IC(dec, 32, 22); this.icZ = new IC(dec, 32, 20);
  }
  Point10.prototype.init = function (dv, o) {
    this.xm = []; this.ym = []; this.lastInt = new Int32Array(16); this.lastH = new Int32Array(8);
    for (let i = 0; i < 16; i++) { this.xm.push(new Median5()); this.ym.push(new Median5()); }
    this.x = dv.getInt32(o, true); this.y = dv.getInt32(o + 4, true); this.z = dv.getInt32(o + 8, true);
    this.intensity = 0; this.bb = dv.getUint8(o + 14); this.cls = dv.getUint8(o + 15);
    this.scan = dv.getUint8(o + 16); this.user = dv.getUint8(o + 17); this.psid = dv.getUint16(o + 18, true);
  };
  Point10.prototype.read = function () {
    const dec = this.dec;
    const changed = dec.symbol(this.mChanged);
    let r, n, m, l;
    if (changed) {
      if (changed & 32) { let md = this.mBitByte[this.bb]; if (!md) md = this.mBitByte[this.bb] = new Model(256); this.bb = dec.symbol(md); }
      r = this.bb & 7; n = (this.bb >> 3) & 7; m = NRM[n][r]; l = NRL[n][r];
      if (changed & 16) { this.intensity = this.icInt.decompress(this.lastInt[m], m < 3 ? m : 3); this.lastInt[m] = this.intensity; }
      else this.intensity = this.lastInt[m];
      if (changed & 8) { let md = this.mClass[this.cls]; if (!md) md = this.mClass[this.cls] = new Model(256); this.cls = dec.symbol(md); }
      if (changed & 4) { const v = dec.symbol(this.mScan[(this.bb >> 6) & 1]); this.scan = fold(v + this.scan); }
      if (changed & 2) { let md = this.mUser[this.user]; if (!md) md = this.mUser[this.user] = new Model(256); this.user = dec.symbol(md); }
      if (changed & 1) this.psid = this.icPsid.decompress(this.psid, 0);
    } else { r = this.bb & 7; n = (this.bb >> 3) & 7; m = NRM[n][r]; l = NRL[n][r]; }
    let diff = this.icDx.decompress(this.xm[m].v[2], n === 1 ? 1 : 0);
    this.x = (this.x + diff) | 0; this.xm[m].add(diff);
    let kb = this.icDx.k;
    diff = this.icDy.decompress(this.ym[m].v[2], (n === 1 ? 1 : 0) + (kb < 20 ? (kb & ~1) : 20));
    this.y = (this.y + diff) | 0; this.ym[m].add(diff);
    kb = (this.icDx.k + this.icDy.k) >>> 1;
    this.z = this.icZ.decompress(this.lastH[l], (n === 1 ? 1 : 0) + (kb < 18 ? (kb & ~1) : 18));
    this.lastH[l] = this.z;
  };

  /* ---------- GPSTIME11 v2 (decoded only to keep the stream in sync) ---------- */
  function Gps11(dec) { this.dec = dec; this.mMulti = new Model(516); this.m0 = new Model(6); this.ic = new IC(dec, 32, 9); }
  Gps11.prototype.init = function (dv, o) {
    this.last = 0; this.next = 0; this.diff = new Int32Array(4); this.ext = new Int32Array(4);
    this.lo = new Uint32Array(4); this.hi = new Int32Array(4);
    this.lo[0] = dv.getUint32(o, true); this.hi[0] = dv.getInt32(o + 4, true);
  };
  Gps11.prototype.add = function (i, d) {          // 64-bit add of a signed 32-bit value
    const s = this.lo[i] + d;
    this.hi[i] = (this.hi[i] + Math.floor(s / 4294967296)) | 0; this.lo[i] = s >>> 0;
  };
  Gps11.prototype.full = function () {
    const dec = this.dec;
    this.next = (this.next + 1) & 3;
    this.hi[this.next] = this.ic.decompress(this.hi[this.last], 8);
    this.lo[this.next] = dec.int();
    this.last = this.next; this.diff[this.last] = 0; this.ext[this.last] = 0;
  };
  Gps11.prototype.read = function () {
    const dec = this.dec;
    for (;;) {
      if (this.diff[this.last] === 0) {
        const multi = dec.symbol(this.m0);
        if (multi === 1) { this.diff[this.last] = this.ic.decompress(0, 0); this.add(this.last, this.diff[this.last]); this.ext[this.last] = 0; }
        else if (multi === 2) this.full();
        else if (multi > 2) { this.last = (this.last + multi - 2) & 3; continue; }
        return;
      }
      let multi = dec.symbol(this.mMulti);
      if (multi === 1) { this.add(this.last, this.ic.decompress(this.diff[this.last], 1)); this.ext[this.last] = 0; }
      else if (multi < 511) {
        let gd; const ld = this.diff[this.last];
        if (multi === 0) { gd = this.ic.decompress(0, 7); if (++this.ext[this.last] > 3) { this.diff[this.last] = gd; this.ext[this.last] = 0; } }
        else if (multi < 500) gd = this.ic.decompress(Math.imul(multi, ld), multi < 10 ? 2 : 3);
        else if (multi === 500) { gd = this.ic.decompress(Math.imul(500, ld), 4); if (++this.ext[this.last] > 3) { this.diff[this.last] = gd; this.ext[this.last] = 0; } }
        else {
          multi = 500 - multi;
          if (multi > -10) gd = this.ic.decompress(Math.imul(multi, ld), 5);
          else { gd = this.ic.decompress(Math.imul(-10, ld), 6); if (++this.ext[this.last] > 3) { this.diff[this.last] = gd; this.ext[this.last] = 0; } }
        }
        this.add(this.last, gd);
      }
      else if (multi === 512) this.full();
      else if (multi > 512) { this.last = (this.last + multi - 512) & 3; continue; }
      return;
    }
  };

  /* ---------- RGB12 v2 ---------- */
  function Rgb12(dec) { this.dec = dec; this.mUsed = new Model(128); this.m = []; for (let i = 0; i < 6; i++) this.m.push(new Model(256)); }
  Rgb12.prototype.init = function (dv, o) { this.l = [dv.getUint16(o, true), dv.getUint16(o + 2, true), dv.getUint16(o + 4, true)]; };
  Rgb12.prototype.read = function () {
    const dec = this.dec, l = this.l, m = this.m, it = [0, 0, 0];
    const sym = dec.symbol(this.mUsed);
    let diff;
    it[0] = (sym & 1) ? fold(dec.symbol(m[0]) + (l[0] & 255)) : (l[0] & 255);
    it[0] |= (sym & 2) ? (fold(dec.symbol(m[1]) + (l[0] >> 8)) << 8) : (l[0] & 0xFF00);
    if (sym & 64) {
      diff = (it[0] & 255) - (l[0] & 255);
      it[1] = (sym & 4) ? fold(dec.symbol(m[2]) + clamp(diff + (l[1] & 255))) : (l[1] & 255);
      if (sym & 16) { const c = dec.symbol(m[4]); diff = Math.trunc((diff + ((it[1] & 255) - (l[1] & 255))) / 2); it[2] = fold(c + clamp(diff + (l[2] & 255))); }
      else it[2] = l[2] & 255;
      diff = (it[0] >> 8) - (l[0] >> 8);
      it[1] |= (sym & 8) ? (fold(dec.symbol(m[3]) + clamp(diff + (l[1] >> 8))) << 8) : (l[1] & 0xFF00);
      if (sym & 32) { const c = dec.symbol(m[5]); diff = Math.trunc((diff + ((it[1] >> 8) - (l[1] >> 8))) / 2); it[2] |= fold(c + clamp(diff + (l[2] >> 8))) << 8; }
      else it[2] |= l[2] & 0xFF00;
    } else { it[1] = it[0]; it[2] = it[0]; }
    this.l = it;
  };

  /* ---------- BYTE v2 ---------- */
  function Byte2(dec, n) { this.dec = dec; this.n = n; this.m = []; for (let i = 0; i < n; i++) this.m.push(new Model(256)); }
  Byte2.prototype.init = function (dv, o) { this.l = new Uint8Array(this.n); for (let i = 0; i < this.n; i++) this.l[i] = dv.getUint8(o + i); };
  Byte2.prototype.read = function () { for (let i = 0; i < this.n; i++) this.l[i] = fold(this.l[i] + this.dec.symbol(this.m[i])); };

  /* ---------- POINT14 v3/v4 (XY + Z + classification layers only) ---------- */
  function P14Ctx(decXY, decZ) {
    this.mChanged = []; for (let i = 0; i < 8; i++) this.mChanged.push(new Model(128));
    this.mChannel = new Model(3); this.mNret = new Array(16); this.mRn = new Array(16); this.mRnSame = new Model(13);
    this.icDx = new IC(decXY, 32, 2); this.icDy = new IC(decXY, 32, 22); this.icZ = new IC(decZ, 32, 20);
    this.mClass = new Array(64);
    this.xm = []; this.ym = []; for (let i = 0; i < 12; i++) { this.xm.push(new Median5()); this.ym.push(new Median5()); }
    this.lastZ = new Int32Array(8);
  }
  function decodeP14Chunk(buf, first, count, layers, out, ptLen) {
    // first: DataView over raw first point; layers: {xy:[s,e], z:[s,e] or null, cls:[s,e] or null}
    const decXY = new Decoder(buf, layers.xy[0], layers.xy[1]); decXY.start();
    const decZ = layers.z ? new Decoder(buf, layers.z[0], layers.z[1]) : null; if (decZ) decZ.start();
    const decC = layers.cls ? new Decoder(buf, layers.cls[0], layers.cls[1]) : null; if (decC) decC.start();
    const p0 = {
      x: first.getInt32(0, true), y: first.getInt32(4, true), z: first.getInt32(8, true),
      r: first.getUint8(14) & 15, n: first.getUint8(14) >> 4, ch: (first.getUint8(15) >> 4) & 3, cls: first.getUint8(16), gpsChange: false
    };
    const ctxs = [null, null, null, null], last = [null, null, null, null];
    const mk = (c, item) => {
      const C = new P14Ctx(decXY, decZ || decXY);
      for (let i = 0; i < 8; i++) C.lastZ[i] = item.z;
      ctxs[c] = C; last[c] = { x: item.x, y: item.y, z: item.z, r: item.r, n: item.n, ch: c, cls: item.cls, gpsChange: false };
    };
    let cur = p0.ch; mk(cur, p0); last[cur].ch = p0.ch;
    out.X[0] = p0.x; out.Y[0] = p0.y; out.Z[0] = p0.z; out.C[0] = p0.cls;
    for (let i = 1; i < count; i++) {
      let C = ctxs[cur], L = last[cur];
      let lpr = (L.r === 1 ? 1 : 0) + (L.r >= L.n ? 2 : 0) + (L.gpsChange ? 4 : 0);
      const changed = decXY.symbol(C.mChanged[lpr]);
      if (changed & 64) {
        const d = decXY.symbol(C.mChannel), sc = (cur + d + 1) % 4;
        if (!ctxs[sc]) mk(sc, L);
        cur = sc; C = ctxs[cur]; L = last[cur]; L.ch = sc;
      }
      const gpsChange = (changed & 16) ? 1 : 0;
      const lastN = L.n, lastR = L.r;
      let n, r;
      if (changed & 4) { let md = C.mNret[lastN]; if (!md) md = C.mNret[lastN] = new Model(16); n = decXY.symbol(md); L.n = n; } else n = lastN;
      const rc = changed & 3;
      if (rc === 0) r = lastR;
      else if (rc === 1) { r = (lastR + 1) % 16; L.r = r; }
      else if (rc === 2) { r = (lastR + 15) % 16; L.r = r; }
      else {
        if (gpsChange) { let md = C.mRn[lastR]; if (!md) md = C.mRn[lastR] = new Model(16); r = decXY.symbol(md); }
        else { const s = decXY.symbol(C.mRnSame); r = (lastR + s + 2) % 16; }
        L.r = r;
      }
      const m = NRM6[n][r], l = NRL8[n][r];
      const cpr = (r === 1 ? 2 : 0) + (r >= n ? 1 : 0);
      const mi = (m << 1) | gpsChange;
      let diff = C.icDx.decompress(C.xm[mi].v[2], n === 1 ? 1 : 0);
      L.x = (L.x + diff) | 0; C.xm[mi].add(diff);
      let kb = C.icDx.k;
      diff = C.icDy.decompress(C.ym[mi].v[2], (n === 1 ? 1 : 0) + (kb < 20 ? (kb & ~1) : 20));
      L.y = (L.y + diff) | 0; C.ym[mi].add(diff);
      if (decZ) {
        kb = (C.icDx.k + C.icDy.k) >>> 1;
        L.z = C.icZ.decompress(C.lastZ[l], (n === 1 ? 1 : 0) + (kb < 18 ? (kb & ~1) : 18));
        C.lastZ[l] = L.z;
      }
      if (decC) {
        const ccc = ((L.cls & 0x1F) << 1) + (cpr === 3 ? 1 : 0);
        let md = C.mClass[ccc]; if (!md) md = C.mClass[ccc] = new Model(256);
        L.cls = decC.symbol(md);
      }
      L.gpsChange = !!gpsChange;
      out.X[i] = L.x; out.Y[i] = L.y; out.Z[i] = L.z; out.C[i] = L.cls;
    }
  }

  /* ---------- header ---------- */
  const td = new TextDecoder('ascii');
  function str(u8, o, n) { let e = o; while (e < o + n && u8[e]) e++; return td.decode(u8.subarray(o, e)).trim(); }
  async function readHeader(file) {
    const head = new Uint8Array(await file.slice(0, Math.min(file.size, 375)).arrayBuffer());
    const dv = new DataView(head.buffer);
    if (str(head, 0, 4) !== 'LASF') throw new Error('not a LAS/LAZ file (no LASF signature)');
    const H = {
      vMaj: head[24], vMin: head[25], headerSize: dv.getUint16(94, true), offPoints: dv.getUint32(96, true),
      nVlr: dv.getUint32(100, true), fmtRaw: head[104], recLen: dv.getUint16(105, true), nLegacy: dv.getUint32(107, true),
      scale: [dv.getFloat64(131, true), dv.getFloat64(139, true), dv.getFloat64(147, true)],
      offset: [dv.getFloat64(155, true), dv.getFloat64(163, true), dv.getFloat64(171, true)],
      max: [dv.getFloat64(179, true), dv.getFloat64(195, true), dv.getFloat64(211, true)],
      min: [dv.getFloat64(187, true), dv.getFloat64(203, true), dv.getFloat64(219, true)]
    };
    H.fmt = H.fmtRaw & 0x3F;
    H.count = H.nLegacy;
    if (H.vMin >= 4 && H.headerSize >= 375) { const c = Number(dv.getBigUint64(247, true)); if (c) H.count = c; }
    // VLRs
    const vlrBytes = new Uint8Array(await file.slice(H.headerSize, H.offPoints).arrayBuffer());
    const vdv = new DataView(vlrBytes.buffer);
    let p = 0; H.vlrs = [];
    for (let i = 0; i < H.nVlr && p + 54 <= vlrBytes.length; i++) {
      const user = str(vlrBytes, p + 2, 16), rid = vdv.getUint16(p + 18, true), len = vdv.getUint16(p + 20, true);
      H.vlrs.push({ user, rid, data: vlrBytes.subarray(p + 54, p + 54 + len) });
      p += 54 + len;
    }
    const lz = H.vlrs.find(v => v.user === 'laszip encoded' && v.rid === 22204);
    if (lz) {
      const d = new DataView(lz.data.buffer, lz.data.byteOffset, lz.data.byteLength);
      H.laz = { compressor: d.getUint16(0, true), coder: d.getUint16(2, true), version: `${d.getUint8(4)}.${d.getUint8(5)}r${d.getUint16(6, true)}`, chunkSize: d.getUint32(12, true), items: [] };
      const ni = d.getUint16(32, true);
      for (let i = 0; i < ni; i++) H.laz.items.push({ type: d.getUint16(34 + i * 6, true), size: d.getUint16(36 + i * 6, true), version: d.getUint16(38 + i * 6, true) });
    } else if (H.fmtRaw & 0x80) throw new Error('compressed point format flag set but no LASzip VLR found');
    // CRS: WKT (2112) or GeoKeys (34735)
    const wkt = H.vlrs.find(v => v.user === 'LASF_Projection' && v.rid === 2112);
    if (wkt) H.wkt = str(wkt.data, 0, wkt.data.length);
    const gk = H.vlrs.find(v => v.user === 'LASF_Projection' && v.rid === 34735);
    if (gk) { const g = new DataView(gk.data.buffer, gk.data.byteOffset, gk.data.byteLength); H.geoKeys = []; for (let i = 0; i * 2 + 2 <= gk.data.length; i++) H.geoKeys.push(g.getUint16(i * 2, true)); }
    if (!H.epsg && H.wkt) { const m = H.wkt.match(/AUTHORITY\["EPSG",\s*"(\d+)"\]\s*\]\s*$/) || H.wkt.match(/ID\["EPSG",\s*(\d+)\]\s*\]\s*$/); if (m) H.epsg = +m[1]; }
    return H;
  }

  /* ---------- main reader ---------- */
  // onChunk(out, n) with out = {X,Y,Z: Int32Array, C: Uint8Array}; progress(done, total); isCancelled()
  async function read(file, H, onChunk, progress, isCancelled, opts) {
    const N = H.count, fmt = H.fmt;
    const clsOf = (dv, o) => fmt >= 6 ? dv.getUint8(o + 16) : dv.getUint8(o + 15) & 31;
    const yieldUI = () => new Promise(r => setTimeout(r, 0));
    if (!H.laz) {                                   // uncompressed LAS
      const per = 200000, rl = H.recLen;
      const out = { X: new Int32Array(per), Y: new Int32Array(per), Z: new Int32Array(per), C: new Uint8Array(per) };
      for (let s = 0; s < N; s += per) {
        if (isCancelled()) throw new Error('cancelled');
        const n = Math.min(per, N - s), a = H.offPoints + s * rl;
        const dv = new DataView(await file.slice(a, a + n * rl).arrayBuffer());
        for (let i = 0; i < n; i++) { const o = i * rl; out.X[i] = dv.getInt32(o, true); out.Y[i] = dv.getInt32(o + 4, true); out.Z[i] = dv.getInt32(o + 8, true); out.C[i] = clsOf(dv, o); }
        onChunk(out, n); progress(s + n, N); await yieldUI();
      }
      return;
    }
    const Z = H.laz;
    if (Z.coder !== 0) throw new Error('unsupported LAZ coder ' + Z.coder);
    const layered = Z.compressor === 3;
    if (Z.compressor !== 2 && Z.compressor !== 3) throw new Error(`unsupported LAZ compressor ${Z.compressor} (only chunked LAZ is supported – re-save with LAStools/PDAL)`);
    for (const it of Z.items) {
      const ok = layered ? ([10, 11, 12, 14].includes(it.type) && it.version >= 2) || it.type === 13
                         : ([6, 7, 8, 0].includes(it.type) && it.version === 2);
      if (!ok) throw new Error(`unsupported LAZ item type ${it.type} v${it.version}`);
    }
    if (layered && Z.items[0].type !== 10) throw new Error('layered LAZ without POINT14 first');
    // chunk table
    const tdv = new DataView(await file.slice(H.offPoints, H.offPoints + 8).arrayBuffer());
    let tablePos = Number(tdv.getBigInt64(0, true));
    const chunksStart = H.offPoints + 8;
    if (tablePos === -1) { const e = new DataView(await file.slice(file.size - 8).arrayBuffer()); tablePos = Number(e.getBigInt64(0, true)); }
    if (!(tablePos > chunksStart && tablePos < file.size)) throw new Error('LAZ chunk table missing (file was not finalised) – re-save it with LAStools/PDAL');
    const tbuf = new Uint8Array(await file.slice(tablePos).arrayBuffer());
    const tv = new DataView(tbuf.buffer);
    const nChunks = tv.getUint32(4, true), variable = Z.chunkSize === 0xFFFFFFFF;
    const starts = [chunksStart], counts = [];
    {
      const dec = new Decoder(tbuf, 8, tbuf.length); dec.start();
      const ic = new IC(dec, 32, 2);
      let pc = 0, pb = 0;
      for (let i = 0; i < nChunks; i++) {
        if (variable) { pc = ic.decompress(pc, 0); counts.push(pc); }
        pb = ic.decompress(pb, 1);
        starts.push(starts[i] + (pb >>> 0));
      }
    }
    if (!variable) for (let i = 0; i < nChunks; i++) counts.push(Math.min(Z.chunkSize, N - i * Z.chunkSize));
    const rl = Z.items.reduce((a, b) => a + b.size, 0);
    const jobs = [];
    for (let ci = 0; ci < nChunks; ci++) if (counts[ci] > 0) jobs.push({ ci, a: starts[ci], b: starts[ci + 1], cnt: counts[ci] });
    const nW = Math.max(0, Math.min(opts && opts.workers || 0, jobs.length));
    let done = 0;
    const finish = (out, n) => { done += n; onChunk(out, n); progress(done, N); };
    if (nW > 0 && opts.makeWorker) {
      let pool = [];
      try { for (let i = 0; i < nW; i++) pool.push(opts.makeWorker()); }
      catch (e) { pool.forEach(w => w.terminate()); pool = []; if (opts.log) opts.log('Worker threads unavailable (' + e.message + ') – decoding on the main thread.'); }
      if (pool.length) {
        try {
          await new Promise((resolve, reject) => {
            let next = 0, active = 0, failed = false;
            const launch = async (w) => {
              if (failed) return;
              if (isCancelled()) { failed = true; reject(new Error('cancelled')); return; }
              if (next >= jobs.length) { if (active === 0) resolve(); return; }
              const j = jobs[next++]; active++;
              const buf = await file.slice(j.a, j.b).arrayBuffer();
              w.onmessage = (ev) => {
                active--;
                const d = ev.data;
                if (d.error) { failed = true; reject(new Error(d.error)); return; }
                finish({ X: new Int32Array(d.X), Y: new Int32Array(d.Y), Z: new Int32Array(d.Z), C: new Uint8Array(d.C) }, d.n);
                launch(w);
              };
              w.onerror = (ev) => { failed = true; ev.preventDefault && ev.preventDefault(); reject(new Error('worker error: ' + (ev.message || 'unknown'))); };
              w.postMessage({ buf, items: Z.items, layered, cnt: j.cnt, rl }, [buf]);
            };
            pool.forEach(launch);
          });
        } finally { pool.forEach(w => w.terminate()); }
        return;
      }
    }
    for (const j of jobs) {
      if (isCancelled()) throw new Error('cancelled');
      const buf = new Uint8Array(await file.slice(j.a, j.b).arrayBuffer());
      const r = decodeChunk(buf, Z.items, layered, j.cnt, rl);
      finish(r, r.n);
      await yieldUI();
    }
  }
  function decodeChunk(buf, items, layered, cnt, rl) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (layered) { const fc = dv.getUint32(rl, true); if (fc > 0) cnt = fc; }
    const out = { X: new Int32Array(cnt), Y: new Int32Array(cnt), Z: new Int32Array(cnt), C: new Uint8Array(cnt), n: cnt };
    if (!layered) {
      const dec = new Decoder(buf, rl, buf.length);
      const readers = []; let o = 0;
      for (const it of items) {
        const r = it.type === 6 ? new Point10(dec) : it.type === 7 ? new Gps11(dec) : it.type === 8 ? new Rgb12(dec) : new Byte2(dec, it.size);
        r.init(dv, o); o += it.size; readers.push(r);
      }
      dec.start();
      const p = readers[0], nr = readers.length;
      out.X[0] = p.x; out.Y[0] = p.y; out.Z[0] = p.z; out.C[0] = p.cls & 31;
      for (let i = 1; i < cnt; i++) {
        for (let k = 0; k < nr; k++) readers[k].read();
        out.X[i] = p.x; out.Y[i] = p.y; out.Z[i] = p.z; out.C[i] = p.cls & 31;
      }
    } else {
      let o = rl + 4;
      const sizes = [];
      for (const it of items) {
        const nl = it.type === 10 ? 9 : it.type === 11 ? 1 : it.type === 12 ? 2 : it.type === 13 ? 1 : it.size;
        const s = []; for (let k = 0; k < nl; k++) { s.push(dv.getUint32(o, true)); o += 4; } sizes.push(s);
      }
      const ps = sizes[0];
      const xy = [o, o + ps[0]], zr = ps[1] ? [xy[1], xy[1] + ps[1]] : null, cr = ps[2] ? [xy[1] + ps[1], xy[1] + ps[1] + ps[2]] : null;
      decodeP14Chunk(buf, new DataView(buf.buffer, buf.byteOffset, 30), cnt, { xy, z: zr, cls: cr }, out);
    }
    return out;
  }
  return { readHeader, read, decodeChunk };
}
const LAZ = lazFactory();
/* worker source: same decoder, decodes one chunk per message */
function lazWorkerSource() {
  return 'const LAZ = (' + lazFactory.toString() + ')();\n' +
    'onmessage = function (e) { try { const d = e.data; const r = LAZ.decodeChunk(new Uint8Array(d.buf), d.items, d.layered, d.cnt, d.rl);' +
    ' postMessage({ n: r.n, X: r.X.buffer, Y: r.Y.buffer, Z: r.Z.buffer, C: r.C.buffer }, [r.X.buffer, r.Y.buffer, r.Z.buffer, r.C.buffer]); }' +
    ' catch (err) { postMessage({ error: String(err && err.message || err) }); } };';
}


