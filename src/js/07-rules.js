/* =========================== ASSESSMENT RULES ========================== */
/* Rules come from src/data/rules.json (TfNSW CNVG-PTI defaults) and can be
   exported, edited and re-imported, so project-specific strategies don't need
   a code change. Nothing here claims compliance with a particular edition. */
const clone = o => JSON.parse(JSON.stringify(o));
/* Overlay rule files ("extends") are deep-merged over their base; arrays replace. */
function mergeRules(base, over) {
  const out = clone(base);
  for (const [k, v] of Object.entries(over)) {
    if (k === 'extends') continue;
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) ? mergeRules(out[k], v) : clone(v);
  }
  return out;
}
const RULESETS = {
  cnvg: { label: 'CNVG-PTI v4.6 Table 9 (guideline)', rules: DATA.rules },
  estimator: { label: 'TfNSW estimator Step 4 (spreadsheet)', rules: mergeRules(DATA.rules, DATA['rules-estimator']) }
};
let RULES = clone(DATA.rules);
function setRuleSet(key) {
  RULES = clone(RULESETS[key].rules); state.rulesSet = key; state.rulesEdited = false;
}

function landUseRule(lu) { return RULES.landUses[lu] || RULES.landUses[RULES.osmLandUse.unknown]; }
function landUseLabel(lu) { const L = RULES.landUses[lu]; return L ? L.label : lu; }

/* RBL for an NCA and RBL period ('day' | 'evening' | 'night'): a measured value
   where the NCA has one (raised to the minimum RBL), otherwise its category. */
function ncaRbl(nca, rp) {
  const m = nca && nca.rbl ? nca.rbl[rp] : null;
  if (m != null && isFinite(m)) {
    const floor = (RULES.measuredRblFloor || {})[rp] || 0;
    return m < floor ? { rbl: floor, src: `measured ${fmt(m, 0)}, raised to minimum ${floor}` } : { rbl: m, src: 'measured' };
  }
  const cat = RULES.noiseAreaCategories[nca && nca.cat] || RULES.noiseAreaCategories[DEFAULT_NCA_CAT];
  return { rbl: cat[rp], src: `category ${nca && RULES.noiseAreaCategories[nca.cat] ? nca.cat : DEFAULT_NCA_CAT}` };
}

/* Noise management level for a land use in an NCA and period.
   → { nml, basis } or { nml: null, reason } when not assessed. */
function nmlFor(lu, nca, period) {
  const L = landUseRule(lu), P = RULES.periods[period];
  if (!P) return { nml: null, reason: `no rules for period ${period}` };
  if (L.assess === false) return { nml: null, reason: 'not assessed' };
  if (L.periods && !L.periods.includes(period)) return { nml: null, reason: 'not in use in this period' };
  if (L.nml === 'rbl') {
    const r = ncaRbl(nca, P.rbl);
    return { nml: r.rbl + P.nmlAdd, basis: `${P.rbl} RBL ${fmt(r.rbl, 0)} (${r.src}) + ${P.nmlAdd}` };
  }
  if (typeof L.nml === 'number') return { nml: L.nml, basis: `${L.label}: ${L.nml} dBA external` };
  if (L.nml && isFinite(L.nml.internal)) {
    const f = RULES.facadeReduction;
    return { nml: L.nml.internal + f, basis: `${L.nml.internal} dBA internal + ${f} dB façade reduction` };
  }
  return { nml: null, reason: 'land use has no NML rule' };
}

/* Exceedance band and additional mitigation measures (CNVG-PTI Table 9 by
   default). Exceedance is rounded first, as reported in tables; a band applies
   above the previous limit and at or below its own. */
function classify(Leq, nml, period, lu) {
  const p = Math.pow(10, RULES.exceedanceDecimals || 0);
  const exc = Math.round((Leq - nml) * p) / p;
  let label = 'Below NML', impact = 'None', measures = [];
  if (exc > 0) {
    const set = RULES.bandSets[RULES.periods[period].bands] || [];
    const lower = RULES.boundary === 'lower';   // 'lower': band includes its lower limit (estimator); 'upper': its upper limit (guideline)
    const band = set.find(b => b.above == null || (lower ? exc < b.above : exc <= b.above)) || set[set.length - 1];
    if (band) { label = band.label; impact = band.impact || ''; measures = band.measures.slice(); }
  }
  const H = RULES.highlyAffected;
  let highly = false;
  if (H && H.periods.includes(period) && landUseRule(lu).nml === 'rbl' && Leq >= H.level) {
    highly = true;
    for (const m of H.measures) if (!measures.includes(m)) measures.push(m);
  }
  return { exc, label, impact, measures, highly };
}

/* Sleep disturbance screening (indicative): LAmax ≈ LAeq + offset. */
function sleepCheck(Leq, nca, lu, period) {
  const Sr = RULES.sleep;
  if (!Sr || !Sr.periods.includes(period) || !landUseRule(lu).sleep) return null;
  const r = ncaRbl(nca, 'night'), lmax = Leq + Sr.lmaxOffset, screen = Math.max(r.rbl, Sr.minRbl) + Sr.screeningAdd;
  return { lmax, screen, overScreen: lmax > screen, awakening: lmax >= Sr.awakening };
}

/* Light check of an imported rules file. Throws with a readable message. */
function validateRules(R) {
  const need = (c, msg) => { if (!c) throw new Error(msg); };
  need(R && typeof R === 'object', 'not a JSON object');
  for (const k of Object.keys(PERIODS)) {
    const P = R.periods && R.periods[k];
    need(P && ['day', 'evening', 'night'].includes(P.rbl) && isFinite(P.nmlAdd), `periods.${k} missing or invalid`);
    need(Array.isArray(R.bandSets && R.bandSets[P.bands]), `bandSets.${P.bands} (used by ${k}) missing`);
  }
  need(R.landUses && Object.keys(R.landUses).length, 'landUses missing');
  need(R.noiseAreaCategories && R.noiseAreaCategories[DEFAULT_NCA_CAT], `noiseAreaCategories must include ${DEFAULT_NCA_CAT}`);
  need(R.osmLandUse && R.landUses[R.osmLandUse.unknown], 'osmLandUse.unknown must name a land use');
  if (R.respite != null) {
    need(typeof R.respite.trigger === 'string' && R.respite.kinds && typeof R.respite.kinds === 'object', 'respite needs a trigger and kinds');
    for (const [k, K] of Object.entries(R.respite.kinds))
      need(Array.isArray(K.periods) && K.periods.every(p => PERIODS[p]) && Number.isInteger(K.maxConsecutive) && K.maxConsecutive >= 1 && Number.isInteger(K.minBreak) && K.minBreak >= 0, `respite.kinds.${k} invalid`);
  }
  return R;
}
function categoryColor(label) { return (RULES.categoryStyle || {})[label] || '#9ca3af'; }
/* Short description of an NCA's background levels, e.g. "R3" or "R2 · measured RBL night 36". */
function ncaSummary(n) {
  const r = n.rbl || {}, m = ['day', 'evening', 'night'].filter(k => r[k] != null && isFinite(r[k]));
  const cat = n.cat || DEFAULT_NCA_CAT;
  return m.length ? `${cat} · measured RBL ${m.map(k => `${k} ${fmt(r[k], 0)}`).join(', ')}` : cat;
}
