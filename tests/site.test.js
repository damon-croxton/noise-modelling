/* Site workflow: start-up scene and layout, the numbered site steps, Go to
   site from the example, OSM-only fetch, and the OSM street-map underlay.
   Network calls are answered by Playwright routes – nothing leaves the test. */
'use strict';

const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==', 'base64');
const SITE = [-33.88901, 151.23702];
/* A 1 px PNG of one colour (tiles that are easy to find in a picture). */
function pngOf([r, g, b]) {
  const zlib = require('zlib'), crcT = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4), c = Buffer.alloc(4), td = Buffer.concat([Buffer.from(type), data]); l.writeUInt32BE(data.length); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from([0, r, g, b]))), chunk('IEND', Buffer.alloc(0))]);
}
const OSM_XML = `<?xml version="1.0"?><osm version="0.6">
  <node id="1" lat="-33.8889" lon="151.2368"/><node id="2" lat="-33.8889" lon="151.2371"/><node id="3" lat="-33.8891" lon="151.2371"/><node id="4" lat="-33.8891" lon="151.2368"/>
  <way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/><tag k="building" v="apartments"/><tag k="building:levels" v="5"/></way></osm>`;
/* Fresh start with the app's own defaults (layout, start-up scene, underlay), auto-update off. */
async function defaults(page) {
  // set before the app reads it (a write followed by an immediate reload can be lost)
  await page.addInitScript(() => localStorage.setItem('noise-poc-ui-v3', JSON.stringify({ auto: false })));
  await page.reload(); await page.waitForFunction(() => window.__noise && window.__noise.selftest);
}

module.exports = [
  {
    name: 'opens on the empty map in the guided layout at the default location, fully zoomed out; Report is in Results; very coarse heat map',
    async run({ page, assert }) {
      await page.route('https://maps.six.nsw.gov.au/**', r => r.fulfill({ body: PNG1, contentType: 'image/png' }));
      await defaults(page);
      const r = await page.evaluate(() => { const N = window.__noise, st = N.state, c = N.local2ll(st.view.cx, st.view.cy);
        return { cls: document.getElementById('app').className, ex: st.example, n: st.buildings.length + st.sources.length, o: st.origin, c, scale: st.view.scale, cell: st.settings.cellPx }; });
      assert.ok(r.cls.includes('layout-guided'), r.cls);
      assert.strictEqual(r.ex, null); assert.strictEqual(r.n, 0, 'nothing in the project');
      assert.ok(r.o && r.o.isDefault && r.o.zone === 56);
      assert.ok(Math.abs(r.c[0] - -33.85276318512677) < 1e-5 && Math.abs(r.c[1] - 151.19989931580375) < 1e-5, 'view centred on the default location: ' + r.c);
      assert.strictEqual(r.scale, 0.02, 'fully zoomed out');
      assert.strictEqual(r.cell, 16, 'very coarse heat map by default');
      assert.strictEqual(await page.textContent('#steps button.on'), '1 Site');
      const steps = await page.$$eval('#card-site li[data-step]', l => l.map(x => x.dataset.step + (x.classList.contains('done') ? ':done' : '') + (x.classList.contains('next') ? ':next' : '')));
      assert.deepStrictEqual(steps, ['clear:done', 'site:next', 'go', 'osm', 'dem', 'lidar']);
      assert.ok(await page.isDisabled('#btnClearSample'), 'nothing to clear');
      assert.ok(!(await page.isVisible('#exampleNote')));
      await page.waitForFunction(() => /Spatial Services/.test(document.getElementById('attrib').textContent), null, { timeout: 5000 });   // background map (from disk: NSW base map)
      assert.ok((await page.textContent('#card-site')).includes('right-click the project location'));
      assert.ok((await page.textContent('#card-dem')).includes('1 m DEM') && (await page.getAttribute('#card-dem a', 'href')).includes('elevation.fsdf.org.au'));
      assert.ok((await page.textContent('#card-lidar')).includes('.laz'));
      assert.strictEqual(await page.locator('#topbar #btnReport').count(), 0, 'no Report in the top bar');
      assert.ok(await page.evaluate(() => !!document.getElementById('btnReport').closest('#card-report')));
      assert.strictEqual(await page.$$eval('#steps button', b => b[4].textContent), '5 Report');
    }
  },
  {
    name: 'a loaded sample has no background map; step 1 Clear sample goes back to the empty map; Go to site from a sample asks first',
    async run({ page, assert }) {
      const tiles = [];
      await page.route('https://maps.six.nsw.gov.au/**', r => { tiles.push(r.request().url()); return r.fulfill({ body: PNG1, contentType: 'image/png' }); });
      await defaults(page);
      await page.selectOption('#exampleSel', 'corridor'); await page.click('#btnExample');
      await page.waitForTimeout(300); tiles.length = 0; await page.waitForTimeout(500);
      let r = await page.evaluate(() => ({ ex: window.__noise.state.example, o: window.__noise.state.origin }));
      assert.deepStrictEqual(r, { ex: 'corridor', o: null }, 'sample has no location');
      assert.strictEqual(tiles.length, 0, 'no background tiles under a sample');
      assert.ok(await page.isVisible('#exampleNote'));
      assert.ok((await page.getAttribute('#card-site li[data-step=clear]', 'class')).includes('next'));
      await page.click('#btnClearSample');
      r = await page.evaluate(() => ({ ex: window.__noise.state.example, n: window.__noise.state.buildings.length, d: window.__noise.state.origin && window.__noise.state.origin.isDefault, s: window.__noise.state.view.scale }));
      assert.deepStrictEqual(r, { ex: null, n: 0, d: true, s: 0.02 });
      // Go to site straight from a sample: asks, cancel keeps it
      await page.click('#btnExample');
      await page.fill('#siteLL', SITE.join(', '));
      page.once('dialog', d => d.dismiss()); await page.click('#btnSite');
      assert.strictEqual(await page.evaluate(() => window.__noise.state.example), 'corridor', 'cancel keeps the example');
      page.once('dialog', d => d.accept()); await page.click('#btnSite');
      r = await page.evaluate(() => { const st = window.__noise.state; return { ex: st.example, b: st.buildings.length, s: st.sources.length, zone: st.origin && st.origin.zone, d: !!(st.origin && st.origin.isDefault) }; });
      assert.deepStrictEqual(r, { ex: null, b: 0, s: 0, zone: 56, d: false });
      const steps = await page.$$eval('#card-site li[data-step]', l => l.map(x => x.dataset.step + (x.classList.contains('done') ? ':done' : '') + (x.classList.contains('next') ? ':next' : '')));
      assert.deepStrictEqual(steps.slice(0, 4), ['clear:done', 'site:done', 'go:done', 'osm:next']);
      assert.ok(/Next: Fetch OSM buildings/.test(await page.textContent('#log')));
    }
  },
  {
    name: 'Go to site from the opening map moves the origin to the site (no example to clear, no question)',
    async run({ page, assert }) {
      await defaults(page);
      await page.fill('#siteLL', SITE.join(', ')); await page.click('#btnSite');
      const r = await page.evaluate(() => { const N = window.__noise, st = N.state, c = N.local2ll(0, 0); return { d: !!st.origin.isDefault, c, scale: st.view.scale }; });
      assert.ok(!r.d && Math.abs(r.c[0] - -33.88901) < 1e-4 && Math.abs(r.c[1] - 151.23702) < 1e-4, 'origin at the site: ' + r.c);
      assert.ok(r.scale > 0.5, 'zoomed in to the site');
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
    name: 'report maps over the background map: drawn with the tiles and credited when the server allows it; plain map and a warning when it does not; none with the layer off',
    async run({ page, assert }) {
      let n = 0;
      await page.route('https://maps.six.nsw.gov.au/**', r => { n++; return r.fulfill({ body: pngOf([200, 30, 30]), contentType: 'image/png',
        headers: { 'access-control-allow-origin': '*' } }); });
      await page.addInitScript(() => localStorage.setItem('noise-poc-ui-v3', JSON.stringify({ auto: false, layout: 'workspace', start: 'map', layers: { osm: true } })));
      await page.reload(); await page.waitForFunction(() => window.__noise && window.__noise.selftest);
      await page.fill('#siteLL', SITE.join(', ')); await page.click('#btnSite');
      await page.evaluate(() => { const N = window.__noise, st = N.state; st.sources.push({ id: 'rp1', name: 'Saw', x: 0, y: 0, h: 1.5, lw: 110, shift: N._t.curShift().id });
        st.buildings.push(N._t.makeBuilding([[30, 10], [45, 10], [45, 25], [30, 25]], 7, 'House', { tags: { building: 'house' } })); });
      // share of the map that is not plain white (the background map covers it)
      const covered = url => page.evaluate(u => new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) k++; ok(k / (d.length / 4)); }; im.src = u; }), url);
      let m = await page.evaluate(() => window.__noise._t.reportMaps());
      assert.strictEqual(m.bg, 'nswbase', 'NSW base map used from disk');
      assert.ok(n > 0 && n <= 120, n + ' tile requests');
      assert.ok(await covered(m.works) > 0.9 && await covered(m.impact) > 0.9, 'background under both maps');
      await page.evaluate(() => window.__noise.runAssessment());
      const html = await page.evaluate(m => window.__noise.buildReport(m), m);
      assert.ok(html.includes('Background map (report maps)') && html.includes('Spatial Services NSW (CC BY 4.0)'), 'credited in Appendix C');
      assert.ok(/NSW base map \(Spatial Services\) background, zoom \d+/.test(await page.textContent('#log')));
      // a server that doesn't allow it taints the canvas, so it can't be saved. (Playwright's route.fulfill adds the CORS header
      // itself, so the refusal is simulated where the browser reports it: the first map's toDataURL throws.)
      m = await page.evaluate(async () => { const P = HTMLCanvasElement.prototype, o = P.toDataURL; let k = 0;
        P.toDataURL = function (...a) { if (k++ === 0) throw new DOMException('Tainted canvases may not be exported.', 'SecurityError'); return o.apply(this, a); };
        try { return await window.__noise._t.reportMaps(); } finally { P.toDataURL = o; } });
      assert.ok(await covered(m.works) < 0.5, 'works map drawn plain');
      assert.ok(await covered(m.impact) > 0.9, 'impact map keeps its background');
      assert.ok(/NSW base map \(Spatial Services\) could not be included/.test(await page.textContent('#log')));
      // layer off: no tiles asked for
      await page.uncheck('#lyOsm'); n = 0;
      m = await page.evaluate(() => window.__noise._t.reportMaps());
      assert.strictEqual(m.bg, null); assert.strictEqual(n, 0);
    }
  },
  {
    name: 'background map from disk: Automatic uses the NSW base map (right tiles, attribution); OSM is not requested and points to the online copy',
    async run({ page, assert }) {
      const nsw = [], osm = [];
      await page.route('https://maps.six.nsw.gov.au/**', r => { nsw.push(r.request().url()); return r.fulfill({ body: PNG1, contentType: 'image/png' }); });
      await page.route('https://tile.openstreetmap.org/**', r => { osm.push(r.request().url()); return r.fulfill({ body: PNG1, contentType: 'image/png' }); });
      await page.addInitScript(() => localStorage.setItem('noise-poc-ui-v3', JSON.stringify({ auto: false, layout: 'workspace', start: 'demo', layers: { osm: true } })));
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
        await page.addInitScript(() => localStorage.setItem('noise-poc-ui-v3', JSON.stringify({ auto: false, layout: 'workspace', start: 'demo', layers: { osm: true } })));
        await page.goto(url); await page.waitForFunction(() => window.__noise && window.__noise.selftest);
        await page.fill('#siteLL', SITE.join(', ')); await page.click('#btnSite');
        await page.waitForFunction(() => /OpenStreetMap/.test(document.getElementById('attrib').textContent) && /^Map ©/.test(document.getElementById('attrib').textContent));
        assert.ok(osm.length > 0 && osm.length <= 80, `${osm.length} OSM tiles`);
        assert.ok(osm.every(r => r.startsWith(`http://127.0.0.1:${server.address().port}/`)), 'every tile request carries the page origin as Referer: ' + osm[0]);
      } finally { server.close(); }
    }
  }
];
