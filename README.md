# GC ETA

**When will my priority date be current?**

A mobile app that estimates when a US employment-based green card priority date
becomes current, from public data only. No account, no sign-in, and your case
details never leave your device.

> Status: **planning complete, implementation not started.**
> Nothing here is legal advice, and this project is not affiliated with any
> government agency.

---

## What it does

You enter three things: country of birth, priority date, and I-140 category.
It returns an estimated window for when your date becomes current, a near-term
outlook of advance / hold / retrogress, and any active disruption that affects
your country and processing path.

It deliberately does **not** give a single confident date. The State Department
moves cutoffs in monthly steps and only jumps a few times a year, so the honest
answer is a range with a confidence label and the reasons behind it.

## Start here

**[`PLAN.md`](PLAN.md)** is the full design document and the source of truth:
the statutory arithmetic the model has to reproduce, the tiered public data
sources, the three-level prediction model, the validation plan, and a
pre-implementation review log recording 47 findings with their dispositions.

Read at least these sections before writing code:

| Section | Why |
|---|---|
| §1 | Corrections to common misconceptions, including that the priority date is the PERM *receipt* date |
| §2 | The supply arithmetic. §2.2 contains the per-category per-country derivation that is easy to get eightfold wrong |
| §4.1 | What the USCIS inventory file actually contains, which constrains the queue model |
| §6 | The prediction model, levels A through C |
| §8.1 | Update cadence: what refreshes automatically and the one step that needs a human |
| §13 | The review log. Several entries record mistakes already made and corrected; do not reintroduce them |

## Design

The phone mockup lives in `design/project/` as a set of self-contained
artboards, with the app icon and background artwork in `design/assets/`.

## Intended layout

Not yet created. Per §8 of the plan:

```
pipeline/   Python ETL. Fetches public sources, validates, publishes versioned JSON
data/       Checked-in historical bulletin dataset and the curated event registry
model/      TypeScript prediction model, no UI dependencies, shared by app and backtests
app/        Expo (React Native) client
docs/       Methodology page surfaced inside the app
design/      Phone mockup and artwork  (exists)
```

The model is plain TypeScript with no React dependency specifically so it can be
unit-tested and backtested in Node, independently of the app.

## Data

Every source is public. The pipeline runs server-side on a schedule and
publishes static JSON to a CDN; the app downloads that bundle and computes
everything on the device. Changing an estimate is a data publish, not an app
release.

Two constraints worth knowing up front:

- `travel.state.gov` is behind a bot filter, but `adoption.state.gov` serves the
  same content tree unblocked and is the ingest path. Treat that as possibly
  temporary and keep the manual fallback working. See §8.
- The USCIS pending-application inventory has real gaps, including **no rows for
  India EB-2 priority dates from 2016 onward**, which is the most common user.
  The queue model must degrade rather than report an empty queue as a short wait.
  See §4.1.

## Licence

[MIT](LICENSE). The code is free to use, modify and redistribute with the
copyright notice retained.

Two things the licence does not cover. The underlying data comes from US
government sources and is public domain as a US Government work, but this
project is not affiliated with or endorsed by any agency. And the estimates are
unofficial and not legal advice; the MIT warranty disclaimer applies to them in
the strongest possible terms. Consult an immigration attorney about your case.
