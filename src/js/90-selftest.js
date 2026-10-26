/* ============================== SELF-TESTS ============================= */
function selfTest() {
  const S0 = { hr: 1.5, ground: 'hard', air: false, barriers: true, terrain: true };
  let pass = 0, fail = 0;
  const results = [];
  const saved = { b: state.buildings, h: state.hoardings, t: state.terrain };
  function check(name, got, exp, tol) {
    const ok = Math.abs(got - exp) <= tol; ok ? pass++ : fail++;
    results.push({ name, got, exp, tol, ok });
    log(`${ok ? 'PASS' : 'FAIL'} ${name}: engine ${got.toFixed(2)}, hand calc ${exp.toFixed(2)} dB`, ok ? 'pass' : 'fail');
  }
  const single = (zs, zr, xb, hb, d) => {
    const a = Math.hypot(xb, hb - zs), b = Math.hypot(d - xb, hb - zr), dir = Math.hypot(d, zs - zr), z = a + b - dir;
    const km = Math.exp(-(1 / 2000) * Math.sqrt(a * b * dir / (2 * z)));
    return 10 * Math.log10(3 + (20 / LAMBDA) * z * km);
  };
  try {
    state.buildings = []; state.hoardings = []; state.terrain = null; geomChanged();
    const src = { x: 0, y: 0, h: 1.5, lw: 105 }; prep([src]);
    check('Free field 50 m', contrib(src, 50, 0, S0, [], false), 105 - (20 * Math.log10(50) + 11), 0.01);
    check('Soft ground 100 m', contrib(src, 100, 0, Object.assign({}, S0, { ground: 'soft' }), [], false), 105 - 51 - 4.2, 0.01);

    const wall = makeBuilding(rect(24.9, -100, 25.1, 100), 10, 'test wall');
    state.buildings = [wall]; geomChanged(); prep([src]);
    check('10 m wall @ 25 m (Dz)', contrib(src, 50, 0, S0, state.buildings, true).Abar, single(1.5, 1.5, 25, 10, 50), 0.15);
    const hi = { x: 0, y: 0, h: 30, lw: 105 }; prep([hi]);
    check('Line of sight over wall', contrib(hi, 50, 0, S0, state.buildings, true).Abar, 0, 0.001);

    state.buildings = []; geomChanged();
    state.hoardings = [makeHoarding([[5, -50], [5, 50]], 2.4, 'test hoarding')]; prep([src]);
    check('2.4 m hoarding @ 5 m', contrib(src, 50, 0, S0, [], true).Abar, single(1.5, 1.5, 5, 2.4, 50), 0.05);
    state.hoardings = [];

    const mkT = (fn) => { const w = 121, h = 41, z = new Float32Array(w * h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) z[j * w + i] = fn(i - 10, 20 - j); return { w, h, cx: 1, cy: 1, x0: -10.5, yTop: 20.5, z, zmin: 0, zmax: 0 }; };
    state.terrain = mkT(() => 30); prep([src]);
    check('Flat terrain RL 30 = free field', contrib(src, 50, 0, S0, [], false), 105 - (20 * Math.log10(50) + 11), 0.01);
    state.terrain = mkT(x => 30 + (x === 25 ? 6 : 0)); prep([src]);
    check('Terrain ridge 6 m @ 25 m', contrib(src, 50, 0, S0, [], true).Abar, single(31.5, 31.5, 25, 36, 50), 0.15);
    state.terrain = mkT(x => (x <= 10 ? 26 : 30)); prep([src]);
    const r = contrib(src, 40, 0, S0, [], true);
    check('Source in 4 m cut, edge @ 10 m', r.Abar, single(27.5, 31.5, 11, 30, 40), 0.3);
  } catch (err) { fail++; results.push({ name: 'exception', error: err.message, ok: false }); log('Self-test error: ' + err.message, 'fail'); console.error(err); }
  state.buildings = saved.b; state.hoardings = saved.h; state.terrain = saved.t; geomChanged();
  log(`Self-test: ${pass} passed, ${fail} failed.`, fail ? 'fail' : 'pass');
  return { pass, fail, results };
}

