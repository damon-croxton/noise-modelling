#!/usr/bin/env node
/* Headless test runner (developers and CI only).
 *
 *   node tests/run.js [filter]
 *
 * 1. Opens dist/noise_poc.html in Chromium and reads the in-app self-test
 *    results (window.__noise.selftest). Any failure fails the run.
 * 2. Runs every tests/*.test.js. Each exports { name, run } or an array of
 *    them; run({ page, open, assert, fixtures }) gets a freshly loaded page.
 * Uncaught page errors fail the test they occur in.
 */
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const assert = require('assert');
const fixtures = require('./fixtures');

const PAGE = 'file://' + path.resolve(__dirname, '..', 'dist', 'noise_poc.html');
const filter = process.argv[2] || '';

async function open(browser) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page._errors = [];
  page._allowed = [];   // patterns of console errors a test expects (e.g. a deliberately rejected file)
  page.on('pageerror', e => page._errors.push(e.message));
  // app log lines marked 'fail' are echoed to console.error with a [noise-poc] prefix; tests assert on those explicitly
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !t.startsWith('[noise-poc]') && !page._allowed.some(re => re.test(t))) page._errors.push(t); });
  // UI preferences for tests: the workspace layout and the small demo (the scene the tests were written
  // against), no automatic re-runs (tests run the assessment explicitly) and no map tiles (no network)
  await page.addInitScript(() => { try { if (!localStorage.getItem('noise-poc-ui-v2')) localStorage.setItem('noise-poc-ui-v2', JSON.stringify({ auto: false, layout: 'workspace', start: 'demo', layers: { osm: false } })); } catch (e) {} });
  // controls live in menus, tabs and folded cards: bring each one into view before using it, as a user would
  for (const m of ['click', 'fill', 'selectOption', 'check', 'uncheck', 'hover']) {
    const orig = page[m].bind(page);
    page[m] = async (sel, ...a) => {
      if (typeof sel === 'string' && sel.startsWith('#')) await page.evaluate(s => window.__noise && window.__noise._reveal && window.__noise._reveal(s), sel).catch(() => {});
      return orig(sel, ...a);
    };
  }
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__noise && window.__noise.selftest, null, { timeout: 30000 });
  return page;
}
/* waits until the in-app log contains a line matching re (string source) */
async function waitLog(page, re, timeout = 60000) {
  await page.waitForFunction(src => new RegExp(src).test(document.getElementById('log').innerText), re, { timeout });
  return page.$eval('#log', el => el.innerText);
}

(async () => {
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  const report = (ok, name, extra) => {
    ok ? pass++ : fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  };

  // 1. in-app self-tests
  {
    const page = await open(browser);
    const st = await page.evaluate(() => window.__noise.selftest);
    for (const r of st.results) {
      const detail = r.error ? r.error : `got ${Number(r.got).toFixed(3)}, expected ${Number(r.exp).toFixed(3)} ± ${r.tol}`;
      if (!filter || ('self-test: ' + r.name).includes(filter)) report(r.ok, 'self-test: ' + r.name, detail);
    }
    report(page._errors.length === 0, 'page loads without errors', page._errors.join(' | '));
    await page.close();
  }

  // 2. browser tests
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
  for (const f of files) {
    let tests = require(path.join(__dirname, f));
    if (!Array.isArray(tests)) tests = [tests];
    for (const t of tests) {
      const name = `${f.replace('.test.js', '')}: ${t.name}`;
      if (filter && !name.includes(filter)) continue;
      const page = await open(browser);
      try {
        await t.run({ page, assert, fixtures, waitLog: (re, ms) => waitLog(page, re, ms), expectError: re => page._allowed.push(re) });
        if (page._errors.length) throw new Error('page error: ' + page._errors.join(' | '));
        report(true, name);
      } catch (err) {
        report(false, name, process.env.FULL_ERR ? err.message : err.message.split("\n")[0]);
      }
      await page.close();
    }
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
