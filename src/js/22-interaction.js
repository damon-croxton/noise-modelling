/* ============================== SELECTION ============================== */
function listFor(type) { return type === 'source' ? state.sources : type === 'building' ? state.buildings : state.hoardings; }
function getSel() { if (!state.sel) return null; const obj = listFor(state.sel.type).find(o => o.id === state.sel.id); return obj ? { type: state.sel.type, obj } : null; }
function select(type, id) { state.sel = type ? { type, id } : null; renderSelPanel(); requestRender(); }
function deleteSel() {
  const s = getSel(); if (!s) return;
  if (s.type === 'source') state.sources = state.sources.filter(o => o !== s.obj);
  else if (s.type === 'building') { state.buildings = state.buildings.filter(o => o !== s.obj); geomChanged(); }
  else state.hoardings = state.hoardings.filter(o => o !== s.obj);
  log(`Deleted ${s.type} “${s.obj.name}”.`);
  select(null); requestCompute(false);
}
function bindNum(input, min, max, apply) {
  input.addEventListener('input', () => {
    const v = num(input.value, min, max);
    input.classList.toggle('bad', v === null);
    if (v !== null) { apply(v); requestCompute(true); }
  });
}
function renderSelPanel() {
  const body = $('selBody'), s = getSel();
  if (!s) { body.innerHTML = '<p class="muted">Nothing selected. Click a source, building or hoarding in Select mode.</p>'; return; }
  const o = s.obj;
  if (s.type === 'source') {
    body.innerHTML = `
      <div class="row"><label for="sName">Name</label><input type="text" id="sName" value="${esc(o.name)}" maxlength="40"></div>
      <div class="row"><label for="sEq">Equipment</label><select id="sEq">${libraryOptions(o.eq)}</select></div>
      <div class="row"><label for="sLw">Sound power Lw dB(A)</label><input type="number" id="sLw" min="40" max="150" step="0.5" value="${o.lw}"></div>
      <div class="row"><label for="sOn">% time on in 15 min</label><input type="number" id="sOn" min="1" max="100" step="1" value="${o.on}"></div>
      <div class="row"><label for="sPen">Annoyance penalty (dB)</label><input type="number" id="sPen" min="0" max="10" step="1" value="${o.pen}"></div>
      <div class="row"><label for="sMit">Mitigation reduction (dB)</label><input type="number" id="sMit" min="0" max="30" step="0.5" value="${o.mit}"></div>
      <div class="row"><label for="sH">Height above ground (m)</label><input type="number" id="sH" min="0" max="200" step="0.5" value="${o.h}"></div>
      <p class="kv" id="sInfo"></p>
      <p class="kv">${coordText(o.x, o.y)} · ground RL ${fmt(ground(o.x, o.y), 2)}</p>
      <div class="row"><button type="button" id="sToLib">Save as library item</button><button type="button" id="sDel" class="danger">Delete</button></div>`;
    const info = () => {
      const e = libItem(o.eq), mx = overMax(o);
      $('sInfo').innerHTML = `Effective: ${esc(lwBreakdown(o))} dB(A)` +
        (e.sac ? '<br>Special audible characteristics – CNVG-PTI applies +5 dB.' : '') +
        (mx != null ? `<br><b style="color:#b91c1c">Above the CNVG-PTI Appendix C maximum of ${mx} dB(A) – this plant should not be permitted on site.</b>` : '') +
        `<br><span class="muted">${esc(e.group)}${e.maxLw != null ? ` · maximum ${e.maxLw} dB(A)` : ''}</span>`;
    };
    info();
    $('sName').addEventListener('input', e => { o.name = e.target.value.slice(0, 40) || 'Source'; requestRender(); });
    $('sEq').addEventListener('change', e => {
      const it = libItem(e.target.value); o.eq = it.id; state.lastEq = it.id;
      o.lw = it.lw; o.pen = it.sac ? SAC_PENALTY : 0; $('sLw').value = o.lw; $('sPen').value = o.pen;
      if (it.id !== 'custom') { o.name = it.name.replace(/ \(.*\)$/, ''); $('sName').value = o.name; }
      log(`Source ${o.id} → ${it.name} (Lw ${o.lw}${o.pen ? ', +' + o.pen + ' dB penalty' : ''}).`); info(); requestCompute(false);
    });
    bindNum($('sLw'), 40, 150, v => { o.lw = v; info(); if (overMax(o) != null) log(`“${o.name}”: Lw ${v} is above the CNVG-PTI Appendix C maximum (${overMax(o)} dB(A)).`, 'warn'); });
    bindNum($('sOn'), 1, 100, v => { o.on = v; info(); });
    bindNum($('sPen'), 0, 10, v => { o.pen = v; info(); });
    bindNum($('sMit'), 0, 30, v => { o.mit = v; info(); });
    bindNum($('sH'), 0, 200, v => { o.h = v; });
    $('sToLib').addEventListener('click', () => saveSourceToLibrary(o));
    $('sDel').addEventListener('click', deleteSel);
  } else if (s.type === 'building') {
    body.innerHTML = `
      <div class="row"><label for="bName">Name</label><input type="text" id="bName" value="${esc(o.name)}" maxlength="40"></div>
      <div class="row"><label for="bH">Height (m)</label><input type="number" id="bH" min="0.5" max="300" step="0.5" value="${fmt(o.h, 2)}"></div>
      <p class="kv" id="bInfo"></p>
      <div class="row"><span class="muted">${o.pts.length} vertices</span><button type="button" id="bDel" class="danger">Delete</button></div>`;
    const SRC = { manual: 'entered by hand', 'osm-height': 'OSM height tag', 'osm-levels': 'OSM levels × 3 m + 1 m', 'type-default': `ESTIMATE – typical “${o.btype || 'yes'}” height, check it`, dsm: 'DSM (90th percentile roof) − DEM', lidar: `LiDAR – 90th percentile of ${o.lidarN || '?'} roof cells (class 6) − ground`, file: 'imported file' };
    const info = () => { $('bInfo').textContent = `Height source: ${SRC[o.hsrc] || o.hsrc}${o.osmId ? ' · ' + o.osmId : ''}. Base RL ${fmt(o.base, 2)}${o.baseFixed != null ? ' (from file)' : state.terrain ? ' (lowest DEM point)' : ''} · Roof RL ${fmt(topOf(o), 2)}`; };
    info();
    $('bName').addEventListener('input', e => { o.name = e.target.value.slice(0, 40) || 'Building'; });
    bindNum($('bH'), 0.5, 300, v => { o.h = v; o.roofRL = null; o.hsrc = 'manual'; info(); requestRender(); });
    $('bDel').addEventListener('click', deleteSel);
  } else {
    let len = 0; for (let i = 0; i < o.pts.length - 1; i++) len += hyp(o.pts[i], o.pts[i + 1]);
    body.innerHTML = `
      <div class="row"><label for="hName">Name</label><input type="text" id="hName" value="${esc(o.name)}" maxlength="40"></div>
      <div class="row"><label for="hH">Height above ground (m)</label><input type="number" id="hH" min="0.3" max="20" step="0.1" value="${o.h}"></div>
      <div class="row"><span class="muted">${fmt(len)} m long, ${o.pts.length} points</span><button type="button" id="hDel" class="danger">Delete</button></div>`;
    $('hName').addEventListener('input', e => { o.name = e.target.value.slice(0, 40) || 'Hoarding'; });
    bindNum($('hH'), 0.3, 20, v => { o.h = v; });
    $('hDel').addEventListener('click', deleteSel);
  }
}

/* ================================ MODES ================================ */
const HINTS = {
  select: 'Drag a source, building or hoarding to move it. Drag empty space to pan; wheel to zoom. Delete removes the selection.',
  source: 'Click the map to place a noise source.',
  building: 'Click to add corners. Click the first corner, double-click or press Enter to finish. Esc cancels. Right-drag pans.',
  hoarding: 'Click to add points along the hoarding line. Double-click or Enter to finish (2+ points). Esc cancels.'
};
function setMode(m) {
  if (state.mode !== m && state.draft.length) cancelDraft();
  state.mode = m;
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('hint').textContent = HINTS[m];
  canvas.style.cursor = m === 'select' ? 'default' : 'crosshair';
  updateDraftButtons(); requestRender();
}
function updateDraftButtons() {
  const show = (state.mode === 'building' || state.mode === 'hoarding') && state.draft.length > 0;
  $('finishPoly').hidden = !show; $('cancelPoly').hidden = !show;
}
function cancelDraft() { state.draft = []; updateDraftButtons(); requestRender(); }
function finishDraft() {
  const tol = 4 / state.view.scale, pts = [];
  for (const p of state.draft) if (!pts.length || hyp(pts[pts.length - 1], p) > tol) pts.push(p);
  if (state.mode === 'hoarding') {
    if (pts.length < 2) { log('Hoarding needs at least 2 points.', 'warn'); return; }
    const ho = makeHoarding(pts, state.settings.newHo);
    state.hoardings.push(ho); state.draft = [];
    let len = 0; for (let i = 0; i < pts.length - 1; i++) len += hyp(pts[i], pts[i + 1]);
    log(`Added ${ho.name}: ${fmt(len)} m long, ${ho.h} m high.`);
    updateDraftButtons(); select('hoarding', ho.id); requestCompute(false); return;
  }
  if (pts.length > 1 && hyp(pts[0], pts[pts.length - 1]) <= tol) pts.pop();
  if (pts.length < 3) { log('Building needs at least 3 distinct corners.', 'warn'); return; }
  const b = makeBuilding(pts, state.settings.newH);
  state.buildings.push(b); state.draft = []; geomChanged();
  log(`Added ${b.name}: ${pts.length} corners, ${b.h} m high, base RL ${fmt(b.base, 2)}.`);
  updateDraftButtons(); select('building', b.id); requestCompute(false);
}

/* ============================== INTERACTION ============================ */
let drag = null;
function mousePos(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function hitSource(mx, my) { for (let i = state.sources.length - 1; i >= 0; i--) { const s = state.sources[i], [sx, sy] = w2s(s.x, s.y); if (Math.hypot(sx - mx, sy - my) <= 11) return s; } return null; }
function hitHoarding(wx, wy) {
  const tol = 6 / state.view.scale;
  for (let k = state.hoardings.length - 1; k >= 0; k--) { const ho = state.hoardings[k]; for (let i = 0; i < ho.pts.length - 1; i++) if (distSeg(wx, wy, ho.pts[i], ho.pts[i + 1]) <= tol) return ho; }
  return null;
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  const [mx, my] = mousePos(e), [wx, wy] = s2w(mx, my);
  state.mouse = { x: mx, y: my };
  if (e.button === 1 || e.button === 2) { drag = { kind: 'pan', lx: mx, ly: my }; return; }
  if (e.button !== 0) return;
  if (state.mode === 'source') {
    const s = makeSource(wx, wy, state.lastEq); state.sources.push(s);
    log(`Added source ${s.id} “${s.name}” ${lwBreakdown(s)} at ${coordText(wx, wy)}, ground RL ${fmt(ground(wx, wy), 2)}.`);
    setMode('select'); select('source', s.id); requestCompute(false); return;
  }
  if (state.mode === 'building' || state.mode === 'hoarding') {
    if (state.mode === 'building' && state.draft.length >= 3) {
      const [fx, fy] = w2s(state.draft[0][0], state.draft[0][1]);
      if (Math.hypot(fx - mx, fy - my) <= 10) { finishDraft(); return; }
    }
    state.draft.push([wx, wy]); updateDraftButtons(); requestRender(); return;
  }
  const s = hitSource(mx, my);
  if (s) { select('source', s.id); drag = { kind: 'source', obj: s, ox: wx - s.x, oy: wy - s.y, moved: false }; return; }
  const ho = hitHoarding(wx, wy);
  if (ho) { select('hoarding', ho.id); drag = { kind: 'poly', type: 'hoarding', obj: ho, lx: wx, ly: wy, moved: false }; return; }
  const b = buildingAt(wx, wy);
  if (b) { select('building', b.id); drag = { kind: 'poly', type: 'building', obj: b, lx: wx, ly: wy, moved: false }; return; }
  if (state.sel) select(null);
  drag = { kind: 'pan', lx: mx, ly: my };
});
canvas.addEventListener('pointermove', e => {
  const [mx, my] = mousePos(e), [wx, wy] = s2w(mx, my);
  state.mouse = { x: mx, y: my };
  if (drag) {
    const v = state.view;
    if (drag.kind === 'pan') { v.cx -= (mx - drag.lx) / v.scale; v.cy += (my - drag.ly) / v.scale; drag.lx = mx; drag.ly = my; requestCompute(true); return; }
    if (drag.kind === 'source') { drag.obj.x = wx - drag.ox; drag.obj.y = wy - drag.oy; drag.moved = true; requestCompute(true); return; }
    if (drag.kind === 'poly') {
      const dx = wx - drag.lx, dy = wy - drag.ly;
      for (const p of drag.obj.pts) { p[0] += dx; p[1] += dy; }
      drag.obj.bbox = bboxOf(drag.obj.pts); drag.lx = wx; drag.ly = wy; drag.moved = true;
      if (drag.type === 'building') geomChanged();
      requestCompute(true); return;
    }
  }
  requestRender();
});
function endDrag() {
  if (!drag) return;
  if (drag.moved && drag.kind === 'source') { log(`Moved “${drag.obj.name}” to ${coordText(drag.obj.x, drag.obj.y)}.`); renderSelPanel(); }
  if (drag.moved && drag.kind === 'poly') {
    if (drag.type === 'building') { updateBase(drag.obj); geomChanged(); }
    log(`Moved “${drag.obj.name}”.`); renderSelPanel();
  }
  drag = null; requestCompute(false);
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => { if (!drag) { state.mouse = null; $('hud').textContent = '–'; requestRender(); } });
canvas.addEventListener('dblclick', e => {
  e.preventDefault();
  if (state.mode === 'building' && state.draft.length >= 3) finishDraft();
  if (state.mode === 'hoarding' && state.draft.length >= 2) finishDraft();
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const [mx, my] = mousePos(e), before = s2w(mx, my), v = state.view;
  v.scale = Math.min(60, Math.max(0.02, v.scale * Math.exp(-e.deltaY * 0.0015)));
  v.cx = before[0] - (mx - cssW / 2) / v.scale; v.cy = before[1] + (my - cssH / 2) / v.scale;
  requestCompute(true);
}, { passive: false });
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;   // leave browser shortcuts (Ctrl+S, Ctrl+V …) alone
  const k = e.key.toLowerCase();
  if (k === 'v') setMode('select'); else if (k === 's') setMode('source'); else if (k === 'b') setMode('building'); else if (k === 'h') setMode('hoarding');
  else if (k === 'escape') { if (state.draft.length) cancelDraft(); else select(null); }
  else if (k === 'enter' && (state.mode === 'building' || state.mode === 'hoarding')) finishDraft();
  else if (k === 'delete' || k === 'backspace') { if (state.sel) { e.preventDefault(); deleteSel(); } }
});

