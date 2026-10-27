/* Keyboard shortcuts and page furniture. */
'use strict';
module.exports = [
  {
    name: 'Ctrl+S / Ctrl+B do not switch modes; plain S does',
    async run({ page, assert }) {
      await page.locator('#map').hover();
      await page.keyboard.press('Control+s'); await page.keyboard.press('Control+b');
      assert.strictEqual(await page.evaluate(() => window.__noise.state.mode), 'select');
      await page.keyboard.press('s');
      assert.strictEqual(await page.evaluate(() => window.__noise.state.mode), 'source');
    }
  },
  {
    name: 'version, disclaimer and licence notes are shown',
    async run({ page, assert }) {
      assert.strictEqual(await page.textContent('#ver'), 'v0.10.0');
      const t = await page.textContent('#app');
      for (const k of ['does not replace an assessment by a qualified acoustic consultant', 'OpenStreetMap contributors (ODbL)', 'Apache License 2.0', 'EMF-NV-GD-0060'])
        assert.ok(t.includes(k), 'missing: ' + k);
    }
  }
];
