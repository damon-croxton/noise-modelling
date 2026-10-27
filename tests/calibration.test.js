/* Calibration import: comparison with measured / other-tool levels. */
'use strict';
const fs = require('fs');
const imp = (page, name, text) => page.setInputFiles('#fileCal', { name, mimeType: 'text/csv', buffer: Buffer.from(text) });

module.exports = [
  {
    name: 'receiver IDs: a known bias and spread are recovered',
    async run({ page, assert, waitLog }) {
      await page.selectOption('#setPeriod', 'p2night');
      const recs = await page.evaluate(async () => (await window.__noise.runAssessment()).receivers.filter(r => r.Leq != null).map(r => [r.id, r.Leq]));
      const noise = recs.map((_, i) => (i % 2 ? 0.5 : -0.5));
      const csv = 'Receiver ID,LAeq\n' + recs.map(([id, L], i) => `${id},${(L + 2 + noise[i]).toFixed(2)}`).join('\n');
      await imp(page, 'other_tool.csv', csv);
      await waitLog('Calibration other_tool.csv');
      const s = await page.evaluate(() => window.__noise.state.calib.stats);
      const expMean = -2 - noise.reduce((a, b) => a + b, 0) / noise.length;
      assert.strictEqual(s.n, recs.length);
      assert.ok(Math.abs(s.mean - expMean) < 0.01, `mean ${s.mean} vs ${expMean}`);
      assert.ok(Math.abs(s.sd - 0.5 * Math.sqrt(recs.length / (recs.length - 1))) < 0.02, `sd ${s.sd}`);
      assert.strictEqual(s.within3, 1); assert.strictEqual(s.catN, recs.length);
    }
  },
  {
    name: 'coordinates: height, RL and floor; a point inside a building moves to its façade',
    async run({ page, assert, waitLog }) {
      await page.evaluate(() => { window.__noise.state.origin = { type: 'projected', x0: 330000, y0: 6250000, zone: 56, epsg: 7856 }; });
      const exp = await page.evaluate(() => [window.__noise._t.levelAt(30, -5, 1.5), window.__noise._t.levelAt(-20, -40, 4)]);
      const csv = 'Point;Easting;Northing;Height;RL;Floor;"LAeq,15min"\n' +
        `M1;330030;6249995;1.5;;;${(exp[0] - 1).toFixed(3)}\n` +
        `M2;329980;6249960;;4;;${(exp[1] - 1).toFixed(3)}\n` +
        `C3;329940;6249998;;;L2;60\n` +
        `bad;329940;6249998;;;;n/a\n`;
      await imp(page, 'measured.csv', csv);
      await waitLog('Calibration measured.csv');
      const c = await page.evaluate(() => window.__noise.state.calib);
      assert.deepStrictEqual([c.stats.n, c.stats.skipped], [3, 1], JSON.stringify(c.rows.map(r => [r.id, r.how, r.theirs, r.ours])));
      assert.ok(Math.abs(c.rows[0].diff - 1) < 0.01 && Math.abs(c.rows[1].diff - 1) < 0.01, `${c.rows[0].diff} ${c.rows[1].diff}`);
      assert.strictEqual(c.rows[2].how, 'coordinates → nearest façade', JSON.stringify(c.rows[2]));
      assert.ok(Math.abs(c.rows[2].z - 7.5) < 1e-9, `z ${c.rows[2].z}`);   // apartment block base 0 + 1.5 + 2 × 3 m
      assert.strictEqual(c.rows[2].nml, 60, JSON.stringify(c.rows[2]));   // standard hours, R3: RBL 50 + 10
    }
  },
  {
    name: 'comparison CSV export, and a file without a level column is rejected',
    async run({ page, assert, waitLog, expectError }) {
      expectError(/no level column/);
      await page.evaluate(() => { window.__noise.state.origin = { type: 'projected', x0: 330000, y0: 6250000, zone: 56, epsg: 7856 }; });
      await imp(page, 'a.csv', 'E,N,LAeq\n330030,6249995,55\n330040,6249995,52\n');
      await waitLog('Calibration a.csv');
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnCalExport')]);
      const lines = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').split('\r\n');
      assert.ok(lines[0].startsWith('Point,Imported LAeq (dBA),This tool LAeq (dBA),Difference (dB)'));
      assert.strictEqual(lines.filter(l => /^row \d/.test(l)).length, 2);
      await imp(page, 'b.csv', 'E,N,Comment\n330030,6249995,hello\n');
      await waitLog('Calibration b.csv FAILED: no level column');
    }
  }
];
