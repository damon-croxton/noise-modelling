/* UI pass: layouts, themes, panels, shift chips, Clear menu, map layers,
   focus mode, the quick guide, tooltips and automatic updates. */
'use strict';

const CARDS = ['card-shifts', 'card-plant', 'card-selection', 'card-results', 'card-report', 'card-mapdisplay', 'card-site', 'card-lidar', 'card-dem', 'card-ncas',
  'card-landuse', 'card-library', 'card-model', 'card-assess', 'card-rules', 'card-calibration', 'card-about', 'card-sources', 'card-log'];
const where = page => page.evaluate(ids => ids.map(id => { const c = document.getElementById(id), p = c.closest('#left, #right, #bottom'); return p ? p.id : c.parentElement.id; }), CARDS);
const pick = (page, sel) => page.evaluate(s => { document.querySelector(s).click(); }, sel);   // radios in the View menu

module.exports = [
  {
    name: 'layouts: workspace, guided and single column each place every card; the choice is remembered',
    async run({ page, assert }) {
      let w = await where(page);
      assert.deepStrictEqual(w.slice(0, 3), ['left', 'left', 'left'], 'shifts, plant and selection on the left');
      assert.ok(w.slice(3, 17).every(p => p === 'right'), 'method, site and results on the right: ' + w);
      assert.deepStrictEqual(w.slice(17), ['bottom', 'bottom'], 'data sources and log at the bottom');
      assert.deepStrictEqual(await page.$$eval('#rtabs button', b => b.map(x => x.textContent)), ['Results', 'Site', 'Method']);
      await page.click('[data-menu=mView]'); await pick(page, 'input[name=uiLayout][value=guided]');
      w = await where(page);
      assert.ok(w.slice(0, 17).every(p => p === 'left') && !(await page.isVisible('#right')), 'guided: one panel');
      assert.deepStrictEqual(await page.$$eval('#steps button', b => b.map(x => x.textContent)), ['1 Site', '2 Shifts', '3 Method', '4 Results', '5 Report']);
      assert.ok(await page.isVisible('#btnOsm'), 'step 1 shows the site card');
      await page.click('#stepNext'); assert.ok(await page.isVisible('#shName') && !(await page.isVisible('#btnOsm')), 'step 2: shifts');
      await page.click('#stepNext'); await page.click('#stepNext');
      assert.ok(await page.isVisible('#btnAssess'), 'step 4: results');
      await page.click('#stepBack'); assert.ok(await page.isVisible('#setMethod'), 'back to step 3');
      assert.ok(!(await page.isVisible('#selBody')), 'Selected card hidden while nothing is selected');
      await page.evaluate(() => window.__noise._t && 0);
      await page.click('[data-menu=mView]'); await pick(page, 'input[name=uiLayout][value=single]');
      w = await where(page);
      assert.ok(w.slice(0, 17).every(p => p === 'left'), 'single column: all in one panel');
      await page.reload(); await page.waitForFunction(() => window.__noise && window.__noise.selftest);
      assert.ok((await page.getAttribute('#app', 'class')).includes('layout-single'), 'layout remembered after reload');
    }
  },
  {
    name: 'themes and density: light, dark, high contrast and compact change the page and the map',
    async run({ page, assert }) {
      const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const light = await bg();
      await page.click('[data-menu=mView]'); await pick(page, 'input[name=uiTheme][value=dark]');
      assert.ok((await page.getAttribute('html', 'class')).includes('theme-dark'));
      assert.notStrictEqual(await bg(), light);
      await page.click('#clrOverlays'); await page.waitForTimeout(150);   // heat map off, so the corner shows the map background
      const px = await page.evaluate(() => Array.from(document.getElementById('map').getContext('2d').getImageData(2, 2, 1, 1).data.slice(0, 3)));
      assert.ok(px[0] < 60 && px[1] < 60 && px[2] < 60, `dark map background, got ${px}`);
      await page.click('[data-menu=mView]'); await pick(page, 'input[name=uiTheme][value=contrast]');
      assert.ok((await page.getAttribute('html', 'class')).includes('theme-contrast'));
      await page.click('#uiCompact');
      assert.ok((await page.getAttribute('html', 'class')).includes('density-compact'));
      await page.click('#uiHelp');
      assert.ok(!(await page.isVisible('#card-shifts .help')), 'help text hidden');
    }
  },
  {
    name: 'shift chips: one per shift, click to switch; banner and plant list follow; counts update when plant is added',
    async run({ page, assert }) {
      await page.click('#shDup'); await page.fill('#shName', 'Night B'); await page.selectOption('#setPeriod', 'p2night');
      const chips = await page.$$eval('#shChips button', b => b.map(x => [x.textContent, x.classList.contains('on')]));
      assert.strictEqual(chips.length, 2); assert.ok(chips[1][0].includes('Night B') && chips[1][0].includes('P2 night') && chips[1][1], JSON.stringify(chips));
      assert.ok((await page.textContent('#banner')).includes('Night B') && (await page.textContent('#banner')).includes('OOHW Period 2 – night'));
      // add a plant item to this shift with the map tool
      await page.click('#plAdd');
      const box = await page.locator('#map').boundingBox();
      await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.35);
      await page.waitForFunction(() => /2 plant/.test(document.querySelector('#shChips button.on').textContent));
      assert.strictEqual(await page.$$eval('#plantList tbody tr', r => r.length), 2);
      // the first shift still has one, and switching shows its own plant and period
      await page.click('#shChips button:not(.on)');
      assert.ok((await page.textContent('#banner')).includes('Demo shift') && (await page.textContent('#banner')).includes('Standard hours'));
      assert.strictEqual(await page.$$eval('#plantList tbody tr', r => r.length), 1);
      assert.strictEqual(await page.inputValue('#setPeriod'), 'std');
      // clicking a plant row selects it; × deletes it
      await page.click('#plantList tbody tr');
      assert.ok((await page.inputValue('#sName')).length > 0, 'selected plant shown in Selected');
      await page.click('#plantList [data-del]');
      assert.strictEqual(await page.evaluate(() => window.__noise.state.sources.length), 0);
    }
  },
  {
    name: 'Clear menu: tidy the screen without deleting; remove plant, hoarding, NCAs, buildings; new project',
    async run({ page, assert }) {
      await page.click('#clrOverlays');
      let L = await page.evaluate(() => ({ ...JSON.parse(localStorage.getItem('noise-poc-ui')).layers }));
      assert.deepStrictEqual([L.heat, L.impact, L.blabels, L.slabels, L.legend, L.ncas, L.hoard], [false, false, false, false, false, true, true]);
      assert.ok(!(await page.isVisible('#legend')));
      await page.click('#clrShowAll');
      assert.ok(await page.isVisible('#legend'));
      const counts = () => page.evaluate(() => { const st = window.__noise.state; return [st.sources.length, st.hoardings.length, st.ncas.length, st.buildings.length, st.shifts.length]; });
      await page.evaluate(() => { const N = window.__noise, st = N.state; st.ncas.push(N._t.makeNca([[-50, -50], [50, -50], [50, 50]], 'X')); });
      page.once('dialog', d => d.dismiss()); await page.click('#clrPlant');
      assert.strictEqual((await counts())[0], 1, 'cancelled: plant kept');
      page.once('dialog', d => d.accept()); await page.click('#clrPlant');
      page.once('dialog', d => d.accept()); await page.click('#clrHoard');
      page.once('dialog', d => d.accept()); await page.click('#clrNcas');
      assert.deepStrictEqual(await counts(), [0, 0, 0, 5, 1]);
      await page.click('#shNew');
      page.once('dialog', d => d.accept()); await page.click('#clrAll');
      assert.deepStrictEqual(await counts(), [0, 0, 0, 0, 1]);
      assert.ok((await page.textContent('#log')).includes('New empty project'));
    }
  },
  {
    name: 'focus mode (F / Esc), panel hide buttons and the quick guide',
    async run({ page, assert }) {
      await page.locator('#map').hover();
      await page.keyboard.press('f');
      assert.ok(!(await page.isVisible('#left')) && !(await page.isVisible('#right')) && !(await page.isVisible('#bottom')));
      await page.keyboard.press('Escape');
      assert.ok(await page.isVisible('#left') && await page.isVisible('#right'));
      await page.click('#hideLeft');
      assert.ok(!(await page.isVisible('#left')) && await page.isVisible('#showLeft'));
      await page.click('#showLeft'); assert.ok(await page.isVisible('#left'));
      await page.click('#toggleBottom'); assert.ok(!(await page.isVisible('#log')) || (await page.evaluate(() => document.getElementById('bottom').classList.contains('closed'))));
      await page.click('#btnHelp');
      assert.ok(await page.isVisible('#guide'));
      assert.ok((await page.textContent('#guide')).includes("you don't need to click Run all shifts"));
      await page.keyboard.press('Escape');
      assert.ok(!(await page.isVisible('#guide')));
    }
  },
  {
    name: 'every fixed button explains itself (tooltip)',
    async run({ page, assert }) {
      const missing = await page.evaluate(() => [...document.querySelectorAll('button')]
        .filter(b => !b.closest('.paneltabs, #ptable, #selBody, #guide, #plantList, .card > h2') && !b.title)
        .map(b => b.id || b.textContent.trim()));
      assert.deepStrictEqual(missing, []);
    }
  },
  {
    name: 'update automatically: results follow a moved plant item; off leaves them out of date',
    async run({ page, assert }) {
      await page.evaluate(() => { window.__noise.state.sources[0].x = 0; });
      await page.click('#btnAssess');
      await page.waitForFunction(() => /up to date/.test(document.getElementById('runState').textContent));
      // auto on: move the plant, results catch up by themselves
      await page.check('#asAuto');
      await page.evaluate(() => { window.__noise.state.sources[0].x = 4; window.__noise.state.sources[0].h = 2.5; });
      await page.locator('#map').hover();   // any redraw notices the change
      await page.waitForFunction(() => /Auto-update/.test(document.getElementById('log').textContent), null, { timeout: 10000 });
      await page.waitForFunction(() => /up to date/.test(document.getElementById('runState').textContent));
      // auto off: stays out of date
      await page.uncheck('#asAuto');
      await page.evaluate(() => { window.__noise.state.sources[0].x = 9; });
      await page.mouse.move(10, 10); await page.locator('#map').hover();
      await page.waitForTimeout(1800);
      assert.ok(/Out of date/.test(await page.textContent('#runState')));
    }
  },
  {
    name: 'Compare & respite runs out-of-date shifts itself',
    async run({ page, assert }) {
      await page.click('#shDup');
      await page.click('#shCompare');
      await page.waitForSelector('#cmpTbl');
      const st = await page.evaluate(() => window.__noise.state.shifts.map(s => !!s.results));
      assert.deepStrictEqual(st, [true, true]);
      assert.ok(/Shifts brought up to date: 2 of 2 run/.test(await page.textContent('#log')));
    }
  }
];
