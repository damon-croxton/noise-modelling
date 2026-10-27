/* Stage 1: rules, land use, façade receivers, assessment, NCAs and outputs.
   All scenes are synthetic. */
'use strict';
const fs = require('fs');

/* Replace the scene with buildings/sources built in the page. spec: { buildings:
   [{ pts, h, opt }], sources: [{ x, y, eq?, lw?, on?, pen? }], settings } */
async function scene(page, spec) {
  await page.evaluate(sp => {
    const N = window.__noise, T = N._t, st = N.state;
    st.buildings = sp.buildings.map(b => T.makeBuilding(b.pts, b.h, b.name, b.opt));
    st.hoardings = []; st.ncas = []; st.assess.results = null;
    st.sources = sp.sources.map(s => Object.assign({ id: 9000 + Math.random(), name: 'src', eq: 'custom', lw: 105, on: 100, pen: 0, mit: 0, h: 2 }, s));
    Object.assign(st.settings, sp.settings || {});
    T.geomChanged();
  }, spec);
}
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const run = page => page.evaluate(async () => { const R = await window.__noise.runAssessment(); return R && { stats: R.stats, receivers: R.receivers }; });

module.exports = [
  {
    name: 'NMLs: residential by period and NCA, measured RBL floor, non-residential',
    async run({ page, assert }) {
      const r = await page.evaluate(() => {
        const f = window.__noise._t.nmlFor, R4 = { cat: 'R4', rbl: {} }, meas = { cat: 'R4', rbl: { day: 33, evening: 41, night: 28 } };
        const per = ['std', 'p1day', 'p1eve', 'p2eve', 'p2night'];
        return {
          r4: per.map(p => f('residential', R4, p).nml), meas: per.map(p => f('residential', meas, p).nml),
          edu: per.map(p => f('education', R4, p).nml), com: f('commercial', R4, 'p2night').nml, ind: f('industrial', R4, 'std').nml,
          none: f('none', R4, 'std').nml, hosp: f('hospital', R4, 'p2night').nml, act: f('activeRec', R4, 'p2night').nml
        };
      });
      assert.deepStrictEqual(r.r4, [65, 60, 55, 55, 50]);
      assert.deepStrictEqual(r.meas, [45, 40, 46, 46, 35]);   // day 33 → 35; night 28 → 30
      assert.deepStrictEqual(r.edu, [55, 55, null, null, null]);
      assert.deepStrictEqual([r.com, r.ind, r.none, r.hosp, r.act], [70, 75, null, 55, null]);
    }
  },
  {
    name: 'Table 9 bands and measures at the boundaries, highly noise affected',
    async run({ page, assert }) {
      const r = await page.evaluate(() => {
        const c = window.__noise._t.classify, o = (L, n, p, lu) => { const x = c(L, n, p, lu || 'residential'); return [x.exc, x.label, x.measures.join(' ')]; };
        return [o(45, 45, 'p2night'), o(50, 45, 'p2night'), o(50.4, 45, 'p2night'), o(50.6, 45, 'p2night'), o(60, 45, 'p2night'), o(61, 45, 'p2night'), o(71, 45, 'p2night'),
          o(81, 55, 'p1day'), o(81, 55, 'p1eve'), o(64, 55, 'p1eve'), o(75, 65, 'std'), o(76, 65, 'std'), o(76, 70, 'std', 'commercial'), o(86, 65, 'std')];
      });
      assert.deepStrictEqual(r, [
        [0, 'Below NML', ''], [5, 'Noticeable', 'PN'], [5, 'Noticeable', 'PN'], [6, 'Clearly audible', 'PN V'], [15, 'Clearly audible', 'PN V'],
        [16, 'Moderately intrusive', 'PN V SN RP DR'], [26, 'Highly intrusive', 'PN V SN RP DR AA'],
        [26, 'Highly intrusive', 'PN V SN RO'], [26, 'Highly intrusive', 'PN V SN RO RP DR'], [9, 'Clearly audible', 'PN'],
        [10, 'Clearly audible', 'PN V SN'], [11, 'Moderately intrusive', 'PN V SN'], [6, 'Clearly audible', ''], [21, 'Highly intrusive', 'PN V SN']
      ]);
    }
  },
  {
    name: 'sleep disturbance screening (LAmax ≈ LAeq + 5) and awakening',
    async run({ page, assert }) {
      const r = await page.evaluate(() => {
        const s = window.__noise._t.sleepCheck, R3 = { cat: 'R3', rbl: {} };
        return [s(50, R3, 'residential', 'p2night'), s(51, R3, 'residential', 'p2night'), s(60, R3, 'residential', 'p2night'), s(60, R3, 'residential', 'std'), s(60, R3, 'commercial', 'p2night')];
      });
      assert.deepStrictEqual(r[0], { lmax: 55, screen: 55, overScreen: false, awakening: false });
      assert.strictEqual(r[1].overScreen, true); assert.strictEqual(r[2].awakening, true);
      assert.strictEqual(r[3], null); assert.strictEqual(r[4], null);
    }
  },
  {
    name: 'land use, floors and address from OSM tags',
    async run({ page, assert }) {
      const r = await page.evaluate(() => {
        const T = window.__noise._t, lu = t => T.landUseFromTags(t);
        const b = (h, tags, floors) => Object.assign(T.makeBuilding([[0, 0], [10, 0], [10, 10]], h, 'x', { tags }), floors ? { floors } : {});
        return {
          lu: [lu({ building: 'yes', amenity: 'school' }), lu({ building: 'apartments' }), lu({ building: 'yes', shop: 'bakery' }), lu({ building: 'garage' }), lu({ building: 'yes' })].map(x => [x.lu, !!x.assumed]),
          floors: [T.floorsOf(b(20, { 'building:levels': '5' })).n, T.floorsOf(b(9, null)).n, T.floorsOf(b(8.5, null)).n, T.floorsOf(b(2.5, null)).n, T.floorsOf(b(9, null, 7)).n],
          addr: T.addressOf(b(9, { 'addr:unit': '3', 'addr:housenumber': '12', 'addr:street': 'Example St', 'addr:suburb': 'Testville' }))
        };
      });
      assert.deepStrictEqual(r.lu, [['education', false], ['residential', false], ['commercial', false], ['none', false], ['residential', true]]);
      assert.deepStrictEqual(r.floors, [5, 3, 2, 1, 7]);
      assert.strictEqual(r.addr, '3/12 Example St, Testville');
    }
  },
  {
    name: 'façade points: outside each wall, spaced, party walls skipped',
    async run({ page, assert }) {
      const r = await page.evaluate(() => {
        const N = window.__noise, T = N._t, st = N.state;
        const a = T.makeBuilding([[0, 0], [20, 0], [20, 10], [0, 10]], 9, 'a'), cw = T.makeBuilding([[0, 0], [0, 10], [20, 10], [20, 0]], 9, 'cw');
        st.buildings = [a]; T.geomChanged();
        const p1 = T.facadePoints(a, 10, 1), p2 = T.facadePoints(cw, 10, 1);
        st.buildings = [a, T.makeBuilding([[20, 0], [30, 0], [30, 10], [20, 10]], 9, 'neighbour')]; T.geomChanged();
        const p3 = T.facadePoints(a, 10, 1);
        return { n1: p1.pts.length, out1: p1.pts.every(p => p.x < 0 || p.x > 20 || p.y < 0 || p.y > 10), n2: p2.pts.length, out2: p2.pts.every(p => p.x < 0 || p.x > 20 || p.y < 0 || p.y > 10), n3: p3.pts.length, party: p3.party };
      });
      assert.deepStrictEqual(r, { n1: 6, out1: true, n2: 6, out2: true, n3: 5, party: 1 });
    }
  },
  {
    name: 'street canyon: upper floors behind a terrace row are louder than the ground floor',
    async run({ page, assert }) {
      await scene(page, {
        buildings: [
          { pts: rect(-50, 20, 50, 30), h: 6, name: 'terraces', opt: { landUse: 'residential' } },
          { pts: rect(-20, 40, 20, 55), h: 18, name: 'apartments', opt: { landUse: 'residential' } }
        ],
        sources: [{ x: 0, y: 0, lw: 110 }], settings: { method: 'tfnsw', period: 'p2night', soft: 0 }
      });
      const R = await run(page);
      const apt = R.receivers.filter(r => r.bId === R.receivers[R.receivers.length - 1].bId).sort((a, b) => a.floor - b.floor);
      assert.strictEqual(apt.length, 6);
      assert.ok(apt[5].Leq - apt[0].Leq >= 3, `ground ${apt[0].Leq.toFixed(1)}, top ${apt[5].Leq.toFixed(1)}`);
      // the ground floor is the quietest (fully screened); floors that see over the terraces are louder
      for (let k = 1; k < 6; k++) assert.ok(apt[k].Leq >= apt[0].Leq - 0.1, `floor ${k} quieter than ground: ${apt[k].Leq} < ${apt[0].Leq}`);
    }
  },
  {
    name: 'distance pre-screen never hides an exceedance (brute-force check)',
    async run({ page, assert }) {
      await scene(page, {
        buildings: Array.from({ length: 36 }, (_, k) => ({ pts: rect(-900 + (k % 6) * 300, -750 + Math.floor(k / 6) * 260, -860 + (k % 6) * 300, -720 + Math.floor(k / 6) * 260), h: 4 + (k % 4) * 6 })),
        sources: [{ x: 10, y: 15, lw: 103 }, { x: -40, y: -60, lw: 100, on: 50 }], settings: { method: 'tfnsw', period: 'p2night', soft: 0.5 }
      });
      const R = await run(page);
      const bad = await page.evaluate(() => {
        const N = window.__noise, st = N.state, T = N._t, out = [];
        N.prep(st.sources);
        for (const r of st.assess.results.receivers) {
          const b = st.buildings.find(x => x.id === r.bId), fp = T.facadePoints(b, st.assess.spacing, st.assess.offset);
          let best = -Infinity;
          for (const p of fp.pts) { let e = 0; for (const s of st.sources) e += Math.pow(10, N.contrib(s, p.x, p.y, st.settings, st.buildings, false, null, r.z) / 10); best = Math.max(best, 10 * Math.log10(e)); }
          if (r.Leq != null ? Math.abs(best - r.Leq) > 1e-6 : best >= r.nml) out.push([r.id, r.Leq, best, r.nml]);
        }
        return out;
      });
      assert.ok(R.stats.bound > 0, 'expected some points screened out by distance');
      assert.deepStrictEqual(bad, []);
    }
  },
  {
    name: 'NCA drawn on the map sets the NML of buildings inside it',
    async run({ page, assert }) {
      await scene(page, {
        buildings: [{ pts: rect(20, -5, 30, 5), h: 6, opt: { landUse: 'residential' } }, { pts: rect(-30, -5, -20, 5), h: 6, opt: { landUse: 'residential' } }],
        sources: [{ x: 0, y: 0, lw: 100 }], settings: { period: 'p2night' }
      });
      await page.evaluate(() => { const st = window.__noise.state; st.view = { cx: 0, cy: 0, scale: 8 }; });
      const box = await page.locator('#map').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2, w = (x, y) => [cx + x * 8, cy - y * 8];
      await page.keyboard.press('n');
      for (const [x, y] of [[10, -15], [40, -15], [40, 15], [10, 15]]) { const [px, py] = w(x, y); await page.mouse.click(px, py); }
      await page.keyboard.press('Enter');
      await page.fill('#nRblN', '35');
      const R = await run(page);
      const nml = R.receivers.map(r => [r.nca, r.nml]);
      assert.deepStrictEqual([...new Set(nml.map(String))].sort(), ['NCA 01,40', 'Outside NCAs,45'], JSON.stringify(nml) + ' ncas ' + JSON.stringify(await page.evaluate(() => window.__noise.state.ncas.map(n => n.pts))));
    }
  },
  {
    name: 'NCAs import from GeoJSON with category and measured RBLs',
    async run({ page, assert, waitLog }) {
      await page.fill('#siteLL', '-33.90, 151.20'); await page.click('#btnSite');
      const d = 0.0006, gj = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { NCA: 'North', Category: 'r2', RBL_Night: 33 }, geometry: { type: 'Polygon', coordinates: [[[151.2 - d, -33.9 - d], [151.2 + d, -33.9 - d], [151.2 + d, -33.9 + d], [151.2 - d, -33.9 + d], [151.2 - d, -33.9 - d]]] } }] };
      await page.setInputFiles('#fileNca', { name: 'nca.geojson', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(gj)) });
      await waitLog('Imported 1 NCA');
      const n = await page.evaluate(() => { const x = window.__noise.state.ncas[0]; return { name: x.name, cat: x.cat, rbl: x.rbl, n: x.pts.length }; });
      assert.deepStrictEqual(n, { name: 'North', cat: 'R2', rbl: { day: null, evening: null, night: 33 }, n: 4 });
    }
  },
  {
    name: 'OSM import keeps tags: land use, floors and address',
    async run({ page, assert, waitLog }) {
      const osm = `<?xml version="1.0"?><osm version="0.6">
        <node id="1" lat="-33.9000" lon="151.2000"/><node id="2" lat="-33.9000" lon="151.2003"/><node id="3" lat="-33.9002" lon="151.2003"/><node id="4" lat="-33.9002" lon="151.2000"/>
        <node id="5" lat="-33.9005" lon="151.2000"/><node id="6" lat="-33.9005" lon="151.2003"/><node id="7" lat="-33.9007" lon="151.2003"/><node id="8" lat="-33.9007" lon="151.2000"/>
        <way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/><tag k="building" v="apartments"/><tag k="building:levels" v="6"/><tag k="addr:housenumber" v="21"/><tag k="addr:street" v="Sample Rd"/></way>
        <way id="11"><nd ref="5"/><nd ref="6"/><nd ref="7"/><nd ref="8"/><nd ref="5"/><tag k="building" v="yes"/><tag k="amenity" v="school"/></way></osm>`;
      await page.click('#btnClearB');
      await page.setInputFiles('#fileGeo', { name: 'map.osm', mimeType: 'application/xml', buffer: Buffer.from(osm) });
      await waitLog('OSM: 2 elements');
      const r = await page.evaluate(() => window.__noise.state.buildings.map(b => { const T = window.__noise._t; return [T.luOf(b).lu, T.floorsOf(b).n, T.addressOf(b)]; }));
      assert.deepStrictEqual(r.sort(), [['education', 2, ''], ['residential', 6, '21 Sample Rd']].sort(), JSON.stringify(r));
    }
  },
  {
    name: 'building panel override and bulk land-use change',
    async run({ page, assert }) {
      await scene(page, { buildings: [{ pts: rect(20, -5, 30, 5), h: 6 }, { pts: rect(-30, -5, -20, 5), h: 6 }, { pts: rect(-5, 20, 5, 30), h: 6, opt: { landUse: 'commercial' } }], sources: [{ x: 0, y: 0 }] });
      await page.evaluate(() => { const st = window.__noise.state; st.view = { cx: 0, cy: 0, scale: 8 }; });
      const box = await page.locator('#map').boundingBox();
      await page.keyboard.press('v');
      await page.mouse.click(box.x + box.width / 2 + 25 * 8, box.y + box.height / 2);
      await page.selectOption('#bLu', 'industrial');
      await page.evaluate(() => { document.querySelectorAll('details.sub2').forEach(d => { d.open = true; }); });
      await page.selectOption('#bulkFrom', '?'); await page.selectOption('#bulkIn', '*'); await page.selectOption('#bulkTo', 'education');
      await page.click('#btnBulk');
      const r = await page.evaluate(() => window.__noise.state.buildings.map(b => window.__noise._t.luOf(b).lu));
      assert.deepStrictEqual(r, ['industrial', 'education', 'commercial']);
    }
  },
  {
    name: 'property table filters and sorts; CSV export asks first and has every row',
    async run({ page, assert }) {
      await page.selectOption('#setPeriod', 'p2night');
      await page.click('#btnAssess');
      await page.waitForFunction(() => /Assessment \(/.test(document.getElementById('log').innerText));
      await page.click('#btnTable');
      const rows = await page.$$eval('#ptBody tr', t => t.length);
      const first = await page.$eval('#ptBody tr td:nth-child(8)', td => td.textContent);
      await page.fill('#ptQ', 'Apartment');
      const apt = await page.$$eval('#ptBody tr', t => t.map(r => r.children[1].textContent));
      assert.ok(rows >= 5 && first.startsWith('+'), `rows ${rows}, first exceedance ${first}`);
      assert.ok(apt.length >= 2 && apt.every(a => a === 'Apartment block'), apt.join(','));
      page.once('dialog', d => d.dismiss());
      await page.click('#ptCsv');
      await page.waitForFunction(() => /CSV export cancelled/.test(document.getElementById('log').innerText));
      await page.fill('#ptQ', '');
      page.once('dialog', d => d.accept());
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ptCsv')]);
      const csv = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').split('\r\n');
      assert.ok(csv[0].startsWith('Receiver ID,Building ID,Address / building,Floor'), csv[0]);
      assert.strictEqual(csv.filter(l => /^B\d+-/.test(l)).length, rows);
      assert.ok(csv[csv.length - 1].includes('Screening estimate only'));
    }
  },
  {
    name: 'results are flagged as out of date when a source moves',
    async run({ page, assert }) {
      await page.click('#btnAssess');
      await page.waitForFunction(() => /Assessment \(/.test(document.getElementById('log').innerText));
      assert.ok(!(await page.$('#asStatus .stale')));
      await page.evaluate(() => { const s = window.__noise.state.sources[0]; s.x += 5; });
      await page.selectOption('#setCell', '8');   // any change that triggers a full recompute
      await page.waitForSelector('#asStatus .stale', { timeout: 5000 });
    }
  },
  {
    name: 'scenario round trip keeps NCAs, land use, floors, addresses and edited rules',
    async run({ page, assert }) {
      await page.evaluate(() => {
        const N = window.__noise, st = N.state, T = N._t;
        st.ncas = [Object.assign(T.makeNca([[0, 0], [50, 0], [50, 50]], 'Test NCA'), { cat: 'R5', rbl: { day: 61, evening: null, night: 44 } })];
        const b = st.buildings[0]; b.landUse = 'hospital'; b.floors = 4; b.address = '1 Test Pl';
        st.assess.defNca.cat = 'R1'; st.assess.floorH = 3.2;
        N._t.rules().name = 'Project rules'; st.rulesEdited = true;
      });
      page.once('dialog', d => d.accept());   // the scenario holds an address
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
      const d = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
      await page.click('#btnDemo');
      await page.evaluate(() => document.getElementById('btnRulesReset').click());
      await page.setInputFiles('#fileLoad', { name: 's.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d)) });
      await page.waitForFunction(() => /Loaded s\.json/.test(document.getElementById('log').innerText));
      const r = await page.evaluate(() => { const st = window.__noise.state, b = st.buildings[0]; return { n: st.ncas.map(x => [x.name, x.cat, x.rbl.night]), b: [b.landUse, b.floors, b.address], def: st.assess.defNca.cat, fh: st.assess.floorH, rules: window.__noise._t.rules().name }; });
      assert.deepStrictEqual(r, { n: [['Test NCA', 'R5', 44]], b: ['hospital', 4, '1 Test Pl'], def: 'R1', fh: 3.2, rules: 'Project rules' });
    }
  },
  {
    name: 'rules import: project-specific bands apply; invalid rules are rejected',
    async run({ page, assert, waitLog }) {
      const rules = await page.evaluate(() => JSON.parse(JSON.stringify(window.__noise._t.rules())));
      rules.name = 'Project X'; rules.bandSets.oohw2[1].measures = ['PN', 'V', 'RO'];   // RO in Period 2, as in the reference case
      await page.setInputFiles('#fileRules', { name: 'r.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rules)) });
      await waitLog('Imported assessment rules');
      const m = await page.evaluate(() => window.__noise._t.classify(55, 45, 'p2night', 'residential').measures.join(' '));
      assert.strictEqual(m, 'PN V RO');
      delete rules.periods.p2night;
      await page.setInputFiles('#fileRules', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rules)) });
      await waitLog('Rules bad.json rejected: periods.p2night');
    }
  },
  {
    name: 'performance: 2,000 buildings, 3 sources (TfNSW basis; ISO with reflections)',
    async run({ page, assert }) {
      for (const [method, reflect] of [['tfnsw', 'auto'], ['iso', 'on']]) {
        const t = await page.evaluate(async ([method, reflect]) => {
          const N = window.__noise, st = N.state, T = N._t, B = [];
          for (let i = 0; i < 50; i++) for (let j = 0; j < 40; j++) {
            const x = -600 + i * 24, y = -480 + j * 24; B.push(T.makeBuilding([[x, y], [x + 16, y], [x + 16, y + 14], [x, y + 14]], 6 + ((i * 7 + j * 3) % 5) * 3, 'b'));
          }
          st.buildings = B; st.hoardings = []; st.ncas = []; T.geomChanged();
          st.sources = [0, 1, 2].map(k => ({ id: 9100 + k, name: 's' + k, eq: 'custom', lw: 108, on: 100, pen: 0, mit: 0, h: 2, x: -4 + k * 24 * 5, y: 10 - k * 24 * 3 }));
          Object.assign(st.settings, { period: 'p2night', method, reflect });
          const t0 = performance.now(); const R = await N.runAssessment();
          return { ms: performance.now() - t0, rec: R.stats.receivers, pts: R.stats.points, exact: R.stats.exact };
        }, [method, reflect]);
        console.log(`      performance (${method}${method === 'iso' ? ', reflections' : ''}): ${t.rec} building-floors, ${t.pts} façade points (${t.exact} calculated) in ${(t.ms / 1000).toFixed(1)} s`);
        assert.ok(t.ms < 60000, `${t.ms} ms`);
      }
    }
  }
  ,
  {
    name: 'reflections: street canyon façades gain from the opposite façade, not their own; probe lists them',
    async run({ page, assert }) {
      const r = await page.evaluate(async () => {
        const N = window.__noise, st = N.state, T = N._t;
        st.buildings = [T.makeBuilding([[-50, 10], [50, 10], [50, 30], [-50, 30]], 15, 'north'), T.makeBuilding([[-50, -30], [50, -30], [50, -10], [-50, -10]], 15, 'south')];
        st.hoardings = []; st.ncas = []; T.geomChanged();
        st.sources = [{ id: 9200, name: 'plant', eq: 'custom', lw: 105, on: 100, pen: 0, mit: 0, h: 2, x: 0, y: 0 }];
        Object.assign(st.settings, { period: 'std', method: 'iso', soft: 0 });
        const run = async reflect => { st.settings.reflect = reflect; const R = await N.runAssessment(); return R.receivers.filter(x => x.bId === st.buildings[0].id).map(x => x.Leq); };
        const off = await run('off'), on = await run('on');
        N.prep(st.sources);
        const det = N.contrib(st.sources[0], 0, 5, st.settings, st.buildings, true);
        st.view.cx = 0; st.view.cy = 5;
        return { off, on, n: det.refl.length, gain: det.Lp - det.Ldir };
      });
      const gain = r.on.map((x, i) => x - r.off[i]);
      assert.ok(gain.every(g => g > 0.2 && g < 3), `façade gain ${gain}`);
      assert.strictEqual(r.n, 2, 'mid-street point sees both façades');
      // ISO hard ground (same Agr on every path): gain = 10·lg(1 + Σ (d_direct / d_image)² · 10^(−loss/10))
      const dd = Math.hypot(5, 0.5), k = d => Math.pow(dd / Math.hypot(d, 0.5), 2) * Math.pow(10, -0.1);
      assert.ok(Math.abs(r.gain - 10 * Math.log10(1 + k(15) + k(25))) < 0.01, `mid-street gain ${r.gain}`);
      const box = await page.locator('#map').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForFunction(() => /reflections: .*(north.*south|south.*north)/.test(document.getElementById("probe").innerText));
      const t = await page.textContent('#probe');
      assert.ok(/direct [\d.]+ → total/.test(t), t);
    }
  }
];
