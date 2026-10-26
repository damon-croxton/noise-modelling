/* Synthetic input files for the browser tests. Everything is generated in
 * memory so the tests do not depend on any real location or dataset. */
'use strict';

/* Minimal little-endian GeoTIFF: one strip, uncompressed float32.
 *   opts.W, opts.H        size in cells
 *   opts.x0, opts.yTop    top-left corner (map units)
 *   opts.cell             cell size
 *   opts.z(i, j)          value function (column i, row j from the top)
 *   opts.geoKeys          flat GeoKeyDirectory entries after the header, e.g.
 *                         [1024,0,1,1, 3072,0,1,28356]
 *   opts.nodata           optional GDAL_NODATA string */
function geotiff(opts) {
  const W = opts.W, H = opts.H, cell = opts.cell || 1;
  const data = Buffer.alloc(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) data.writeFloatLE(opts.z(i, j), (j * W + i) * 4);
  const keys = opts.geoKeys || [];
  const tags = [
    [256, 3, [W]], [257, 3, [H]], [258, 3, [32]], [259, 3, [1]], [262, 3, [1]],
    [273, 4, [0]], [277, 3, [1]], [278, 3, [H]], [279, 4, [data.length]], [339, 3, [3]],
    [33550, 12, [cell, cell, 0]], [33922, 12, [0, 0, 0, opts.x0, opts.yTop, 0]]
  ];
  if (keys.length) tags.push([34735, 3, [1, 1, 0, keys.length / 4, ...keys]]);
  if (opts.nodata != null) tags.push([42113, 2, String(opts.nodata)]);
  tags.sort((a, b) => a[0] - b[0]);

  const size = { 2: 1, 3: 2, 4: 4, 12: 8 };
  const enc = (type, vals) => {
    if (type === 2) return Buffer.from(vals + '\0', 'latin1');
    const b = Buffer.alloc(size[type] * vals.length);
    vals.forEach((v, k) => {
      if (type === 3) b.writeUInt16LE(v, k * 2);
      else if (type === 4) b.writeUInt32LE(v, k * 4);
      else b.writeDoubleLE(v, k * 8);
    });
    return b;
  };
  const ifdOff = 8, ifdLen = 2 + 12 * tags.length + 4;
  let extraOff = ifdOff + ifdLen;
  const extras = [], entries = [];
  const raw = tags.map(([tag, type, vals]) => [tag, type, vals, enc(type, vals)]);
  const extraTotal = raw.reduce((a, r) => a + (r[3].length > 4 ? r[3].length + (r[3].length & 1) : 0), 0);
  const dataOff = extraOff + extraTotal;
  for (const [tag, type, vals, b0] of raw) {
    let b = b0;
    if (tag === 273) b = enc(4, [dataOff]);
    const count = type === 2 ? b.length : vals.length;
    const e = Buffer.alloc(12);
    e.writeUInt16LE(tag, 0); e.writeUInt16LE(type, 2); e.writeUInt32LE(count, 4);
    if (b.length <= 4) b.copy(e, 8);
    else {
      e.writeUInt32LE(extraOff, 8);
      const padded = b.length & 1 ? Buffer.concat([b, Buffer.alloc(1)]) : b;
      extras.push(padded); extraOff += padded.length;
    }
    entries.push(e);
  }
  const head = Buffer.alloc(8);
  head.write('II', 0, 'latin1'); head.writeUInt16LE(42, 2); head.writeUInt32LE(ifdOff, 4);
  const cnt = Buffer.alloc(2); cnt.writeUInt16LE(tags.length, 0);
  return Buffer.concat([head, cnt, ...entries, Buffer.alloc(4), ...extras, data]);
}

/* ESRI ASCII grid. z(i, j) as above; returns a string. */
function asc(opts) {
  const { W, H, cell = 1, xll, yll, nodata = -9999 } = opts;
  const rows = [`ncols ${W}`, `nrows ${H}`, `xllcorner ${xll}`, `yllcorner ${yll}`, `cellsize ${cell}`, `NODATA_value ${nodata}`];
  for (let j = 0; j < H; j++) {
    const r = new Array(W);
    for (let i = 0; i < W; i++) r[i] = opts.z(i, j);
    rows.push(r.join(' '));
  }
  return rows.join('\n') + '\n';
}

module.exports = { geotiff, asc };
