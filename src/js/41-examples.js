/* ================================ EXAMPLES ============================== */
/* Synthetic inner-city scene for the reference-case comparison (Stage 2). The
   geometry was fixed before any results were looked at, and is not tuned to
   match. Three variants:
     street   – plant in the middle of a 20 m wide street, façades 10 m away;
     corridor – plant inside a 30 m wide rail corridor behind 2.4 m hoarding,
                first-row façades 20 m away.
     setback  – derived from the reference itself, not independent: its
                maximum of 57 dBA implies (TfNSW basis, 96.4 dBA total) an
                unscreened nearest façade about 37 m away, so the first row is
                set back 37 m with no hoarding.
   Each side of the works has a first row of terraces (2 storeys, 7 m, 6 m
   frontage, party walls) and 6-storey apartment blocks, a 6 m rear lane, and a
   second row of 8-storey apartments and terraces. Cross streets 12 m wide every
   70 m. North side = catchment A (NML 44 at night: measured RBL 39), south
   side = catchment B (NML 40: RBL 35). Plant: the reference shift. */
const REF_PLANT = [
  { name: 'Scissor lift / EWP', lw: 96, on: 40, pen: 0, x: 0, y: 0 },
  { name: 'Impact wrench (rattle gun)', lw: 96, on: 20, pen: 5, x: 3, y: 1 },
  { name: 'Power tools', lw: 90, on: 20, pen: 0, x: -3, y: -1 },
  { name: 'Utility vehicle', lw: 80, on: 10, pen: 0, x: 8, y: 0 }
];
function buildReferenceExample(variant) {
  const face = variant === 'corridor' ? 20 : variant === 'setback' ? 37 : 10, B = [];
  const res = { landUse: 'residential' };
  for (const side of [1, -1]) {
    const yr = (a, b) => (side > 0 ? [face + a, face + b] : [-face - b, -face - a]);
    for (let x0 = -175; x0 < 175; x0 += 70) {
      // first row: 5 terraces (30 m) + apartment block (24 m), order swapped on the south side
      const terr = side > 0 ? x0 : x0 + 28, apt = side > 0 ? x0 + 34 : x0;
      const [ty0, ty1] = yr(0, 12), [ay0, ay1] = yr(0, 18);
      for (let k = 0; k < 5; k++) B.push(makeBuilding(rect(terr + 6 * k, ty0, terr + 6 * k + 6, ty1), 7, 'Terrace', res));
      B.push(makeBuilding(rect(apt, ay0, apt + 24, ay1), 18, 'Apartments (6 storeys)', res));
      // second row behind a 6 m lane: 8-storey apartments + 4 terraces
      const [by0, by1] = yr(24, 42), [sy0, sy1] = yr(24, 36);
      B.push(makeBuilding(rect(x0 + (side > 0 ? 30 : 4), by0, x0 + (side > 0 ? 54 : 28), by1), 24, 'Apartments (8 storeys)', res));
      for (let k = 0; k < 4; k++) B.push(makeBuilding(rect(x0 + (side > 0 ? 4 : 34) + 6 * k, sy0, x0 + (side > 0 ? 10 : 40) + 6 * k, sy1), 7, 'Terrace', res));
    }
  }
  state.buildings = B;
  state.hoardings = variant === 'corridor' ? [makeHoarding([[-180, 15], [180, 15]], 2.4, 'Corridor fence (north)'), makeHoarding([[-180, -15], [180, -15]], 2.4, 'Corridor fence (south)')] : [];
  const A = Object.assign(makeNca([[-200, 5], [200, 5], [200, 120], [-200, 120]], 'Catchment A'), { cat: 'R4', rbl: { day: null, evening: null, night: 39 } });
  const Bn = Object.assign(makeNca([[-200, -120], [200, -120], [200, -5], [-200, -5]], 'Catchment B'), { cat: 'R3', rbl: { day: null, evening: null, night: 35 } });
  state.ncas = [A, Bn];
  state.sources = REF_PLANT.map(p => Object.assign(makeSource(p.x, p.y, 'custom'), { name: p.name, lw: p.lw, on: p.on, pen: p.pen, mit: 0, h: 2 }));
  Object.assign(state.settings, { period: 'p2night', soft: 0, combine: 'all' });
  state.assess.results = null; state.terrain = null;
  resetShifts(`Night works – ${variant}`); state.provenance = [{ kind: 'Example', name: `Synthetic inner-city scene (${variant})`, detail: 'Generated in the app – not a real location', loaded: new Date().toISOString(), fileDate: null }];
  geomChanged(); syncSettingsUI(); syncAssessUI(); select(null);
  const desc = { corridor: 'rail corridor behind 2.4 m hoarding, façades 20 m away', street: 'street works, façades 10 m away', setback: 'open works area, façades 37 m away' }[variant];
  log(`Example loaded: inner-city night works (${desc}), ${B.length} buildings, reference-case plant. Synthetic geometry – for comparison only.`);
  requestCompute(false);
}
$('btnExample').addEventListener('click', () => { buildReferenceExample($('exampleSel').value); zoomExtents(); });
