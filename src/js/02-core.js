/* ================================ DOM ================================== */
const $ = id => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d'), wrap = $('wrap');
const off = document.createElement('canvas'), offctx = off.getContext('2d');
let cssW = 800, cssH = 600, dpr = 1;

/* =============================== LOGGING =============================== */
function log(msg, cls) {
  const el = $('log'), line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = `[${new Date().toTimeString().slice(0, 8)}] ${msg}`;
  el.appendChild(line);
  while (el.childNodes.length > 300) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
  (cls === 'fail' ? console.error : console.log)('[noise-poc]', msg);
}

/* =============================== HELPERS =============================== */
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function num(v, min, max) { const n = parseFloat(v); if (!isFinite(n) || n < min || n > max) return null; return n; }
function fmt(n, d = 1) { return typeof n === 'number' && isFinite(n) ? n.toFixed(d) : '–'; }
function bboxOf(pts) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of pts) { if (p[0] < a) a = p[0]; if (p[1] < b) b = p[1]; if (p[0] > c) c = p[0]; if (p[1] > d) d = p[1]; }
  return [a, b, c, d];
}
function pip(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inBox(x, y, bb) { return x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3]; }
function hyp(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
function rect(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
function distSeg(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  let t = L ? ((px - a[0]) * dx + (py - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}

