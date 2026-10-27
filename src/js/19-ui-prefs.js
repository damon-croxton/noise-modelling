/* ============================ UI PREFERENCES =========================== */
/* Per-viewer display choices (layout, colours, panels, map layers), kept in
   this browser's localStorage. They are conveniences only: the app works the
   same without them, and they are never saved in the project file. */
const UI_KEY = 'noise-poc-ui';
const UI = {
  layout: 'workspace', theme: 'light', compact: false, help: true, auto: true,
  left: true, right: true, bottom: true, focus: false, rtab: 'Results', btab: 'Data sources', step: 0, probeMin: false, collapsed: [],
  layers: { heat: true, impact: true, blabels: true, slabels: true, ncas: true, hoard: true, paths: true, legend: true, probe: true, banner: true }
};
(function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
    if (!p || typeof p !== 'object') return;
    for (const k of Object.keys(UI)) if (k !== 'layers' && k in p && typeof p[k] === typeof UI[k]) UI[k] = p[k];
    if (p.layers && typeof p.layers === 'object') for (const k of Object.keys(UI.layers)) if (typeof p.layers[k] === 'boolean') UI.layers[k] = p.layers[k];
  } catch (e) { /* storage blocked: defaults */ }
})();
function savePrefs() { try { localStorage.setItem(UI_KEY, JSON.stringify(UI)); } catch (e) { /* storage blocked */ } }

/* Map colours per theme (the canvas can't read CSS variables cheaply). */
const MAPTHEME = {
  light: { bg: '#f4f5f7', grid: '#e1e4e9', gridShade: 'rgba(0,0,0,0.06)', bfill: 'rgba(55,60,72,0.78)', bstroke: '#1f2937', bw: 1, blabel: '#ffffff', boxBg: 'rgba(255,255,255,0.9)', boxText: '#111827' },
  dark: { bg: '#161b22', grid: '#232a35', gridShade: 'rgba(255,255,255,0.05)', bfill: 'rgba(130,140,158,0.82)', bstroke: '#e5e7eb', bw: 1, blabel: '#0b0f16', boxBg: 'rgba(26,31,41,0.92)', boxText: '#e5e7eb' },
  contrast: { bg: '#ffffff', grid: '#c8c8c8', gridShade: 'rgba(0,0,0,0.12)', bfill: 'rgba(60,60,60,0.85)', bstroke: '#000000', bw: 1.6, blabel: '#ffffff', boxBg: '#ffffff', boxText: '#000000' }
};
let MT = MAPTHEME[UI.theme] || MAPTHEME.light;
/* Period colours for shift chips and the map banner. */
const PERIOD_COLOR = { std: '#16a34a', p1day: '#ca8a04', p1eve: '#c026d3', p2eve: '#7c3aed', p2night: '#1e40af' };
const PERIOD_SHORT = { std: 'Standard hours', p1day: 'P1 day', p1eve: 'P1 evening', p2eve: 'P2 evening', p2night: 'P2 night' };
