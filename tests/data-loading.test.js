/* CRS detection, NoData filling and MGA zone handling for terrain files. */
'use strict';

const loadDem = async (page, buf, name) => {
  await page.setInputFiles('#fileDem', { name, mimeType: 'image/tiff', buffer: buf });
};

module.exports = [
  {
    name: 'GeoKeys: projected code wins over geographic code listed first',
    async run({ page, assert }) {
      const r = await page.evaluate(() => {
        const f = window.__noise._t.crsFromGeoKeys;
        return [
          f([1, 1, 0, 3, 1024, 0, 1, 1, 2048, 0, 1, 4283, 3072, 0, 1, 28355]).epsg,   // projected, both keys
          f([1, 1, 0, 2, 1024, 0, 1, 2, 2048, 0, 1, 7844]).epsg,                      // geographic
          f([1, 1, 0, 2, 1024, 0, 1, 1, 3072, 0, 1, 32767]).epsg,                     // user-defined → null
          f([1, 1, 0, 1, 3072, 34737, 5, 0]).epsg                                      // value stored in another tag → ignored
        ];
      });
      assert.deepStrictEqual(r, [28355, 7844, null, null]);
    }
  },
  {
    name: 'GeoTIFF with both keys is placed in the projected zone',
    async run({ page, assert, fixtures, waitLog }) {
      const buf = fixtures.geotiff({ W: 4, H: 4, x0: 320000, yTop: 5810000, z: () => 50, geoKeys: [1024, 0, 1, 1, 2048, 0, 1, 4283, 3072, 0, 1, 28355] });
      await loadDem(page, buf, 'zone55.tif');
      await waitLog('DEM installed|FAILED');
      const o = await page.evaluate(() => window.__noise.state.origin);
      assert.strictEqual(o.zone, 55); assert.strictEqual(o.epsg, 28355);
    }
  },
  {
    name: 'NoData fill is linear time and fills every hole',
    async run({ page, assert, fixtures, waitLog }) {
      const N = 1500;   // 90 % NoData, like a coastal tile
      const buf = fixtures.geotiff({ W: N, H: N, x0: 330000, yTop: 6251000, z: i => (i < 150 ? 10 : -9999), nodata: -9999, geoKeys: [1024, 0, 1, 1, 3072, 0, 1, 28356] });
      await loadDem(page, buf, 'coastal.tif');
      const log = await waitLog('DEM installed|FAILED');
      const ms = +log.match(/DEM installed:.* (\d+) ms\./)[1];
      const T = await page.evaluate(() => { const T = window.__noise.state.terrain; let nan = 0, off = 0; for (const v of T.z) { if (v !== v) nan++; else if (Math.abs(v - 10) > 1e-4) off++; } return { nan, off, filled: T.filled }; });
      assert.strictEqual(T.nan, 0); assert.strictEqual(T.off, 0);
      assert.strictEqual(T.filled, N * N - 150 * N);
      assert.ok(ms < 4000, `install took ${ms} ms`);
    }
  },
  {
    name: 'fillHoles: interior hole takes the mean of its neighbours',
    async run({ page, assert }) {
      const z = await page.evaluate(() => {
        const z = new Float32Array([1, 1, 1, 1, NaN, 3, 3, 3, 3]);   // 3×3, centre missing
        window.__noise._t.fillHoles(z, 3, 3); return Array.from(z);
      });
      assert.ok(Math.abs(z[4] - 2) < 1e-6, String(z[4]));
    }
  },
  {
    name: 'DEM in another MGA zone is resampled into the scenario zone',
    async run({ page, assert, fixtures, waitLog }) {
      // Site just east of 150°E (zone 56); DEM delivered in zone 55.
      const lat = -33.7, lon = 150.02;
      await page.fill('#siteLL', `${lat}, ${lon}`);
      await page.click('#btnSite');
      const p55 = await page.evaluate(([la, lo]) => window.__noise.ll2mga(la, lo, 55), [lat, lon]);
      // Tilted plane in zone-55 coordinates: RL 200 at the site, 1 m per 100 m east and 2 m per 100 m north.
      const x0 = Math.round(p55[0]) - 1000, yTop = Math.round(p55[1]) + 1000;
      const z = (i, j) => 200 + 0.01 * (x0 + i * 10 + 5 - p55[0]) + 0.02 * (yTop - j * 10 - 5 - p55[1]);
      const buf = fixtures.geotiff({ W: 200, H: 200, cell: 10, x0, yTop, z, geoKeys: [1024, 0, 1, 1, 3072, 0, 1, 28355] });
      await loadDem(page, buf, 'zone55-dem.tif');
      await waitLog('DEM installed|FAILED');
      const r = await page.evaluate(([la, lo]) => {
        const N = window.__noise, at = N.ll2local(la, lo), north = N.ll2local(la + 0.005, lo);
        return { origin: N.state.origin, site: N.ground(at[0], at[1]), north: N.ground(north[0], north[1]), n55: N.ll2mga(la + 0.005, lo, 55) };
      }, [lat, lon]);
      assert.strictEqual(r.origin.zone, 56);
      assert.ok(Math.abs(r.site - 200) < 0.05, `RL at site ${r.site}`);
      const expNorth = 200 + 0.01 * (r.n55[0] - p55[0]) + 0.02 * (r.n55[1] - p55[1]);
      assert.ok(Math.abs(r.north - expNorth) < 0.05, `RL 550 m north ${r.north}, expected ${expNorth}`);
    }
  }
];
