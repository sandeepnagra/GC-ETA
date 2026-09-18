"""GC ETA data pipeline.

Fetches public immigration data, parses it into versioned JSON, and writes it
to ../data/ for the app to consume. Nothing here touches user data; every
input is a public government file.

See ../PLAN.md sections 4 and 8 for the source inventory and the ingest rules.
"""

__version__ = "0.1.0"
