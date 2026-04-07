# Olympics Day Planner

Frontend-only TypeScript app to build a day schedule from Olympics event data with zone-based transit constraints.

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Convert CSV source data to frontend JSON:

```bash
npm run convert:data
```

3. Start the dev server:

```bash
npm run dev
```

## Data flow

- Source CSV: `raw/olympic-events.csv`
- Converter script: `scripts/convert-events.mjs`
- Generated JSON: `public/data/events.json`

## Planner logic

For a selected event A, event B is reachable only if:

- Same day
- `start(B) >= end(A) + transit(zone(A), zone(B))`

Transit values are editable in the UI and are symmetric between zones.
