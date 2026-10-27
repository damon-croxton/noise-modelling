/* ===================== TfNSW ESTIMATOR PLANT COMBINATION =================== */
/* Level of one estimator row (Step 2, column G): qty items of sound power
   lw (already including any +5 dB special-audible correction), less 3 dB if
   used intermittently and 5 dB if locally screened. */
function estimatorRowLevel(lw, qty, intermittent, screened) {
  if (!(qty > 0)) return 0;
  return 10 * Math.log10(qty * Math.pow(10, lw / 10)) - (intermittent ? 3 : 0) - (screened ? 5 : 0);
}
/* The estimator's "realistic worst case" (Step 2, cell C14). rows: [{ G, qty }]
   in sheet order. It sums the loudest one, two or three rows:
   – loudest row has 3 or more items and is 5 dB or more above the next: that row only;
   – loudest row has 2 items, or 3+ items within 5 dB of the next: the top two rows;
   – otherwise, if the second row has 2 or more items: the top two rows;
   – otherwise the top three rows.
   As in the spreadsheet, unused rows count as 0 dB in the ranking and the sum
   (adds well under 0.1 dB), and ties look up the first row with that level.
   Returns { swl, n (rows summed), used (row indices) }. */
function estimatorCombine(rows) {
  if (!rows.length) return { swl: null, n: 0, used: [] };
  const G = rows.map(r => r.G), ranked = G.map((g, i) => i).sort((a, b) => G[b] - G[a] || a - b);
  const top = [0, 1, 2].map(k => (k < ranked.length ? G[ranked[k]] : 0));
  const qtyOf = v => { const k = G.indexOf(v); return k >= 0 ? rows[k].qty : 0; };
  const g18 = qtyOf(top[0]), g19 = qtyOf(top[1]), f18 = top[0] - top[1];
  let n;
  if (g18 >= 3 && f18 >= 5) n = 1;
  else if (g18 === 2 || (g18 >= 3 && f18 < 5)) n = 2;
  else if (g19 >= 2) n = 2;
  else n = 3;
  const swl = 10 * Math.log10(top.slice(0, n).reduce((a, v) => a + Math.pow(10, v / 10), 0));
  return { swl, n, used: ranked.slice(0, n) };
}

/* Group placed sources into estimator rows: identical plant (same library item,
   level and corrections) becomes one row with a quantity. */
function sourceGroups(sources) {
  const map = new Map();
  for (const s of sources) {
    const key = [s.eq, s.lw, s.on, s.pen, s.mit].join('|');
    if (!map.has(key)) map.set(key, { key, items: [], lw: effectiveLw(s) });
    map.get(key).items.push(s);
  }
  return [...map.values()].map(g => Object.assign(g, { qty: g.items.length, G: estimatorRowLevel(g.lw, g.items.length, false, false) }));
}
/* Sources that count in the prediction. 'all' (default, conservative): every
   placed source. 'estimator': only the plant the TfNSW estimator's realistic
   worst-case rule keeps (the loudest one to three rows). */
let activeCache = { sig: '', list: null, excluded: [] };
function activeSources() {
  if (state.settings.combine !== 'estimator') return state.sources;
  const sig = state.sources.map(s => [s.id, s.eq, s.lw, s.on, s.pen, s.mit].join(':')).join(',');
  if (activeCache.sig === sig && activeCache.list) return activeCache.list;
  const groups = sourceGroups(state.sources), c = estimatorCombine(groups);
  const keep = new Set(); c.used.forEach(i => groups[i].items.forEach(s => keep.add(s)));
  activeCache = { sig, list: state.sources.filter(s => keep.has(s)), excluded: state.sources.filter(s => !keep.has(s)) };
  if (activeCache.excluded.length) log(`Plant combination (TfNSW estimator rule): ${c.n} loudest plant row(s) kept, total ${fmt(c.swl, 1)} dB(A); excluded: ${activeCache.excluded.map(s => s.name).join(', ')}.`, 'warn');
  return activeCache.list;
}
function isExcluded(s) { return state.settings.combine === 'estimator' && !activeSources().includes(s); }
/* The estimator's distance-based level (Step 3): total SWL, distance r (m),
   whole-site screening (0, 5, 10 or 15 dB), soft-ground fraction, season
   ('warm' Oct–Apr / 'cool' May–Sep) and night (true for Period 2 night air).
   Same terms as the TfNSW method in contrib(), with a fixed screening value. */
function estimatorLevel(swl, r, screening, soft, season, night) {
  const air = airAlpha({ season, period: night ? 'p2night' : 'std' }) * r / 1000;
  return swl - 20 * Math.log10(r) - 8 - air - screening - groundUnderScreening(soft * concaweGround(r), screening);
}
