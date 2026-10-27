# Calibration report – Stage 2 (v0.7.0)

This report covers two comparisons:
- **Part A:** against the **TfNSW Construction Noise Estimator** (EMF-NV-TT-0068). The spreadsheet is available, so the comparison is exact, case by case.
- **Part B:** against the **de-identified commercial reference case** from the challenge brief (§4). Its geometry is not available, so the comparison is partial.

Part C describes the calibration import for future real-data comparisons. All test data is synthetic, and no real location was used.

## Summary

| Check | Result |
|---|---|
| Estimator: plant combination, levels, NMLs, sleep check, exceedances, measures (24 cases × 5 periods) | **Exact match** (to 10⁻⁶ dB) with the "TfNSW estimator Step 4" rule set |
| Estimator vs guideline Table 9 (CNVG-PTI v4.6) | **54 of 120** case-periods give different measures. The two TfNSW sources disagree, so the team must choose one (see A.3) |
| Reference: plant total and implied distances | Total 96.4 dBA. Its 46–57 dBA range implies unscreened receivers 37–131 m away (TfNSW basis) |
| Reference: level and exceedance range | Reproduced only when the scene is set back 37 m, which is derived from the reference itself and therefore not independent evidence |
| Reference: category pattern (mostly Low, few Medium, no High) | Same pattern in the corridor and set-back scenes, but with more Medium (15–21 building-floors against the reference's 2). Not comparable in absolute numbers, because the scene sizes differ |
| Reference: upper floors 2–4 dB above ground floors | **Not reproduced** on the TfNSW basis: about 0 dB with line of sight, and +5 to +15 dB behind screening. The 2–4 dB pattern appears with ISO 9613-2 and partly soft ground (+1.2 dB at 50 % soft, +2.7 dB at 100 %) |
| ±3 dB at most receivers | **Cannot be tested** without the reference geometry or its receiver list. The calibration import (Part C) is ready for when it is available |

## A. TfNSW Construction Noise Estimator

### A.1 Method
`tools/estimator_golden.py` fills in the estimator spreadsheet, recalculates it in LibreOffice and saves the outputs to `tests/golden/estimator-cases.json`. It covers 24 cases:

- **10 plant cases.** These exercise every branch of the "realistic worst case" rule (Step 2, cell C14): one item; loudest ×3 at 5 dB or more above the next; loudest ×2; loudest ×3 within 5 dB; loudest ×1 with second ×2; three single rows plus a quieter fourth; intermittent and locally screened flags; a tie; the reference-case plant; and six of one type. They also use different distances, screening (0, 5, 10, 15 dB), % soft ground, seasons, noise area categories, and measured RBLs, including RBLs below the minimums.
- **14 exceedance cases.** Each sets the total SWL so the exceedance lands on or beside every band boundary in every period, including ±0.5 dB rounding and the 75 dBA highly-noise-affected row.

The only change made to the spreadsheet: LibreOffice 24.2 has no `XLOOKUP`, so the three cells that look up the quantity of the loudest rows (Step 2, G18:G20) are replaced with the equivalent `INDEX/MATCH`.

`tests/estimator.test.js` checks the app against every output: cumulative SWL, LAeq day/evening and night, LAmax, sleep screening level and flag, NMLs for all five periods, rounded exceedance or "Compliant", and the additional measures. **All 24 cases match.**

### A.2 What the estimator does that isn't obvious from the guideline
- **Realistic worst case:** only the loudest one to three plant rows are summed (rule above). The app offers this as *Plant combination → Loudest 1–3 rows (TfNSW estimator)*; the default stays *All plant*, which is conservative.
- **Band boundaries:** each band includes its lower limit, so an exceedance of exactly 5 dB falls in "5–15", not "≤ 5".
- **Rounding:** exceedances are rounded to whole dB before banding, half away from zero.
- **Sleep check:** LAmax is taken as night LAeq + 5 dB and compared with RBL + 15 (RBL not below 30, so a minimum of 45).

### A.3 Estimator measures vs CNVG-PTI v4.6 Table 9
Under the guideline's Table 9, the same 24 cases give different measures in 54 of 120 case-periods. The estimator's measures are:

| Period | Estimator (as calculated) | Guideline Table 9 |
|---|---|---|
| Standard hours | PN, V from 10 dB (inclusive) | PN, V above 10 dB |
| OOHW 1 day | PN from 5 dB; PN, V, SN, RO from 15 dB | Same values, with upper-inclusive boundaries |
| OOHW 1 evening | PN 5–10; **PN, RP, DR 10–15**; **PN, V, SN, RO, RP, DR** from 15 | PN 5–15; PN, V, SN, RO 15–25; adds RP, DR above 25 |
| OOHW 2 evening (Sun/PH) | Uses the evening NML; **PN, V, SN, RO, RP, DR from 5 dB**; adds AA from 25 | As Period 2 night (below) |
| OOHW 2 night | **No PN below 5 dB** (that spreadsheet cell can never be true); **PN, V, SN, RP, DR from 5 dB**; adds AA from 25 | PN up to 5; PN, V 5–15; PN, V, SN, RP, DR 15–25; adds AA above 25 |

Both are TfNSW documents, so **the team must choose which one the client accepts.** The app has both as built-in rule sets: *Assessment rules → Rule set*. The guideline is the default. Project-specific rules can also be imported.

## B. Reference case (commercial tool, de-identified)

### B.1 What is known
- Night, OOHW Period 2, dense inner city, apartments and terraces.
- NMLs 44 (catchment A) and 40 (catchment B).
- Plant:

  | Item | Lw (dBA) | % time on | Penalty |
  |---|---|---|---|
  | EWP | 96 | 40 % | 0 |
  | Rattle gun | 96 | 20 % | +5 |
  | Power tools | 90 | 20 % | 0 |
  | Ute | 80 | 10 % | 0 |

- Results: 59 receivers above NML, 46–57 dBA, exceedances 5–17, mostly Low with two Medium, upper floors 2–4 dB higher.
- Codes: PN, V, SN, RO, RP, DR, and AA for higher categories.
- Geometry, receiver positions and the commercial tool's prediction method (beyond "ISO 9613-2") are **not known**.

### B.2 Checks that don't need the geometry
- **Effective sound power:** after time-on and penalty, the plant is 92.0, 94.0, 83.0 and 70.0 dBA, **96.4 dBA in total**. This is deterministic and the same in any tool that applies `10·lg(% on)`.
- **Implied distances:** on the TfNSW basis, 57 dBA occurs at 37 m and 46 dBA at 131 m from the works, unscreened. Screening would bring those distances in.
- **Categories:** exceedances of 5–15 shown as "Low" and about 17 as "Medium" fit both rule sets (Clearly audible / Moderately intrusive). The lowest exceedance being exactly 5 and labelled Low matches the estimator's lower-inclusive boundary, not the guideline's wording.
- **Measures:** **RO in Period 2 night** doesn't arise under either built-in rule set; the estimator gives RO only on Sunday or public-holiday evenings. **AA with nothing above Medium** doesn't arise either; both give AA only above 25 dB. So the reference used a project-specific strategy, or a different reading of Table 9. This is why the rules are editable data.

### B.3 Synthetic scenes
I fixed the geometry before looking at any results (`src/js/41-examples.js`, *Scenario → Example*). Each scene has:
- on both sides of the works: a first row of 2-storey terraces with party walls, and 6-storey apartment blocks;
- a 6 m lane, then a second row of 8-storey apartments and terraces;
- cross streets every 70 m;
- catchment A (NML 44) to the north and B (NML 40) to the south;
- the reference plant, 2 m high, within 10 m.

There are three variants:
- **street:** plant in the middle of a 20 m street, façades 10 m away.
- **corridor:** plant inside a 30 m rail corridor behind 2.4 m hoarding, first-row façades 20 m away.
- **set-back:** façades 37 m away with no hoarding. This distance comes from the reference's own maximum level, so it **isn't independent**.

Results with the CNVG-PTI rule set. "Above NML" counts building-floors (each building's worst façade point per floor); "top − ground" is the mean for the first-row and second-row apartment blocks:

| Scene / method | Above NML | LAeq above NML | Exceedance | Categories (above NML) | Top − ground, 1st row / 2nd row |
|---|---|---|---|---|---|
| Reference | 59 | 46–57 | 5–17 | mostly Low, 2 Medium | +2 to +4 |
| street, TfNSW | 186 | 41–69 | 1–29 | 70 Negl., 81 Low, 29 Med., 6 High | −0.5 / +10.9 |
| street, ISO | 175 | 42–69 | 1–29 | 56 Negl., 84 Low, 29 Med., 6 High | −0.7 / +18.8 |
| corridor, TfNSW | 170 | 41–63 | 1–22 | 58 Negl., 91 Low, 21 Med. | +5.3 / +12.9 |
| corridor, ISO | 155 | 41–63 | 1–22 | 56 Negl., 78 Low, 21 Med. | +8.3 / +20.2 |
| set-back, TfNSW | 202 | 41–57 | 1–17 | 68 Negl., 119 Low, 15 Med. | 0.0 / +11.2 |
| set-back, ISO | 202 | 41–57 | 1–17 | 65 Negl., 122 Low, 15 Med. | −0.3 / +16.0 |

The full output, including the estimator rule set and measure counts, is in `docs/test-evidence/v0.7.0.txt`.

### B.4 Findings
1. **Absolute levels depend on geometry, which isn't known.** The street scene is about 12 dB louder than the reference at its loudest receivers; the corridor scene is about 6 dB louder. Only the set-back scene matches the reference range, and that is by construction.
2. **The counts aren't comparable.** The synthetic scenes cover 350 m of frontage on both sides, and "above NML" here includes exceedances of 1–4 dB. The reference's lowest listed exceedance is 5, which suggests it lists only receivers that trigger measures.
3. **The category shape is similar** in the corridor and set-back scenes: mostly Low, some Medium, no High. The share of Medium is higher than the reference's.
4. **The upper-floor pattern differs, and this is a model limitation, not a geometry question.**
   - On the TfNSW basis with hard ground, an unscreened façade gets the same level on every floor (±0.5 dB). Behind hoarding or buildings, ground floors come out 5–15 dB quieter than top floors.
   - The 15 dB screening cap and the missing side diffraction make the screened ground floors too quiet: in reality sound reaches them around building ends and through gaps.
   - The reference's +2–4 dB on line-of-sight façades is what ISO 9613-2 with partly soft ground gives: +1.2 dB at 50 % soft and +2.7 dB at 100 % soft in the set-back scene, because ISO ground attenuation shrinks as the receiver rises.
   - The TfNSW estimator basis (CONCAWE ground, no receiver height term) can't produce this.

### B.5 What a real calibration needs
- **The reference project's geometry** (works location and receiver points), **or the commercial tool's receiver export** (ID or coordinates, floor, level). Load it with *Calibration → Import levels* (Part C) to get bias, spread and category agreement directly.
- **Better acoustics for screened receivers (Stage 3):** side diffraction, so the 15 dB cap can be relaxed; first-order façade reflections; and ISO ground attenuation per region as the main detailed method.
- **Attended measurements** at a few receivers during a real shift, compared through the same import. This is the only way to know which model is closer to reality.

## C. Calibration import

*Calibration → Import levels (CSV)* accepts:
- measured levels, or another tool's receiver results;
- matched by **receiver ID** (as in this tool's property list, e.g. `B12-L2`), or placed by **easting/northing** or **lat/lon** with a height above ground, RL or floor.

For each row the tool calculates its own level at that point, using the current period, method and plant. A point inside a footprint (e.g. another tool's building centroid) moves to the nearest façade point. The import reports:
- the difference (this tool − imported): mean, SD, RMS and range;
- the share of points within ±1 dB and ±3 dB;
- category agreement at each point's NML.

The points are drawn on the map, coloured by difference, and the comparison exports to CSV. Tested with synthetic "other tool" data: a known bias and spread are recovered exactly.
