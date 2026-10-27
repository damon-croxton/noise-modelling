/* Reference-case comparison (brief §4) on the synthetic inner-city scenes.
   This is a report, not a pass/fail calibration: the reference geometry is not
   known. The metrics are printed for docs/CALIBRATION.md; assertions only
   check that the runs complete and the floor-height pattern is present. */
'use strict';
const REF = { aboveNml: 59, levels: [46, 57], exceed: [5, 17], categories: 'mostly Low, two Medium', upperMinusGround: [2, 4] };

/* model configurations compared: TfNSW basis; ISO 9613-2 single band (with
   reflections, Auto); ISO 9613-2 in octave bands (generic spectra). */
const CONFIGS = {
  tfnsw: { method: 'tfnsw', bands: false, reflect: 'auto' },
  iso: { method: 'iso', bands: false, reflect: 'auto' },
  'iso-oct': { method: 'iso', bands: true, reflect: 'auto' }
};
async function metrics(page, variant, method, ruleSet, extra) {
  return page.evaluate(async ([v, m, rs, cfg]) => {
    const N = window.__noise;
    N.buildReferenceExample(v); Object.assign(N.state.settings, cfg); N._t.setRuleSet(rs);
    const R = await N.runAssessment(), byB = new Map(N.state.buildings.map(b => [b.id, b]));
    const above = R.receivers.filter(r => r.exc > 0), r1 = x => Math.round(x * 10) / 10;
    const impact = {}; above.forEach(r => { impact[r.impact] = (impact[r.impact] || 0) + 1; });
    const deltas = (prefix, first) => {
      const out = [];
      for (const b of N.state.buildings) {
        if (!b.name.startsWith(prefix)) continue;
        const near = Math.min(Math.abs(b.bbox[1]), Math.abs(b.bbox[3])) < ({ corridor: 20, street: 10, setback: 37 }[v] + 10);
        if (near !== first) continue;
        const fl = R.receivers.filter(r => r.bId === b.id && r.Leq != null).sort((a, c) => a.floor - c.floor);
        if (fl.length >= 2 && fl.some(r => r.exc > 0)) out.push(fl[fl.length - 1].Leq - fl[0].Leq);
      }
      if (!out.length) return null;
      return { n: out.length, mean: r1(out.reduce((a, b) => a + b, 0) / out.length), min: r1(Math.min(...out)), max: r1(Math.max(...out)) };
    };
    const measures = {}; above.forEach(r => r.measures.forEach(c => { measures[c] = (measures[c] || 0) + 1; }));
    return {
      variant: v, method: m, rules: rs, above: above.length, buildings: new Set(above.map(r => r.bId)).size,
      levels: above.length ? [r1(Math.min(...above.map(r => r.Leq))), r1(Math.max(...above.map(r => r.Leq)))] : null,
      exceed: above.length ? [Math.min(...above.map(r => r.exc)), Math.max(...above.map(r => r.exc))] : null,
      impact, measures, nmls: [...new Set(R.receivers.map(r => r.nml))].sort(),
      aptFirst: deltas('Apartments (6', true), aptSecond: deltas('Apartments (8', false), terrFirst: deltas('Terrace', true), terrSecond: deltas('Terrace', false),
      floors: R.stats.receivers, ms: Math.round(R.stats.ms)
    };
  }, [variant, method, ruleSet, Object.assign({}, CONFIGS[method], extra || {})]);
}
const fmtD = d => (d ? `${d.mean} (${d.min} to ${d.max}, n ${d.n})` : '–');

module.exports = [
  {
    name: 'synthetic inner-city scenes vs the reference case (printed report)',
    async run({ page, assert }) {
      console.log(`      reference: ${REF.aboveNml} above NML, ${REF.levels.join('–')} dBA, exceedance ${REF.exceed.join('–')} dB, ${REF.categories}, upper floors +${REF.upperMinusGround.join('–')} dB`);
      const all = [];
      for (const v of ['street', 'corridor', 'setback']) for (const m of Object.keys(CONFIGS)) for (const rs of ['cnvg', 'estimator']) {
        const r = await metrics(page, v, m, rs); all.push(r);
        console.log(`      ${v.padEnd(8)} ${m.padEnd(7)} ${rs.padEnd(9)} above ${String(r.above).padStart(3)} (${r.buildings} bldg) · ${r.levels ? r.levels.join('–') : '–'} dBA · exc ${r.exceed ? r.exceed.join('–') : '–'} · ` +
          `${Object.entries(r.impact).map(([k, n]) => `${k} ${n}`).join(', ')} · measures ${Object.entries(r.measures).sort().map(([k, n]) => `${k} ${n}`).join(' ')}`);
        if (rs === 'cnvg') console.log(`               top − ground: 6-storey 1st row ${fmtD(r.aptFirst)}; 8-storey 2nd row ${fmtD(r.aptSecond)}; terraces 1st ${fmtD(r.terrFirst)}, 2nd ${fmtD(r.terrSecond)} · NMLs ${r.nmls.join('/')} · ${r.floors} floors in ${r.ms} ms`);
      }
      // upper-floor pattern on line-of-sight façades (set-back scene) against % soft ground
      for (const m of ['iso', 'iso-oct']) for (const soft of [0.5, 1]) {
        const r = await metrics(page, 'setback', m, 'cnvg', { soft });
        console.log(`      setback  ${m.padEnd(7)} ${Math.round(soft * 100)} % soft: above ${r.above} · ${r.levels ? r.levels.join('–') : '–'} dBA · top − ground: 6-storey 1st row ${fmtD(r.aptFirst)}; terraces 1st ${fmtD(r.terrFirst)}`);
      }
      for (const r of all) assert.deepStrictEqual(r.nmls, [40, 44], 'catchment NMLs');
      const cor = all.find(r => r.variant === 'corridor' && r.method === 'tfnsw' && r.rules === 'cnvg');
      assert.ok(cor.aptFirst && cor.aptFirst.mean > 0, 'upper floors louder behind the corridor hoarding');
    }
  }
];
