# Changelog

## 0.9.0 – Stage 4: outputs

### Added
- **Shifts.** A project now holds several shifts. Each has its own activity name, plant, time period, dates and notes. Buildings, NCAs, terrain, model settings and rules are shared.
  - *Shift* panel: New, Duplicate (copies the plant), Delete, and switching between shifts. Switching restores that shift's plant, period, season and last results.
  - Dates are entered as `YYYY-MM-DD` with ranges (`2026-11-03..2026-11-05`). A night counts on its start date. The panel warns when the season under *Model* doesn't match the dates.
  - Shifts, dates, notes and project details are saved in the scenario. Older scenarios load as one shift.
- **Run all shifts and compare.**
  - Assesses every shift in turn.
  - The comparison shows one row per shift: building-floors and buildings above NML, the impact counts, highly affected receivers, maximum level and measures.
  - It also shows one row per receiver above NML in any shift, with each shift's exceedance coloured by category.
  - It exports to CSV, with a privacy prompt.
- **Respite tracking.**
  - Per receiver: the number of shifts and of planned dates above NML.
  - The CNVG-PTI v4.6 Table 8 respite-period (RP) check:
    - at most 3 consecutive evenings and 2 consecutive nights;
    - at least 4 evenings / 5 nights free between runs;
    - not applied to OOHW Period 1 days.

    A receiver counts on a date when a shift planned for it triggers RP there. The check runs per receiver, which is at least as strict as per NCA.
  - The limits are editable data in the rules file (`respite`).
  - New map mode *Respite: dates above NML (all shifts)*, with breaches outlined in red.
- **Printable report** (*Shift → Report (print / PDF)*). One self-contained HTML file for the current shift: open it in Edge and print to PDF. It contains:
  1. **Introduction:** project, activity, period, dates and assessment basis.
  2. **Method:** prediction method, assumptions and the NCA table.
  3. **Works description:** a plant-location map and the plant table (% time on, equipment, sound power, penalty, mitigation, effective Lw, height, notes).
  4. **Results:** properties per land use and category, an overall statement, an impact map, and the list of receivers above NML with measures and notes.
  5. **All shifts and respite:** only when several shifts have results.
  - **Appendices:**
    - A: buildings with land use, floors, height and height source;
    - B: the rules applied for the period and the measure codes;
    - C: data sources with file and load dates.

  The screening disclaimer is at the top and in every page footer, with page numbers. The report runs the assessment first if results are missing or out of date, and asks before creating the file because it lists properties.
- **Data-source record.** Every DEM, LiDAR, DSM, OSM fetch or file, GeoJSON building import and NCA import is logged with its file date and load time, kept in the scenario, and listed in the report.
- **Source notes** field, shown in the report's works table.

### Changed
- The CNVG-PTI guideline stays the default rule set, now as a recorded decision (see GAP_REGISTER).
- Numbers that aren't available show as "–" everywhere instead of failing. A shift whose points were all screened out by distance used to stop the comparison view opening.
- Failures in the new buttons are logged instead of being lost.

### Tests
95 tests, all passing (see `docs/test-evidence/v0.9.0.txt`). New ones cover:
- date parsing;
- the respite rule: limits, minimum breaks, evenings and nights;
- shift new / duplicate / rename / switch / delete;
- batch results matching single runs;
- the comparison table and its CSV;
- the respite map mode;
- the report's sections, rows, maps, data sources and privacy prompt;
- the report re-running stale results;
- the scenario round trip with shifts and data sources;
- loading an older scenario.

## 0.8.0 – Stage 3: acoustics

Results against the reference case are in `docs/CALIBRATION.md` (Part D).

### Added
- **Side diffraction around buildings and hoarding ends** (*Model → Side diffraction*, on by default, both methods).
  - The two side paths run round the convex hull of the source, the receiver and the corners of the blocking obstacles, as in CNOSSOS-EU.
  - Their Dz (ISO 9613-2 eq. 14, Kmet = 1) is summed by energy with the path over the top and then capped once (TfNSW cap or the ISO 20/25 dB). Capping each path first would make a long wall screen less than a short one.
  - There are no side paths when terrain forms the screening edge.
  - The probe draws the side paths (orange) and lists each one's edges, path difference and Dz.
- **First-order façade reflections** (*Model → Façade reflections*: Auto / On / Off; reflection loss, default 1 dB).
  - Each reflection is an image source off building walls within 60 m of the source or receiver.
  - A wall reflects only if:
    - source and receiver are both in front of it;
    - the reflection point lies on the wall, below its top;
    - the wall passes the ISO 9613-2 eq. 19 size check;
    - both legs have a clear line of sight.
  - The receiver's own façade (within 2 m) is left out, so façade levels stay free-field.
  - *Auto* turns reflections on for ISO 9613-2 and off on the TfNSW basis, since the estimator has none.
  - Reflections are skipped during drag redraws. The probe draws them (blue) and lists each one with the direct and total levels.
- **Octave-band option for ISO 9613-2** (*Model → Octave bands 63 Hz – 8 kHz*).
  - Air absorption per band follows ISO 9613-1. It matches the estimator's 250/500/1000 Hz values and ISO 9613-2 Table 2.
  - Ground uses the general method per band (Table 3).
  - Dz is calculated at each band's wavelength from the same path geometry.
  - The reflector size check is applied per band.
  - Source spectra: generic, indicative shapes (*diesel plant*, *impact / percussive*, *pink*). The default is chosen by the item's special audible characteristics. Each source or library item can take its own preset or eight measured A-weighted band levels. Spectra are saved in scenarios and the library.
  - The probe shows the band breakdown.

### Changed
- **Assessment pre-screen:** with reflections on, the free-field bound allows 10 dB extra, room for nine reflections each as strong as the direct path. A brute-force test confirms it hides no exceedance with reflections and octave bands on.
- **Performance** (110 buildings in view, 4 sources, 37,800 grid points):
  - TfNSW basis with side diffraction: about 0.7 s;
  - ISO with reflections: about 1.9 s;
  - ISO with reflections and octave bands: about 2.2 s.

  The 2,000-building assessment takes about 4.5 s on the TfNSW basis and about 7 s with ISO and reflections.
- Hidden settings rows (e.g. the screening cap in ISO mode) are now actually hidden.

### Findings (summary – see docs/CALIBRATION.md, Part D)
In the example scenes (building-floors, each against its own result without the feature):
- **Effects are concentrated on screened floors.** The median change is 0 dB for every feature, because most floors either have line of sight or sit behind long terrace rows and 360 m of hoarding.
- **Side diffraction:**
  - TfNSW basis: mean +0.4 to +0.7 dB, up to +9.6 dB (the 15 dB cap already limits screening);
  - ISO: mean +1.6 to +2.9 dB, up to +15.5 dB.
- **Reflections (ISO):** mean +0.8 to +1.0 dB, up to +15.7 dB where a screened point sees a reflecting façade.
- **Octave bands vs single band (ISO, generic spectra):** mean within ±0.05 dB, but up to +13 dB at single screened floors, because low frequencies diffract more.
- **Screened second-row top floors are still well above ground floors:** about 10–13 dB on the TfNSW basis and 12–21 dB in ISO.
- **The reference's +2–4 dB upper-floor pattern** is still reproduced only by ISO single band with soft ground (+2.8 dB at 100 % soft). The octave-band general method gives about +1 dB, so the result depends on the ground method.
- **±3 dB at receivers is still untestable** without the reference geometry.

### Tests
88 tests, all passing (see `docs/test-evidence/v0.8.0.txt`). New ones cover:
- side diffraction against hand calculations;
- reflections: image path, own façade, low wall, eq. 19 size check, street canyon, probe;
- octave bands: ISO 9613-1 air against the estimator and ISO 9613-2 Table 2, Table 3 ground, Dz per band, eq. 19 per band, UI and scenario round trip;
- the pre-screen with reflections and bands;
- ISO performance with reflections.

## 0.7.0 – Stage 2: calibration

Full results are in `docs/CALIBRATION.md`.

### Added
- **Exact reconciliation with the TfNSW estimator.**
  - `tools/estimator_golden.py` fills in the estimator spreadsheet, recalculates it in LibreOffice and writes 24 golden cases.
  - The app matches every output: realistic-worst-case SWL, levels, LAmax, sleep check, NMLs, exceedances, and measures for all five periods.
- **Selectable rule sets:**
  - *CNVG-PTI v4.6 Table 9* (default);
  - *TfNSW estimator Step 4*, which reproduces the spreadsheet as it actually calculates: lower-inclusive bands, P1 evening RP/DR from 10 dB, P2 SN/RP/DR from 5 dB, RO on Sunday evenings, no PN below 5 dB at night.

  The two disagree in 54 of 120 tested case-periods. The rule set is saved with the scenario, and `classify()` now supports either boundary convention.
- **Plant combination option:** *Loudest 1–3 rows (TfNSW estimator)* reproduces the spreadsheet's realistic-worst-case rule. Excluded plant is drawn faded and logged. *All plant* stays the default.
- **Calibration import.** Takes a CSV of measured levels or another tool's receiver results, matched by receiver ID or placed by coordinates with height, RL or floor.
  - Reports bias, SD, RMS, range, the share within ±1 and ±3 dB, and category agreement.
  - Draws the points on the map, coloured by difference, and exports the comparison.
- **Example scenes** (*Scenario → Example*): synthetic inner-city night works with the reference-case plant, in three variants: street, rail corridor behind hoarding, and a 37 m set-back.

### Findings (summary – see docs/CALIBRATION.md)
- **±3 dB at receivers can't be tested.** The reference geometry is unknown. The import is ready for the commercial tool's receiver export, or for measurements.
- **Plant total:** the reference plant is 96.4 dBA after time-on and penalty, so its 46–57 dBA implies receivers 37–131 m away if unscreened.
- **Category shape is similar** (mostly Low, some Medium, no High) in the corridor and set-back scenes.
- **The reference's codes match neither rule set** (RO at night, AA with nothing above Medium), so it used project-specific rules.
- **The upper-floor pattern (+2–4 dB on line-of-sight façades) isn't reproduced on the TfNSW basis.** It appears with ISO 9613-2 and partly soft ground. Screened ground floors are too quiet without side diffraction, which supports Stage 3.

### Tests
58 tests, all passing (see `docs/test-evidence/v0.7.0.txt`), including:
- estimator reconciliation (24 cases);
- the rule-set comparison;
- calibration import (bias recovery, coordinates, height/RL/floor, façade snapping, CSV export, rejected files);
- the reference-scene report.

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
