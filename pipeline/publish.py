#!/usr/bin/env python3
"""Validate the built bundle and lay out what the app downloads.

PLAN.md 8.1: shipping a new number is a data publish, not a release. The app
fetches a manifest on launch and pulls a new bundle only when one exists, so
this writes the three files that sit behind that fixed URL.

THE POINT OF THIS SCRIPT IS THE CHECKS, not the copying. A scheduled job that
succeeds quietly on bad data is worse than one that fails, because the app will
take what it is given and nobody will look again. Every check here compares the
new bundle against the one currently committed and refuses to publish anything
that went backwards: fewer series, an earlier last month, a missing dataset.
The archive only grows, so a shrink means something upstream broke.

The app repeats the same shape checks on download, because a build server and a
phone can disagree and the phone is the one holding the user's answer.

Usage:
    python publish.py --out public/data
    python publish.py --out public/data --previous /tmp/old-bundle.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"


def fail(message: str) -> None:
    print(f"  FAIL  {message}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="public/data")
    parser.add_argument(
        "--previous",
        help="The bundle to compare against. Without it, only shape is checked.",
    )
    args = parser.parse_args()

    bundle_path = DATA / "app-bundle.json"
    events_path = DATA / "events.json"
    if not bundle_path.exists() or not events_path.exists():
        fail("data/app-bundle.json or data/events.json is missing")
        return 1

    try:
        bundle = json.loads(bundle_path.read_text())
        events = json.loads(events_path.read_text())
    except json.JSONDecodeError as error:
        fail(f"a data file did not parse: {error}")
        return 1

    problems: list[str] = []

    # Shape. Absent keys mean a pipeline stage was skipped rather than failed,
    # which is the quiet kind of breakage.
    for key in ("schema_version", "start_month", "end_month", "months", "series"):
        if key not in bundle:
            problems.append(f"bundle has no {key!r}")
    for key in ("density", "issuance", "employment_limit_by_fy"):
        if not bundle.get(key):
            problems.append(f"bundle has no {key!r}, so a pipeline stage produced nothing")
    if not isinstance(events.get("events"), list) or not events["events"]:
        problems.append("events.json carries no events")

    series = bundle.get("series", {})
    if len(series) < 100:
        problems.append(f"only {len(series)} series, which is far below the expected ~135")

    # Regression against what is already published. The archive only grows.
    if args.previous:
        previous_path = Path(args.previous)
        if previous_path.exists():
            try:
                previous = json.loads(previous_path.read_text())
            except json.JSONDecodeError:
                previous = None
            if previous:
                if bundle.get("schema_version") != previous.get("schema_version"):
                    problems.append(
                        f"schema_version changed {previous.get('schema_version')} -> "
                        f"{bundle.get('schema_version')}; the app rejects a mismatch, "
                        "so this needs an app release rather than a data publish"
                    )
                if len(series) < len(previous.get("series", {})):
                    problems.append(
                        f"series count fell {len(previous.get('series', {}))} -> {len(series)}"
                    )
                if bundle.get("end_month", "") < previous.get("end_month", ""):
                    problems.append(
                        f"end_month went backwards {previous.get('end_month')} -> {bundle.get('end_month')}"
                    )
                if bundle.get("months", 0) < previous.get("months", 0):
                    problems.append(
                        f"months fell {previous.get('months')} -> {bundle.get('months')}"
                    )
                for key in ("density", "issuance"):
                    was = len(previous.get(key, {}) or {})
                    now = len(bundle.get(key, {}) or {})
                    if now < was:
                        problems.append(f"{key} shrank {was} -> {now}")
        else:
            print(f"  note  no previous bundle at {previous_path}, shape checks only")

    if problems:
        print(f"\nREFUSING TO PUBLISH, {len(problems)} problem(s):")
        for problem in problems:
            fail(problem)
        return 1

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(bundle_path, out / "app-bundle.json")
    shutil.copyfile(events_path, out / "events.json")

    def sha256(path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()

    # The app checks this first and stops there on most launches, so it stays
    # small. The hashes are for humans and for a future integrity story; the app
    # deliberately does not rely on them, since a manifest served from the same
    # origin as the file cannot vouch for it.
    manifest = {
        "generated_at": bundle.get("generated_at") or datetime.now(timezone.utc).isoformat(),
        "bulletin_month": bundle.get("end_month"),
        "published_at": datetime.now(timezone.utc).isoformat(),
        "files": {
            "app-bundle.json": {
                "bytes": (out / "app-bundle.json").stat().st_size,
                "sha256": sha256(out / "app-bundle.json"),
            },
            "events.json": {
                "bytes": (out / "events.json").stat().st_size,
                "sha256": sha256(out / "events.json"),
            },
        },
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))

    print("publishing:")
    print(f"  bulletin month : {bundle.get('end_month')}")
    print(f"  series         : {len(series)}")
    print(f"  density columns: {len(bundle.get('density', {}))}")
    print(f"  issuance years : {len(bundle.get('issuance', {}))}")
    print(f"  events         : {len(events['events'])}")
    print(f"  generated_at   : {manifest['generated_at']}")
    print(f"  written to     : {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
