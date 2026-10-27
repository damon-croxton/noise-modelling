# Build versus buy

This compares the built tool (v0.14.0) with buying a commercial noise-modelling package, and lists the built tool's caveats. It closes the build-versus-buy item in `GAP_REGISTER.md`.

There are three options:
- **Built:** this tool. It is free, runs in a browser, and is scoped to TfNSW out-of-hours-work (OOHW) screening.
- **Bought, general purpose:** a desktop modelling package such as SoundPLAN, CadnaA or Predictor-LimA. These cover many standards and source types and are used by acoustic consultancies.
- **Bought, OOHW platform:** a hosted product built for construction-noise notification and respite planning, usually sold per project or as a subscription.

The free TfNSW Construction Noise Estimator spreadsheet is the baseline that all three are measured against.

Prices below are indicative only. Get quotes before deciding.

## Comparison

| | Built (this tool) | Bought: general purpose | Bought: OOHW platform |
|---|---|---|---|
| **Cost** | No licence fee. The cost is staff time to maintain it. | Typically a five-figure licence per seat, plus annual maintenance and training. | Subscription or per-project fee. |
| **Set-up** | Open a web page or one HTML file. No install, no admin rights. | Install, a licence server or dongle, and IT approval. | Account set-up, plus a vendor security and privacy review. |
| **Who can use it** | Environment and planning staff, after the in-app guide. | Trained acoustic modellers. | Project and community staff. |
| **Prediction method** | Two methods. TfNSW estimator basis: matches the spreadsheet on all 24 golden cases. ISO 9613-2: single band or octave bands. | ISO 9613-2, CONCAWE, CNOSSOS-EU, Nord2000 and others, implemented and tested by the vendor. | Usually ISO 9613-2 or the estimator method. Often a black box. |
| **CNVG-PTI rules** | Built in as editable JSON: NMLs, Table 9 categories and measures, Table 8 respite. | Not built in. It gives levels; categories and measures are done by hand or in a spreadsheet. | Usually built in. Sometimes fixed to one reading of the guideline. |
| **Receivers** | Façade points on every floor, worst point per building and floor, land use from OSM. | Any receiver layout, including building evaluation on every façade and floor. | Per property, usually from an address dataset. |
| **Geometry** | Footprints with OSM height. DEM terrain. LiDAR for building heights. Hoarding as thin barriers. | Full 3D, including bridges, roofs, cuttings and embankments. CAD and GIS import. | Varies, often footprints only. |
| **Sources** | Point sources only. Generic plant library (CNVG-PTI Table 19 and the estimator list). Generic spectra. | Point, line and area sources. Moving sources. Measured spectra. Directivity. | Plant library. Point or area sources. |
| **Propagation** | Over-top and side diffraction. First-order reflections. One ground factor per path. Downwind (ISO) conditions only. | Higher-order reflections, ground regions and meteorology options. | Varies. |
| **Shifts and respite** | Shifts in one project, comparison, the Table 8 respite check, dates per shift. | No. Done outside the tool. | Core feature. Often linked to a works programme and to notifications. |
| **Outputs** | Category map, property list, CSV, a printable report with maps and data sources. | Noise maps and tables. Reports are assembled by the consultant. | Notification lists and letters, dashboards, reports. |
| **Transparency** | Every term on every path is shown in the probe. Rules are readable files. Source code is in this repository. | Documented methods, but the code is closed. | Usually closed. |
| **Privacy** | Runs on the user's machine. Nothing is uploaded. | Local files. | Addresses and resident data are stored with the vendor. |
| **Acceptance** | Not established. No regulator or client has accepted its output. | Widely accepted in NSW EIS and CNVMP work, when used by a consultant. | Depends on the product and the client. |
| **Support and continuity** | In-house only. It depends on whoever maintains it. | Vendor support, updates and user community. | Vendor support. Risk if the vendor exits. |
| **Changing it** | Change it yourself the same day, e.g. new rules, a client template or a new data source. | Feature requests to the vendor. Scripting in some packages. | Feature requests to the vendor. |

## Caveats of the built tool

**Accuracy**
- It is validated against the TfNSW estimator (exact match) and against synthetic scenes.
- It is **not** validated to ±3 dB against a commercial model or against measurements. The reference case's geometry wasn't available (`docs/CALIBRATION.md` Part B). The calibration import is ready for either.
- Screened upper floors come out 10–20 dB above ground floors in the synthetic scenes, while the reference shows 2–4 dB. Whether the scenes or the model is off can't be told without real geometry.

**Model simplifications** (details in `GAP_REGISTER.md`)
- Point sources only. There are no line, area or moving sources, so a long works front has to be several points.
- Reflections are first order only, off building walls, with one loss for every wall.
- There is one ground factor per path, with no ground regions.
- Meteorology is downwind only.
- LAmax is estimated as LAeq + 5 dB. Real maximum levels depend on the loudest events.
- Spectra are generic shapes, not measured data. On the TfNSW basis this doesn't matter, because that method uses single A-weighted values.
- Side diffraction ignores buildings that the side path itself crosses. This leans conservative.

**Input data**
- OSM footprints can be missing, out of date or wrongly tagged.
- Buildings tagged only `building=yes` are assumed residential.
- Floors come from tags, or from height ÷ 3 m.
- There are no unit-level addresses, and no matching to G-NAF or NSW address points.
- Only GDA94/GDA2020 MGA coordinates are supported.

**Scope**
- Construction airborne noise only. Vibration, ground-borne noise, construction traffic and blasting are out of scope.
- Rail is covered (EMF-NV-GD-0060). The roads guideline isn't loaded.

**Scale**
- It runs on one browser thread. On a weak laptop, a large area with thousands of buildings, octave bands and reflections takes minutes rather than seconds.
- Use the TfNSW basis and the draft heat map for big sites.

**Assurance**
- Tests check behaviour against known answers. The code hasn't had an independent technical review, and there is no formal QA or version control of individual assessments.
- A project file and report record the settings and data sources. They are not an audit trail.

**Maintenance**
- One small team maintains it. If nobody owns it, it falls behind changes to CNVG-PTI, the estimator and data sources.

**Background maps**
- The OpenStreetMap background works only in the online copy. From disk, the NSW base map is used.
- The report maps include the background only when the tile server allows cross-origin use (CORS). OSM's servers do. Whether the NSW services do hasn't been checked yet, because the build environment can't reach them. If a server doesn't, the maps are drawn plain and the log says so.

**Licences**
- TfNSW tables are used under the non-commercial condition, and the tool is internal.
- Selling the tool, or giving it to third parties, needs TfNSW's permission and a licence check (`THIRD_PARTY_NOTICES.md`).

**Standing of the output**
- The output is a screening estimate. Where an assessment goes into an approval, an EPL submission or a dispute, it needs a qualified acoustic consultant and their tool.

## Recommendation

**Keep building for screening and OOHW planning. Don't buy a general-purpose package for that work. Rely on consultants (and their licences) for compliance assessments.**

- **What the built tool does well:** early what-ifs, shift and respite planning, and repeatable assessments on the estimator basis. It does them faster than the spreadsheet, keeps resident data on the machine, and can be changed the same day. A general-purpose package doesn't do the CNVG-PTI categories, measures or respite, and needs a trained modeller.
- **Where a bought package earns its cost:** complex 3D sites, long or moving works fronts, measured spectra, and outputs that have to be defended to the EPA or the community. That work is normally done by a consultant who already holds the licence, so buying seats in-house adds little.
- **When to consider an OOHW platform:** if notification letters, dashboards and multi-user programme scheduling become the main need. Run a vendor privacy review first, because resident data would leave the machine.

**Conditions for continuing to build:**
1. Calibrate against one real project, using a consultant's receiver export or attended measurements, with a target of ±3 dB. Record the result in `docs/CALIBRATION.md`.
2. Get one independent technical review of the engine and rules by an acoustic engineer.
3. Name an owner who updates the rules when CNVG-PTI or the estimator changes.

If item 1 fails by a wide margin and can't be fixed, stop extending the model. Use the tool only for CNVG-PTI categories and respite, applied to levels from a consultant's model, which the calibration import can already load.
