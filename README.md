# noise-modelling

A construction noise screening and planning tool for Transport for NSW (TfNSW) projects. It runs as a single HTML file in Edge from local disk: no install, no server, nothing uploaded.

> **Screening and planning aid only.** It does not replace an assessment by a qualified acoustic consultant and is not a validated compliance model. Defaults taken from TfNSW documents must be checked against the current client strategy.

## Using it

Open `dist/noise_poc.html` in Edge or Chrome. Everything the tool needs is inside that one file.

A typical OOHW assessment:
1. **Site:** load buildings (OSM), optionally terrain and LiDAR heights, and the NCAs (*Site* tab).
2. **Shift:** in *Shifts*, set the name, time period and dates, then click **+ Plant** and click the map for each item.
3. **Run:** click **Run this shift** once. After that, results update automatically when something changes.
4. **Check:** look at the map and the property table. **Compare & respite** covers several shifts; it runs any shift that is out of date.
5. **Outputs:** **Report** gives the printable report for the approval pack; **Export CSV** gives the list for the community team.

*? Guide* in the app explains every button.

**Screen:**
- *View* switches between three layouts, all remembered in your browser:
  - **Workspace:** shifts and plant on the left, results, site and method in tabs on the right, data sources and log at the bottom;
  - **Guided:** numbered steps;
  - **Single column**.
- *View* also sets the colours (light, dark, high contrast) and the map layers.
- *Clear* tidies the screen or removes things from the project.
- **F** shows the map only.

The report and CSV list properties and may contain addresses. Keep them on approved storage.

- **Terrain:** DEM as GeoTIFF, ESRI ASCII or XYZ (GDA94 / GDA2020 MGA). Files in another MGA zone are resampled into the scenario zone.
- **Buildings:** OpenStreetMap footprints, fetched live or imported from `.osm` / GeoJSON files. Heights come from public LiDAR (`.laz` / `.las`) or a DSM.
- **Sources:** picked from the equipment library (CNVG-PTI Appendix C Table 19 plus the TfNSW estimator plant list), each with % time on, annoyance penalty, mitigation and height.
- **Two prediction methods:**
  - *TfNSW estimator basis* (default) reconciles with the TfNSW Construction Noise Estimator.
  - *ISO 9613-2* is for detailed checks. It adds first-order façade reflections and an optional octave-band calculation (63 Hz – 8 kHz) with source spectra.

  Both methods include side diffraction around buildings and hoarding ends.

  The probe breaks down every term at any point on the map.

## Status

Version 0.10.0 is a UI pass: a new layout with three layout options, themes, shift chips, a plant list, automatic updates, a Clear menu, map layers and a quick guide. Version 0.9.0 completed Stage 4, outputs:
- shifts within one project, with batch run and comparison;
- respite tracking against the CNVG-PTI respite-period rule;
- a printable report with maps, the disclaimer, data sources and height sources.

Earlier stages:
- **Stage 1:** façade receivers per floor, NCAs, NML rules and the property list.
- **Stage 2:** exact reconciliation with the TfNSW Construction Noise Estimator, a comparison of its measures with the CNVG-PTI guideline, and a calibration import.
- **Stage 3:** side diffraction, façade reflections and an octave-band option.

Results and limits are in [`docs/CALIBRATION.md`](docs/CALIBRATION.md). Next is the build-versus-buy recommendation, then the Stage 5 extras (vibration buffers, below-ground sources, 3D review). See [`CHANGELOG.md`](CHANGELOG.md) and [`GAP_REGISTER.md`](GAP_REGISTER.md).

## Development

The single-file deliverable is built from separate sources. Node is needed only by developers and CI, never by users.

```
src/index.html        page shell (markup) with build markers
src/style.css         styles
src/data/*.json       embedded data (equipment library, assessment rules)
src/js/NN-*.js        scripts, joined in file-name order into one scope
build.js              zero-dependency build → dist/noise_poc.html
tests/run.js          headless runner: in-app self-tests + tests/*.test.js
tests/fixtures.js     synthetic GeoTIFF / ASC generators (no real-world data)
tests/golden/         golden cases from the TfNSW estimator (tools/estimator_golden.py)
tools/                developer scripts (golden-case generator: needs LibreOffice + openpyxl)
```

```
node build.js            # build dist/noise_poc.html
node build.js --check    # fail if dist/ is out of date with src/
node tests/run.js        # run all tests (needs Playwright + Chromium)
```

Edit the files in `src/`, never `dist/` directly, and commit the rebuilt `dist/noise_poc.html` with your change. CI fails if the two don't match. Bump `VERSION` in `src/js/00-constants.js` with every change and keep the self-tests passing.

## Licences

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md): LASzip (Apache-2.0), OpenStreetMap (ODbL) and Transport for NSW material (non-commercial use with acknowledgement).
