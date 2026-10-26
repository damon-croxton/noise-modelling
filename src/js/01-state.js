/* ================================ STATE ================================ */
const state = {
  sources: [], buildings: [], hoardings: [],
  sel: null, mode: 'select', draft: [],
  view: { cx: 0, cy: 0, scale: 3 }, mouse: null, lastEq: 0,
  origin: null,            // {type:'projected', x0, y0, zone, epsg}  (MGA / GDA)
  dsm: null,
  terrain: null,
  settings: { hr: 1.5, ground: 'hard', air: true, barriers: true, terrain: true, shade: true, cellPx: 5, opacity: 0.7, minDb: 35, newH: 9, newHo: 2.4 }
};
let nextId = 1, grid = null;

