/* ============================== OBJECTS ================================ */
function makeBuilding(pts, h, name, opt) {
  const id = nextId++;
  const b = { id, name: name || ('Building ' + id), h, pts, bbox: bboxOf(pts), base: 0, baseFixed: null, roofRL: null, hsrc: 'manual', osmId: null, btype: null,
    tags: null, landUse: null, luSrc: null, floors: null, address: null };
  if (opt) {
    if (opt.baseRL != null) b.baseFixed = opt.baseRL; if (opt.roofRL != null) b.roofRL = opt.roofRL;
    if (opt.hsrc) b.hsrc = opt.hsrc; if (opt.osmId) b.osmId = opt.osmId; if (opt.btype) b.btype = opt.btype;
    if (opt.tags) b.tags = opt.tags;
    if (opt.landUse) { b.landUse = opt.landUse; b.luSrc = opt.luSrc || 'manual'; }
    if (opt.floors != null) b.floors = opt.floors;
    if (opt.address) b.address = opt.address;
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
/* A source: lw = sound power dB(A); on = % of each 15 min the plant operates;
   pen = annoyance / special audible characteristics penalty (dB); mit =
   mitigation at the plant, e.g. local screening or an enclosure (dB). */
function makeSource(x, y, libId) {
  const e = libItem(libId), id = nextId++;
  return { id, name: e.name.replace(/ \(.*\)$/, ''), eq: e.id, lw: e.lw, on: 100, pen: e.sac ? SAC_PENALTY : 0, mit: 0, h: 2, x, y };
}
/* Leq correction for operating time: 10·lg(on/100). The TfNSW estimator uses a
   flat −3 dB for plant running under 7 min in 15 (10·lg(7/15) = −3.3). */
function onTimeCorr(s) { return 10 * Math.log10(Math.max(1, Math.min(100, s.on == null ? 100 : s.on)) / 100); }
function effectiveLw(s) { return s.lw + onTimeCorr(s) + (s.pen || 0) - (s.mit || 0); }
function lwBreakdown(s) {
  const parts = [`Lw ${fmt(s.lw, 1)}`];
  if (s.on != null && s.on < 100) parts.push(`${fmt(onTimeCorr(s), 1)} (${fmt(s.on, 0)} % on)`);
  if (s.pen) parts.push(`+${fmt(s.pen, 0)} penalty`);
  if (s.mit) parts.push(`−${fmt(s.mit, 1)} mitigation`);
  return parts.length > 1 ? `${parts.join(' ')} = ${fmt(effectiveLw(s), 1)}` : parts[0];
}
/* CNVG-PTI Appendix C maximum for the source's library item, if exceeded. */
function overMax(s) { const e = libItem(s.eq); return e && e.id === s.eq && e.maxLw != null && s.lw > e.maxLw ? e.maxLw : null; }
function makeHoarding(pts, h, name) {
  const id = nextId++;
  return { id, name: name || ('Hoarding ' + id), h, pts, bbox: bboxOf(pts) };
}
function geomChanged() { IDX.dirty = true; }
/* Noise catchment area: polygon with a noise area category and optional
   measured RBLs (dBA) that override the category's values. */
function makeNca(pts, name) {
  const id = nextId++;
  return { id, name: name || ('NCA ' + String(state.ncas.length + 1).padStart(2, '0')), pts, bbox: bboxOf(pts), cat: DEFAULT_NCA_CAT, rbl: { day: null, evening: null, night: null } };
}
function ncaAt(x, y) {
  for (let k = state.ncas.length - 1; k >= 0; k--) { const n = state.ncas[k]; if (inBox(x, y, n.bbox) && pip(x, y, n.pts)) return n; }
  return null;
}
/* A point inside the footprint (centroid, or a corner-triangle centroid for odd shapes). */
function insidePoint(b) {
  let cx = b.pts.reduce((a, p) => a + p[0], 0) / b.pts.length, cy = b.pts.reduce((a, p) => a + p[1], 0) / b.pts.length;
  if (!pip(cx, cy, b.pts)) { const p = b.pts; cx = (p[0][0] + p[1][0] + p[2][0]) / 3; cy = (p[0][1] + p[1][1] + p[2][1]) / 3; }
  return [cx, cy];
}
function ncaOf(b) { const c = insidePoint(b); return ncaAt(c[0], c[1]) || state.assess.defNca; }

