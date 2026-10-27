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
  const S0 = { method: 'iso', soft: 0, season: 'warm', period: 'std', barCap: 15, hr: 1.5, air: false, barriers: true, terrain: true, lateral: false, reflect: 'off' };
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

    // Side diffraction: Dz of the path over the top and the two side paths
    // (Kmet = 1) summed by energy, then capped (ISO 9613-2 eq. 14, 15).
    const dzOf = (delta, C3, km) => 10 * Math.log10(3 + (20 / LAMBDA) * C3 * delta * km);
    const sumDz = (...d) => -10 * Math.log10(d.reduce((a, x) => a + Math.pow(10, -x / 10), 0));
    const SL = Object.assign({}, S0, { lateral: true });
    state.hoardings = [makeHoarding([[25, -10], [25, 10]], 4, 'short hoarding')]; prep([src]);
    const latH = dzOf(2 * Math.hypot(25, 10) - 50, 1, 1);
    check('Side diffraction: 20 m hoarding, 4 m high @ 25 m', Dz(contrib(src, 50, 0, SL, [], true)), sumDz(single(1.5, 1.5, 25, 4, 50), latH, latH), 0.05);
    check('Side diffraction off: same hoarding, top path only', Dz(contrib(src, 50, 0, Object.assign({}, SL, { lateral: false }), [], true)), single(1.5, 1.5, 25, 4, 50), 0.05);
    state.hoardings = [];
    state.buildings = [makeBuilding(rect(20, -10, 30, 10), 10, 'block')]; geomChanged(); prep([src]);
    const q = Math.pow(5 * LAMBDA / 10, 2), C3b = (1 + q) / (1 / 3 + q), aT = Math.hypot(20, 8.5), dT = 2 * aT + 10 - 50;
    const topB = dzOf(dT, C3b, Math.exp(-(1 / 2000) * Math.sqrt(aT * aT * 50 / (2 * dT))));
    const latB = dzOf(2 * Math.hypot(20, 10) + 10 - 50, C3b, 1);
    check('Side diffraction: 10 × 20 m block, 10 m high (two edges each way)', Dz(contrib(src, 50, 0, SL, state.buildings, true)), sumDz(topB, latB, latB), 0.05);
    state.buildings = []; geomChanged();

    // First-order reflections (ISO 9613-2 §7.5): image source behind the wall,
    // same spreading and ground terms over the image path, less the 1 dB loss.
    const SR = Object.assign({}, S0, { reflect: 'on', reflLoss: 1 }), esum = (...l) => 10 * Math.log10(l.reduce((a, x) => a + Math.pow(10, x / 10), 0));
    const isoHard = d => 105 - (20 * Math.log10(d) + 11) + 3;
    state.buildings = [makeBuilding(rect(-100, 10, 100, 10.2), 10, 'reflecting wall')]; geomChanged(); prep([src]);
    check('Reflection: 10 m wall 10 m beside a 30 m path (ISO, hard)', contrib(src, 30, 0, SR, state.buildings, false), esum(isoHard(30), isoHard(Math.hypot(30, 20)) - 1), 0.01);
    check('Reflection: TfNSW basis with reflections on', contrib(src, 30, 0, Object.assign({}, SR, { method: 'tfnsw' }), state.buildings, false),
      esum(105 - (20 * Math.log10(30) + 8), 105 - (20 * Math.log10(Math.hypot(30, 20)) + 8) - 1), 0.01);
    check('Reflection off: same wall, direct only', contrib(src, 30, 0, Object.assign({}, SR, { reflect: 'off' }), state.buildings, false), isoHard(30), 0.01);
    check('Reflection: receiver\'s own façade (1 m away) left out', contrib(src, 30, 9, SR, state.buildings, false), isoHard(Math.hypot(30, 9)), 0.01);
    state.buildings = [makeBuilding(rect(-100, 10, 100, 10.2), 1, 'low wall')]; geomChanged(); prep([src]);
    check('Reflection: wall lower than the path, none', contrib(src, 30, 0, SR, state.buildings, false), isoHard(30), 0.01);
    state.buildings = [makeBuilding(rect(14.4, 10, 15.6, 10.2), 10, 'column')]; geomChanged(); prep([src]);
    check('Reflection: 1.2 m wide column too small (eq. 19), none', contrib(src, 30, 0, SR, state.buildings, false), isoHard(30), 0.01);
    state.buildings = []; geomChanged();

    // Octave bands (ISO 9613-2, S.bands). Air: ISO 9613-1 against the
    // estimator's 250/500/1k values and ISO 9613-2 Table 2 (20 °C, 70 %).
    for (const [se, pe] of [['warm', 'std'], ['warm', 'p2night'], ['cool', 'std'], ['cool', 'p2night']]) {
      const a = airBands({ season: se, period: pe });
      check(`ISO 9613-1 air, mean of 250/500/1k = estimator (${se} ${pe === 'std' ? 'day' : 'night'})`, (a[2] + a[3] + a[4]) / 3, airAlpha({ season: se, period: pe }), 0.01);
    }
    [0.1, 0.3, 1.1, 2.8, 5.0, 9.0, 22.9, 76.6].forEach((v, k) => check(`ISO 9613-1 air ${OCT_F[k]} Hz, 20 °C 70 % (ISO 9613-2 Table 2)`, airIso(OCT_FM[k], 20, 70), v, Math.max(0.05, Math.round(v * 10) / 1000)));
    check('Generic spectra sum to 0 dB', Math.max(...Object.values(SPECTRA).map(v => Math.abs(10 * Math.log10(v.rel.reduce((a, x) => a + Math.pow(10, x / 10), 0))))), 0, 1e-9);
    const SB = Object.assign({}, S0, { bands: true }), pinkSrc = Object.assign({}, src, { spec: 'pink' }), pk = SPECTRA.pink.rel;
    prep([pinkSrc]);
    const bandSum = f => 10 * Math.log10(OCT_F.reduce((a, _, k) => a + Math.pow(10, (105 + pk[k] - f(k)) / 10), 0));
    check('Octave bands, hard ground: same as single band', contrib(pinkSrc, 200, 0, SB, [], false), contrib(pinkSrc, 200, 0, S0, [], false), 0.01);
    const agrSoft = [-3.3, 1.4499, 12.146, 8.6002, 1.1413, 0, 0, 0];   // Table 3, G = 1, hs = hr = 1.5 m, dp = 100 m (hand calculation)
    check('Octave bands, soft ground 100 m (ISO 9613-2 Table 3)', contrib(pinkSrc, 100, 0, Object.assign({}, SB, { soft: 1 }), [], false), bandSum(k => 20 * Math.log10(100) + 11 + agrSoft[k]), 0.01);
    state.hoardings = [makeHoarding([[5, -50], [5, 50]], 2.4, 'test hoarding')]; prep([pinkSrc]);
    const zH = Math.hypot(5, 0.9) + Math.hypot(45, 0.9) - 50, kmH = Math.exp(-(1 / 2000) * Math.sqrt(Math.hypot(5, 0.9) * Math.hypot(45, 0.9) * 50 / (2 * zH)));
    check('Octave bands, 2.4 m hoarding @ 5 m: Dz per band', contrib(pinkSrc, 50, 0, Object.assign({}, SB, { lateral: false }), [], false),
      bandSum(k => 20 * Math.log10(50) + 11 + Math.min(20, 10 * Math.log10(3 + (20 * OCT_FM[k] / C_AIR) * zH * kmH))), 0.01);
    state.hoardings = [];
    state.buildings = [makeBuilding(rect(13.5, 10, 16.5, 10.2), 10, '3 m column')]; geomChanged(); prep([pinkSrc]);
    const dI = Math.hypot(30, 20, 0);
    check('Octave bands: 3 m column reflects only at 4 and 8 kHz (eq. 19)', contrib(pinkSrc, 30, 0, Object.assign({}, SB, { reflect: 'on' }), state.buildings, false),
      10 * Math.log10(OCT_F.reduce((a, _, k) => a + Math.pow(10, (105 + pk[k] - (20 * Math.log10(30) + 11) + 3) / 10) + (k >= 6 ? Math.pow(10, (105 + pk[k] - (20 * Math.log10(dI) + 11) + 3 - 1) / 10) : 0), 0)), 0.01);
    check('Single band: the same column does not reflect at 500 Hz', contrib(pinkSrc, 30, 0, SR, state.buildings, false), isoHard(30), 0.01);
    state.buildings = []; geomChanged();

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
