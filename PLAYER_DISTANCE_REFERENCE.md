# Player distance reference comparison

This feature compares observed results with a supplied cohort. It does not predict distance, measure physical power, or change motion scores or experimental A/B indices.

Enter sex alongside height, body mass, muscle mass and measured total distance in the analysis toolbar. In the Reference Guide, review motion priorities first, then player comparison results. Open “Load Reference Data and Set Conditions” to upload CSV data or edit cohort filters. Experimental indices, observations, formulas, engine evidence and frame-scoring details are collapsed separately. Muscle mass is included in A/B and the data1 reference when supplied, but is not yet a CSV cohort-matching field.

## data1 body-reference efficiency

The distance component uses measured total distance divided by the data1 body-adjusted reference distance, multiplied by 100. It is independent of motion scores and CSV cohort means and requires sex/height/body mass/positive measured total distance.

The main estimated potential-power utilization efficiency displays the equal-weight arithmetic mean of that distance component and the distance-motion average converted to percent (score × 10). Average the unrounded components, then display one decimal place. Missing either component holds the combined calculation; a valid zero motion score is not missing. Neither the distance component nor the combined index is capped at 100%. Reference details retain both components and the formula. A one-point increase in motion average raises the combined index by five percentage points with the distance component unchanged.

This 50:50 blend is a user-selected experimental index, not validated physical power utilization. Only the distance component's 100% threshold directly represents matching the distance reference. Existing body formulas, sensitivity settings and frame scores are unchanged; loaded projects recalculate the displayed combined index from their restored inputs.

The workbook supplied by the user contains sex-specific body tiers and total-distance ranges, but no measured percentile distributions or verified sources/sample sizes. The user approved this experimental interpolation:

- Height anchors: male 168/171/176/181/184 cm; female 158/161/166/171/174 cm.
- Body-mass anchors: male 65/69/76/83/87 kg; female 52/55/60.5/66.5/70 kg.
- Muscle-mass anchors: male 30/32/35/38/40 kg; female 21.5/22.75/25/27.5/29 kg.
- Tier anchors map to provisional percentile coordinates 10/30/50/70/90. Interior body anchors are tier midpoints; outer anchors use the tier-1 upper and tier-5 lower boundaries. Linear interpolation clamps outside the anchor range and flags it.
- Composite coordinate: height 35%, mass 15%, muscle 50%; if muscle is unmeasured, height 60%, mass 40%.
- Total-yard upper endpoints: male 280/293/308/320/335; female 228/242/258/270/285. Interpolate using the composite coordinate. The workbook's 335+ and 285+ are not actual maxima; numeric portions are provisional anchors.
- Reference meters = interpolated total-yard upper endpoint × 0.9144 × cross correction (no percentage uplift). Body interpolation, cross correction and experimental sensitivity remain in effect.
- Lambda = height coordinate / muscle coordinate. Correction is 1 for 0.85–1.15; above 1.15 use max(0.96, 1 − 0.015 × (lambda − 1.15)); below 0.85 use min(1.05, 1 + 0.020 × (0.85 − lambda)).
- Without muscle measurement, skip cross correction explicitly (factor 1). Invalid supplied muscle measurements hold calculation rather than silently omitting them.

These are approved modeling assumptions, not validated statistical percentiles or measured physical power. The earlier illustrative 46.75%/242.5m carry example is not a calibration target for this total-distance model. Sex is shared with the comparison settings and is saved/restored with the project. The height selector supports 150–200 cm, including the female lower-tier anchors.

Validation: `node --test scripts/test-physical-distance-reference.mjs`.

### Experimental sensitivity controls

Height and weight sensitivity are independently adjustable from 1 to 3, initially 1.5 each. Let B be the original corrected data1 reference, BH the reference with only the height percentile set to 50, and BW the reference with only the weight percentile set to 50 (all other percentiles unchanged). Adjusted reference = B × (B/BH)^(heightGain−1) × (B/BW)^(weightGain−1). These counterfactual reference coordinates are not new body measurements.

Unit gains reproduce the original formula. Increasing a gain amplifies log-distance differences relative to the central coordinate; the resulting efficiency percentage-point changes are not an exact fixed multiplier. The original distance and efficiency remain visible in details. Muscle weights and cross-correction rules remain unchanged. Body values outside anchors still clamp: this does not invent extrapolated statistics. Coefficients are experimental, not statistically fitted.

Projects save both gains; projects without gains restore 1.0/1.0 to preserve their previous calculation. Reset uses the new 1.5/1.5 defaults. Invalid settings explicitly hold calculation and block saving.

## CSV

UTF-8 CSV, up to 5 MB and 10,000 records. Required columns:

```csv
player_code,sex,height_cm,weight_kg,age_band,level,club,distance_type,conditions,distance_m,source
example01,male,170,70,adult,tour,driver,total,normal-weather-total,225,measured-session-001
```

The example is synthetic, not a real player standard. `sex` is `male` or `female`; `distance_type` is `carry` or `total`. Distances are meters. Use anonymous player codes, measured body data, and a traceable source for each row. Do not mix carry and total, different clubs, or incompatible measurement conditions.

## Cohort and calculation

- Enter matching sex, age band, player level, club and conditions; text fields must match the CSV exactly.
- Only `total` rows are used because the app's observed distance input is carry + roll.
- Set height and mass tolerances and the minimum number of distinct players. Defaults are ±5 cm, ±5 kg and 5 players. These are operational defaults, not statistically validated thresholds.
- The current player's anonymous code is excluded, if entered.
- The optional anonymous player-code input is in the Reference Guide's CSV comparison settings, not the main body-measurement toolbar. It does not affect the data1 efficiency calculation.
- Average repeated records per player, then give each player equal weight.
- Display mean, median, between-player sample standard deviation, and interpolated 25th–75th percentile range of player means. This is not a confidence interval.
- Distance realization = observed total distance / cohort mean × 100%. It may exceed 100%. It is not power utilization.
- Incomplete settings or insufficient distinct players hold the comparison explicitly.
- F1–F4 review uses the existing 8/10 threshold. High motion scores with observed distance below the cohort lower quartile prompt review of strike, delivery and measurement conditions; this is not a causal diagnosis or proof of unrealized potential.
- CSV rows and comparison settings are saved with analysis projects. Older projects load without reference data. Reset clears the dataset and settings.

Matching on body size and sex does not establish equal strength, explosive capacity or swing potential. The user must verify sources and comparable conditions. The app does not establish representativeness or data provenance.

## Validation

`node --test scripts/test-player-distance-reference.mjs`
