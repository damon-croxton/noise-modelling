# Gap register

This register lists what the tool can't yet do, measured against TfNSW CNVG-PTI (EMF-NV-GD-0060 v4.6) and against commercial out-of-hours-work (OOHW) assessment platforms. For each gap it records what closing it would take. It is updated at every stage. The build-versus-buy comparison, the tool's caveats and the recommendation are in `docs/BUILD_VS_BUY.md` (v0.14.0). In short: keep building for screening and OOHW planning, and rely on consultants' tools for compliance work.

Status: **open**, **interim** (partly handled, with a stated limit) or **closed**. Calibration results: `docs/CALIBRATION.md`.

## Acoustics

| Gap | Status | Effect | What it takes |
|---|---|---|---|
| Lateral diffraction around building ends | interim (v0.8.0) | Two side paths around the convex hull of the blocking obstacles, summed by energy with the path over the top, then capped. Further buildings that a side path runs through are ignored, which is conservative. No side paths when terrain is the screening edge. | Obstacles in the side paths (iterated hull) if over-prediction behind dense blocks matters; needs a faster index to stay interactive. |
| Façade reflections | interim (v0.8.0) | First order only, off building walls (not hoarding or terrain), within 60 m of source or receiver, with one reflection loss for all walls (default 1 dB). The receiver's own façade is excluded, so façade levels are free-field. *Auto* = on for ISO, off on the TfNSW basis. Street canyons under-predict a little without higher orders. | Second-order reflections; a loss per building (e.g. glazed vs absorptive); hoarding as a reflector. |
| Single frequency band | closed for screening (v0.8.0) | Optional octave bands for ISO 9613-2 (63 Hz – 8 kHz) with generic indicative spectra. Decision (v0.9.0): generic shapes are acceptable. TfNSW's own method uses no spectra (single A-weighted values), and mobile plant that moves and turns makes measured spectra of limited extra value. The TfNSW basis stays single band. | Only if a detailed assessment needs it: measured or manufacturer spectra per item (BS 5228-1 Annex C data would need a licence). |
| Mixed ground in ISO mode | interim | Single band: Agr is blended linearly between hard (G = 0) and the alternative method (eq. 10, with DΩ). Octave bands: the general method (Table 3). The two give different upper-floor gains over soft ground (+2.8 vs +1.0 dB in the set-back scene). One G is used for the whole path. | Ground regions (G per area, e.g. from land cover), so source, middle and receiver regions can differ. |
| Distance definition | interim | Slant distance is used throughout; the estimator uses horizontal distance. Negligible except close to tall receivers. | Documented. Could be made switchable if reconciliation needs it. |
| Realistic worst-case plant combination | closed | Optional *Loudest 1–3 rows (TfNSW estimator)*, matching the spreadsheet exactly. The default sums all plant (conservative). | – |
| Upper floors vs ground floors | open | The TfNSW basis gives the same level on every floor of an unscreened façade; the reference shows +2–4 dB, which only ISO single-band with soft ground reproduces. Side diffraction and reflections (v0.8.0) lift screened ground floors only a little (reflections about +4 dB in ISO mode), so screened top floors stay 10–20 dB above ground floors in the example scenes. | The reference geometry or measurements, to tell whether the model or the synthetic scene is off; then ground regions. |
| LAmax / sleep disturbance | interim | LAmax is estimated as LAeq,15min + 5 dB, the TfNSW estimator's convention, and checked against RBL + 15 (RBL not below 30) and 65 dBA. This is indicative only: real LAmax depends on the loudest events, not the average. | LAmax per source (an Lw,max field per plant item) and an event-based check. |
| Ground-borne noise, vibration, construction traffic, blasting | open | Out of scope for the screening model. | Vibration buffers from CNVG-PTI Appendix D (Stage 5). Ground-borne noise and blasting need specialist assessment. Traffic noise needs the RNP method. |

## Assessment (Stage 1, v0.6.0)

| Gap | Status | Limit / what it takes |
|---|---|---|
| Façade receivers per floor | closed | Points 1 m in front of each exposed wall, about 10 m apart (both configurable), at 1.5 m above each floor; worst point per building and floor. Party walls are skipped. The levels are free-field: the receiver's own façade is never a reflector, but other façades are when reflections are on (see Acoustics). |
| Floors per building | interim | Taken from OSM `building:levels`; otherwise height ÷ floor height (3 m), rounded down; can be overridden per building. Floors aren't split into individual dwellings or units (CNVG-PTI A.6). |
| Land use per building | interim | From OSM building, amenity, shop and office tags, with per-building and bulk override. Buildings tagged only `building=yes` are **assumed residential** (conservative) and flagged. Importing public zoning layers (e.g. the NSW Planning Portal land zoning) isn't built yet; it would map zone codes to land uses. |
| Noise catchment areas | closed | Drawn on the map or imported from GeoJSON, each with an R0–R5 category and optional measured RBLs. Buildings outside every NCA use a default. |
| NML table | closed | RBL + 10 (standard hours) / + 5 (OOHW), with the estimator's minimum RBLs for measured values; non-residential NMLs per CNVG-PTI Table 13. Internal levels are converted with an assumed 10 dB façade reduction (windows open), which is editable. "When in use" is set per land use (e.g. schools: daytime only). |
| Impact categories and mitigation lookup | closed | CNVG-PTI Table 9 (default) or the TfNSW estimator's Step 4 matrix, both as editable JSON, plus highly noise affected (≥ 75 dBA, standard hours). Exceedance is rounded to whole dB. A boundary value falls in the lower band under the guideline's wording and in the upper band under the estimator's. Project rules (e.g. RO in Period 2, as in the reference case) can be imported. |
| Property list and CSV | closed | Sortable, filterable table, one row per building-floor. CSV export includes every term and the NML basis, with a privacy prompt. Results are not saved in the scenario file; re-run after loading. |
| Addresses | interim | From OSM `addr:*` tags, from a GeoJSON `address` property, or typed in per building. No unit or apartment level. Matching to a public address dataset (NSW address points or G-NAF) isn't built yet. |
| Roads projects (EMF-NV-GD-0056) | open | Different guideline and mitigation codes. Needs that guideline and the roads estimator; the rules file can hold it once available. |

## Outputs (Stage 4, v0.9.0)

| Gap | Status | Limit / what it takes |
|---|---|---|
| Impact map, summary and property table | closed | Since v0.6.0: buildings by worst category, land use × category counts, sortable and filterable property list with CSV. |
| Printable report | closed | One HTML file per shift, with maps over the background map where the tile server allows it (v0.14.0), printed to PDF from Edge, in the generic section order (introduction, method, works, results, appendices). It includes the disclaimer, data sources with dates, and height source per building. Above 300 buildings, Appendix A lists only buildings with a floor above NML (the CSV has every building-floor). The layout is generic, not a copy of any commercial template. It doesn't yet match a specific client template; that needs the template, and the content would then be mapped onto it. |
| Shift scenarios | closed | Save, duplicate, compare and batch-run shifts within one project file. Shifts share buildings, NCAs and model settings; a shift with different model settings (e.g. ISO vs TfNSW) needs its own file. |
| Respite tracking | interim | Counts per receiver across shifts and planned dates, and the CNVG-PTI Table 8 RP check (consecutive evenings / nights and minimum breaks). Limits: the check runs per receiver, not per NCA; "in any one week" is covered by the run and break limits, not by calendar weeks; dates are entered by hand (no import from a works programme). Respite offers (RO) and alternative accommodation (AA) are listed as measures but not scheduled. |
| Works programme import | open | Dates are typed per shift. Importing a programme (CSV of activity, date, period) would remove that step. |
| Report per receiver for notifications | open | The property CSV is the hand-over to the community team. A mail-merge layout (one letter per address) isn't built. |

## Data and validation

| Gap | Status | What it takes |
|---|---|---|
| Calibration against the reference case | interim | Synthetic scenes (docs/CALIBRATION.md) check the category shape and the floor pattern. ±3 dB at receivers can't be tested without the reference geometry or its receiver list. The calibration import is ready for either, or for attended measurements. |
| Validation against the TfNSW estimator | closed | 24 golden cases recalculated from the spreadsheet match on every output (SWL combination, levels, LAmax, sleep, NMLs, exceedances, measures). |
| Estimator vs guideline measures | closed – decision (v0.9.0) | The two TfNSW sources disagree in 54 of 120 case-periods. Decision: use the client guideline (CNVG-PTI v4.6 Table 9), the default rule set. The estimator rule set stays available for reconciling with spreadsheet assessments. Revisit if the client says otherwise. |
| Coordinate systems | interim | Supports GDA94/GDA2020 MGA zones 48–58. Rasters in degrees are placed approximately. Other projections are not supported. |

## Licences

| Item | Status | Action |
|---|---|---|
| LASzip port licence | closed for internal use | Internal use is permitted under either Apache-2.0 (current upstream) or LGPL-2.1 (older releases). Confirm the source release only if the tool is distributed externally. |
| TfNSW tables | closed for internal use | The tool is used internally on TfNSW projects and not commercialised, which meets the non-commercial condition; attribution is in the app and THIRD_PARTY_NOTICES.md. Commercial use would need TfNSW's permission. |
