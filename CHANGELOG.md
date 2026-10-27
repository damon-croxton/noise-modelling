# Changelog

## 0.6.0 – Stage 1: the assessment

### Added
- **Façade receivers per floor.**
  - Points sit 1 m in front of each exposed wall, about 10 m apart (both configurable), at 1.5 m above each floor. Party walls are skipped.
  - Floors come from OSM `building:levels`, or from height ÷ floor height (3 m, configurable), or are set per building.
  - The worst point per building and floor is reported.
  - Points whose free-field upper bound is already below the NML are not calculated in full. A brute-force test confirms this never hides an exceedance.
  - 2,000 buildings (8,000 building-floors, 48,000 façade points, 3 sources) assess in about 2 s.
- **Land use per building.**
  - Derived from OSM tags: building, amenity, shop, office.
  - Can be overridden per building, or in bulk by current land use and area (all, in view, outside NCAs, or a given NCA).
  - Buildings with no usable tag are assumed residential and flagged.
  - The OSM import now keeps the relevant tags, including the address. GeoJSON imports read `land_use`, `floors` and `address` properties.
- **Noise catchment areas (NCAs).**
  - Draw mode (N), or import from GeoJSON.
  - Each NCA has an R0–R5 category and optional measured day / evening / night RBLs.
  - Buildings outside every NCA use a default category or RBLs.
- **Assessment rules** (`src/data/rules.json`) hold the TfNSW CNVG-PTI v4.6 defaults:
  - NML = RBL + 10 (standard hours) / + 5 (OOHW), with minimum RBLs for measured values;
  - non-residential NMLs (Table 13), with an internal-to-external façade reduction;
  - the Table 9 bands and mitigation codes for each period;
  - highly noise affected (≥ 75 dBA);
  - sleep disturbance screening;
  - the OSM land-use mapping.

  Rules can be exported, imported (validated on import) and reset. They are marked "verify against the current client strategy".
- **New time period:** OOHW Period 2 – evening (Sundays and public holidays).
- **Outputs.**
  - Buildings are coloured by worst impact category, with or without the heat map.
  - Summary of building-floors per land use and category, plus counts per measure code.
  - Sortable, filterable property table; clicking a row shows the building.
  - CSV export with a privacy prompt; it covers every row in the current filter, with the NML basis, sleep check, height source and coordinates.
  - The probe and the building panel show per-floor results and the full term breakdown at the worst point.
- **Stale results are flagged.** A warning appears when sources, buildings, NCAs, settings or rules change after a run.
- **Scenario files** now keep NCAs, assessment settings, per-building land use, floors and address, and edited rules. Saving asks first if the file will contain addresses.
- **The demo** has land uses: residential, commercial, and a site shed that isn't assessed.

### Tests
52 tests, all passing (see `docs/test-evidence/v0.6.0.txt`). The 16 new Stage 1 browser tests cover:
- NML derivation per period;
- Table 9 bands and measures at the boundaries;
- sleep checks;
- OSM land use, floors and address;
- façade point geometry;
- a street canyon (upper floors louder than the screened ground floor);
- the pre-screen compared with brute force;
- NCAs drawn and imported;
- OSM import with tags;
- per-building and bulk land-use change;
- property table and CSV;
- stale flag;
- scenario round trip;
- project rules import and rejection of invalid rules;
- performance.

### Known limits
- **No façade reflection correction:** receivers are free-field.
- **No side diffraction:** the 15 dB screening cap is still the interim safeguard.
- **LAmax is indicative:** it is estimated as LAeq + 5.
- **Land use for `building=yes`** is assumed residential.
- **No unit-level addresses**, and no zoning or address-dataset import yet.
- **Results are not saved in the scenario file;** re-run after loading.
- See `GAP_REGISTER.md`.

## 0.5.0 – Stage 0: fixes and foundations

### Changed
- **Development layout.** The tool is now built from `src/` into `dist/noise_poc.html` by a build script with no dependencies. The output is still one self-contained HTML file. Before any code changes, the build reproduced v0.4 byte for byte. CI checks that `dist/` matches `src/` and runs the tests headless.
- **Propagation has two methods.**
  - *TfNSW estimator basis* (default): `Lp = Lw − (20·lg d + 8) − Aatm − Agr − Abar`. This is the basis of the TfNSW Construction Noise Estimator. It uses:
    - seasonal ISO 9613-1 air absorption (mean of 250, 500 and 1000 Hz);
    - CONCAWE category 4 ground attenuation × % soft ground;
    - screening from the modelled buildings, hoarding and terrain, capped at 15 dB (configurable).

    Ground absorption is kept with 5 dB of screening and dropped at 10 dB or more, tapered in between.
  - *ISO 9613-2*: ground per §7.3 (hard G = 0 gives −3 − 3q; soft uses eq. 10 with DΩ) and full diffraction with the 20/25 dB caps.
- **v0.4 under-predicted by about 3 dB.** It used Agr = 0 for hard ground and had no DΩ for soft ground. Both methods now include the ground reflection.
- **New model settings:** method, time period, season, % soft ground and screening cap. The previous fixed 1.9 dB/km air absorption is replaced by seasonal values.
- **New source fields:** % time on in 15 min (`10·lg(on/100)`), annoyance penalty, mitigation reduction, and a default height of 2 m (was 1.5 m). The probe shows the effective Lw and every attenuation term.
- **Equipment library** (`src/data/equipment.json`): CNVG-PTI Appendix C Table 19 maxima (59 items) and the TfNSW estimator plant list (141 items).
  - Items with special audible characteristics default to +5 dB.
  - A source above its Table 19 maximum is flagged in the panel, on the map and in the log.
  - The library can be exported, imported, reset, and extended from a selected source. A scenario saves its library if it was changed.
- **OSM:** Overpass is tried first and the OSM editing API is now only the fallback.

### Fixed
- **Wrong MGA zone from CRS keys.** GeoTIFFs and LAS files carrying both CRS keys were placed in an assumed zone 56. The projected code is now preferred, and keys whose value is stored in another tag are ignored.
- **Page freeze on large NoData areas.** Hole filling is now breadth-first in linear time. A 1500×1500 DEM that is 90 % NoData installs in well under the 4 s test limit; the old 400-pass loop took about 16 s on a 2000×2000 tile.
- **Data in another MGA zone.** A DEM, DSM or LiDAR grid in a different zone from the scenario is now resampled into the scenario zone. It was being read as if it were in that zone, which put it hundreds of km away.
- **Scenario settings are validated on load.** Invalid values are ignored with a warning, and the v0.4 `ground` setting is migrated.
- **Browser shortcuts no longer switch modes.** Ctrl/Cmd/Alt combinations (e.g. Ctrl+S) are left to the browser.
- **LAZ chunk read errors no longer hang the load.** A failed read in the worker path now fails the load cleanly.

### Tests
36 tests, all passing (see `docs/test-evidence/v0.5.0.txt`):
- 21 in-app self-tests:
  - ISO ground (hard, hard with q > 0, soft with DΩ);
  - diffraction against hand calculations (wall, hoarding, terrain ridge, cut);
  - air and CONCAWE terms;
  - the ground/screening rule;
  - 6 whole-path cases recalculated from the TfNSW estimator spreadsheet, all within 0.01 dB.
- 15 browser tests:
  - CRS key handling, NoData fill speed and correctness, zone resampling;
  - effective Lw;
  - library maxima and SAC flags;
  - the source panel and the probe;
  - scenario round trip and v0.4 migration;
  - library export/import;
  - keyboard shortcuts, page load, disclaimer and licence notes.

### Known limits
- **Building shadows are still too quiet.** There is no side diffraction yet; the 15 dB cap is an interim safeguard in the default method only.
- **Missing assessment features:** façade receivers, NMLs, impact categories and mitigation measures don't exist yet (Stage 1).
- **Distance definition differs from the estimator.** Both methods use the slant distance; the estimator uses the horizontal distance. The difference is negligible except close to tall buildings.
- **All placed sources are summed.** The estimator instead takes the 2–3 loudest plant items as the realistic worst case, so the tool is more conservative here.
- See `GAP_REGISTER.md` for the full list.
