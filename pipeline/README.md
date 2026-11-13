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

**That closed in Nov 2026.** `adoption.state.gov` now redirects every bulletin
URL, past ones included, to `travel.state.gov`'s 404 page, which answers 403.
`travel.state.gov` also blocks a browser user agent from scripts (Cloudflare
"Attention Required"). Every bulletin we have is committed in
`data/bulletin-pages/` (`archive_cached_pages.py`, which Refresh data runs on
every run, copies anything from the fetch cache that is not there yet), so the
repository is the archive of record. Each new bulletin now comes in by hand,
about once a month:

```bash
# Save the bulletin from travel.state.gov in your browser (Web Page, HTML Only), then:
.venv/bin/python pipeline/import_bulletin.py ~/Downloads/<saved page>.html
git add data/bulletin-pages && git commit -m "Import the <Month YYYY> visa bulletin" && git push
```

The page is checked (month from its title, both tables must parse) and stored
in `data/bulletin-pages/` with its provenance in `sources.json`. A committed
page wins over the fetch cache and the network. The push triggers Refresh data.
`check_freshness.py` warns from the 25th when the next month's bulletin is due
and fails the run from the 1st if it is still missing.

October and November 2009 and October 2012 were never missing upstream, only
from the mirror. They are recovered from the Wayback Machine into
`data/bulletin-pages/`, so the archive has no gaps.

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
