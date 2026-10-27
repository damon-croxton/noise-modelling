# Gap register

This register lists what the tool can't yet do, measured against TfNSW CNVG-PTI (EMF-NV-GD-0060 v4.6) and against commercial out-of-hours-work (OOHW) assessment platforms. For each gap it records what closing it would take. It is updated at every stage. The build-versus-buy recommendation will be added once Stages 1–3 are done.

Status: **open**, **interim** (partly handled, with a stated limit) or **closed**.

## Acoustics

| Gap | Status | Effect | What it takes |
|---|---|---|---|
| Lateral diffraction around building ends | interim | Sound only goes over buildings, so shadows come out too quiet (unsafe). The TfNSW method caps screening at 15 dB as a safeguard; ISO mode has no cap beyond 20/25 dB. | ISO 9613-2 lateral paths around vertical edges, combined with the path over the top. Planned for Stage 3. |
| Façade reflections | open | Expect +1 to 3 dB in streets. CNVG-PTI Table 4 lists reflections for detailed assessments. | First-order image sources with a configurable reflection loss. Stage 3. |
| Single frequency band | open | Diffraction is calculated at 500 Hz only, and ground and air use broadband values. | Optional octave-band mode with plant spectra (BS 5228 / DEFRA). Stage 3. |
| Mixed ground in ISO mode | interim | Agr is blended linearly between hard and soft, which approximates the ISO general method. | The general method per octave band, once octave mode exists. |
| Distance definition | interim | Slant distance is used throughout; the estimator uses horizontal distance. Negligible except close to tall receivers. | Documented. Could be made switchable if reconciliation needs it. |
| Realistic worst-case plant combination | open | All sources are summed, which is conservative. The estimator sums only the 2–3 loudest items. | An "estimator combination" option per scenario. Stage 1 or 4. |
| LAmax / sleep disturbance | open | Only LAeq,15min is predicted. | LAmax per source (Lw,max) and checks against RBL + 15 and 65 dBA. Stage 1. |
| Ground-borne noise, vibration, construction traffic, blasting | open | Out of scope for the screening model. | Vibration buffers from CNVG-PTI Appendix D (Stage 5). Ground-borne noise and blasting need specialist assessment. Traffic noise needs the RNP method. |

## Assessment (Stage 1)

| Gap | Status | What it takes |
|---|---|---|
| Façade receivers per floor | open | Points on exposed façades at 1.5 m above each floor, with the worst point reported per building and floor. |
| Land use per building | open | From the OSM building type, with per-building and bulk override; optionally imported zoning data. |
| Noise catchment areas | open | Draw or import polygons; RBL per catchment and period (measured, or R0–R5 defaults). |
| NML table | open | RBL + 10 / + 5 with the estimator's minimum floors, plus the non-residential NMLs (CNVG-PTI Table 13), as editable JSON. |
| Impact categories and mitigation lookup | open | CNVG-PTI Table 9 as editable JSON. The reference case shows RO in Period 2, which v4.6 doesn't, so project-specific rules must be supported. |
| Property list and CSV | open | Sortable, filterable table, with a privacy warning before export. |
| Roads projects (EMF-NV-GD-0056) | open | Different guideline and mitigation codes. Needs that guideline and the roads estimator; the rules are being built as data so it can be added. |

## Outputs (Stage 4)

Still to come: the printable report in the standard section structure, saved shift scenarios with duplicate, compare and batch run, respite tracking across scenarios, and a calibration import.

## Data and validation

| Gap | Status | What it takes |
|---|---|---|
| Calibration against the reference case | open | No real-site data in the development environment. Stage 2 uses a synthetic scene; a real-site comparison needs DEM, LiDAR and OSM files for a comparable area. |
| Validation against the TfNSW estimator | partly closed | Propagation terms and 6 whole-path cases match within 0.01 dB. Plant summation and mitigation outputs are not yet compared. |
| Addresses | open | Needs a public address dataset loaded locally (e.g. NSW address points or G-NAF), matched to buildings. |
| Coordinate systems | interim | Supports GDA94/GDA2020 MGA zones 48–58. Rasters in degrees are placed approximately. Other projections are not supported. |

## Licences

| Item | Status | Action |
|---|---|---|
| LASzip port licence | closed for internal use | Internal use is permitted under either Apache-2.0 (current upstream) or LGPL-2.1 (older releases). Confirm the source release only if the tool is distributed externally. |
| TfNSW tables | closed for internal use | The tool is used internally on TfNSW projects and not commercialised, which meets the non-commercial condition; attribution is in the app and THIRD_PARTY_NOTICES.md. Commercial use would need TfNSW's permission. |
