/* ===================== FAÇADE RECEIVERS AND ASSESSMENT ================== */
/* Receiver points along each exposed façade, `offset` m outside the wall and
   about `spacing` m apart (at least one per wall of 1 m or more). A point that
   lands inside another building is on a party wall and is skipped. */
function facadePoints(b, spacing, offset) {
  const P = b.pts, n = P.length;
  let a2 = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) a2 += P[j][0] * P[i][1] - P[i][0] * P[j][1];
  const sgn = a2 > 0 ? 1 : -1;            // anticlockwise: the outward normal of (dx, dy) is (dy, −dx)
  const pts = []; let party = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = P[j], c = P[i], dx = c[0] - a[0], dy = c[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 1) continue;
    const nx = sgn * dy / L, ny = -sgn * dx / L, k = Math.max(1, Math.round(L / spacing));
    for (let q = 0; q < k; q++) {
      const t = (q + 0.5) / k, x = a[0] + dx * t + nx * offset, y = a[1] + dy * t + ny * offset;
      if (buildingAt(x, y)) { party++; continue; }
      pts.push({ x, y, wall: j });
    }
  }
  return { pts, party };
}

/* Rank of a category label within the current period's band set (0 = below NML). */
function categoryRank(label, period) {
  if (label === 'Not assessed') return -1;
  if (label === 'Below NML') return 0;
  const set = RULES.bandSets[RULES.periods[period].bands] || [];
  const k = set.findIndex(b => b.label === label);
  return k < 0 ? 0 : k + 1;
}
function categoryList(period) {
  return [...new Set(['Below NML'].concat((RULES.bandSets[RULES.periods[period].bands] || []).map(b => b.label)))];
}

/* Compact fingerprint of everything the assessment depends on, used to tell
   when the results no longer match the scenario. */
function inputsSignature() {
  const S = state.settings, A = state.assess, r2 = v => Math.round(v * 100);
  let h = 5381;
  const add = v => { const s = String(v); for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; h = ((h * 33) ^ 124) >>> 0; };
  [S.method, S.soft, S.season, S.period, S.barCap, S.air, S.barriers, S.terrain, S.combine, S.lateral, S.reflect, S.reflLoss, S.bands, A.floorH, A.spacing, A.offset, JSON.stringify(A.defNca), RULES.id, state.rulesEdited ? JSON.stringify(RULES).length : 0, state.terrain ? state.terrain.name : ''].forEach(add);
  for (const s of state.sources) [r2(s.x), r2(s.y), s.h, s.lw, s.on, s.pen, s.mit, s.eq, JSON.stringify(s.spec || null)].forEach(add);
  for (const b of state.buildings) { [b.id, r2(b.h), r2(b.base), b.landUse, b.floors].forEach(add); for (const p of b.pts) { add(r2(p[0])); add(r2(p[1])); } }
  for (const ho of state.hoardings) { add(ho.h); for (const p of ho.pts) { add(r2(p[0])); add(r2(p[1])); } }
  for (const n of state.ncas) { [n.cat, JSON.stringify(n.rbl)].forEach(add); for (const p of n.pts) { add(r2(p[0])); add(r2(p[1])); } }
  return h;
}
function assessStale() { const R = state.assess.results; return !!R && R.sig !== inputsSignature(); }

/* Run the assessment for the current time period. For every assessed building
   and floor, the level is predicted at each exposed façade point and the worst
   point is reported. Points whose free-field upper bound (spreading only, no
   ground, air or screening losses) is already below the NML can't exceed it,
   so they are not calculated in full. */
async function runAssessment() {
  const A = state.assess, S = state.settings, period = S.period, B = state.buildings, srcs = activeSources();
  if (A.running) return null;
  if (!srcs.length) { log('Add at least one source before running the assessment.', 'warn'); return null; }
  if (!B.length) { log('There are no buildings to assess – fetch, import or draw them first.', 'warn'); return null; }
  A.running = true; updateAssessButtons();
  const t0 = performance.now();
  try {
    prep(srcs); idx();
    // largest possible gain over 20·lg d (ISO: hard-ground −6 dB Agr); with reflections, room for up to
    // nine first-order reflections each as strong as the direct path (10 dB) – real ones are weaker
    const K = (S.method === 'iso' ? 5 : 8) - (reflectionsOn(S) ? 10 : 0);
    const receivers = [], byBuilding = new Map();
    let nPts = 0, nExact = 0, nBound = 0, party = 0, noFacade = 0, skipped = 0, last = performance.now();
    for (let bi = 0; bi < B.length; bi++) {
      const b = B[bi], lu = luOf(b), nca = ncaOf(b), N = nmlFor(lu.lu, nca, period), fl = floorsOf(b);
      if (N.nml == null) { byBuilding.set(b.id, { worst: 'Not assessed', floors: fl.n, maxLeq: null, reason: N.reason }); skipped++; continue; }
      const fp = facadePoints(b, A.spacing, A.offset); party += fp.party;
      if (!fp.pts.length) { byBuilding.set(b.id, { worst: 'Not assessed', floors: fl.n, maxLeq: null, reason: 'no exposed façade' }); noFacade++; continue; }
      let worst = 'Below NML', worstRank = 0, maxLeq = null;
      for (let f = 0; f < fl.n; f++) {
        const z = b.base + 1.5 + f * A.floorH;
        let best = -Infinity, bestP = null, ubMax = -Infinity;
        for (const p of fp.pts) {
          nPts++;
          let ub = 0;
          for (const s of srcs) ub += Math.pow(10, (s._lw - 20 * Math.log10(Math.max(Math.hypot(p.x - s.x, p.y - s.y, z - s._z), 1)) - K) / 10);
          ub = 10 * Math.log10(ub);
          if (ub < N.nml) { nBound++; if (ub > ubMax) ubMax = ub; continue; }
          nExact++;
          const gr = ground(p.x, p.y);
          let e = 0;
          for (const s of srcs) e += Math.pow(10, contrib(s, p.x, p.y, S, B, false, gr, z) / 10);
          const L = 10 * Math.log10(e);
          if (L > best) { best = L; bestP = p; }
        }
        const Leq = best > -Infinity ? best : null;
        const c = Leq != null ? classify(Leq, N.nml, period, lu.lu) : { exc: null, label: 'Below NML', impact: 'None', measures: [], highly: false };
        const rec = {
          id: `B${b.id}-${floorLabel(f)}`, bId: b.id, floor: f, floorLabel: floorLabel(f), x: bestP ? bestP.x : null, y: bestP ? bestP.y : null, z,
          lu: lu.lu, luSrc: lu.src, nca: nca.name, nml: N.nml, nmlBasis: N.basis, Leq, ub: Leq == null ? ubMax : null,
          exc: c.exc, label: c.label, impact: c.impact, measures: c.measures, highly: c.highly,
          sleep: Leq != null ? sleepCheck(Leq, nca, lu.lu, period) : null, floorsSrc: fl.src
        };
        receivers.push(rec);
        const rk = categoryRank(c.label, period);
        if (rk > worstRank) { worstRank = rk; worst = c.label; }
        if (Leq != null && (maxLeq == null || Leq > maxLeq)) maxLeq = Leq;
      }
      byBuilding.set(b.id, { worst, floors: fl.n, maxLeq });
      if (performance.now() - last > 40) {
        $('busy').textContent = `Assessing… ${Math.round(100 * bi / B.length)} % (${bi.toLocaleString()} of ${B.length.toLocaleString()} buildings)`;
        await new Promise(r => setTimeout(r, 0)); last = performance.now();
      }
    }
    const ms = performance.now() - t0, above = receivers.filter(r => r.exc != null && r.exc > 0);
    A.results = {
      period, method: S.method, at: new Date().toISOString(), receivers, byBuilding, sig: inputsSignature(),
      stats: { buildings: B.length, assessed: B.length - skipped - noFacade, skipped, noFacade, receivers: receivers.length, points: nPts, exact: nExact, bound: nBound, party, above: above.length, ms }
    };
    $('busy').textContent = `Assessment: ${receivers.length.toLocaleString()} building-floors, ${above.length} above NML · ${(ms / 1000).toFixed(1)} s`;
    log(`Assessment (${PERIODS[period]}, ${S.method === 'iso' ? 'ISO 9613-2' : 'TfNSW estimator basis'}): ${B.length - skipped - noFacade} of ${B.length} buildings, ${receivers.length.toLocaleString()} building-floors, ` +
      `${nPts.toLocaleString()} façade points (${nExact.toLocaleString()} calculated, ${nBound.toLocaleString()} below NML on distance alone, ${party.toLocaleString()} on party walls skipped). ` +
      `${above.length} building-floor(s) above NML in ${new Set(above.map(r => r.bId)).size} building(s). ${(ms / 1000).toFixed(1)} s.`, 'pass');
    if (skipped) log(`${skipped} building(s) not assessed for this period (land use not assessed or not in use).`);
    if (noFacade) log(`${noFacade} building(s) have no exposed façade (all walls touch other buildings) – check footprints.`, 'warn');
    const assumed = B.filter(b => luOf(b).assumed).length;
    if (assumed) log(`${assumed} building(s) have an assumed land use (${landUseLabel(RULES.osmLandUse.unknown)}) – check them in the property table or set land use in bulk.`, 'warn');
    return A.results;
  } catch (err) {
    log(`Assessment FAILED: ${err.message}`, 'fail'); console.error(err);
    return null;
  } finally {
    A.running = false; updateAssessButtons(); renderAssessPanel(); renderSelPanel(); requestRender();
  }
}
