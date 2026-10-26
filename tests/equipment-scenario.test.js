/* Source fields, equipment library, scenario save/load and settings migration. */
'use strict';
const fs = require('fs');

async function placeSource(page) {
  await page.keyboard.press('s');
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4);
}
async function saveScenario(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  return JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
}

module.exports = [
  {
    name: 'effective Lw = Lw + 10·lg(% on) + penalty − mitigation (reference-case plant)',
    async run({ page, assert }) {
      const r = await page.evaluate(() => {
        const f = window.__noise._t.effectiveLw;
        return [f({ lw: 96, on: 40, pen: 0 }), f({ lw: 96, on: 20, pen: 5 }), f({ lw: 90, on: 20 }), f({ lw: 80, on: 10 }), f({ lw: 105, mit: 5 }), f({ lw: 100 })];
      });
      const exp = [96 + 10 * Math.log10(0.4), 96 + 10 * Math.log10(0.2) + 5, 90 + 10 * Math.log10(0.2), 70, 100, 100];
      r.forEach((v, i) => assert.ok(Math.abs(v - exp[i]) < 1e-9, `case ${i}: ${v} vs ${exp[i]}`));
    }
  },
  {
    name: 'library: Table 19 maxima, SAC items default to +5 dB, over-maximum flagged',
    async run({ page, assert }) {
      const r = await page.evaluate(() => {
        const N = window.__noise, lib = N.library();
        const exc = N._t.libItem('t19-excavator-tracked-20-t'), saw = N._t.libItem('t19-saw-concrete');
        return { n: lib.length, exc, saw, over: N._t.overMax({ eq: exc.id, lw: 108 }), ok: N._t.overMax({ eq: exc.id, lw: 105 }), est: lib.filter(e => e.group === 'TfNSW estimator').length };
      });
      assert.strictEqual(r.exc.lw, 105); assert.strictEqual(r.exc.maxLw, 105); assert.strictEqual(r.exc.sac, false);
      assert.strictEqual(r.saw.lw, 118); assert.strictEqual(r.saw.sac, true);
      assert.strictEqual(r.over, 105); assert.strictEqual(r.ok, null);
      assert.ok(r.est > 100, `estimator items: ${r.est}`);
    }
  },
  {
    name: 'placing a source uses the default plant at 2 m, and the panel edits every field',
    async run({ page, assert }) {
      await placeSource(page);
      await page.selectOption('#sEq', 't19-saw-concrete');
      await page.fill('#sOn', '50'); await page.fill('#sMit', '3');
      const s = await page.evaluate(() => { const st = window.__noise.state; return st.sources[st.sources.length - 1]; });
      assert.strictEqual(s.eq, 't19-saw-concrete'); assert.strictEqual(s.h, 2);
      assert.strictEqual(s.lw, 118); assert.strictEqual(s.pen, 5); assert.strictEqual(s.on, 50); assert.strictEqual(s.mit, 3);
      const info = await page.textContent('#sInfo');
      assert.ok(/= 117\.0/.test(info), info);   // 118 − 3.0 + 5 − 3
      await page.fill('#sLw', '125');
      assert.ok((await page.textContent('#sInfo')).includes('Appendix C maximum of 118'));
    }
  },
  {
    name: 'probe shows every attenuation term and the method',
    async run({ page, assert }) {
      const box = await page.locator('#map').boundingBox();
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
      await page.waitForFunction(() => document.getElementById('probe').innerText.includes('Total'));
      const t = await page.textContent('#probe');
      for (const k of ['Lw', 'Adiv', 'Aatm', 'Agr', 'Abar', 'Lp', 'TfNSW estimator basis', 'Standard hours'])
        assert.ok(t.includes(k), `missing ${k}: ${t}`);
    }
  },
  {
    name: 'scenario round trip keeps source fields, settings and project library items',
    async run({ page, assert }) {
      await placeSource(page);
      await page.selectOption('#sEq', 't19-jackhammer');
      await page.fill('#sOn', '25'); await page.fill('#sName', 'Breaker A');
      await page.click('#sToLib');
      await page.selectOption('#setMethod', 'iso'); await page.selectOption('#setPeriod', 'p2night'); await page.fill('#setSoft', '40');
      const d = await saveScenario(page);
      const src = d.sources.find(s => s.name === 'Breaker A');
      assert.deepStrictEqual([src.eq, src.lw, src.on, src.pen], ['prj-breaker-a', 113, 25, 5]);
      assert.ok(d.library.some(e => e.id === 'prj-breaker-a'));
      // load it into a fresh state
      await page.click('#btnDemo');
      await page.setInputFiles('#fileLoad', { name: 's.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d)) });
      await page.waitForFunction(() => /Loaded s\.json/.test(document.getElementById('log').innerText));
      const r = await page.evaluate(() => ({ S: window.__noise.state.settings, s: window.__noise.state.sources.find(s => s.name === 'Breaker A') }));
      assert.deepStrictEqual([r.S.method, r.S.period, r.S.soft], ['iso', 'p2night', 0.4]);
      assert.deepStrictEqual([r.s.eq, r.s.lw, r.s.on, r.s.pen, r.s.h], ['prj-breaker-a', 113, 25, 5, 2]);
    }
  },
  {
    name: 'v0.4 scenario: ground and numeric equipment index migrate, bad settings ignored',
    async run({ page, assert }) {
      const v04 = {
        app: 'noise-poc', version: '0.4.0', origin: null,
        settings: { hr: 1.5, ground: 'soft', air: true, cellPx: 0, opacity: 'x' },
        sources: [{ name: 'Old saw', eq: 3, lw: 117, h: 1.5, x: 5, y: 5 }], buildings: [], hoardings: []
      };
      await page.setInputFiles('#fileLoad', { name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(v04)) });
      const log = await page.waitForFunction(() => /Loaded old\.json/.test(document.getElementById('log').innerText)).then(() => page.textContent('#log'));
      const r = await page.evaluate(() => ({ S: window.__noise.state.settings, s: window.__noise.state.sources[0] }));
      assert.strictEqual(r.S.soft, 1); assert.strictEqual(r.S.cellPx, 5); assert.strictEqual(r.S.opacity, 0.7);
      assert.deepStrictEqual([r.s.eq, r.s.lw, r.s.pen, r.s.on, r.s.h], ['custom', 117, 0, 100, 1.5]);
      assert.ok(log.includes('“cellPx” ignored') && log.includes('older version'), 'warnings logged');
    }
  },
  {
    name: 'library export / import round trip',
    async run({ page, assert }) {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnLibExport')]);
      const lib = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
      lib.items = lib.items.slice(0, 5).concat([{ id: 'my-rig', name: 'My rig', lw: 112, sac: true, group: 'Project' }, { id: 'bad', name: 'Bad', lw: 'loud' }]);
      await page.setInputFiles('#fileLib', { name: 'lib.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(lib)) });
      await page.waitForFunction(() => /Imported equipment library/.test(document.getElementById('log').innerText));
      const ids = await page.evaluate(() => window.__noise.library().map(e => e.id));
      assert.ok(ids.includes('my-rig') && ids.includes('custom') && !ids.includes('bad'), ids.join(','));
      assert.strictEqual(ids.length, 7);
    }
  }
];
