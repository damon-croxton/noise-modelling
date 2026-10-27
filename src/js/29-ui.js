/* ================================ LAYOUT =============================== */
/* The panels are built from the cards in #cards. A layout says which card
   goes where; switching layout moves the same elements (and their event
   handlers), so nothing is rebuilt. */
const LAYOUTS = {
  workspace: {
    label: 'Workspace',
    left: ['card-shifts', 'card-plant', 'card-selection'],
    right: {
      Results: ['card-results', 'card-report', 'card-mapdisplay', 'card-calibration'],
      Site: ['card-site', 'card-dem', 'card-lidar', 'card-ncas', 'card-landuse'],
      Method: ['card-model', 'card-assess', 'card-rules', 'card-library', 'card-about']
    }
  },
  guided: {
    label: 'Guided',
    steps: {
      '1 Site': ['card-site', 'card-dem', 'card-lidar', 'card-ncas', 'card-landuse'],
      '2 Shifts': ['card-shifts', 'card-plant', 'card-library'],
      '3 Method': ['card-model', 'card-assess', 'card-rules'],
      '4 Results': ['card-results', 'card-mapdisplay', 'card-calibration'],
      '5 Report': ['card-report', 'card-about']
    },
    pinned: 'card-selection'
  },
  single: {
    label: 'Single column',
    left: ['card-shifts', 'card-plant', 'card-selection', 'card-results', 'card-report', 'card-site', 'card-dem', 'card-lidar', 'card-ncas', 'card-landuse',
      'card-model', 'card-assess', 'card-rules', 'card-library', 'card-mapdisplay', 'card-calibration', 'card-about']
  }
};
const BOTTOM = { 'Data sources': ['card-sources'], Log: ['card-log'] };
const appEl = $('app');

/* card headings (click to fold) */
document.querySelectorAll('#cards .card').forEach(c => {
  const h = document.createElement('h2'); h.textContent = c.dataset.title; h.title = 'Click to fold or unfold';
  c.prepend(h);
  if (UI.collapsed.includes(c.id)) c.classList.add('collapsed');
  h.addEventListener('click', () => {
    c.classList.toggle('collapsed');
    UI.collapsed = [...document.querySelectorAll('.card.collapsed')].map(x => x.id); savePrefs();
  });
});
const card = id => $(id);

/* Tab strip: groups = { label: [card ids] }; shows one group at a time. */
function buildTabs(tabsEl, slotEl, groups, active, onPick) {
  tabsEl.innerHTML = ''; slotEl.innerHTML = '';
  const names = Object.keys(groups), cur = names.includes(active) ? active : names[0], panes = {};
  for (const name of names) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = name; b.dataset.tab = name;
    b.classList.toggle('on', name === cur); tabsEl.appendChild(b);
    const pane = document.createElement('div'); pane.className = 'pane'; pane.hidden = name !== cur; panes[name] = pane;
    for (const id of groups[name]) pane.appendChild(card(id));
    slotEl.appendChild(pane);
    b.addEventListener('click', () => {
      tabsEl.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      for (const n of names) panes[n].hidden = n !== name;
      slotEl.scrollTop = 0; onPick(name);
    });
  }
  return cur;
}
function applyLayout() {
  const Lo = LAYOUTS[UI.layout] || LAYOUTS.workspace, hold = $('cards');
  document.querySelectorAll('.card').forEach(c => hold.appendChild(c));
  ['slotLeft', 'slotRight', 'steps', 'rtabs'].forEach(id => { $(id).innerHTML = ''; });
  appEl.classList.remove('layout-workspace', 'layout-guided', 'layout-single'); appEl.classList.add('layout-' + UI.layout);
  $('steps').hidden = !Lo.steps; $('stepNav').hidden = !Lo.steps;
  if (Lo.left) for (const id of Lo.left) $('slotLeft').appendChild(card(id));
  if (Lo.steps) {
    const names = Object.keys(Lo.steps);
    UI.step = Math.min(Math.max(0, UI.step | 0), names.length - 1);
    const pin = card(Lo.pinned);
    buildTabs($('steps'), $('slotLeft'), Lo.steps, names[UI.step], name => { UI.step = names.indexOf(name); savePrefs(); updateStepNav(); });
    $('slotLeft').prepend(pin);
    updateStepNav();
  }
  if (Lo.right) buildTabs($('rtabs'), $('slotRight'), Lo.right, UI.rtab, name => { UI.rtab = name; savePrefs(); });
  buildTabs($('btabs'), $('slotBottom'), BOTTOM, UI.btab, name => { UI.btab = name; savePrefs(); if (!UI.bottom) toggleBottom(true); });
  syncPinnedSelection(); applyPanels();
}
function updateStepNav() {
  const names = Object.keys(LAYOUTS.guided.steps);
  $('stepBack').disabled = UI.step <= 0; $('stepNext').disabled = UI.step >= names.length - 1;
  $('stepNext').textContent = UI.step < names.length - 1 ? `Next: ${names[UI.step + 1].replace(/^\d+ /, '')} →` : 'Next →';
}
function gotoStep(i) { const b = $('steps').querySelectorAll('button')[i]; if (b) b.click(); }
$('stepBack').addEventListener('click', () => gotoStep(UI.step - 1));
$('stepNext').addEventListener('click', () => gotoStep(UI.step + 1));
/* In the guided layout the Selected card shows above the step only while something is selected. */
function syncPinnedSelection() { card('card-selection').hidden = UI.layout === 'guided' && !state.sel; }

/* panels, theme, density, help, focus */
function applyPanels() {
  const Lo = LAYOUTS[UI.layout] || LAYOUTS.workspace;
  appEl.classList.toggle('noleft', !UI.left); appEl.classList.toggle('noright', !UI.right || !Lo.right);
  $('bottom').classList.toggle('closed', !UI.bottom); $('toggleBottom').textContent = UI.bottom ? '▾' : '▴';
  appEl.classList.toggle('app-focus', UI.focus); $('btnFocus').classList.toggle('on', UI.focus);
  $('showLeft').hidden = UI.left || UI.focus; $('showRight').hidden = UI.right || UI.focus || !Lo.right;
  appEl.classList.toggle('nohelp', !UI.help);
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark', 'theme-contrast'); root.classList.add('theme-' + UI.theme);
  root.classList.toggle('density-compact', UI.compact);
  MT = MAPTHEME[UI.theme] || MAPTHEME.light;
  $('probeBox').hidden = !UI.layers.probe; $('probeBox').classList.toggle('min', UI.probeMin); $('probeMin').textContent = UI.probeMin ? '+' : '–';
  $('banner').hidden = !UI.layers.banner;
  syncViewMenu(); buildLegend(); requestRender();
}
function syncViewMenu() {
  document.querySelectorAll('input[name=uiLayout]').forEach(r => { r.checked = r.value === UI.layout; });
  document.querySelectorAll('input[name=uiTheme]').forEach(r => { r.checked = r.value === UI.theme; });
  $('uiCompact').checked = UI.compact; $('uiHelp').checked = UI.help;
  $('uiLeft').checked = UI.left; $('uiRight').checked = UI.right; $('uiBottom').checked = UI.bottom;
  for (const [id, k] of LAYER_IDS) $(id).checked = UI.layers[k];
}
function setFocus(on) { UI.focus = on; savePrefs(); applyPanels(); log(on ? 'Focus: map only – press F or Esc to bring the panels back.' : 'Panels shown.'); }
function toggleBottom(open) { UI.bottom = open == null ? !UI.bottom : open; savePrefs(); applyPanels(); }
document.querySelectorAll('input[name=uiLayout]').forEach(r => r.addEventListener('change', () => { UI.layout = r.value; savePrefs(); applyLayout(); log(`Layout: ${LAYOUTS[UI.layout].label}.`); }));
document.querySelectorAll('input[name=uiTheme]').forEach(r => r.addEventListener('change', () => { UI.theme = r.value; savePrefs(); applyPanels(); }));
$('uiCompact').addEventListener('change', e => { UI.compact = e.target.checked; savePrefs(); applyPanels(); });
$('uiHelp').addEventListener('change', e => { UI.help = e.target.checked; savePrefs(); applyPanels(); });
$('uiLeft').addEventListener('change', e => { UI.left = e.target.checked; savePrefs(); applyPanels(); });
$('uiRight').addEventListener('change', e => { UI.right = e.target.checked; savePrefs(); applyPanels(); });
$('uiBottom').addEventListener('change', e => toggleBottom(e.target.checked));
$('hideLeft').addEventListener('click', () => { UI.left = false; savePrefs(); applyPanels(); });
$('hideRight').addEventListener('click', () => { UI.right = false; savePrefs(); applyPanels(); });
$('showLeft').addEventListener('click', () => { UI.left = true; savePrefs(); applyPanels(); });
$('showRight').addEventListener('click', () => { UI.right = true; savePrefs(); applyPanels(); });
$('toggleBottom').addEventListener('click', () => toggleBottom());
$('btnFocus').addEventListener('click', () => setFocus(!UI.focus));
$('probeMin').addEventListener('click', () => { UI.probeMin = !UI.probeMin; savePrefs(); applyPanels(); });

/* map layers */
const LAYER_IDS = [['lyOsm', 'osm'], ['lyHeat', 'heat'], ['lyImpact', 'impact'], ['lyBLabels', 'blabels'], ['lySLabels', 'slabels'], ['lyNcas', 'ncas'], ['lyHoard', 'hoard'], ['lyPaths', 'paths'], ['lyLegend', 'legend'], ['lyProbe', 'probe'], ['lyBanner', 'banner']];
for (const [id, k] of LAYER_IDS) $(id).addEventListener('change', e => { UI.layers[k] = e.target.checked; savePrefs(); applyPanels(); });
function setLayers(on, keys) { for (const k of keys || Object.keys(UI.layers)) UI.layers[k] = on; savePrefs(); applyPanels(); }

/* drop-down menus */
function closeMenus(except) { document.querySelectorAll('.pop').forEach(p => { if (p !== except) p.hidden = true; }); }
document.querySelectorAll('.menubtn').forEach(b => b.addEventListener('click', e => {
  const pop = $(b.dataset.menu); e.stopPropagation(); closeMenus(pop); pop.hidden = !pop.hidden;
}));
document.addEventListener('click', e => { if (!e.target.closest('.pop')) closeMenus(); });
document.querySelectorAll('.pop').forEach(p => p.addEventListener('click', e => { if (e.target.closest('button')) closeMenus(); }));
$('mGeo').addEventListener('click', () => $('fileGeo').click());

/* Clear menu */
const ask = msg => window.confirm(msg);
$('clrSel').addEventListener('click', () => { if (state.draft.length) cancelDraft(); setMode('select'); select(null); });
$('clrOverlays').addEventListener('click', () => { setLayers(false, ['heat', 'impact', 'blabels', 'slabels', 'paths', 'legend']); log('Map overlays hidden (heat map, impact colours, labels, paths, legend). View → Map layers turns them back on.'); });
$('clrShowAll').addEventListener('click', () => { setLayers(true); log('All map layers shown.'); });
$('btnFocus2').addEventListener('click', () => setFocus(true));
$('clrPlant').addEventListener('click', () => {
  const n = state.sources.length; if (!n || !ask(`Delete all ${n} plant item(s) in “${curShift().name}”?`)) return;
  state.sources = []; activeCache.sig = ''; select(null); log(`Deleted ${n} plant item(s) from “${curShift().name}”.`); renderShiftPanel(); requestCompute(false);
});
$('clrResults').addEventListener('click', () => {
  if (!ask('Forget the results of every shift? They can be run again.')) return;
  state.shifts.forEach(s => { s.results = null; }); state.assess.results = null; state.respite = null;
  log('Results cleared for all shifts.'); renderAssessPanel(); renderShiftPanel(); renderSelPanel(); requestRender();
});
$('clrHoard').addEventListener('click', () => {
  const n = state.hoardings.length; if (!n || !ask(`Delete all ${n} hoarding line(s)?`)) return;
  state.hoardings = []; geomChanged(); select(null); log(`Deleted ${n} hoarding line(s).`); requestCompute(false);
});
$('clrNcas').addEventListener('click', () => {
  const n = state.ncas.length; if (!n || !ask(`Delete all ${n} NCA(s)? Buildings will use the default noise area.`)) return;
  state.ncas = []; select(null); refreshBulkSelects(); log(`Deleted ${n} NCA(s).`); renderAssessPanel(); requestCompute(false);
});
$('clrDsm').addEventListener('click', () => {
  if (!state.dsm) { log('No LiDAR or DSM grid is loaded.'); return; }
  state.dsm = null; log('LiDAR / DSM grid removed (building heights already applied are kept).'); requestRender();
});
$('clrLog').addEventListener('click', () => { $('log').innerHTML = ''; log('Log cleared.'); });
$('clrAll').addEventListener('click', () => {
  if (!ask('Start an empty project? This removes every shift and its plant, all buildings, hoarding, NCAs, terrain, LiDAR and data sources. Model settings and the equipment library are kept.\n\nSave the project first if you need it.')) return;
  newProject(); log('New empty project.'); zoomExtents();
});
/* Empty project: one empty shift, no geometry, terrain, data sources or location. */
function newProject(keepOrigin) {
  state.sources = []; state.buildings = []; state.hoardings = []; state.ncas = []; state.terrain = null; state.dsm = null; state.calib = null;
  if (!keepOrigin) state.origin = null;
  state.provenance = []; state.project = { name: '', by: '' }; state.assess.results = null; state.example = null;
  resetShifts('Shift 1'); geomChanged(); select(null); setMode('select');
  updateDemInfo(); renderCalPanel(); syncAssessUI(); syncSettingsUI(); renderShiftPanel(true); updateSiteInfo();
  $('attrib').hidden = true;
}
/* What the app shows when it opens (File menu). */
function startScene() {
  if (['corridor', 'street', 'setback'].includes(UI.start)) buildReferenceExample(UI.start);
  else if (UI.start === 'empty') { newProject(); log('Empty project.'); }
  else loadDemo();
}
$('uiStart').value = UI.start;
$('uiStart').addEventListener('change', e => { UI.start = e.target.value; savePrefs(); log(`On start-up: ${e.target.options[e.target.selectedIndex].text}.`); });
$('uiStart').addEventListener('click', e => e.stopPropagation());

/* quick guide */
function openGuide(on) { $('guide').hidden = !on; if (on) $('guideClose').focus(); }
$('btnHelp').addEventListener('click', () => openGuide(true));
$('guideClose').addEventListener('click', () => openGuide(false));
$('guide').addEventListener('click', e => { if (e.target === $('guide')) openGuide(false); });

/* keys: F focus, Esc closes guide / menus / focus (other keys in 22-interaction) */
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (e.key === 'Escape') { if (!$('guide').hidden) { openGuide(false); return; } closeMenus(); if (UI.focus && !state.draft.length && !state.sel) setFocus(false); return; }
  if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.toLowerCase() === 'f') setFocus(!UI.focus);
  else if (e.key === '?') openGuide(true);
});

/* buttons that do the same as another one */
$('plAdd').addEventListener('click', () => setMode('source'));
$('ncaDraw').addEventListener('click', () => setMode('nca'));
$('btnCsvCard').addEventListener('click', () => $('btnCsv').click());
$('btnSaveCard').addEventListener('click', () => $('btnSave').click());
$('runState').addEventListener('click', guarded('Run', () => runAssessment()));

/* ---- status button, banner ---- */
function updateRunState() {
  const A = state.assess, R = A.results, b = $('runState');
  const st = A.running ? 'busy' : !R ? 'none' : assessStale() ? 'stale' : 'ok';
  b.className = 'pill ' + st;
  b.textContent = { busy: 'Running…', none: 'Not run – click to run', stale: 'Out of date – click to run', ok: '✓ Results up to date' }[st];
  renderShiftChips();
  b.title = { busy: 'The assessment is running', none: 'No results for this shift yet – click to run the assessment', stale: 'The inputs have changed since the last run – click to run again', ok: `Results match the inputs (run ${R ? new Date(R.at).toLocaleTimeString() : ''}) – click to run again` }[st];
  updateBanner(st);
}
function updateBanner(st) {
  const sh = state.shifts.find(s => s.id === state.shiftId) || { name: 'Shift 1', period: state.settings.period, dates: [] };
  const el = $('banner'), n = state.sources.length;
  el.style.setProperty('--pc', PERIOD_COLOR[state.settings.period]);
  el.innerHTML = `Shift: <b>${esc(sh.name)}</b> · ${esc(PERIODS[state.settings.period])} · ${n} plant item${n === 1 ? '' : 's'}${sh.dates && sh.dates.length ? ` · ${sh.dates.length} date(s)` : ''}` +
    (state.shifts.length > 1 ? ` <span class="muted">(${state.shifts.indexOf(sh) + 1} of ${state.shifts.length})</span>` : '') +
    ` · <span style="color:var(--${st === 'ok' ? 'ok' : st === 'stale' ? 'stale' : 'none'})">${{ busy: 'running…', none: 'not run', stale: 'out of date', ok: 'up to date' }[st || 'none']}</span>`;
}

/* ---- plant list (current shift) ---- */
let plantSig = '';
function syncPlantList() {
  const sel = state.sel && state.sel.type === 'source' ? state.sel.id : null, excl = state.settings.combine === 'estimator' ? activeSources() : null;
  const sig = state.shiftId + '|' + sel + '|' + state.settings.combine + '|' + state.sources.map(s => [s.id, s.name, s.eq, s.lw, s.on, s.pen, s.mit].join(':')).join(',');
  if (sig === plantSig) return;
  plantSig = sig; renderShiftChips();
  const el = $('plantList');
  if (!state.sources.length) { el.innerHTML = '<p class="kv muted">No plant in this shift yet. Click <b>+ Add plant on the map</b>, then click where it will work.</p>'; return; }
  const tot = 10 * Math.log10((excl || state.sources).reduce((a, s) => a + Math.pow(10, effectiveLw(s) / 10), 0));
  el.innerHTML = `<table><thead><tr><th>Plant</th><th title="Effective sound power: Lw + 10·lg(% on) + penalty − mitigation">L<sub>w,eff</sub></th><th title="% of 15 minutes operating">On</th><th></th></tr></thead><tbody>` +
    state.sources.map(s => `<tr data-id="${s.id}" class="${s.id === sel ? 'sel' : ''}${excl && !excl.includes(s) ? ' excl' : ''}" title="${esc(libItem(s.eq).name)}${excl && !excl.includes(s) ? ' – not in the realistic worst case' : ''}"><td>${esc(s.name)}${overMax(s) != null ? ' ⚠' : ''}</td><td class="n">${fmt(effectiveLw(s), 1)}</td><td class="n">${fmt(s.on, 0)} %</td><td><button type="button" class="x" data-del="${s.id}" title="Delete this plant item">×</button></td></tr>`).join('') +
    `</tbody></table><p class="kv muted">${state.sources.length} item(s) · total ${fmt(tot, 1)} dB(A)${excl ? ' (loudest rows only)' : ''}</p>`;
  el.querySelectorAll('tbody tr').forEach(tr => tr.addEventListener('click', e => {
    const id = +tr.dataset.id;
    if (e.target.closest('[data-del]')) { const s = state.sources.find(x => x.id === id); state.sources = state.sources.filter(x => x.id !== id); if (state.sel && state.sel.id === id) select(null); log(`Deleted plant “${s ? s.name : id}”.`); renderShiftPanel(); requestCompute(false); return; }
    const s = state.sources.find(x => x.id === id); if (!s) return;
    const [sx, sy] = w2s(s.x, s.y); if (sx < 0 || sy < 0 || sx > cssW || sy > cssH) { state.view.cx = s.x; state.view.cy = s.y; requestCompute(false); }
    setMode('select'); select('source', id);
  }));
}

/* ---- site steps: tick off what has been done ---- */
function updateSiteSteps() {
  const real = !!(state.origin && state.origin.zone), osm = state.buildings.some(b => b.osmId), P = state.provenance;
  const done = { site: real || $('siteLL').value.trim() !== '', go: real, osm, dem: !!state.terrain, lidar: P.some(p => /LiDAR|DSM/.test(p.kind)) };
  document.querySelectorAll('#card-site li[data-step]').forEach(li => li.classList.toggle('done', !!done[li.dataset.step]));
  const next = ['site', 'go', 'osm'].find(k => !done[k]);
  document.querySelectorAll('#card-site li[data-step]').forEach(li => li.classList.toggle('next', li.dataset.step === next));
  $('exampleNote').hidden = !state.example;
}
$('siteLL').addEventListener('input', () => updateSiteSteps());

/* ---- data sources ---- */
function renderSources() {
  updateSiteSteps();
  const P = state.provenance;
  $('provList').innerHTML = (P.length ? `<table><thead><tr><th>Data</th><th>Source</th><th>Details</th><th>File date</th><th>Loaded</th></tr></thead><tbody>${P.map(p => `<tr><td>${esc(p.kind)}</td><td>${esc(p.name)}</td><td>${esc(p.detail)}</td><td>${p.fileDate ? esc(p.fileDate.slice(0, 10)) : '–'}</td><td>${p.loaded ? esc(p.loaded.slice(0, 16).replace('T', ' ')) : '–'}</td></tr>`).join('')}</tbody></table>`
    : '<p class="kv muted">No external data loaded yet – buildings, NCAs and terrain drawn or entered here. Loaded files (DEM, LiDAR, DSM, OSM, GeoJSON, NCAs) are listed here with their dates and go into the report.</p>') +
    `<p class="kv muted">Plant: equipment library (${state.libraryEdited ? 'project library' : 'CNVG-PTI Table 19 and the TfNSW estimator list'}). Rules: ${esc(RULES.name)}. Terrain and LiDAR are not saved in the project file – reload them after opening it.</p>`;
}

/* Make an element reachable: open its menu, switch to its tab, unfold its card, show its panel. */
function revealEl(target) {
  const el = typeof target === 'string' ? document.querySelector(target) : target; if (!el) return false;
  const pop = el.closest('.pop'); if (pop && pop.hidden) { closeMenus(pop); pop.hidden = false; }
  const pane = el.closest('.pane');
  if (pane && pane.hidden) { const slot = pane.parentElement, i = [...slot.children].filter(c => c.classList.contains('pane')).indexOf(pane), tabs = slot.previousElementSibling && slot.previousElementSibling.classList.contains('paneltabs') ? slot.previousElementSibling : slot.parentElement.querySelector('.paneltabs'); const b = tabs && tabs.querySelectorAll('button')[i]; if (b) b.click(); }
  const c = el.closest('.card'); if (c && c.classList.contains('collapsed') && el !== c.firstElementChild) c.classList.remove('collapsed');
  if (c && c.hidden && c.id === 'card-selection') c.hidden = false;
  const panel = el.closest('#left, #right, #bottom');
  if (panel && (UI.focus || (panel.id === 'left' && !UI.left) || (panel.id === 'right' && !UI.right) || (panel.id === 'bottom' && !UI.bottom))) {
    UI.focus = false; if (panel.id === 'left') UI.left = true; if (panel.id === 'right') UI.right = true; if (panel.id === 'bottom') UI.bottom = true; applyPanels();
  }
  return true;
}

applyLayout();
