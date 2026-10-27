/* Stage 4: shifts, batch run and comparison, respite tracking, the printable
   report and the data-source record. All scenes are synthetic. */
'use strict';
const fs = require('fs');

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/* A small street: residential blocks either side of plant at the origin, in one NCA (R4). */
async function street(page) {
  const B = [[rect(-30, 12, 0, 24), 9, 'North terrace', { landUse: 'residential', address: '1 Example St' }], [rect(5, 12, 30, 30), 15, 'North flats', { landUse: 'residential' }],
    [rect(-30, -40, 30, -25), 6, 'South row', { landUse: 'residential' }], [rect(200, 200, 220, 215), 6, 'Far house', { landUse: 'residential' }]];
  await page.evaluate(B => {
    const N = window.__noise, T = N._t, st = N.state;
    st.buildings = B.map(b => T.makeBuilding(...b));
    st.hoardings = []; st.assess.results = null;
    st.ncas = [Object.assign(T.makeNca([[-400, -400], [400, -400], [400, 400], [-400, 400]], 'Street NCA'), { cat: 'R4', rbl: { day: null, evening: null, night: null } })];
    st.sources = [{ id: 9501, name: 'Saw', eq: 'custom', lw: 110, on: 50, pen: 5, mit: 0, h: 2, x: 0, y: 0, notes: 'cutting kerbs' }];
    Object.assign(st.settings, { period: 'p2night', method: 'tfnsw', combine: 'all' });
    st.shifts = []; st.shiftId = null; T.curShift(); st.shifts[0].name = 'Night saw';
    T.geomChanged();
  }, B);
}
const download = async (page, click) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  return { name: dl.suggestedFilename(), text: fs.readFileSync(await dl.path(), 'utf8') };
};

module.exports = [
  {
    name: 'dates: lists and ranges, bad parts reported; runs of consecutive dates',
    async run({ page, assert }) {
      const r = await page.evaluate(() => {
        const T = window.__noise._t;
        const a = T.parseDates('2026-11-03..2026-11-05, 2026-11-10; 2026-11-04, 2026-02-30, nonsense, 2026-12-30 to 2027-01-02');
        return { a, txt: T.datesText(a.dates), runs: T.dateRuns(a.dates.map(d => Date.parse(d) / 86400000)).map(x => x.n) };
      });
      assert.deepStrictEqual(r.a.dates, ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-10', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
      assert.deepStrictEqual(r.a.bad, ['2026-02-30', 'nonsense']);
      assert.strictEqual(r.txt, '2026-11-03..2026-11-05, 2026-11-10, 2026-12-30..2027-01-02');
      assert.deepStrictEqual(r.runs, [3, 1, 4]);
    }
  },
  {
    name: 'respite rule (CNVG-PTI RP): consecutive limit and minimum break, evenings and nights',
    async run({ page, assert }) {
      const r = await page.evaluate(() => {
        const T = window.__noise._t, R = T.rules().respite, d = s => T.parseDates(s).dates.map(x => Date.parse(x) / 86400000);
        return {
          src: R.source, kinds: R.kinds,
          n2: T.respiteCheck(d('2026-11-02..2026-11-03'), R.kinds.night),
          n3: T.respiteCheck(d('2026-11-02..2026-11-04'), R.kinds.night),
          nGap: T.respiteCheck(d('2026-11-02..2026-11-03, 2026-11-07..2026-11-08'), R.kinds.night),
          nGapOk: T.respiteCheck(d('2026-11-02..2026-11-03, 2026-11-09..2026-11-10'), R.kinds.night),
          e3: T.respiteCheck(d('2026-11-02..2026-11-04'), R.kinds.evening),
          e4: T.respiteCheck(d('2026-11-02..2026-11-05'), R.kinds.evening)
        };
      });
      assert.ok(/Table 8/.test(r.src));
      assert.deepStrictEqual([r.kinds.night.maxConsecutive, r.kinds.night.minBreak, r.kinds.evening.maxConsecutive, r.kinds.evening.minBreak], [2, 5, 3, 4]);
      assert.deepStrictEqual(r.kinds.night.periods, ['p2night']);
      assert.ok(!r.kinds.evening.periods.includes('p1day'), 'not applied to OOHW Period 1 days');
      assert.deepStrictEqual(r.n2.issues, []);
      assert.strictEqual(r.n3.issues.length, 1); assert.ok(/3 in a row/.test(r.n3.issues[0]));
      assert.strictEqual(r.nGap.issues.length, 1); assert.ok(/3 free .* \(minimum 5\)/.test(r.nGap.issues[0]), r.nGap.issues[0]);
      assert.deepStrictEqual(r.nGapOk.issues, []);
      assert.deepStrictEqual(r.e3.issues, []);
      assert.strictEqual(r.e4.issues.length, 1);
      assert.strictEqual(r.n3.longest, 3); assert.strictEqual(r.nGap.count, 4);
    }
  },
  {
    name: 'shifts: new, duplicate, rename and switch keep plant, period and dates apart',
    async run({ page, assert }) {
      await street(page);
      await page.evaluate(() => window.__noise._t.switchShift(window.__noise.state.shiftId));   // refresh panel
      await page.click('#shDup');
      await page.fill('#shName', 'Evening saw');
      await page.selectOption('#shPeriod', 'p1eve');
      await page.fill('#shDates', '2026-11-02..2026-11-04'); await page.locator('#shDates').dispatchEvent('change');
      await page.click('#shNew'); await page.fill('#shName', 'Empty');
      const r = await page.evaluate(() => {
        const st = window.__noise.state;
        return st.shifts.map(s => ({ name: s.name, period: s.period, dates: s.dates.length, n: s.sources.length, notes: s.sources.map(x => x.notes || '').join() })).concat([{ cur: st.shifts.findIndex(s => s.id === st.shiftId), srcs: st.sources.length, period: st.settings.period }]);
      });
      assert.deepStrictEqual(r.slice(0, 3), [
        { name: 'Night saw', period: 'p2night', dates: 0, n: 1, notes: 'cutting kerbs' },
        { name: 'Evening saw', period: 'p1eve', dates: 3, n: 1, notes: 'cutting kerbs' },
        { name: 'Empty', period: 'p1eve', dates: 0, n: 0, notes: '' }]);
      assert.deepStrictEqual(r[3], { cur: 2, srcs: 0, period: 'p1eve' });
      // switching back restores that shift's plant and period, and the copy's plant is independent
      await page.selectOption('#shSel', { label: 'Night saw – OOHW Period 2 – night' });
      const s = await page.evaluate(() => { const st = window.__noise.state; st.sources[0].lw = 100; return { period: st.settings.period, ui: document.getElementById('setPeriod').value, copy: st.shifts[1].sources[0].lw, name: document.getElementById('shName').value }; });
      assert.deepStrictEqual(s, { period: 'p2night', ui: 'p2night', copy: 110, name: 'Night saw' });
      page.once('dialog', d => d.accept());
      await page.selectOption('#shSel', { label: 'Empty – OOHW Period 1 – evening' });
      await page.click('#shDel');
      assert.strictEqual(await page.evaluate(() => window.__noise.state.shifts.length), 2);
    }
  },
  {
    name: 'run all shifts: per-shift results match single runs; comparison, respite issues and CSV',
    async run({ page, assert }) {
      await street(page);
      // three shifts: nights on 3 consecutive dates (RP breach), evenings on 3 dates (allowed), a quiet day shift
      const single = await page.evaluate(async () => {
        const N = window.__noise, T = N._t, st = N.state;
        const base = st.sources[0];
        st.shifts[0].dates = T.parseDates('2026-11-02..2026-11-04').dates;
        const ev = T.makeShift('Evening saw', [Object.assign({}, base, { id: 9502 })], { period: 'p1eve', dates: T.parseDates('2026-11-09..2026-11-11').dates });
        const dy = T.makeShift('Day, small plant', [Object.assign({}, base, { id: 9503, lw: 90, pen: 0 })], { period: 'std' });
        st.shifts.push(ev, dy);
        const out = {};
        for (const sh of st.shifts) { T.switchShift(sh.id, true); const R = await N.runAssessment(); out[sh.name] = R.receivers.filter(r => r.exc > 0).map(r => r.id + ':' + r.Leq.toFixed(3)).sort(); }
        T.switchShift(st.shifts[0].id, true);
        return out;
      });
      page.on('dialog', d => d.accept());
      await page.click('#shRunAll');
      await page.waitForFunction(() => /All shifts: 3 of 3 run/.test(document.getElementById('log').innerText) && document.getElementById('cmpTbl'), null, { timeout: 60000 });
      const r = await page.evaluate(() => {
        const st = window.__noise.state, out = {};
        for (const sh of st.shifts) out[sh.name] = sh.results.receivers.filter(r => r.exc > 0).map(r => r.id + ':' + r.Leq.toFixed(3)).sort();
        const rs = st.respite, rp = rs.list.filter(x => x.per.get(st.shifts[0].id) && x.per.get(st.shifts[0].id).measures.includes('RP'));
        return { out, cur: st.shiftId === st.shifts[0].id, curRes: st.assess.results === st.shifts[0].results, issues: rs.list.filter(x => x.issues.length).map(x => x.id).sort(), rp: rp.map(x => x.id).sort(),
          evIssues: rs.list.filter(x => x.issues.some(t => /Evenings/.test(t))).length, visible: !document.getElementById('ptable').hidden, rows: document.querySelectorAll('#cmpTbl tbody tr').length,
          above: rs.list.filter(x => x.above).length, sum: document.querySelector('#ptable table tbody').innerText };
      });
      assert.deepStrictEqual(r.out, single, 'batch results equal individual runs');
      assert.ok(r.cur && r.curRes, 'back on the first shift with its own results');
      assert.ok(r.rp.length > 0, 'the night shift triggers RP somewhere');
      assert.deepStrictEqual(r.issues, r.rp, 'exactly the RP receivers of the 3-night shift breach the 2-night limit');
      assert.strictEqual(r.evIssues, 0, '3 evenings are within the limit');
      assert.ok(r.visible && r.rows === r.above, `comparison lists every receiver above NML in any shift (${r.rows} vs ${r.above})`);
      assert.ok(/Night saw/.test(r.sum) && /Evening saw/.test(r.sum) && /Day, small plant/.test(r.sum));
      const csv = await download(page, () => page.click('#cmpCsv'));
      const lines = csv.text.replace(/^﻿/, '').trim().split(/\r\n/);
      assert.ok(lines[0].includes('Night saw: exceedance') && lines[0].includes('Respite issues'));
      assert.ok(lines.length >= r.above + 2);
      // respite map mode renders without errors and colours buildings
      await page.selectOption('#asDisplay', 'respite');
      await page.waitForTimeout(200);
    }
  },
  {
    name: 'report: sections, disclaimer, works table, property list, height source, data sources; asks first',
    async run({ page, assert, fixtures }) {
      await street(page);
      // a DEM, so the data sources list a file with its date
      const asc = fixtures.asc({ W: 40, H: 40, cell: 25, xll: 330000, yll: 6250000, z: () => 20 });
      await page.setInputFiles('#fileDem', { name: 'site_dem.asc', mimeType: 'text/plain', buffer: Buffer.from(asc) });
      await page.waitForFunction(() => /DEM installed/.test(document.getElementById('log').innerText));
      await page.evaluate(() => { const st = window.__noise.state; st.project.name = 'Synthetic street'; st.project.by = 'Env team'; });
      page.once('dialog', d => d.dismiss());
      await page.click('#btnReport');
      await page.waitForFunction(() => /Report cancelled/.test(document.getElementById('log').innerText), null, { timeout: 60000 });
      page.once('dialog', d => d.accept());
      const rep = await download(page, () => page.click('#btnReport'));
      const t = rep.text, above = await page.evaluate(() => window.__noise.state.assess.results.receivers.filter(r => r.exc > 0).length);
      assert.ok(/^noise_report_night-saw_\d{4}-\d{2}-\d{2}\.html$/.test(rep.name), rep.name);
      for (const k of ['1. Introduction', '2. Method', '3. Works description', '4. Results', 'Appendix A', 'Appendix B', 'Appendix C', 'Screening and planning aid only',
        'Synthetic street', 'Env team', 'OOHW Period 2 – night', 'cutting kerbs', 'Properties per land use and impact category', 'Overall statement', '1 Example St', 'site_dem.asc', 'Height source', 'entered by hand', 'Street NCA', 'Print / save as PDF'])
        assert.ok(t.includes(k), `report missing “${k}”`);
      assert.strictEqual((t.match(/<img class="map"/g) || []).length, 2, 'works and impact maps');
      assert.ok(/data:image\/png;base64,/.test(t));
      // one property-list row per receiver above NML
      const sec = t.slice(t.indexOf('Receivers above the noise management level'), t.indexOf('Appendix A'));
      assert.strictEqual((sec.match(/<tr>/g) || []).length - 1, above);
      // the far house is below NML; every building appears in Appendix A with its height source
      const app = t.slice(t.indexOf('Appendix A'), t.indexOf('Appendix B'));
      assert.strictEqual((app.match(/<tr>/g) || []).length - 1, 4);
      // the report opens as a page without errors
      const p2 = await page.context().browser().newPage(); const errs = []; p2.on('pageerror', e => errs.push(e.message));
      await p2.setContent(t); assert.ok(await p2.isVisible('text=Overall statement')); assert.deepStrictEqual(errs, []); await p2.close();
    }
  },
  {
    name: 'report runs the assessment first when results are missing or out of date',
    async run({ page, assert }) {
      await street(page);
      page.once('dialog', d => d.accept());
      await download(page, () => page.click('#btnReport'));
      await page.evaluate(() => { window.__noise.state.sources[0].x = 3; });
      page.once('dialog', d => d.accept());
      const rep = await download(page, () => page.click('#btnReport'));
      const log = await page.textContent('#log');
      assert.ok(/Results are out of date – running the assessment for the report/.test(log));
      assert.ok(!rep.text.includes('inputs have changed since this run'));
    }
  },
  {
    name: 'scenario round trip keeps shifts, dates, notes, project details and data sources',
    async run({ page, assert, fixtures }) {
      await street(page);
      const asc = fixtures.asc({ W: 10, H: 10, cell: 25, xll: 330000, yll: 6250000, z: () => 5 });
      await page.setInputFiles('#fileDem', { name: 'dem_a.asc', mimeType: 'text/plain', buffer: Buffer.from(asc) });
      await page.waitForFunction(() => /DEM installed/.test(document.getElementById('log').innerText));
      await page.evaluate(() => {
        const N = window.__noise, T = N._t, st = N.state;
        st.shifts[0].dates = T.parseDates('2026-11-02..2026-11-03').dates; st.shifts[0].notes = 'kerb works';
        st.shifts.push(T.makeShift('Evening', [{ id: 9601, name: 'Truck', eq: 'custom', lw: 100, on: 100, pen: 0, mit: 0, h: 2, x: 10, y: 0 }], { period: 'p1eve' }));
        st.project = { name: 'P1', by: 'Me' };
      });
      page.once('dialog', d => d.accept());   // the scenario holds an address
      const sv = await download(page, () => page.click('#btnSave'));
      const d = JSON.parse(sv.text);
      assert.strictEqual(d.shifts.length, 2); assert.strictEqual(d.shift, 0);
      assert.deepStrictEqual(d.shifts[0].dates, ['2026-11-02', '2026-11-03']);
      assert.strictEqual(d.shifts[0].sources[0].notes, 'cutting kerbs');
      assert.ok(d.provenance.some(p => p.name === 'dem_a.asc' && p.loaded && p.fileDate));
      d.shift = 1;
      await page.click('#btnDemo');
      await page.setInputFiles('#fileLoad', { name: 's.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d)) });
      await page.waitForFunction(() => /Loaded s\.json/.test(document.getElementById('log').innerText));
      const r = await page.evaluate(() => {
        const st = window.__noise.state;
        return { shifts: st.shifts.map(s => [s.name, s.period, s.dates.join(), s.notes, s.sources.map(x => x.name + (x.notes ? '/' + x.notes : '')).join()]), cur: st.shifts.findIndex(s => s.id === st.shiftId),
          period: st.settings.period, srcs: st.sources.map(s => s.name), project: st.project, prov: st.provenance.map(p => p.name) };
      });
      assert.deepStrictEqual(r.shifts, [['Night saw', 'p2night', '2026-11-02,2026-11-03', 'kerb works', 'Saw/cutting kerbs'], ['Evening', 'p1eve', '', '', 'Truck']]);
      assert.deepStrictEqual([r.cur, r.period, r.srcs], [1, 'p1eve', ['Truck']]);
      assert.deepStrictEqual(r.project, { name: 'P1', by: 'Me' });
      assert.ok(r.prov.includes('dem_a.asc'));
      // a scenario from before shifts loads as one shift
      delete d.shifts; delete d.shift;
      await page.setInputFiles('#fileLoad', { name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d)) });
      await page.waitForFunction(() => /Loaded old\.json/.test(document.getElementById('log').innerText));
      assert.deepStrictEqual(await page.evaluate(() => window.__noise.state.shifts.map(s => s.sources.length)), [1]);
    }
  }
];
