# Data shapes the app reads

Proposed by Zohaib for the 10 PM check-in. `earth_grid.json`, `targets.json` and `scores_<target>.json` follow `TASKS-IBRAHIM.md` exactly. The rest are proposals: change anything, just tell me so I can match it.

All files sit in `data/processed/`. The app never fills gaps: a missing file shows "waiting for <file>", and a `null` value shows "pending".

## Already agreed

- **`earth_grid.json`**: read through `fields`; the column order is never hard-coded. `year` shows in the Earth source tag. `sources[field]` shows under each Earth value in Nerd Mode.
- **`targets.json`**: `value` / `range` / `status` / `source` per feature. `null` shows as "pending", and `range` shows as "180 to 605".
- **`scores_<target>.json`**: `cells[]` with `lat`, `lon`, `score`, `tier`, `dims`. Two optional extras help:
  - `"resolution_deg": 0.5` (otherwise the app works it out from the latitudes)
  - `"illustrative": true` while it's sample data (shows the yellow badge)

## Proposed

### Lens switching happens in the browser

Section 12 step 5 says overall = weighted mean of the per-dimension scores. If **`dims` in the scores file are the per-dimension similarities**, the app can rescore the whole globe instantly for any lens, and Gemini "Ask the Planet" only has to pick weights. That means one scores file per target, not one per lens.

**`lenses.json`**: the weight keys must match the `dims` keys in the scores files.
```json
{
  "lenses": [
    { "id": "rover_testing", "name": "Rover Testing",
      "description": "Roughness, boulders, crater walls",
      "weights": { "terrain": 0.6, "temperature": 0.1, "albedo": 0.2, "barrenness": 0.1 } }
  ],
  "tier_thresholds": { "exact": 0.9, "strong": 0.75, "moderate": 0.6, "variable": 0.4 }
}
```
`tier_thresholds` are your numbers. Without them, a rescored cell shows its score but no tier.

### `sites.json`
```json
{ "sites": [
  { "id": "hingol", "name": "Hingol mud volcanoes", "country": "Pakistan",
    "lat": 25.445, "lon": 65.866, "tag": "emerging",
    "analog_for": ["acidalia"], "note": "...", "source": "..." }
] }
```
`tag` is `benchmark` or `emerging`. `id` is also the name of that site's `nerd_<id>.json`.

### `gaps.json`
```json
{ "gaps": [
  { "id": "gravity", "worlds": ["mars", "moon"], "gap": "Reduced gravity",
    "detail": { "mars": "0.38 g", "moon": "0.16 g" },
    "how_to_fake_it": ["Gravity offloading rigs", "Parabolic flights"],
    "source": "..." }
] }
```

### `blind_test.json`
```json
{ "target": "jezero", "top_n": 500, "recall": { "found": 5, "total": 8 },
  "known_analogs": [ { "name": "Atacama", "lat": -24.5, "lon": -69.25, "rank": 12, "score": 0.91, "in_top_n": true } ] }
```

### `mission_twin.json`
```json
{
  "mission": "Perseverance, Jezero",
  "playback_seconds": 24,
  "planet": { "world": "mars", "target": "jezero", "rover": "Perseverance",
              "path": [[77.40, 18.44], [77.41, 18.445]], "source": "..." },
  "earth":  { "site": "Hingol", "rover": "Earth twin",
              "path": [[65.85, 25.44], [65.86, 25.445]], "source": "..." },
  "segments": [
    { "id": 1, "label": "flat, dusty", "length_m": 100,
      "planet_range": [0, 2], "earth_range": [0, 3],
      "match": 0.82,
      "planet": { "slope_deg": 2.1, "roughness_m": 0.3, "albedo": 0.18 },
      "earth":  { "slope_deg": 2.4, "roughness_m": 0.4, "albedo": 0.20 },
      "gaps": ["Gravity", "Thin CO2 atmosphere"] }
  ],
  "itinerary": [ { "day": 1, "time": "09:00", "segment": 1, "text": "Segment A (flat, dusty)" } ],
  "timing_note": "A Mars day is about 24 h 39 min. We match conditions, not clocks."
}
```
- Paths are `[lon, lat]`.
- `planet_range` / `earth_range` are vertex indices into each path. That's how DTW's pairing reaches the screen: segment i plays on both worlds at the same moment.
- `match: null` means no good Earth match. The app says so instead of hiding it.

### `nerd_<site>.json`: one shape for every Nerd chart
```json
{
  "site": "hingol", "target": "acidalia",
  "cards": [ { "title": "Basalt", "text": "Same rock that covers most of Mars", "source": "..." } ],
  "charts": [
    { "id": "temp_24h", "title": "24-hour surface temperature",
      "x": { "label": "Local hour", "unit": "h" },
      "y": { "label": "Surface temperature", "unit": "°C" },
      "series": [
        { "world": "earth", "label": "Hingol", "points": [[0, 21.3], [1, 20.8]], "source": "MODIS MOD11A2 v061, 2023", "source_type": "orbital" },
        { "world": "mars",  "label": "Acidalia", "points": [[0, -80], [1, -82]], "source": "Mars Climate Database", "source_type": "model" }
      ] }
  ]
}
```
`source_type` is one of `orbital`, `ground sample`, `rover measurement`, `model`, `lab`. Slope histograms and the spectral pair use the same shape: x = slope bin or wavelength, y = fraction or reflectance.

### For the API (optional)
`top_<target>.json`: the same shape as `scores_<target>.json`, with only the top ~500 cells. The Worker uses it when it exists, because parsing the full grid can go past the free-plan CPU limit.
