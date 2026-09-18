# Pipeline

Server-side ETL. Fetches public government data, parses it into versioned JSON
under `../data/`, and never touches user data.

## Setup

```bash
python3 -m venv .venv            # from the repo root
./.venv/bin/pip install -r pipeline/requirements.txt
```

## Run

```bash
cd pipeline
../.venv/bin/python build_bulletins.py     # archive -> data/bulletins.json
../.venv/bin/python build_limits.py        # annual limits -> data/limits.json
../.venv/bin/python analyze_archive.py     # Phase 0 data-quality report
```

Raw downloads are cached under `pipeline/cache/` (gitignored). A full backfill
is about 200 requests; after that re-runs are free. `--no-cache` forces refetch.

## Where the data comes from

`travel.state.gov` is behind a bot filter and returns 403. `adoption.state.gov`
serves the same content tree unblocked, and that is the ingest path. Treat it as
possibly a firewall misconfiguration that could close without notice: the
fetcher is rate limited to roughly one request per second with a descriptive
user agent, and the manual fallback in PLAN.md section 8 stays the backup.

Two URL details that are easy to get wrong:

- The path segment is the **fiscal** year while the filename carries the
  **calendar** month and year. October 2015 lives under `/2016/`.
- A 404 is meaningful rather than an error. A future month simply does not exist
  yet, which is how the backfill finds the edge of the archive.

## Output shape

`bulletins.json` is one flat row per `(chart, track, category, chargeability)`
per month, not a fixed column layout. Columns genuinely churn across the
archive, so a fixed five-country table would silently drop data. Each month also
carries a `content_sha256`, because bulletins have been revised at the same URL.

Cell values are typed rather than stringly: `date`, `current`, `unavailable` or
`empty`. "C" and "U" are not points on a date line and collapsing them would
corrupt both the velocity model and the backtest metric.

## Tests

`analyze_archive.py` doubles as the regression check. It asserts nothing, but a
clean run reports zero unmapped labels and zero parse warnings. If a new
bulletin introduces a column or category the mapping does not know, it shows up
there as a `?`-prefixed label rather than being dropped.
