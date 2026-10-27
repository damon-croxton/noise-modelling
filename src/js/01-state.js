/* ================================ STATE ================================ */
const state = {
  sources: [], buildings: [], hoardings: [], ncas: [], rulesSet: 'cnvg', calib: null,
  sel: null, mode: 'select', draft: [],
  view: { cx: 0, cy: 0, scale: 3 }, mouse: null, lastEq: DEFAULT_EQ,
  origin: null,            // {type:'projected', x0, y0, zone, epsg}  (MGA / GDA)
  dsm: null,
  terrain: null,
  assess: {
    defNca: { name: 'Outside NCAs', cat: DEFAULT_NCA_CAT, rbl: { day: null, evening: null, night: null } },
    floorH: 3, spacing: 10, offset: 1, display: 'both', results: null, sig: null, running: false
  },
  settings: { method: 'tfnsw', lateral: true, reflect: 'auto', reflLoss: 1, bands: false, combine: 'all', soft: 0, season: 'warm', period: 'std', barCap: 15, hr: 1.5, air: true, barriers: true, terrain: true, shade: true, cellPx: 5, opacity: 0.7, minDb: 35, newH: 9, newHo: 2.4 }
};
let nextId = 1, grid = null;

