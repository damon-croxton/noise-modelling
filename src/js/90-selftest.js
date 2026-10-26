/* ============================== SELF-TESTS ============================= */
/* Golden values from the TfNSW Construction Noise Estimator (EMF-NV-TT-0068),
   'Step 3 Results' recalculated in LibreOffice 24.2 with total SWL (E7) =
   110 dBA: [season, period, distance m, soft fraction, screening dB, LAeq]. */
const ESTIMATOR_GOLDEN = [
  ['warm', 'std', 40, 0.2, 0, 69.6545014344895],
  ['warm', 'std', 100, 0.5, 0, 59.1718666666667],
  ['warm', 'p2night', 250, 1, 0, 44.3973813005487],
  ['cool', 'std', 10, 0, 0, 81.9747666666667],
  ['cool', 'p2night', 1000, 0.8, 0, 30.5724133333333],
  ['warm', 'std', 100, 1, 5, 51.6424],
  ['warm', 'std', 250, 1, 10, 43.2945331598926],
  ['warm', 'std', 500, 0.5, 15, 31.5272665799463]
];
function selfTest() {
  const S0 = { method: 'iso', soft: 0, season: 'warm', period: 'std', barCap: 15, hr: 1.5, air: false, barriers: true, terrain: true };
  const ST = Object.assign({}, S0, { method: 'tfnsw', air: true });
  let pass = 0, fail = 0;
  const results = [];
  const saved = { b: state.buildings, h: state.hoardings, t: state.terrain };
  function check(name, got, exp, tol) {
    const ok = Math.abs(got - exp) <= tol; ok ? pass++ : fail++;
    results.push({ name, got, exp, tol, ok });
    log(`${ok ? 'PASS' : 'FAIL'} ${name}: engine ${got.toFixed(2)}, expected ${exp.toFixed(2)} dB`, ok ? 'pass' : 'fail');
  }
  const single = (zs, zr, xb, hb, d) => {
    const a = Math.hypot(xb, hb - zs), b = Math.hypot(d - xb, hb - zr), dir = Math.hypot(d, zs - zr), z = a + b - dir;
    const km = Math.exp(-(1 / 2000) * Math.sqrt(a * b * dir / (2 * z)));
    return 10 * Math.log10(3 + (20 / LAMBDA) * z * km);
  };
  const Dz = r => (r.bar ? r.bar.Dz : 0);
  try {
    state.buildings = []; state.hoardings = []; state.terrain = null; geomChanged();
    const src = { x: 0, y: 0, h: 1.5, lw: 105 }; prep([src]);

    // ISO 9613-2 ground (§7.3): hard G = 0 gives Agr = −3 − 3q; soft eq. 10 with DΩ.
    check('ISO hard ground 50 m (q = 0)', contrib(src, 50, 0, S0, [], false), 105 - (20 * Math.log10(50) + 11) + 3, 0.01);
    check('ISO hard ground 200 m (q = 0.55)', contrib(src, 200, 0, S0, [], false), 105 - (20 * Math.log10(200) + 11) + 3 + 3 * 0.55, 0.01);
    const dOm = 10 * Math.log10(1 + 10000 / (10000 + 9));
    check('ISO soft ground 100 m + DΩ', contrib(src, 100, 0, Object.assign({}, S0, { soft: 1 }), [], false), 105 - 51 - 4.2 + dOm, 0.01);

    // Diffraction (Dz) against hand calculations.
    const wall = makeBuilding(rect(24.9, -100, 25.1, 100), 10, 'test wall');
    state.buildings = [wall]; geomChanged(); prep([src]);
    check('10 m wall @ 25 m (Dz)', Dz(contrib(src, 50, 0, S0, state.buildings, true)), single(1.5, 1.5, 25, 10, 50), 0.15);
    const hi = { x: 0, y: 0, h: 30, lw: 105 }; prep([hi]);
    check('Line of sight over wall', Dz(contrib(hi, 50, 0, S0, state.buildings, true)), 0, 0.001);

    state.buildings = []; geomChanged();
    state.hoardings = [makeHoarding([[5, -50], [5, 50]], 2.4, 'test hoarding')]; prep([src]);
    check('2.4 m hoarding @ 5 m (Dz)', Dz(contrib(src, 50, 0, S0, [], true)), single(1.5, 1.5, 5, 2.4, 50), 0.05);
    state.hoardings = [];

    const mkT = (fn) => { const w = 121, h = 41, z = new Float32Array(w * h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) z[j * w + i] = fn(i - 10, 20 - j); return { w, h, cx: 1, cy: 1, x0: -10.5, yTop: 20.5, z, zmin: 0, zmax: 0 }; };
    state.terrain = mkT(() => 30); prep([src]);
    check('Flat terrain RL 30 = flat ground', contrib(src, 50, 0, S0, [], false), 105 - (20 * Math.log10(50) + 11) + 3, 0.01);
    state.terrain = mkT(x => 30 + (x === 25 ? 6 : 0)); prep([src]);
    check('Terrain ridge 6 m @ 25 m (Dz)', Dz(contrib(src, 50, 0, S0, [], true)), single(31.5, 31.5, 25, 36, 50), 0.15);
    state.terrain = mkT(x => (x <= 10 ? 26 : 30)); prep([src]);
    check('Source in 4 m cut, edge @ 10 m (Dz)', Dz(contrib(src, 40, 0, S0, [], true)), single(27.5, 31.5, 11, 30, 40), 0.3);
    state.terrain = null;

    // TfNSW estimator basis: terms, then whole-path golden values.
    check('Air: Oct–Apr day (dB/km)', airAlpha(ST), (1.04 + 2.77 + 5.15) / 3, 1e-9);
    check('Air: May–Sep night (dB/km)', airAlpha(Object.assign({}, ST, { season: 'cool', period: 'p2night' })), (0.897 + 1.64 + 3.8) / 3, 1e-9);
    check('CONCAWE ground 100 m × 50 %', 0.5 * concaweGround(100), 2.52946666666667, 1e-6);
    check('CONCAWE ground 250 m', concaweGround(250), 9.00881852601056, 1e-6);
    check('Ground kept with 5 dB screening', 5 + groundUnderScreening(concaweGround(100), 5), 62 - 0.298666666666667 - 51.6424, 1e-6);
    check('Ground dropped with 10 dB screening', 10 + groundUnderScreening(concaweGround(250), 10), 10, 1e-9);
    const src110 = { x: 0, y: 0, h: 1.5, lw: 110 }; prep([src110]);
    for (const [season, period, d, soft, scr, exp] of ESTIMATOR_GOLDEN) {
      if (scr && scr !== 15) continue;   // 5 and 10 dB screening are checked through groundUnderScreening above
      if (scr === 15) {                  // 20 m wall 5 m from the source: Dz ≈ 25 dB, capped at 15
        state.buildings = [makeBuilding(rect(4.9, -1000, 5.1, 1000), 20, 'test wall')]; geomChanged(); prep([src110]);
      }
      const S = Object.assign({}, ST, { season, period, soft });
      check(`TfNSW estimator ${season === 'warm' ? 'Oct–Apr' : 'May–Sep'} ${period} ${d} m, ${soft * 100} % soft${scr ? ', ' + scr + ' dB screening' : ''}`,
        contrib(src110, d, 0, S, state.buildings, false), exp, 0.01);
      state.buildings = []; geomChanged();
    }
  } catch (err) { fail++; results.push({ name: 'exception', error: err.message, ok: false }); log('Self-test error: ' + err.message, 'fail'); console.error(err); }
  state.buildings = saved.b; state.hoardings = saved.h; state.terrain = saved.t; geomChanged();
  log(`Self-test: ${pass} passed, ${fail} failed.`, fail ? 'fail' : 'pass');
  return { pass, fail, results };
}
