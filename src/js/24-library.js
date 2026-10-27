/* =========================== EQUIPMENT LIBRARY ========================= */
function libraryOptions(selId) {
  const groups = new Map();
  for (const e of LIBRARY) { if (!groups.has(e.group)) groups.set(e.group, []); groups.get(e.group).push(e); }
  let html = '';
  for (const [g, list] of groups) {
    html += `<optgroup label="${esc(g)}">` + list.map(e =>
      `<option value="${esc(e.id)}" ${e.id === selId ? 'selected' : ''}>${esc(e.name)}${e.id === 'custom' ? '' : ' – ' + fmt(e.lw, 0) + (e.sac ? ' +5' : '')}</option>`).join('') + '</optgroup>';
  }
  return html;
}
function updateLibInfo() {
  const n = LIBRARY.length, user = LIBRARY.filter(e => e.group === 'Project').length;
  $('libInfo').textContent = `${n} items${user ? ` (${user} project item${user > 1 ? 's' : ''})` : ''}. Sources: CNVG-PTI Appendix C Table 19 (maximum permissible levels) and the TfNSW Construction Noise Estimator plant list – verify against the current client strategy.`;
}
/* Store a source's settings as a 'Project' library item. */
function saveSourceToLibrary(o) {
  const id = 'prj-' + o.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  const base = libItem(o.eq), item = { id, name: o.name, lw: o.lw, sac: (o.pen || 0) > 0, group: 'Project' };
  if (o.spec) item.spec = o.spec;
  if (base && base.maxLw != null) item.maxLw = base.maxLw;
  const k = LIBRARY.findIndex(e => e.id === id);
  if (k >= 0) LIBRARY[k] = item; else LIBRARY.push(item);
  o.eq = id; state.libraryEdited = true;
  log(`Library: ${k >= 0 ? 'updated' : 'added'} project item “${o.name}” (Lw ${o.lw}).`, 'pass');
  updateLibInfo(); renderSelPanel();
}
/* Validate imported library items; returns the clean list or throws. */
function cleanLibrary(items) {
  if (!Array.isArray(items)) throw new Error('expected { "items": [...] }');
  const out = [], ids = new Set();
  for (const e of items) {
    const lw = num(e && e.lw, 40, 150);
    if (!e || typeof e.id !== 'string' || !e.id || typeof e.name !== 'string' || lw === null || ids.has(e.id)) { log(`Library item skipped: ${JSON.stringify(e).slice(0, 80)}`, 'warn'); continue; }
    ids.add(e.id);
    const it = { id: e.id.slice(0, 60), name: e.name.slice(0, 60), lw, sac: !!e.sac, group: typeof e.group === 'string' ? e.group.slice(0, 40) : 'Project' };
    const mx = num(e.maxLw, 40, 150); if (mx !== null) it.maxLw = mx;
    if (e.spec != null && validSpec(e.spec)) it.spec = Array.isArray(e.spec) ? e.spec.slice() : e.spec;
    out.push(it);
  }
  if (!out.some(e => e.id === 'custom')) out.push({ id: 'custom', name: 'Custom', lw: 100, sac: false, group: 'Custom' });
  return out;
}
$('btnLibExport').addEventListener('click', () => {
  download('equipment_library.json', JSON.stringify({ _about: DATA.equipment._about, exported: new Date().toISOString(), app: 'noise-poc ' + VERSION, items: LIBRARY }, null, 1));
  log(`Exported equipment library (${LIBRARY.length} items).`);
});
$('btnLibImport').addEventListener('click', () => $('fileLib').click());
readJSONFile($('fileLib'), (d, name) => {
  LIBRARY = cleanLibrary(d && d.items); state.libraryEdited = true;
  log(`Imported equipment library ${name}: ${LIBRARY.length} items.`, 'pass');
  const missing = state.sources.filter(s => !LIBRARY.some(e => e.id === s.eq));
  if (missing.length) log(`${missing.length} source(s) refer to items not in this library – they keep their own levels and show as Custom.`, 'warn');
  updateLibInfo(); renderSelPanel(); requestCompute(false);
});
$('btnLibReset').addEventListener('click', () => {
  LIBRARY = DATA.equipment.items.map(o => Object.assign({}, o)); state.libraryEdited = false;
  log('Equipment library reset to the built-in list.'); updateLibInfo(); renderSelPanel();
});
