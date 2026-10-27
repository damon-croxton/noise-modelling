# Calibration report – Stages 2 and 3 (v0.8.0)

This report covers two comparisons:
- **Part A:** against the **TfNSW Construction Noise Estimator** (EMF-NV-TT-0068). The spreadsheet is available, so the comparison is exact, case by case.
- **Part B:** against the **de-identified commercial reference case** from the challenge brief (§4). Its geometry is not available, so the comparison is partial.

Part C describes the calibration import for future real-data comparisons. Part D repeats the reference comparison with the Stage 3 acoustics (v0.8.0): side diffraction, façade reflections and octave bands. All test data is synthetic, and no real location was used.

## Summary

| Check | Result |
|---|---|
| Estimator: plant combination, levels, NMLs, sleep check, exceedances, measures (24 cases × 5 periods) | **Exact match** (to 10⁻⁶ dB) with the "TfNSW estimator Step 4" rule set |
| Estimator vs guideline Table 9 (CNVG-PTI v4.6) | **54 of 120** case-periods give different measures. The two TfNSW sources disagree, so the team must choose one (see A.3) |
| Reference: plant total and implied distances | Total 96.4 dBA. Its 46–57 dBA range implies unscreened receivers 37–131 m away (TfNSW basis) |
| Reference: level and exceedance range | Reproduced only when the scene is set back 37 m, which is derived from the reference itself and therefore not independent evidence |
| Reference: category pattern (mostly Low, few Medium, no High) | Same pattern in the corridor and set-back scenes, but with more Medium (15–21 building-floors against the reference's 2). Not comparable in absolute numbers, because the scene sizes differ |
| Reference: upper floors 2–4 dB above ground floors | **Not reproduced** on the TfNSW basis: about 0 dB with line of sight, and +5 to +13 dB behind screening. The 2–4 dB pattern appears only with ISO 9613-2 single band over soft ground (+1.3 dB at 50 % soft, +2.8 dB at 100 %). The octave-band general method gives about +1 dB (Part D) |
| Stage 3 acoustics (v0.8.0) | Side diffraction, reflections and octave bands change the median building-floor by 0 dB, but screened floors by up to 10–16 dB. They don't close the gap to the reference, which stays a geometry question (Part D) |
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

Results from v0.7.0, before the Stage 3 acoustics (Part D has the v0.8.0 re-run), with the CNVG-PTI rule set. "Above NML" counts building-floors (each building's worst façade point per floor); "top − ground" is the mean for the first-row and second-row apartment blocks:

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

## D. Stage 3 re-run (v0.8.0)

The same three synthetic scenes and the same plant, with the new acoustics:
- **side diffraction**, on in every configuration;
- **façade reflections**, which *Auto* turns on for ISO and off on the TfNSW basis;
- **octave bands** ("ISO oct."), with the generic spectra chosen automatically: *impact* for the rattle gun, *diesel plant* for the rest.

Ground is hard unless stated. Full output: `docs/test-evidence/v0.8.0.txt`.

### D.1 Results (CNVG-PTI rule set)

| Scene / method | Above NML (v0.7.0) | LAeq above NML | Exceedance | Categories (above NML) | Top − ground, 1st row / 2nd row (v0.7.0) |
|---|---|---|---|---|---|
| Reference | 59 | 46–57 | 5–17 | mostly Low, 2 Medium | +2 to +4 |
| street, TfNSW | 193 (186) | 41–69 | 1–29 | 74 Negl., 84 Low, 29 Med., 6 High | −0.5 / +9.8 (+10.9) |
| street, ISO | 193 (175) | 41–70 | 1–29 | 61 Negl., 97 Low, 28 Med., 7 High | −0.7 / +15.0 (+18.8) |
| street, ISO oct. | 194 | 41–70 | 1–29 | 66 Negl., 93 Low, 29 Med., 6 High | −0.4 / +15.2 |
| corridor, TfNSW | 181 (170) | 41–63 | 1–22 | 68 Negl., 92 Low, 21 Med. | +5.3 / +13.1 (+12.9) |
| corridor, ISO | 166 (155) | 41–63 | 1–23 | 52 Negl., 91 Low, 23 Med. | +8.8 / +21.2 (+20.2) |
| corridor, ISO oct. | 165 | 41–63 | 1–23 | 53 Negl., 89 Low, 23 Med. | +9.3 / +20.7 |
| set-back, TfNSW | 215 (202) | 41–57 | 1–17 | 78 Negl., 122 Low, 15 Med. | 0.0 / +9.6 (+11.2) |
| set-back, ISO | 218 (202) | 43–58 | 1–17 | 62 Negl., 140 Low, 16 Med. | −0.2 / +11.8 (+16.0) |
| set-back, ISO oct. | 221 | 41–57 | 1–17 | 69 Negl., 136 Low, 16 Med. | −0.2 / +11.6 |

The second-row means cover slightly different buildings in each run (only buildings with a floor above NML are counted), so compare them roughly.

### D.2 What each feature changes
Each building-floor is compared with the same run without the feature (hard ground):

| Feature | Basis | Mean change | Median | Largest |
|---|---|---|---|---|
| Side diffraction | TfNSW | +0.4 to +0.7 dB | 0 | +9.6 dB |
| Side diffraction | ISO | +1.6 to +2.9 dB | 0 | +15.5 dB |
| Reflections | ISO | +0.8 to +1.0 dB | 0 | +15.7 dB |
| Octave bands vs single band | ISO | −0.05 to +0.05 dB | −0.2 to −0.1 dB | +12.7 dB |

- **Side diffraction does more in ISO mode,** because ISO screening goes to 20/25 dB while the TfNSW basis already stops at 15 dB.
- **The largest changes are all at screened floors:**
  - ends of terrace rows and cross streets, where a side path or a reflection off the next block reaches a point that the path over the top doesn't;
  - low-frequency diffraction in octave mode.
- **Most floors don't change.** They either have line of sight, or sit behind 30–54 m terrace and apartment blocks and 360 m of hoarding, where the side paths are long.

### D.3 Upper floors over soft ground (set-back scene, first-row 6-storey blocks, line of sight)

| % soft | ISO single band | ISO octave bands |
|---|---|---|
| 0 | −0.2 dB | −0.2 dB |
| 50 | +1.3 (0.2 to 2.3) | +0.7 (−0.1 to 2.1) |
| 100 | +2.8 (1.5 to 4.1) | +1.0 (0.3 to 1.7) |

- **Single band** uses ISO 9613-2's alternative method (eq. 10 with DΩ). It gives the larger height effect, which falls in the reference's +2–4 dB range at 100 % soft.
- **Octave bands** use the general method (Table 3). Its ground effect is concentrated at 250–500 Hz near the ground, and is smaller after A-weighting with these spectra.
- So the upper-floor gain depends on the ground method as much as on the geometry. Which method the commercial tool used isn't known.

### D.4 Findings
1. **Stage 3 doesn't close the gap to the reference.** Absolute levels and counts are set by the geometry, which is unknown (B.4). The new features change the median floor by 0 dB.
2. **Screened ground floors are less under-predicted than in v0.7.0.** Side diffraction and reflections lift individual screened floors by up to 15 dB. But screened second-row top floors are still 10–13 dB (TfNSW) to 12–21 dB (ISO) above their ground floors. The reference's 2–4 dB suggests its receivers were mostly unscreened, or that its scene was more open than these.
3. **The TfNSW basis stays the reconciling default.** Side diffraction (on by default) moves it away from the estimator only at screened points, and only upwards (conservative). Turn it off under *Model* to keep screening to the path over the top, as the estimator's screening input assumes.
4. **ISO with octave bands is the most complete method** but needs real plant spectra. The built-in shapes are indicative, and with them the A-weighted results average the same as single band.
5. **Next steps are unchanged:** the reference geometry or the commercial tool's receiver export (load it with *Calibration → Import levels*), or attended measurements.

