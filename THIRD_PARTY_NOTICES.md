# Third-party notices

**Current arrangement:** the tool is used internally on Transport for NSW projects and is not commercialised or distributed outside the organisation. Under that arrangement:
- the TfNSW non-commercial condition is met, and acknowledgement is given in the app and below;
- the LASzip licence question below doesn't restrict use, because both Apache-2.0 and LGPL-2.1 permit internal use;
- OSM attribution is shown in the app.

If the tool is ever commercialised or distributed externally, revisit the TfNSW and LASzip sections.

## LASzip (LAZ decoder)

`src/js/30-laz.js` is a JavaScript port of the LASzip decompressor (arithmetic coder after A. Said; LASzip by Martin Isenburg / rapidlasso GmbH). Only point formats 0–10 are decoded, and only the fields the tool needs.

- Upstream: <https://github.com/LASzip/LASzip>
- Licence: **Apache License 2.0** (<https://www.apache.org/licenses/LICENSE-2.0>). This is the licence in the current upstream `COPYING.txt`, checked 2026-10-26.

**Open point (only matters if the tool is distributed externally):** releases of LASzip before its relicensing were LGPL-2.1. The commit history doesn't record which upstream release the port follows. If it was an LGPL release, the LGPL terms apply to this file. To be confirmed by whoever wrote the v0.4 port (see the gap register).

## OpenStreetMap

Building footprints fetched or imported from OpenStreetMap are © OpenStreetMap contributors, available under the Open Database Licence (ODbL), <https://www.openstreetmap.org/copyright>. The app shows this attribution whenever OSM buildings are loaded.

- **Footprints** are fetched from the OSM editing API (`api.openstreetmap.org/api/0.6/map`), one small bounding box (about 1 km² or less) per click. The API usage policy (<https://operations.osmfoundation.org/policies/api/>) allows occasional reads like this. It isn't meant for bulk or repeated downloads.
- **The street-map underlay** (*View → Map layers → OSM street map*) uses the standard tiles from `tile.openstreetmap.org`, under the tile usage policy (<https://operations.osmfoundation.org/policies/tiles/>). The app:
  - shows the attribution on the map whenever tiles are drawn;
  - requests only the tiles in view (at most 80 per view);
  - caches them in the browser;
  - never prefetches or bulk-downloads.

  The tile servers learn which area is being viewed, but no addresses or project data are sent. For heavier or organisation-wide use, a commercial tile provider or a self-hosted tile server would be the right choice. The policy can also block pages opened from local disk, which send no `Referer` header; if that happens, the underlay doesn't draw, and the model is unaffected.

## Transport for NSW material

The following come from Transport for NSW publications:

- the equipment sound power levels (`src/data/equipment.json`);
- the seasonal air absorption values and the CONCAWE ground fits;
- the golden test values in `src/js/90-selftest.js`.

The publications are:

- *Construction noise and vibration guideline – public transport infrastructure*, EMF-NV-GD-0060 v4.6 (March 2026), Appendix C Table 19.
- *Construction Noise Estimator Tool (Public Transport Infrastructure)*, EMF-NV-TT-0068: the plant list, the "Air Atten calcs" sheet and the "Mit dist calcs 2024" sheet.

The guideline permits copying and distribution for non-commercial purposes only, with acknowledgement of Transport for NSW as the source. Commercial use of this material needs permission from Transport for NSW. No licence was found in the estimator spreadsheet itself.

## Standards

ISO 9613-1, ISO 9613-2 and the CONCAWE method are implemented from their published equations. No text or tables from the standards are reproduced beyond the coefficients needed for the calculation.
