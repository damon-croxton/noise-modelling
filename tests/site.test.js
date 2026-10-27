/* Site workflow: start-up scene and layout, the numbered site steps, Go to
   site from the example, OSM-only fetch, and the OSM street-map underlay.
   Network calls are answered by Playwright routes – nothing leaves the test. */
'use strict';

const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==', 'base64');
const SITE = [-33.88901, 151.23702];
const OSM_XML = `<?xml version="1.0"?><osm version="0.6">
  <node id="1" lat="-33.8889" lon="151.2368"/><node id="2" lat="-33.8889" lon="151.2371"/><node id="3" lat="-33.8891" lon="151.2371"/><node id="4" lat="-33.8891" lon="151.2368"/>
  <way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/><tag k="building" v="apartments"/><tag k="building:levels" v="5"/></way></osm>`;
/* Fresh start with the app's own defaults (layout, start-up scene, underlay), auto-update off. */
async function defaults(page) {
  // set before the app reads it (a write followed by an immediate reload can be lost)
  await page.addInitScript(() => localStorage.setItem('noise-poc-ui-v2', JSON.stringify({ auto: false })));
  await page.reload(); await page.waitForFunction(() => window.__noise && window.__noise.selftest);
}

module.exports = [
  {
    name: 'opens on the rail corridor example in the guided layout, at step 1 Site; Report is in Results, not the top bar',
    async run({ page, assert }) {
      await page.route('https://tile.openstreetmap.org/**', r => r.fulfill({ body: PNG1, contentType: 'image/png' }));
      await defaults(page);
      const r = await page.evaluate(() => ({ cls: document.getElementById('app').className, ex: window.__noise.state.example, n: window.__noise.state.buildings.length, shift: window.__noise.state.shifts[0].name }));
      assert.ok(r.cls.includes('layout-guided'), r.cls);
      assert.strictEqual(r.ex, 'corridor'); assert.ok(r.n > 50);
      assert.strictEqual(await page.textContent('#steps button.on'), '1 Site');
      assert.ok(await page.isVisible('#exampleNote'), 'example notice shown');
      assert.ok(await page.isVisible('#siteLL') && await page.isVisible('#btnSite') && await page.isVisible('#btnOsm'));
      assert.ok((await page.textContent('#card-site')).includes('right-click the project location'));
      assert.ok((await page.textContent('#card-dem')).includes('1 m DEM') && (await page.getAttribute('#card-dem a', 'href')).includes('elevation.fsdf.org.au'));
      assert.ok((await page.textContent('#card-lidar')).includes('.laz'));
      assert.strictEqual(await page.locator('#topbar #btnReport').count(), 0, 'no Report in the top bar');
      assert.ok(await page.evaluate(() => !!document.getElementById('btnReport').closest('#card-report')));
      // the guided layout's Results step shows the report card next to it in workspace; in guided it is step 5
      assert.strictEqual(await page.$$eval('#steps button', b => b[4].textContent), '5 Report');
    }
  },
  {
    name: 'Go to site from the example: asks, clears the example, moves there; steps tick off; cancel keeps the example',
    async run({ page, assert }) {
      await page.route('https://tile.openstreetmap.org/**', r => r.fulfill({ body: PNG1, contentType: 'image/png' }));
      await defaults(page);
      await page.fill('#siteLL', SITE.join(', '));
      page.once('dialog', d => d.dismiss()); await page.click('#btnSite');
      assert.strictEqual(await page.evaluate(() => window.__noise.state.example), 'corridor', 'cancel keeps the example');
      page.once('dialog', d => d.accept()); await page.click('#btnSite');
      const r = await page.evaluate(() => { const st = window.__noise.state; return { ex: st.example, b: st.buildings.length, s: st.sources.length, zone: st.origin && st.origin.zone, w: window.innerWidth }; });
      assert.deepStrictEqual([r.ex, r.b, r.s, r.zone], [null, 0, 0, 56]);
      const steps = await page.$$eval('#card-site li[data-step]', l => l.map(x => x.dataset.step + (x.classList.contains('done') ? ':done' : '') + (x.classList.contains('next') ? ':next' : '')));
      assert.deepStrictEqual(steps.slice(0, 3), ['site:done', 'go:done', 'osm:next']);
      assert.ok(!(await page.isVisible('#exampleNote')));
      assert.ok(/Next: Fetch OSM buildings/.test(await page.textContent('#log')));
    }
  },
  {
    name: 'Fetch OSM buildings uses the OpenStreetMap API only (no Overpass) and records the source',
    async run({ page, assert }) {
      const hosts = [];
      page.on('request', q => { const u = new URL(q.url()); if (u.protocol.startsWith('http')) hosts.push(u.host); });
      await page.route('https://api.openstreetmap.org/**', r => r.fulfill({ body: OSM_XML, contentType: 'application/xml', headers: { 'Access-Control-Allow-Origin': '*' } }));
      await page.fill('#siteLL', SITE.join(', ')); await page.click('#btnSite');
      await page.click('#btnOsm');
      await page.waitForFunction(() => /OSM: 1 elements/.test(document.getElementById('log').textContent));
      const r = await page.evaluate(() => { const st = window.__noise.state; return { osm: st.buildings.filter(b => b.osmId).length, prov: st.provenance.map(p => p.name).join('|') }; });
      assert.strictEqual(r.osm, 1);
      assert.ok(/OpenStreetMap API, fetched/.test(r.prov), r.prov);
      assert.ok(hosts.includes('api.openstreetmap.org') && !hosts.some(h => /overpass/.test(h)), hosts.join(','));
      assert.ok(!/Overpass/.test(await page.textContent('#log')));
      assert.ok((await page.getAttribute('#card-site li[data-step=osm]', 'class')).includes('done'));
    }
  },
  {
    name: 'background map from disk: Automatic uses the NSW base map (right tiles, attribution); OSM is not requested and points to the online copy',
    async run({ page, assert }) {
      const nsw = [], osm = [];
      await page.route('https://maps.six.nsw.gov.au/**', r => { nsw.push(r.request().url()); return r.fulfill({ body: PNG1, contentType: 'image/png' }); });
      await page.route('https://tile.openstreetmap.org/**', r => { osm.push(r.request().url()); return r.fulfill({ body: PNG1, contentType: 'image/png' }); });
      await page.addInitScript(() => localStorage.setItem('noise-poc-ui-v2', JSON.stringify({ auto: false, layout: 'workspace', start: 'demo', layers: { osm: true } })));
      await page.reload(); await page.waitForFunction(() => window.__noise && window.__noise.selftest);
      await page.waitForTimeout(300);
      assert.strictEqual(nsw.length + osm.length, 0, 'no location yet: no tiles');
      await page.fill('#siteLL', SITE.join(', ')); await page.click('#btnSite');
      await page.waitForFunction(() => !document.getElementById('attrib').hidden && /Spatial Services/.test(document.getElementById('attrib').textContent));
      // ArcGIS tile order is z/y/x: the tile under the site at the zoom used
      const [z, y, x] = nsw[0].match(/tile\/(\d+)\/(\d+)\/(\d+)$/).slice(1).map(Number);
      const tx = (SITE[1] + 180) / 360 * 2 ** z, r = SITE[0] * Math.PI / 180, ty = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z;
      assert.ok(z >= 15 && z <= 19, 'street-level zoom ' + z);
      assert.ok(nsw.some(u => u.endsWith(`/NSW_Base_Map/MapServer/tile/${z}/${Math.floor(ty)}/${Math.floor(tx)}`)), 'site tile requested');
      assert.ok(nsw.length <= 80, `${nsw.length} tiles`);
      // aerial imagery
      await page.selectOption('#uiBasemap', 'nswimg');
      await page.waitForFunction(() => /Imagery ©/.test(document.getElementById('attrib').textContent));
      assert.ok(nsw.some(u => u.includes('/NSW_Imagery/MapServer/tile/')));
      // OSM chosen from disk: not requested (its servers refuse file:// pages), pointer to the online copy
      await page.selectOption('#uiBasemap', 'osm');
      await page.waitForFunction(() => /online copy/.test(document.getElementById('attrib').textContent));
      assert.strictEqual(osm.length, 0, 'no OSM tile requests from disk');
      assert.ok(/only works in the online copy/.test(await page.textContent('#log')));
      // layer off: nothing drawn, no attribution needed
      await page.selectOption('#uiBasemap', 'auto');
      await page.uncheck('#lyOsm');
      await page.waitForFunction(() => document.getElementById('attrib').hidden);
    }
  },
  {
    name: 'background map online (http): OSM street map tiles are requested with a Referer and attributed',
    async run({ page, assert }) {
      const http = require('http'), fs = require('fs'), path = require('path');
      const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'noise_poc.html'));
      const server = http.createServer((q, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); });
      await new Promise(ok => server.listen(0, '127.0.0.1', ok));
      try {
        const url = `http://127.0.0.1:${server.address().port}/noise-modelling/`, osm = [];
        await page.route('https://tile.openstreetmap.org/**', r => { osm.push(r.request().headers().referer || ''); return r.fulfill({ body: PNG1, contentType: 'image/png' }); });
        await page.addInitScript(() => localStorage.setItem('noise-poc-ui-v2', JSON.stringify({ auto: false, layout: 'workspace', start: 'demo', layers: { osm: true } })));
        await page.goto(url); await page.waitForFunction(() => window.__noise && window.__noise.selftest);
        await page.fill('#siteLL', SITE.join(', ')); await page.click('#btnSite');
        await page.waitForFunction(() => /OpenStreetMap/.test(document.getElementById('attrib').textContent) && /^Map ©/.test(document.getElementById('attrib').textContent));
        assert.ok(osm.length > 0 && osm.length <= 80, `${osm.length} OSM tiles`);
        assert.ok(osm.every(r => r.startsWith(`http://127.0.0.1:${server.address().port}/`)), 'every tile request carries the page origin as Referer: ' + osm[0]);
      } finally { server.close(); }
    }
  }
];
