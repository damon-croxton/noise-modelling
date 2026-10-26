/* ============================== OBJECTS ================================ */
function makeBuilding(pts, h, name, opt) {
  const id = nextId++;
  const b = { id, name: name || ('Building ' + id), h, pts, bbox: bboxOf(pts), base: 0, baseFixed: null, roofRL: null, hsrc: 'manual', osmId: null, btype: null };
  if (opt) {
    if (opt.baseRL != null) b.baseFixed = opt.baseRL; if (opt.roofRL != null) b.roofRL = opt.roofRL;
    if (opt.hsrc) b.hsrc = opt.hsrc; if (opt.osmId) b.osmId = opt.osmId; if (opt.btype) b.btype = opt.btype;
  }
  updateBase(b);
  return b;
}
function updateBase(b) {
  if (b.baseFixed != null) b.base = b.baseFixed;
  else if (state.terrain) {
    let m = Infinity;
    for (const p of b.pts) m = Math.min(m, ground(p[0], p[1]));
    const cx = b.pts.reduce((a, p) => a + p[0], 0) / b.pts.length, cy = b.pts.reduce((a, p) => a + p[1], 0) / b.pts.length;
    m = Math.min(m, ground(cx, cy));
    b.base = m;
  } else b.base = 0;
  if (b.roofRL != null) b.h = Math.max(0.5, b.roofRL - b.base);
}
function topOf(b) { return b.base + b.h; }
function makeSource(x, y, eqIdx) {
  const e = EQUIP[eqIdx] || EQUIP[0], id = nextId++;
  return { id, name: e[0].replace(/ \(.*\)$/, ''), eq: eqIdx, lw: e[1] == null ? 100 : e[1], h: 1.5, x, y };
}
function makeHoarding(pts, h, name) {
  const id = nextId++;
  return { id, name: name || ('Hoarding ' + id), h, pts, bbox: bboxOf(pts) };
}
function geomChanged() { IDX.dirty = true; }

