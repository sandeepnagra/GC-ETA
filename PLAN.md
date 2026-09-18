# GC ETA — Plan for a Priority-Date Projection App

Working name: **GC ETA** (chosen 2026-09-17; earlier codename Time4AD). Store subtitle: "When will my priority date be current?" so searches for green card, priority date and visa bulletin still find it. Before store submission: check App Store and Play Store for the name plus "visa" or "green card", and run a USPTO search in class 9.

Status: planning document, v0.1 (2026-09-17). Nothing built yet.
Scope: a simple, no-login, no-user-data mobile app that takes country of birth, priority date, and employment-based (EB) category, and shows (a) an estimated wait until the priority date is current, (b) a near-term outlook (advance / hold / retrogress), and (c) any active disruption that affects that person.

---

## 1. Corrections to the assumptions in the ask

These matter because they change what the app asks for and what it computes.

1. **"PERM approval date" is not the priority date.** For PERM-based EB-2/EB-3 cases the priority date (PD) is the date the Department of Labor *received* the PERM (Form ETA-9089), not the date it was certified. For categories with no PERM (EB-1A, EB-1B, EB-1C, EB-2 NIW, Schedule A), the PD is the date USCIS *received* the I-140. The app should ask for "priority date" with helper text explaining where to find it (I-140 approval notice, I-797, shows it), and ask whether they hold an earlier PD from a previous approved I-140, since PDs are retained across petitions (8 CFR 204.5(e)) unless one of the four grounds in 8 CFR 204.5(e) applies: fraud or willful misrepresentation, revocation of the labor certification by the Department of Labor, invalidation of the labor certification by USCIS or the State Department, or material error. (An employer withdrawing the I-140 after 180 days of approval does **not** destroy the retained priority date.) Retention under that rule covers EB-1, EB-2 and EB-3 only.
2. **The Visa Bulletin is published by the Department of State (Visa Office), not USCIS.** USCIS's only monthly decision is which of the two charts governs I-485 filing that month. For September 2026 USCIS designated Final Action Dates for EB and Dates for Filing for family.
3. **PERM has no EB category; the I-140 does.** The user picks the I-140 classification. EB-3 also splits into "Professionals/Skilled Workers" and "Other Workers" with different dates. A person can hold I-140s in more than one category with the same PD (EB-2 to EB-3 "downgrade" is common for India), so the app should let them evaluate more than one category.
4. **Family-to-employment spillover is fixed once a year, at the start of the fiscal year, from the *prior* year's unused family numbers (INA 201(d)).** It cannot rescue a category that goes Unavailable in July. Mid-year relief comes from two other mechanisms: "otherwise unused" numbers in the same category that other countries did not take, which INA 202(a)(5) evaluates **per calendar quarter**, not per year; and fall-down between EB categories under INA 203(b) (see §2.1).
5. **The family/employment spillover is asymmetric, and unused EB numbers are effectively lost.** INA 201(c) does add the prior year's unused EB numbers to the family level, so the statute reads two-way. But the family level is computed as 480,000 minus immediate-relative admissions minus certain other numbers, **floored at 226,000**. Immediate-relative admissions have run well above 480,000 for years, so the computed number is negative and the floor binds; adding unused EB numbers to a negative number still leaves it under the floor, so they raise nothing. Unused EB numbers therefore vanish. Unused *family* numbers do reach EB, because EB is a flat 140,000 plus the unused family amount with no competing floor. Never tell a user that stranded EB numbers "come back later." (Verify current immediate-relative admissions in Phase 0 from the DHS OHSS quarterly report; the mechanism is statutory but the binding depends on that figure staying above 480,000.)
6. **There are two dates to project, not one.** The Final Action Date (FAD) controls approval. The Dates for Filing (DFF) chart controls when an I-485 can be filed when USCIS designates it, which unlocks EAD and Advance Parole. Users care about both.
7. **"Current" is not "green card in hand."** After the PD is current, an adjustment case still needs USCIS adjudication (months), and a consular case needs NVC scheduling and an interview, which is paused worldwide as of late August 2026. The app should show the wait to "current" and a separate add-on for "approval."
8. **"x years, y months, z days" is false precision.** State moves dates in monthly steps and only a few times a year in big jumps. The honest deliverable is a range (for example, "3 to 5 years, most likely mid-2029") with a confidence label and a plain explanation of the main drivers. Showing days would mislead.
9. **The near-term outlook has a strong calendar pattern.** Big advances cluster in October (new fiscal year). Retrogression and "Unavailable" cluster in July through September when annual limits are hit. This seasonality is a first-class feature, not noise.

---

## 2. How the numbers work (what the model must reproduce)

### 2.1 Annual supply
- EB worldwide limit = 140,000 **base** (not a floor: the statute is a `+`, not a `max()`, and nothing reduces it below 140,000) + unused family-sponsored numbers from the prior fiscal year. Reported FY2026 limit: 186,317 (about 46,000 of spillover from FY2025). Analysts' FY2027 estimates ranged from about 55,000 to 95,000 of spillover during 2026, converging around 73,000 by September, because the 75-country immigrant-visa pause and the worldwide interview pause suppressed family visa usage.
- Category shares of the EB limit (INA 203(b), verified against the statute): EB-1 28.6%, EB-2 28.6%, EB-3 28.6% (within EB-3, "not more than 10,000" for Other Workers, reduced by the NACARA offset). **Do not hard-code 5,000 for the NACARA reduction**, which is the figure in older write-ups. The September 2026 bulletin states the reduction "began in Fiscal Year 2002" and that "For Fiscal Year 2026 this reduction will be limited to **116**", so the operative FY2026 Other Workers cap is about **9,884**. The offset has shrunk to near-nil; read it from the bulletin each year rather than assuming, EB-4 7.1%, EB-5 7.1% (with 32% of EB-5 reserved for rural, high-unemployment, and infrastructure set-asides).
- Fall-down chain, quoting INA 203(b): EB-1 gets 28.6% "plus any visas not required for the classes specified in paragraphs (4) and (5)"; EB-2 gets 28.6% "plus any visas not required for the classes specified in paragraph (1)"; EB-3 gets 28.6% "plus any visas not required for the classes specified in paragraphs (1) **and (2)**". So EB-3 is the residual bucket for both higher categories, not only EB-2. EB-4 and EB-5 receive no fall-down; they are flat 7.1% each. Unused EB-3 falls nowhere and is lost (see §1.5). In practice EB-4 has been fully used by Special Immigrant Juvenile demand since FY2023, so little falls from EB-4.
- Family worldwide limit: `max(226_000, 480_000 − immediate_relatives_prev_year − paragraph_4_number_prev_year + unused_EB_prev_year)` (INA 201(c)). Implement it with the `max()`; an earlier draft wrote "226,000 minimum (plus unused EB)", which read literally would add the unused EB on top of the floor and inflate the pool. The floor has bound in every recent year, so in practice family = 226,000 and the "plus unused EB" term in the statute adds nothing (§1.5). Family *usage* against that 226,000 is what determines next year's EB spillover, so the model must track family issuance, not only EB.

### 2.2 Per-country limit
- 7% of the combined family + EB total for the year, 2% for dependent areas. The September 2026 bulletin states the FY2026 figures outright: per-country 28,862, dependent area 8,247. It adds that these "do not account for carryover provisions in accordance with INA 203(b)(5)(B)"; with carryover included the per-country limit is 29,136 and the dependent area limit is 8,325.
- **Do not feed 28,862 into the supply model.** That number is across family *and* employment, all preferences combined. What Level B needs is the **pro-rated per-country, per-category** limit, which is what the Visa Office actually operates on: the bulletin's own section E refers to "India's pro-rated limit in the EB-1 category." The derivation is `per_country_category = 0.07 × category_share × EB_worldwide_limit`. For EB-2 in FY2026 that is 0.07 × 0.286 × 186,317 ≈ **3,730**, not 28,862. Using the combined figure would overstate a category's per-country supply by roughly eight times and make every estimate far too optimistic. Unit-test this derivation against the 3,730 figure.
- That per-category number is a **floor, not a ceiling**: INA 202(a)(5) lifts it whenever a category's quarterly supply exceeds qualified demand, which is how India takes far more than 7% of EB-2 in a good year. Model the floor as guaranteed and the excess as conditional on Rest-of-World demand.
- **There is no "quarterly pacing rule."** An earlier draft of this plan asserted one. It does not exist: 9 FAM 503.1 through 503.5 contain no occurrence of "quarter," and 9 FAM 503.4 describes the Visa Office allocating numbers **monthly** through IVAMS from the Report of Documentarily Qualified Applicants. The only quarterly language in the INA, at 202(a)(3) and 202(a)(5), does the *opposite* of pacing: it lifts the per-country cap. Do not show a pacing percentage anywhere.
- The real monthly mechanism, in the bulletin's own words: cutoffs are set "in chronological order of reported priority dates, for demand received by **August 10th**" for the September bulletin. That cutoff date, not the month the bulletin governs, is the information-set boundary the backtest must respect (§10).
- INA 202(a)(5) (8 U.S.C. 1152(a)(5)), verified against the text: if the visas available in an EB category "for a calendar quarter" exceed the qualified immigrants who could otherwise be issued them, the visas are issued without regard to the per-country cap "during the remainder of the calendar quarter." So the cap-lift is tested and applied **quarter by quarter, not once a year**. This is why India can take far more than 7% of EB-2 in a high-spillover year, why India's dates depend on Rest-of-World demand, and why the cap can be lifted for part of a year and not the rest.
- **Do not cite AC21 §104(c) for this.** An earlier draft did. AC21 §104(c) is the "One-Time Protection Under Per Country Ceiling" provision allowing H-1B extensions in three-year increments beyond the six-year limit for I-140 beneficiaries stuck behind per-country limits. It has nothing to do with visa-number allocation, and citing it in user-facing copy would be an affirmatively misleading legal citation. The allocation rule is INA 202(a)(5) alone. (Its addition by AC21 §104(a) is plausible but was not verified against the public law text, which is image-only; confirm at govinfo before citing the public law section.)
- Chargeability is country of *birth*, not citizenship. Hong Kong, Macau, and Taiwan are charged separately from mainland China. INA 202(b) gives **four** chargeability rules, and the app's helper text should cover all four: (1) a child accompanying a parent may be charged to either parent's state, to prevent separation; (2) a spouse may be charged to the other spouse's state, to prevent separation, when accompanying or following to join; (3) a person born in the United States is charged to their country of citizenship, or last residence if stateless; (4) a person born in a state where **neither parent was born and neither parent resided at the time of birth** may be charged to either parent's state. Rules (1) and (2) carry two conditions the app must respect. First, the cross-charge is unavailable if the target state has already reached its per-country level for that fiscal year, so cross-chargeability moves people *out of* oversubscribed columns, never into them. Second, and this is the one most likely to produce a harmful wrong answer: the spouse must be **accompanying or following to join as an immigrant**. A spouse who is already a U.S. citizen or a permanent resident confers **nothing**. An app that asks only "spouse's country of birth" would tell an India-born applicant married to a U.S. citizen of Canadian birth that they are Current, and someone could resign a job or decline an H-1B extension on that answer. The input must gate the spouse question behind "Is your spouse immigrating with you as a derivative, and not already a citizen or green card holder?"

Rule (4) is not an edge case for this audience: it covers, for example, a child of Indian nationals born in a Gulf state, who may be chargeable to a parent's country.

### 2.3 Demand
- Derivatives (spouse and children) count against the numbers. Roughly half of EB numbers historically go to derivatives. The USCIS inventory reports include both principals and dependents.
- Demand ahead of a given PD = pending I-485s with earlier PDs in the same category/country + consular applicants at NVC with earlier PDs + approved I-140s whose beneficiaries have not yet filed either (they will once DFF opens). Minus attrition.
- Demand shifts between categories: EB-2 to EB-3 downgrades, EB-3 to EB-2 upgrades, EB-1C and EB-1A upgrades (the reason EB-1 India retrogressed), NIW filing surge since the 2022 policy manual update.

### 2.4 State's chart-setting behavior
- FAD is set monthly to steer issuances toward using the full annual limit without overshooting. State advances aggressively when it fears numbers will go unused (October, and mid-year if usage lags), holds when on pace, and retrogresses or sets "U" when a category or country hits its limit.
- The bulletin's narrative section contains explicit forward guidance ("may become unavailable in the coming weeks", "expected to advance to at least ..."). It is a data source, not just commentary. For example the September 2026 bulletin warned EB-1 India may go Unavailable and EB-2 and EB-5 unreserved may retrogress before September 30, and secondary sources report State expects EB-2 India to reopen in October at or beyond July 15, 2014.
- USCIS chart choice: DFF when USCIS believes there are more visas than known applicants for the year, otherwise FAD. In FY2026 USCIS switched EB filings to FAD from May onward.

---

## 3. Everything that moves priority dates (factor inventory)

Grouped by whether it changes supply, demand, processing throughput, or is an external shock. Each factor lists the public signal we can observe for it.

### 3.1 Supply factors
| Factor | Direction | Observable signal |
|---|---|---|
| Prior-year unused family numbers (spillover) | Bigger EB pool next October | DOS Annual Numerical Limits PDF (October, provisional); DOS monthly IV issuance stats; family FAD movement Jul–Sep; **and DHS OHSS quarterly Legal Immigration and Adjustment of Status for the family I-485 half.** Consular issuance alone is only part of family usage; watching it alone understates usage and therefore *overstates* next year's EB spillover, which biases the whole app optimistic |
| Fall-down from EB-4/EB-5 to EB-1, EB-1 to EB-2, EB-2 to EB-3 | Extra numbers mid-year | EB-1 Rest-of-World usage (I-485 inventory + IV issuances); EB-5 usage; EB-4 SIJ demand |
| Otherwise-unused numbers within category (202(a)(5)) | India/China get more than 7% | Rest-of-World demand vs. category size; whether ROW is "Current" |
| Per-country cap hit | "U" for rest of year | Bulletin narrative; cumulative issuances by country |
| Quarterly pacing | Slower early-year use | Bulletin narrative |
| EB-5 set-aside carryover rules | Small effect on unreserved EB-5 | Annual limits PDF |
| EB-4 Certain Religious Worker sunset dates | EB-4 sub-category availability | Congress (H.R. 7148 extended through Sept 30, 2026) |
| Legislation removing per-country caps (EAGLE Act, IVES Act) | Structural change | Congress.gov bill status. **Do not track by bill number:** S.3291 and H.R.6542 are 118th Congress numbers and died on 3 Jan 2025, so polling those numbers returns stale 2023 records forever. Track by sponsor plus title keyword and resolve the current Congress's numbers at query time. Whether either was reintroduced is unverified |
| Gold Card program drawing on EB-1/EB-2 | Small demand added (338 requests, 1 approval by mid-2026; lawsuit pending) | USCIS/Commerce statements; court docket |

### 3.2 Demand factors
| Factor | Direction | Observable signal |
|---|---|---|
| Pending I-485 inventory by category/country/PD month | Direct queue length | USCIS monthly inventory XLSX (lagged 1–3 months) |
| Consular applicants waiting at NVC | Adds to queue, but only as a **scalar** | DOS Annual Waiting List report (Nov 1 snapshot); NVC scheduling status tool. It reports totals by preference and foreign state with **no priority-date breakdown**, it counts derivatives, and roughly 85% of employment cases are adjustment cases that never appear in it. Treat it as a small, biased scalar adjustment, not a date-resolved addend |
| Approved I-140s not yet in either queue | Hidden demand that appears when DFF opens | USCIS I-140 approvals by country of birth (quarterly CSV) minus filings |
| PERM filings and certifications (2–4 year lead) | Future I-140 demand | OFLC quarterly disclosure files; OFLC processing times (analyst review ~400–500 days in 2026) |
| H-1B registrations and approvals (3–6 year lead) | Future PERM demand | USCIS H-1B registration stats (FY2027 registrations ~210,000, down from ~344,000); H-1B Employer Data Hub |
| H-1B $100,000 fee and wage-weighted lottery | Lower future demand from abroad | Litigation status (fee vacated, on appeal as of Aug 2026) |
| Category porting (EB-2↔EB-3, EB-1 upgrades, NIW) | Shifts queue between categories | I-140 approvals by classification code (E21 vs NIW, E11/E12/E13) |
| Derivative ratio and CSPA age-outs | Numbers per principal | **Not** the inventory report, which combines principals and dependents (§4.1). Use DHS OHSS quarterly counts or the Report of the Visa Office |
| **Non-materialisation of approved I-140 holders** (left the sponsor with no new petition filed, left the country, stopped pursuing) | Shrinks *effective* demand without shrinking the counts; largest in the oldest cohorts | **Primary:** the filing-chart natural experiment in §6.2, filings surge versus approved I-140s for the same priority-date range. **Weak secondary:** H-1B continuing/extension approvals by employer and country as a proxy for still being here and sponsored; WARN layoff notices and tech unemployment as covariates for the rate moving |
| Attrition after filing (withdrawal, denial, death, abandonment) | Shrinks queue | Not identifiable from inventory deltas alone (§6.2); estimate only on cohorts frozen on both sides |
| Economic cycle (tech hiring, layoffs) | Filing volumes | OFLC filings by NAICS; H-1B registrations |
| Concurrent-filing surges when DFF opens | Inventory jumps | Inventory report after DFF months |

### 3.3 Processing-capacity factors
| Factor | Direction | Observable signal |
|---|---|---|
| USCIS I-485 adjudication capacity and processing times | Whether numbers get used | USCIS processing times page; inventory approvals per month |
| USCIS chart designation (FAD vs DFF) | Filing eligibility | USCIS adjustment-of-status filing charts page |
| Consular interview capacity, NVC scheduling backlog | Whether consular numbers get used | NVC IV Scheduling Status tool; monthly IV issuance by post |
| Worldwide immigrant visa interview pause (public charge training, since late Aug 2026, no end date) | Strands FY2026 numbers. Stranded **EB** numbers are lost, not recycled (§1.5). Stranded **family** numbers raise FY2027 EB spillover | DOS announcements; law-firm alerts |
| Government shutdowns (Oct 1–Nov 12, 2025) | Minor: both agencies fee-funded, but courts and DOL affected | Federal news |
| Interview-waiver and biometrics policy changes | Adjudication speed | USCIS policy alerts |
| Premium processing availability for I-140 classes | When demand becomes visible | USCIS alerts |

### 3.4 Policy and legal shocks (the event layer)
| Event | Dates | Who it hits | Status (Sept 2026) |
|---|---|---|---|
| Proclamation 10949 travel ban (19 countries) | Jun 2025 → | Nationals of listed countries abroad | In force |
| Proclamation 10998 expanded ban (39 countries) | Dec 2025 → | Nationals of listed countries abroad | In force |
| USCIS adjudication pause for travel-ban nationals (incl. I-485, EAD, AP) | Dec 2025 (19 countries) → expanded Jan 1 2026 (39) → Jun 5 2026 | Nationals in the US | Vacated by D.R.I. court; bans themselves remain |
| DOS immigrant visa issuance pause, 75 countries (public charge) | Jan 21 2026 → Aug 21 2026 | Consular applicants from listed countries, all IV classes incl. EB | Struck down; ended by court order |
| DOS worldwide immigrant visa interview pause (training) | ~Aug 25 2026 → open | All consular IV applicants; AOS unaffected | Active |
| H-1B $100,000 fee proclamation | Sept 19 2025 → | Future demand | Vacated at district court, appeal pending |
| H-1B weighted selection rule | Effective Feb 27 2026 | Future demand | In force |
| Gold Card (EB-1/EB-2 NIW repackaging) | Dec 2025 → | EB-1/EB-2 supply | Minimal uptake; lawsuit pending |
| **DHS public charge rule for adjustment of status** | **Effective 18 Sep 2026** | Every AOS applicant filing on or after that date | **In force.** Verified against the Federal Register notice of 20 Jul 2026. DHS rescinds the December 2022 rule and replaces it with stricter sub-regulatory guidance and broad adjudicator discretion; a new Form I-485 keyed to the standard is issued the same day. Benefits received before 18 Sep 2026 are assessed under the old rule. This is the single most consequential near-term event for the app's adjustment users and directly hits the §6.5 approval curve |
| **EB-4 non-minister religious worker sunset** | **30 Sep 2026** | EB-4 SR sub-category | H.R. 7148 (signed 3 Feb 2026) extended it only through 30 Sep 2026; no enacted further extension was found. Treat as an expiry two weeks out, not settled context |
| Public charge guidance changes (DOS consular side) | 2026 | Consular approval rates and throughput | Ongoing; distinct from the DHS rule above |
| Court orders generally | — | — | Three of 2026's biggest shocks ended by court order; dockets are a data source |

Key modeling rule learned from 2026: demand suppressed by a country-specific pause does **not** evaporate. State reallocates the unused numbers to other countries by advancing their dates. Model a pause as a redistribution, not a loss, and as a rebound in demand for the affected country after it lifts.

### 3.5 Seasonal pattern
- October: largest forward jumps of the year (new numbers, new spillover).
- November–March: steady or small advances; USCIS often designates DFF early in the year.
- April–June: holds; USCIS tends to move back to FAD.
- July–September: retrogression and "U" for oversubscribed countries; worldwide (Rest of World) rows have also retrogressed at fiscal year-end.

---

## 4. Data source inventory (tiered)

Tier 1 is required for the MVP. Tier 2 feeds the queue model. Tier 3 feeds the event layer. Tier 4 is context only.

### Tier 1 — core
| Source | Publisher | Cadence | Format | Feeds | Notes |
|---|---|---|---|---|---|
| Visa Bulletin (FAD + DFF tables + narrative) | DOS Visa Office, travel.state.gov | Monthly (~2nd–3rd week for next month) | HTML + PDF | Everything | Site sits behind Cloudflare bot protection; automated fetches get a 403. Plan a semi-manual ingest (see §8). Archive goes back to 1990s. |
| Adjustment of Status Filing Charts page | USCIS | Monthly | HTML | Which chart applies to I-485 filing | Simple page, fetchable |
| Pending Employment-Based I-485 Inventory | USCIS Immigration and Citizenship Data | Monthly snapshot, published in batches 1–3 months later (Aug 5 2026 file published Aug 25) | XLSX | Queue length by category, country, PD month — **with severe limits, see §4.1** | Back to Feb 2024 monthly; older quarterly reports exist |
| Annual Numerical Limits | DOS | Each October, but **provisional** | PDF | Year's supply | The year's limit is an estimate under INA 203(g) until USCIS supplies immediate-relative and parolee counts. The Sept 2026 bulletin records that "On July 24th, USCIS provided the required data to the VO." So `limits.json` must be **versioned per fiscal year**, carrying an estimate from October and a final value mid-year, with the model widening its bands until the final lands. Reachable via the mirror in §8 |
| Annual Report of Immigrant Visa Applicants (waiting list) | DOS/NVC | Annual, Nov 1 snapshot | PDF | Consular demand by category/country | |

### 4.1 What the I-485 inventory file actually contains (parsed, not assumed)

The August 2026 file (`eb_inventory_august_2026_v1.0.xlsx`) was downloaded and parsed **by the independent audit**, and was not re-verified by a second party, so Phase 0 must re-parse it and confirm these constraints before Level B is built on them. Level B was specified against an imagined version of this file; these are the real constraints and they re-scope the model.

- **Six sheets, five chargeability areas:** `Rest of the World`, `China`, `India (EB1 EW3 EB4 CRW EB5)`, `India (EB2 EB3)`, `Mexico`, `Philippines`. There is no Hong Kong, Macau, Taiwan or dependent-area breakout, so Level B can only ever serve CN, IN, MX, PH and ROW. §7.1 still collects the full chargeability list, because it drives the *bulletin column*, but the queue model must degrade to Level A outside these five.
- **The modal user has no rows at all.** The India EB-2/EB-3 sheet covers only "Prior Years" plus 2006 through 2015. There is no 2016 column anywhere in the file. An India EB-2 applicant with a 2016–2023 priority date, which is a large share of the intended audience, has **zero** inventory rows. Level B returns nothing for them and must fall back to Level A without pretending otherwise.
- **Granularity is year columns by month rows, over a rolling ten-year window.** The ROW, China, Mexico and Philippines sheets run 2017 to 2026 with everything older collapsed into a single "Prior Years" bucket, so "demand ahead by priority-date month" does not exist for old dates in those columns.
- **Twelve to twenty-seven percent of cells are suppressed.** Cells marked `D` mean disclosure standards were not met: about 17.8% of ROW, 14.4% of China, 12.5% of the India EB-1 sheet, **27.0% of the India EB-2/EB-3 sheet**, 20.3% of Mexico, 19.7% of Philippines. Summing a column silently drops every one of them. The parser must handle `D` and the `-` rounds-to-zero sentinel, and every total must be labelled a **lower bound**.
- **People are double counted.** The file's own note: "Some individuals may have multiple pending I-485 applications. This report captures applications filed for a preference category." That is exactly the India EB-2 to EB-3 downgrade population the model wants to reason about, so EB-2 and EB-3 India counts are overlapping populations and must not be added. Carry an explicit overlap prior.
- **One useful dimension the plan had not noticed:** the file carries a `Visa Status` field with values `Available` and `Awaiting Availability`. That directly supplies the §6.4 feature "applications with priority dates already earlier than the cutoff" with no derivation needed, and it also gives §6.5 the exposure indicator it needs for survival analysis.

### Tier 2 — demand and throughput
| Source | Publisher | Cadence | Format | Feeds |
|---|---|---|---|---|
| I-140 receipts/approvals by classification and country of birth | USCIS | Quarterly, **existence of a current series unconfirmed** | CSV/PDF | Hidden demand, category porting. The by-country-of-birth dataset located in review is **archived**, covers Jan 2008 to Jun 2011 only, is consular-processed I-140s only, and excludes dependents. A live series appears to exist ("Receipts and Current Status by Preference and Country of Birth", FY2023 Q4) but its current cadence and whether it reports approvals or receipts were not verified. Confirm before Phase 2 depends on it |
| PERM disclosure data + selected statistics | DOL OFLC | Quarterly | XLSX/PDF | **Promoted to Tier 1 in importance.** `CASE_RECEIVED_DATE` *is* the priority date, by country of citizenship, going back years, so these files are the only public source of **priority-date density** beyond the filing cutoff. This is what converts Level A's "days of priority date covered" into "people covered" for the users the inventory cannot serve (§4.1). Caveats: citizenship is a proxy for birth (§11.2), and PERM misses EB-1 and NIW entirely |
| PERM processing times | DOL OFLC | Monthly | HTML | When pipeline converts to PDs |
| Monthly Immigrant Visa Issuances by post and class | DOS | Monthly | PDF/XLSX | Family usage (spillover forecast), EB consular usage — also on travel.state.gov, so the Cloudflare note in Tier 1 applies here too |
| Report of the Visa Office (Tables V–VII) | DOS | Annual | PDF | Year-end issuances by category and chargeability |
| Immigrant Visa Scheduling Status tool | DOS/NVC | Monthly | HTML | Consular throughput by post |
| USCIS processing times (I-485, I-140) | USCIS | Monthly | HTML/API | "Current" to "approved" add-on |
| I-485 approvals per month by cohort, derived from consecutive inventory reports | Derived | Monthly | Computed | Approval curve for filed-and-current cases (§6.5) |
| Employment-Based Adjustment of Status FAQs (numbers used and expected to be used) | USCIS | Annual with mid-year updates | HTML | Direct read on year-end EB usage |
| Legal Immigration and Adjustment of Status quarterly report | DHS OHSS | Quarterly | XLSX | LPR counts by class, faster than the yearbook |
| H-1B registration statistics and Employer Data Hub | USCIS | Annual/quarterly | HTML/CSV | 3–6 year leading demand |
| DHS OHSS Yearbook (LPRs by class and country) | DHS | Annual | XLSX | Historical calibration |
| CRS reports (R47164 and successors), Cato backlog estimates | Congress, Cato | Irregular | PDF | Calibration and sanity checks |

### Tier 3 — event feeds
| Source | What to watch |
|---|---|
| Federal Register API | Presidential proclamations, DHS/DOS rules (public charge, H-1B), USCIS fee rules. No key required |
| USCIS Newsroom alerts (RSS) | Adjudication pauses, chart changes, policy memos |
| DOS travel.state.gov news + GovDelivery email | Consular pauses, country suspensions |
| Congress.gov API | EAGLE Act (S.3291), IVES Act (H.R.6542), religious worker extensions, any cap reform. **Requires an api.data.gov key**; rate limited |
| CourtListener / PACER dockets | Injunctions and vacaturs (Rhode Island 39-country case, 75-country case, H-1B fee case, Gold Card case). CourtListener **needs an API token** for usable rate limits; PACER charges per page |
| AILA / law-firm bulletin alerts | Human-readable confirmation of the above |

### Tier 4 — community and context (low reliability, never used as ground truth)
Trackers such as trackitt-style crowd data, greencardclock, visabulletin.ai, and Reddit threads. Useful for spotting anomalies and for seeding the historical bulletin dataset, which must then be verified against the official PDFs.

---

## 5. Where things stand today (September 2026, FY2026 final month)

Employment-based Final Action Dates, September 2026 (from law-firm reproductions of the bulletin):

| Category | Rest of World | China | India | Mexico | Philippines |
|---|---|---|---|---|---|
| EB-1 | Current | 1 Jul 2023 | 15 Oct 2022 | Current | Current |
| EB-2 | Current | 1 Sep 2021 | Unavailable | Current | Current |
| EB-3 Professionals | 1 Sep 2024 | 1 Jan 2022 | 1 Jan 2014 | 1 Sep 2024 | 1 Aug 2023 |
| EB-3 Other Workers | 1 Apr 2022 | 1 May 2019 | 1 Jan 2014 | 1 Apr 2022 | 1 Dec 2021 |
| EB-4 | 15 Dec 2022 | same | same | same | same |
| EB-5 Unreserved | Current | 1 Dec 2016 | Unavailable | Current | Current |

Dates for Filing (subset): EB-1 India 1 Dec 2023, EB-2 India 15 Jan 2015, EB-3 India 15 Jan 2015, EB-2 China 1 Jan 2022, EB-3 China 8 Jan 2022, EB-3 ROW Current, EB-5 India 1 May 2024.

Rows omitted from the table above that the data model still needs: **Certain Religious Workers** (15 Dec 2022, all countries) and the three **EB-5 set-aside** rows (all Current). §7.1 offers EB-5 set-aside as an input, so they cannot be dropped.

**The parser must not assume this month's five columns.** Historical bulletins churn: a separate El Salvador, Guatemala and Honduras column existed roughly 2016 to 2022; a Vietnam EB-5 column appeared around 2018 to 2020; EB-4 has carried country-specific rows; and the EB-5 set-aside rows only exist from FY2022. The "same across countries" shown for EB-4 above is true this month and not historically. Model the schema as `(month, category, chargeability_label)` tuples, never a fixed five-column table.

USCIS chart for EB in September: Final Action Dates. State's warnings: EB-1 India may go Unavailable; EB-2 and EB-5 unreserved may retrogress or go Unavailable before September 30. Consular immigrant visa interviews are paused worldwide, so a portion of FY2026 numbers will go unused. Note the asymmetry from §1.5: unused **EB** numbers are lost at year end, while unused **family** numbers raise the FY2027 EB limit. The interview pause therefore hurts EB consular applicants this year and helps EB applicants next year, through the family side.

---

## 6. Prediction model

Three levels. Ship Level A, then B, then C. Each level produces the same output schema so the UI does not change.

### 6.1 Level A — bulletin-history velocity model (MVP)
Input: FAD history for the user's (category, chargeability column) back to at least FY2010, and DFF history **from October 2015 only**. The Dates for Filing chart did not exist before the October 2015 bulletin, and that bulletin was itself revised on 25 September 2015, days after publication. So DFF has at most eleven fiscal years of history and its first year is a policy shakedown. Store the two series with **separate start dates**, cap DFF velocity windows accordingly, and widen DFF confidence bands relative to FAD. Because bulletins are sometimes revised at the same URL, store a content hash and a fetched-at timestamp per month, not just a month key.
- Convert each month's cutoff to "days of PD covered". Net advance per fiscal year is a useful **descriptive** statistic and is what the history chart shows, but it is not the forecast method: the first-passage bullet below supersedes it.
- Distance to cover = user PD − current FAD (in days). If the user's PD is already earlier than the FAD, they are current.
- Encoding rule for special values: "U" (Unavailable) carries forward the last published cutoff with a flag and counts as zero advance for that month; "Current" means the user is current now and those months are excluded from velocity math. Both occur in the most-used inputs today (EB-2 India is U, Rest of World rows are Current).
- Step distribution = the empirical **monthly** advances, resampled by **block bootstrap over 24–36 month blocks** so that autocorrelation and the October seasonality survive the resampling. Never collapse to a mean: three to five annual observations cannot support a quantile estimate, which is what an earlier draft's percentile arithmetic assumed.
- **Weight for regime, or COVID-era optimism leaks into today's numbers.** FY2021 to FY2023 ran EB worldwide limits up to roughly 281,000 against 186,317 now, so raw advances from those years are not comparable. Normalise each year's advance by that year's EB worldwide limit, or carry the limit as an explicit covariate. FY2026 is itself anomalous: the bulletin says dates were advanced *because* country-specific proclamations suppressed issuance, so it is not a clean baseline either.
- **Drop the "small positive drift floor."** It is an unprincipled fudge that silently determines the answer: one day a year yields a 3,000-year wait, thirty days a year yields a confident forty-year number, and neither is estimated from anything. Instead, when the simulated probability of crossing within 25 years falls below a stated threshold, **stop returning a date** and return "beyond the model's horizon", with the explanation that the category and country combination has no realistic queue position at current rates. For India EB-2 that is the honest answer, and it matches the Cato anchor this plan already cites.
- **Predict first passage, not net drift.** The quantity the user cares about is the first month in which FAD ≥ their PD, which is a first-passage time, not distance ÷ average velocity. Averaging net annual advance understates it, because a retrogression does not undo progress toward first passage; it postpones it. Model the advance as a monthly step distribution with the seasonal profile, simulate forward to first crossing, and treat retrogression as a delay (and as freeze risk once the user is current), not as negative velocity to be netted out.
- ETA range = the P10, P50 and P90 of that simulated first-crossing month. Use one percentile convention throughout, P10/P50/P90, so the output matches the internals. Push a projected crossing in July–September to the following October, since that is when numbers actually appear.
- Output: P10/P50/P90 dates, plus the same for DFF.
Strengths: needs only Tier 1, and it is **structurally robust to phantom demand** because it is calibrated on cutoff movement that already reflects who failed to show up (§6.2). Weakness: blind to queue composition. Note that raw "years of PD covered per year" can be misleading when a cohort of PDs is thin (for example India EB-2 2015 months are much thinner than 2012 months, so dates can jump faster than history suggests). Level B fixes that.

### 6.2 Level B — queue (demand/supply) model (v1)
- Demand ahead of user: sum of inventory rows (principal + dependents) with PD earlier than the user's PD in the same category and country; plus NVC waiting-list share for that category/country apportioned by PD; plus an estimate of approved-but-unfiled I-140 demand; minus attrition. **Attrition is not identified by "inventory change not explained by approvals."** USCIS's own file notes say the pending count also moves because of "new Form I-485 applications based on older priority dates due to priority date retention", applications "transferring from one basis to another" such as an EB-3 to EB-2 switch, and retroactive revisions ("counts may differ from those reported in previous periods due to system updates and post-adjudicative outcomes"). So the month-over-month delta mixes new filings, approvals, denials, withdrawals, interfiling transfers and data revisions, and attrition cannot be separated from it. Estimate attrition only on cohorts frozen on both sides, meaning a priority date past the filing cutoff so no new filings are possible and not yet current so no approvals are possible, and subtract known denial rates even then. Otherwise carry attrition as a wide prior into Level C rather than a point estimate.
- **Four known biases in that sum. Each must be handled explicitly or the estimate is too optimistic.**
  1. *The queue is not closed.* People with PDs earlier than the user's keep joining it after today: a 2013 PD holder whose I-140 is approved next year enters ahead of a 2015 PD holder. Level B must add an arrival process for earlier-PD demand, estimated from the PERM and I-140 pipeline, not just count today's queue.
  2. *The I-485 inventory is truncated by the filing chart.* Only people whose PD passed the Dates for Filing cutoff could file, so for PDs far behind the cutoff the inventory shows almost nobody, and the model would read an empty queue as a short wait. For any PD later than the current DFF, the inventory is not a queue measurement at all; fall back to Level A and the I-140 pipeline, and say so in the confidence label.
  3. *Double counting.* A person can appear in both the USCIS inventory and the NVC waiting list across a switch between adjustment and consular processing. Net this out with a documented assumption rather than summing blind.
  4. *Dimension mismatch on "approved but not filed."* USCIS publishes I-140 approvals by **approval fiscal year**; the queue is indexed by **priority date**. Subtracting one from the other is not valid as stated. Build a PERM-receipt-to-I-140-approval lag distribution from the OFLC disclosure data, which carries received and decision dates, then map approval-year counts back onto PD cohorts. Until that exists, treat approved-but-unfiled demand as a wide prior, not a point estimate.
- **Materialisation: not everyone counted will actually take a visa number.** This is a fifth bias, separate from the four above because it is not a counting error. Those people are genuinely in the data; they will simply never consume a number.
  - *Where it does not bite.* AC21 portability protects a case once the I-485 has been pending **180 days** and the I-140 was **approved, or approvable when filed**; the beneficiary can then change to a same or similar occupation with no new PERM or I-140, and the case survives even employer revocation. The large India cohorts that filed during the FY2022 and FY2023 filing-chart windows are past that mark and are protected, so pending I-485 counts are closer to real demand than intuition suggests; their leakage is denials, withdrawals, death and abandonment. Two exceptions to keep: a case sitting on an I-140 later denied or revoked for cause cannot port at all, and every time a chart opens a fresh slice of filers sits inside the 180-day window unprotected. So the carve-out is strong for aged cases and weak for new ones.
  - *Where it bites hard.* The approved-I-140-but-never-filed bucket, which for India EB-2 and EB-3 is most of the backlog, because those people have never been permitted to file. A 2015 priority date holder who left their sponsor in 2019 **keeps the priority date** under 8 CFR 204.5(e) but needs a new I-140 from a new employer to use it. If none is ever filed, they persist in the statistics and consume nothing. The same applies to people who left the country, moved to family-based, or stopped pursuing it.
  - *Estimator A, a ratio, with a denominator problem that must be stated.* Every time the Dates for Filing chart opens for a priority-date range, compare the surge of new filings in the following inventory snapshots against the size of the cohort eligible to file. The numerator is easy and comes straight from consecutive inventory snapshots. **The denominator is the hard part and is not sitting there ready.** Approved I-140 counts are indexed by approval fiscal year rather than priority date (finding 9), and the by-country-of-birth series is itself unconfirmed for recent years (finding 42). So the denominator has to be built from OFLC PERM density, where the received date is the priority date, carrying the citizenship-for-birth proxy error and missing EB-1 and NIW entirely. Treat any ratio produced this way as indicative, not measured.
  - *Estimator B, a shape, needing no denominator.* When a chart opens for a range, the **profile of the filing surge over the following months** is informative on its own. A sharp spike that decays quickly means the cohort was largely real and waiting. A slow trickle means many holders had to find a new sponsor first, or were already gone. This is measurable from the inventory alone, gives a lower bound on materialisation without any PERM denominator, and directly tests the decay-with-age claim below, since older priority-date ranges should show visibly flatter surges. Build B first; it is cheaper and more robust than A.
  - *Two properties the curve must have.* It **decays with cohort age**, because a 2012 priority date has had fourteen years to go stale while a 2023 one has had three, so model it as a function of elapsed time, never a constant. And it is **regime-dependent**: a soft labour market raises non-materialisation, so a rate calibrated on 2015 to 2019 and applied to 2026 will understate it. This is the same non-stationarity trap already flagged for the pandemic-era spillover years in §6.1.
  - *How to use it.* Apply it to the unfiled bucket only, and let it widen the interval **asymmetrically toward sooner** rather than shifting the headline number. It is an uncertainty, not a correction with a known sign and size.
- **Why Level A is robust to this and Level B is not.** The Visa Office cannot see phantoms either. It sets cutoffs against demand actually reported to it, and when a phantom-heavy cohort becomes current and too few people materialise, it advances the date further the next year. Unexpected jumps are partly this. So a model calibrated on **observed cutoff movement already has attrition priced in empirically**, while a bottom-up queue count counts those people as live demand. Concretely: treat Level B's output as an **upper bound on the wait**, and when Level A and Level B disagree with Level B predicting a longer wait, weight toward Level A rather than splitting the difference.
- Supply per fiscal year for that category/country: base per-country share of the category, plus expected otherwise-unused numbers (function of ROW demand vs category size), plus expected fall-down from higher categories, all scaled by the expected worldwide EB limit for the year (140,000 + spillover forecast). Spillover forecast comes from family issuance run-rate versus the family limit.
- Expected wait = demand ahead ÷ annual supply, distributed across years with the seasonal profile.
- Blending Level A and Level B: do not hard-code a 60/40 split. Weight the two by their **backtested error** on the same (category, country) series, inverse-variance style, and let the weight on Level B decay with the age of the inventory snapshot. A fixed ratio is a guess; the backtest harness in §10 produces the real one.
- Also compute the EB-2 versus EB-3 comparison for India and China, but **present it descriptively, never as a recommendation.** This is the highest-liability feature in the app. A downgrade carries costs the app cannot see: a new I-140, sometimes a new PERM, employer cooperation, and H-1B timing. Show the two categories' historical cutoff lines with the user's date marked and let them take it to a lawyer. No "you should downgrade" phrasing and no single-number delta in the hero.

### 6.3 Level C — scenario simulation (v2)
Monte Carlo over: spillover (distribution from the last 8 years), ROW demand, fall-down, attrition, new demand entering from the PERM/I-140 pipeline, and event probabilities (a pause for the user's country, a cap-reform bill, a court reversal). Output a full distribution and the probability of "current by" each year.

### 6.4 Near-term outlook: regression-risk score
A 0–100 score for the next 3–6 months, shown as Advance / Hold / Retrogress with a short reason. Features:
- Month of fiscal year (July–September raises risk; October lowers it).
- Gap between DFF and FAD (a wide gap means State sees more demand than it can serve).
- Recent velocity (three-month change) and whether the last move was a retrogression.
- **Bulletin structure, not keywords.** An earlier draft proposed matching phrases like "may retrogress" and "may become unavailable". That will not work: the bulletin's Section C is generic boilerplate that fires every one of those phrases every month with no category attached ("retrogression may be necessary in the upcoming months… Visa categories may become 'Unavailable' prior to the end of the fiscal year"), so a keyword classifier would flag every category every month. The real signal is structural. The Visa Office publishes **dedicated per-category sections** when it has something specific to say: the September 2026 bulletin carries section E on the EB-1 final action date for India, section F on EB-2, and section G on unreserved EB-5. The feature is therefore "does a section exist whose heading names this category and country", plus a three-way classification of that section's verb into advance, retrogress or unavailable. Ignore Section C entirely.
- Inventory of applications with PDs already earlier than the FAD, as a proxy for visas demanded now. Note that "numbers left in the year" is **not directly observable**: State does not publish running category/country balances. It has to be estimated from monthly consular issuance statistics plus inventory decline, and carries real error late in the year, which is exactly when the score matters most. Label it an estimate wherever it is surfaced.
- Active events for the user's country.
Labels for training and validation come from bulletin history (did the date move back or go U within 3 months). MVP uses a hand-tuned heuristic; a small classifier later once backtests exist.

### 6.5 "Current" to "approved" add-on, and the filed-I-485 states
- Three states drive the results screen. **Not filed:** Final Action estimate plus the filing window. **Filed, not current:** the same Final Action estimate, labelled "approval likely", with notes on work permit and parole renewals. **Filed and current:** an approval estimate anchored on the month the Final Action Date passed the user's date ("current since"), not on the receipt date, because USCIS works current cases roughly in priority-date order when numbers are tight.
- **Two clocks, not one.** Time-since-current is the right anchor only for cases that were already filed and pre-adjudicated. Someone who filed years ago during a Dates for Filing window is often documentarily complete and approves within weeks of a number becoming available; someone who filed concurrently and just became current still has the whole I-485 adjudication ahead. Condition the curve on **both** time-since-filing and time-since-current, and show the user the one that fits their case.
- Approval curve: **use survival analysis, not a decay rate.** Count exposure only in months when the cohort's Final Action Date is at or past its priority date, which the inventory's own `Visa Status` field supplies directly (§4.1), and treat denials, withdrawals and transfers out of the category as **competing risks**, not as approvals. Without the exposure restriction, a cohort that is current for two months and then retrogresses looks like slow processing when it is really a visa-availability artifact. Validate the implied approval count against the USCIS employment-based adjustment FAQs "numbers used" figure, and do not ship the curve if the two disagree by more than about 15%.
- A further caution on the underlying counts: they are a **snapshot, not a flow**, priority-date retention refilings can push a cohort's count *up*, and the decline is net, not approvals. It also contains denials, withdrawals, abandonments, transfers between service centers, and cases moving between rows when a beneficiary upgrades or downgrades category. Treat the observed decline as an **upper bound on approval speed**, label it as such, and subtract a denial-and-transfer allowance calibrated against the DHS OHSS quarterly LPR counts, which are actual approvals. Remember the 1–3 month publication lag makes this curve stalest in July–September, when freeze risk peaks. USCIS's published I-485 processing times are a coarser second signal.
- Freeze risk: a visa number must be available on the day of approval, so a retrogression past the user's date before the decision pauses the case. Score it with the same regression-risk features (§6.4), and show "low until July" style guidance since the July to September window is where freezes happen.
- Adjustment cases: current USCIS I-485 median processing time for employment cases, shown as an extra range.
- Consular cases: NVC documentarily-complete month for the relevant post, plus a flag when interviews are paused. Right now the flag is on for every post.

### 6.6 Event layer
A curated JSON registry, hand-maintained, that the model consumes:
```json
{
  "id": "dos-iv-pause-75-countries-2026",
  "type": "consular_pause",
  "title": "State Department immigrant visa issuance pause, 75 countries",
  "countries": ["BD", "NG", "PK", "..."],
  "affects": ["consular"],
  "categories": ["EB1","EB2","EB3","EB4","EB5","F*"],
  "start": "2026-01-21",
  "end": "2026-08-21",
  "status": "ended_by_court",
  "modeling": {"demand_multiplier_during": 0.0, "redistribute_unused": true, "rebound_after_months": 6},
  "sources": ["https://..."]
}
```
Seed with the events listed in §3.4. Every event carries a status (active, ended, vacated, enjoined, pending) and a modeling effect so the model and the UI read the same file.

Two required fields beyond the sketch above. Every event needs a **`verified_against`** primary-source URL and a **`last_checked`** date, and the interface must not display an event whose status has not been re-checked within a stated window. This plan's own §11.5 notes that three of 2026's biggest shocks reversed in court, so a stale "in force" is a wrong answer with consequences. Several statuses in §3.4 were carried from secondary reporting and are explicitly **unverified**: the Gold Card figures, the 39-country vacatur, the 75-country ruling, the H-1B fee appeal posture, the claim that roughly half of employment numbers go to derivatives, and the widely repeated "EB-2 India reopens in October at or beyond 15 July 2014", which is **not** in the official bulletin text. None should ship without primary-source confirmation.

---

## 7. The app

### 7.1 Inputs (no account; your case details never leave the device)

**Wording matters here.** "Nothing leaves the device" is not accurate and would not survive review. The app fetches a data file from a content delivery network, so the host necessarily sees an IP address, a user agent and timing. Both stores also enable crash reporting by default, which transmits device data. The honest claim, and the one to use in copy, is: *your priority date, category and country never leave your device; the app downloads the same public data file that everyone else downloads.* To keep that true, the fetch must be **parameter-free**, one manifest and whole files, never a URL keyed to the user's category or country, which would otherwise leak exactly the inputs being protected. Publish a privacy policy URL, complete the store privacy labels, and decide explicitly whether default crash reporting stays on.

**Inputs:**
1. Country of birth, from the DOS chargeability list (Hong Kong, Macau, Taiwan separate from mainland China; dependent areas flagged). Optional: spouse's country of birth for cross-chargeability, and a "child charged to parent" note.
2. Priority date, with helper text on where to find it and a checkbox "I have an earlier retained PD from a previous I-140." **The helper text must cover every category the app offers**, not just PERM cases: EB-4 priority date is the I-360 receipt date and EB-5 is the I-526 or I-526E receipt date, neither of which involves a labor certification. Note also that priority-date retention under 8 CFR 204.5(e) applies to EB-1, EB-2 and EB-3 only.
3. Category: EB-1, EB-2, EB-2 NIW, EB-3 Professional/Skilled, EB-3 Other Workers, EB-4, EB-5 unreserved, EB-5 set-aside. Allow selecting a second category to compare (EB-2 vs EB-3).
4. Optional: adjustment of status in the US vs consular processing (changes the add-on and the pause flags). Default: adjustment.
5. Optional (added 2026-09-17): "Have you already filed I-485?" with the receipt month if yes. No receipt number, no service center. This switches the estimate from "when will my date be current" to "when will USCIS decide" once the date is current, and reframes it as "approval likely" while the date is not yet current.

### 7.2 Outputs
- Status now: current or not, on both charts, with the exact cutoffs and the chart USCIS designated this month.
- Estimated wait to Final Action: a range and a most-likely window, expressed in years and months (never days), with a confidence label (Low / Medium / High) and the top three drivers.
- Estimated wait to Dates for Filing (when they could file I-485 if USCIS designates DFF).
- Near-term outlook gauge: Advance / Hold / Retrogress for the next 3–6 months, with the reason.
- Active disruptions for their country and processing path (from the event registry), with dates and status.
- History chart: their category/country FAD and DFF over the last 10 years with their PD as a horizontal line.
- "What would change this" list: spillover size in October, cap-reform bills, pauses lifting, EB-2/EB-3 downgrade, and **how many people ahead of you drop out**. The last one deserves plain words on the card, because it is one of the honest reasons an estimate can land early: not everyone holding an older priority date is still pursuing it. Some changed employers and were never sponsored again, some left the country. They stay in the published counts and never take a visa number, and when a cohort turns out to be thinner than it looked, the cutoff moves further than expected.
- Filed-and-current variant: hero shows Filed, Current since, Now and Decision on one line, a "freeze risk before decision" tile, and a "Your I-485" stage card (filed, current, in line, decision). Its practical notes must be **corrected from the first draft**:
  - *Interviews.* The draft said interviews are usually waived for employment cases. That is now misleading. USCIS restricted interview-waiver criteria through a Policy Manual update in early 2026; reporting puts employment-based waiver eligibility near 72%, so more than one in four now get an interview, with concurrent filings and complex histories most affected. Say an interview is possible and increasingly common, and verify against USCIS Policy Manual Volume 7, Part A, Chapter 5 before shipping.
  - *Medical exam.* An I-693 signed on or after 1 November 2023 does not expire, **but only while the application it was filed with remains pending.** State the condition.
  - *Retrogression.* A retrogression pauses the case rather than killing it. This one stands.
- **A CSPA caution wherever the filing window is shown, for users with children.** USCIS reverted to the **Final Action Dates** chart for calculating a child's Child Status Protection Act age for requests filed on or after 15 August 2025. So being able to *file* under the Dates for Filing chart has **no** age-freezing effect. Telling a parent "you can file now" without this is a common and costly misunderstanding, and the app must not create it.
- Always-visible note: unofficial estimate, not legal advice, based on public data as of a shown date.
- Wordmark: "GC ETA" in the display serif; the tagline under it is the store subtitle above.

### 7.3 Design system (decided 2026-09-17, reaffirmed after a rejected iOS-native variant)
- **Look:** warm paper ground (#F3EFE6) with off-white cards (#FFFDF8, 1 px #D9D3C5 border, 14 to 16 px radius), Fraunces for display text and IBM Plex Sans for body, teal accent #0E6B63 for advance and rust #A8401F for retrogression, amber #8A5A00 for hold. Secondary text #5B5850. Uppercase 12 px section labels on cards.
- **Structure:** a three-step input (one question per screen), a results screen with a teal timeline hero, two "right now" tiles, a pill-tab flash-card carousel with eight cards (Outlook, Queue, Supply, Season, History, Events, EB-2 or EB-3, Changes), a bottom-sheet detail view per card, a Disruptions screen with an events timeline and status chips, and a methodology screen.
- **Accessibility constraints that override the "fits without scrolling" goal.** Screens fit a phone height *at the default text size*. They must still scroll, because iOS Dynamic Type and Android font scaling will overflow any fixed layout at accessibility sizes, and opting out of text scaling to preserve the layout fails review. Design for scroll with no scrolling needed at default. Separately, Advance, Hold and Retrogress must never be carried by colour alone: teal, amber and rust are indistinguishable for the roughly 8% of men with red-green colour deficiency, so every status needs an icon and a text label as well. Check teal #0E6B63 and rust #A8401F against the #F3EFE6 ground for 4.5:1 contrast and darken if they fail.
- **Rejected on 2026-09-17:** an Apple HIG-native variant (grouped inset lists, tab bar, system font, iOS gray palette, a document-style I-797-like summary card). Do not reintroduce it without asking.
- **Icon and background artwork (kept):** an original line-art card in the teal accent: photo box, dotted row, text lines, chip square, and a third line drawn as a progress bar with a marker, the one detail that says "ETA". Files: `design/assets/gc-eta-icon.svg` (1024 px app icon) and `design/assets/card-outline.svg` (stroke-only, uses currentColor, for faint decorative backgrounds at about 8% opacity, as behind the results header). Never reproduce the DHS seal, the eagle, the Statue of Liberty, "Permanent Resident" or "United States of America" wording, or the card's security patterns: they are the government card's design and are also present in third-party stock art. Imitating a government identity document risks App Store rejection and misleads users. Likewise, USCIS does not send a "final action notice" (Final Action Date is a Visa Bulletin term), and the I-797 Notice of Action layout is not to be copied.
- **Mockup source:** `design/project/` (Design canvas artifact https://claude.ai/artifact/GvFq5PSSkjz3TUAbd7Kvbd). Cards are separate components mounted inside the results screen, which maps to one view per card in the app.

### 7.4 Non-goals for v1
Push notifications (needs device tokens on a server), case tracking, accounts, ads, analytics. A "remember my inputs on this device" toggle can exist, default off, stored only locally.

---

## 8. Architecture

- **Pipeline (server-side, no user data):** a scheduled job (GitHub Actions cron or similar) runs Python ETL for every fetchable source, validates against a schema, and publishes versioned static JSON to a CDN bucket (GitHub Pages, Cloudflare R2, or S3 + CloudFront). Files: `bulletins.json` (full history), `inventory.json`, `limits.json`, `events.json`, `processing.json`, `manifest.json` (versions and "data as of" dates).
- **Visa Bulletin ingest: automate it against the unblocked official mirror.** travel.state.gov is behind Cloudflare and returns 403 even for robots.txt, which led an earlier draft of this plan to specify a permanent monthly manual paste step. That premise was wrong. **adoption.state.gov serves the identical AEM content tree and is not blocked.** Verified during review with live requests: the September 2026 bulletin at `adoption.state.gov/content/travel/en/legal/visa-law0/visa-bulletin/2026/visa-bulletin-for-september-2026.html` returns 200 with 118 KB containing the full tables and narrative; the October 2015 bulletin returns 200 from the 2016 archive path; and the FY2026 annual limits PDF returns 200 under `/content/dam/visas/Statistics/`. The whole FY2010-to-now dataset is therefore fetchable from an official government host, which removes roughly a week of Phase 0 seeding and a permanent single-maintainer dependency.
  - Treat this as possibly a firewall misconfiguration that could close without notice. Keep the GovDelivery email plus manual-PDF path as a documented, tested fallback, and keep the two-source cross-check before publishing.
  - Be a good citizen: one request per file per month, a descriptive User-Agent, and no backfill hammering. The content is a US Government work and so carries no copyright, but `adoption.state.gov/robots.txt` returns 404, meaning no crawl directives are declared. Absence of a directive is not permission, so do not over-fetch.
- **App:** all computation on device from the downloaded JSON. Works offline with the last downloaded data. No backend calls other than fetching the static files. No identifiers sent.
- **Stack:** Expo (React Native, TypeScript) for iOS and Android from one codebase; a pure TypeScript `model/` package with no React dependencies so it can be unit-tested and backtested in Node; charts with react-native-svg; date math with a fiscal-year helper. Python for the ETL only.
- **Repo layout:** `pipeline/` (ETL, parsers, tests, published-data schema), `data/` (checked-in historical bulletin dataset and event registry), `model/` (TypeScript, shared by app and backtests), `app/` (Expo), `docs/` (methodology page shown inside the app).

### 8.1 Update cadence: what refreshes by itself, and what needs a human

Nothing in this design depends on the app's users to supply data, and no app-store release is required to change an estimate. The model runs on the device against a downloaded JSON bundle, so when the pipeline publishes a new bundle the estimate recomputes the next time the app opens. Shipping a new number is a data publish, not a release.

**Poll schedule.** A single scheduled job runs **daily**, with a tighter cadence in the one window where timing matters.

| Feed | Cadence | Trigger to poll | Automatic? |
|---|---|---|---|
| Visa Bulletin (cutoffs + narrative sections) | Monthly, published ~2–3 weeks before the month it governs | Poll daily, and more often during the release window once its real spread is measured from the archive in Phase 0. The publication day varies, so do not hard-code a window before measuring it | Yes, via the unblocked mirror in §8 |
| USCIS chart designation (Final Action vs Dates for Filing) | Monthly, can lag the bulletin by days | Daily | Yes |
| Pending I-485 inventory XLSX | Monthly snapshot, published in irregular batches 1–3 months later | Daily, since publication timing is unpredictable | Yes |
| Annual numerical limits | October (provisional) and mid-year (final, §2.1) | Daily in October, weekly otherwise | Yes |
| Federal Register API | Continuous | Daily | Yes |
| CourtListener dockets | Continuous | Daily | Yes |
| USCIS newsroom / policy alerts (RSS) | Continuous | Daily | Yes |
| Congress.gov API | Continuous | Weekly | Yes |
| USCIS processing times | Monthly | Weekly | Yes |
| OFLC PERM disclosure, DHS OHSS quarterly | Quarterly | Weekly check for a new release | Yes |

**The one human step, and why it cannot be automated away.** Detecting that something happened is automatic. Deciding what it *means for the model* is not. A court order in a docket feed is a PDF; turning it into `{"status": "vacated", "demand_multiplier_during": 0.0, "redistribute_unused": true}` is a judgement about which population is affected, through which processing path, and in which direction. Get that wrong in an automated rule and the app confidently publishes a wrong number to everyone at once.

So the event layer runs as **detect automatically, confirm manually**:

1. The daily job scans the Federal Register, court dockets and USCIS alerts for a watchlist of terms (priority date, visa bulletin, adjustment of status, public charge, per-country, proclamation, the named case dockets) and for any new document from the relevant agencies.
2. Anything matching opens a pull request against `events.json` with the source link, the text excerpt and an **empty modeling effect**, plus a notification.
3. A maintainer fills in the effect and merges, or rejects it. Merging publishes.
4. Until a maintainer acts, the app keeps serving the last good bundle. It never shows a half-interpreted event.

**Freshness has to be visible rather than assumed.** Every bundle carries a `generated_at` and a per-source `as_of` and `published_at`. The app shows the bulletin month it is using on the results screen. If the bundle is older than a stated threshold, or the current month's bulletin has not been ingested by around the 25th, the app says so plainly rather than presenting a stale estimate as current. Pipeline failures page the maintainer; they do not silently serve old data as new.

**What this commits you to.** A daily cron that is nearly free to run, plus a standing human commitment to triage flagged events within a few days. §11.5 already records that three of 2026's biggest shocks arrived as court orders, so that triage is the real ongoing cost of the project, not the compute.

---

## 9. Roadmap

**Phase 0 — data spike (1 week).** Build the historical bulletin dataset (FAD and DFF, all EB rows and columns, FY2010 to now; seed from community datasets, verify against official PDFs). Write the inventory XLSX parser. Write `limits.json` for FY2020–FY2026. Seed `events.json`.

**Phase 0 must also settle these open data questions before Level B is designed.** Each one can invalidate a modeling assumption above, and all are cheap to answer by opening the files:
1. ~~Does the inventory split principals from dependents?~~ **Answered during review: it does not.** USCIS's own Q&A states the report "contains principal and dependent employment-based I-485s" as a combined count. The derivative ratio must therefore come from DHS OHSS or the Report of the Visa Office instead, and §3.2's "principal/dependent split" observable is wrong.
2. ~~Does the inventory cross-tabulate category × country × priority-date month?~~ **Answered during review: only partially, and not where it matters most.** See §4.1 for what the file actually contains.
3. Does a **November 2025 edition** of the DOS Annual Report of Immigrant Visa Applicants exist, and does it break employment categories down finely enough to apportion by priority date? Only the 2023 edition was confirmed while writing this plan. If it is category-and-country only, the consular queue has to be apportioned with an assumption, which must be stated in the app.
4. Do the OFLC disclosure files carry both **received and decision dates** per case, which the I-140 lag distribution in §6.2 depends on?
5. How many usable **filing-chart opening events** exist since 2016 per (category, country)? This sets whether the materialisation rate in §6.2 can be estimated at all, or has to ship as a prior. Count them from the bulletin archive before scoping Phase 2.
6. Record, for every file, both its **snapshot date and its publication date** (§10 leakage rule).

**Phase 1 — MVP (2–3 weeks).** Level A model, regression-risk heuristic, event flags, the three input screens, results screen, history chart, methodology page. Ship to TestFlight and internal Android track. Definition of done: for any (country, PD, category) the app shows both estimated windows, the outlook, and active events, with a visible "data as of" date, and works offline after first load.

**Phase 2 — queue model (3–4 weeks).** Level B from inventory + waiting list + I-140 data, spillover forecaster from family issuance data, backtest harness, EB-2 vs EB-3 comparison, "current to approved" add-on.

**Phase 3 — scenarios (later).** Level C Monte Carlo, probability-by-year view, optional topic-based push notifications (requires storing anonymous device tokens; decide then whether that breaks the no-data promise), localization (Hindi, Chinese, Spanish, Tagalog).

---

## 10. Validation

- **Backtest 1, short-range movement:** for every month from October 2021 to now, run the model using only data published before that month and predict FAD 6 and 12 months ahead. Report mean absolute error in months against a persistence baseline (assume no movement) and a naive trend baseline.
- **Backtest 2, first passage — this is the one that tests what users are shown.** The app promises "years until current," which a 6- and 12-month MAE does not validate. For every priority-date month that actually became current between 2018 and 2026, forecast from three years earlier using only data available then, and score the error in **years**, plus the coverage of the P10–P90 band (it should contain the truth about 80% of the time). A model can win on 12-month MAE and still be badly wrong at the horizon the app sells.
- **Leakage rule:** backtests must filter on **publication date, not snapshot date.** Three specific traps. The inventory files carry an as-of date and a separate, later publication date, so a naive run dated 10 August would wrongly use the 5 August snapshot that was not public until 25 August. The event registry is hand-curated with hindsight, so a status like "ended by court" was not knowable months earlier; version `events.json` as an append-only log with a `known_at` per entry, or exclude the event layer from backtests entirely. And the bulletin's information-set boundary is the demand cutoff it names, "demand received by August 10th" for the September edition, not the month the bulletin governs. The USCIS inventory dated 5 Aug 2026 was not public until 25 Aug 2026, and some files lag by up to three months. Every stored record needs both dates, and the harness must refuse to read a record whose publication date is later than the simulated "today." Without this the backtest silently cheats and the shipped accuracy numbers are wrong.
- **Metrics, because mean absolute error alone will flatter the model.** The cutoff is unchanged most months, so a persistence baseline is very strong and monthly error hides exactly the events that matter, the October jumps and the summer retrogressions. Report, in this order: (1) **interval coverage**, the fraction of realised outcomes falling inside the displayed P10 to P90 band, which is the only metric that tests what the interface actually claims; (2) a **Brier score** for "current by month m"; (3) errors **stratified by fiscal-year month**; (4) comparison against a **seasonal-only baseline** of month-of-fiscal-year averages as well as persistence, because the seasonal baseline will likely beat the model on the outlook task and that needs to be known rather than discovered later. Note that "Unavailable" and "Current" are not points on a date line, so how they are encoded drives the result and the encoding must be stated with the numbers.
- Publish the results inside the app's methodology page.
- **Outlook accuracy:** precision and recall of "Retrogress" warnings against actual retrogressions and "U" events in the following 3 months.
- **Sanity anchors:** Cato's long-run estimates (a new India EB-2 applicant faces a multi-decade or lifetime wait) and the observed 2026 India cohort behavior (2013 PDs cleared, 2015 entering) should fall inside the model's range.
- **Unit tests:** fiscal-year math, per-country cap computation from limits, fall-down arithmetic, chart selection logic, event applicability by country and path.

---

## 11. Open questions and risks

1. How much of the approved-I-140-but-not-filed population is real demand versus abandoned cases. Only estimable indirectly; treat as a wide prior.
2. Country of citizenship in PERM data is a proxy for country of birth; error is small for India and China, larger elsewhere.
3. Inventory publication lag (1–3 months) means the queue model always runs on stale data near fiscal year-end, exactly when retrogression risk peaks. Level A and the narrative keywords carry the outlook in those months.
4. App-store review: the app must not use agency logos or imply affiliation, and must carry the not-legal-advice disclaimer. **Check developer enrollment type early.** Apple's guideline 5.1.1(ix) requires apps in highly regulated fields to be submitted by a legal entity enrolled as an organization rather than an individual, and immigration is regulated, with unauthorized-practice-of-law rules varying by state. Google Play additionally requires a government-apps declaration and rejects apps that appear to facilitate a government process without documentation. Both are unverified against current store policy text, but if an entity and a D-U-N-S number turn out to be needed that is a weeks-long process, so confirm before Phase 1 ends rather than at submission.
5. Court-driven reversals happened three times in 2026. The event registry must be updated within days of such rulings, which is a maintenance commitment.
6. The worldwide interview pause has no end date; if it runs into FY2027 it changes the spillover forecast for FY2028 as well.
7. The 226,000 family floor binding (§1.5) depends on immediate-relative admissions staying above 480,000. If they fall below that, the family level floats up and unused EB numbers start mattering again. Re-check each October.
8. Level B is unusable for priority dates far behind the Dates for Filing cutoff, because the inventory is truncated there (§6.2). That is exactly the population with the longest waits and the most interest in the app, so the MVP must degrade honestly to Level A rather than showing a falsely short queue.
9. The materialisation rate (§6.2) is the model's largest unquantified parameter and its sign is known while its size is not: the queue model is biased toward predicting waits that are **too long**. The natural-experiment estimator depends on chart openings, which are infrequent and concentrated in categories that are not the ones most in need of it, so expect wide bands for years. Do not present a queue-derived number without the Level A cross-check.
10. Backtest results may show the model is not materially better than persistence at the multi-year horizon. If so, publish that and lead with ranges and drivers rather than a headline date. Do not let the UI imply more precision than the validation supports.

---

## 12. Sources consulted for this plan

- USCIS, Adjustment of Status Filing Charts from the Visa Bulletin (September 2026 designation).
- USCIS, Immigration and Citizenship Data: Pending Applications for Employment-Based Preference Categories (monthly XLSX, Feb 2024–Aug 2026); Form I-140 by classification and country of birth (quarterly).
- DOS, Visa Bulletin for September 2026 (via Fragomen and GreenCardClock reproductions; official site blocked automated access).
- DOS, Annual Numerical Limits FY2026 (186,317 EB limit reported by IIUSA, Manifest Law, Keller Immigration).
- Fragomen, "State Department Temporarily Pauses Immigrant Visa Interviews Worldwide" (Aug 2026) and September 2026 Visa Bulletin analysis.
- Mintz, EPI, Ogletree, Envoy Global on the 75-country immigrant visa suspension (Jan 21–Aug 21, 2026).
- Reddy Neumann Brown, Phillips Lytle, Tafapolsky & Smith on the June 5, 2026 vacatur of the USCIS 39-country adjudication pause; Boundless for the 39-country list.
- GreenCardClock, FY2027 spillover methodology and September 2026 analysis; USCIS inventory monthly write-ups.
- TRAC, Penn Wharton Budget Model, Vorys, Klasko on the H-1B $100,000 fee and weighted selection rule.
- Alma, Fennemore, VisaVerge, Visa Lawyer Blog on the Gold Card.
- AILA, Fragomen, Sen. Hickenlooper press on per-country cap legislation (EAGLE Act S.3291, IVES Act H.R.6542).
- DOL OFLC PERM Selected Statistics FY2026 Q1; VisasUpdate on July 2026 PERM processing times.
- CLINIC and NPZ Law on EB-4 religious worker sunset and H.R. 7148.
- Cato Institute (David Bier) backlog analyses; CRS R47164.

---

## 13. Pre-implementation review log (2026-09-17)

The plan was reviewed before any code was written, by a reviewer with the full design history and by an independent audit that re-checked claims against primary sources. Findings and dispositions below. Statute citations were verified against the US Code text at law.cornell.edu, not against secondary summaries.

### Fixed — wrong law or wrong math

| # | Finding | Disposition |
|---|---|---|
| 1 | The plan said unused EB numbers "flow to the family side next year." Statutorily true (INA 201(c)) but practically false: the family level is 480,000 minus immediate-relative admissions, floored at 226,000, and immediate relatives have exceeded 480,000 for years, so the floor binds and added EB numbers raise nothing. Unused EB numbers are lost. | Fixed in §1.5 (new item), §2.1, §3.3, §5, and in the mockup's events card, which told users "stranded consular numbers shift next year's supply." |
| 2 | Fall-down chain was stated as EB-2 unused → EB-3. INA 203(b)(3) actually gives EB-3 the visas not required by paragraphs **(1) and (2)**, so EB-3 is the residual for both higher categories. EB-4 and EB-5 receive no fall-down. | Fixed in §2.1 with the statutory language quoted. |
| 3 | INA 202(a)(5) was described as an annual cap-lift. The text conditions it on a **calendar quarter** and applies it "during the remainder of the calendar quarter." | Fixed in §1.4 and §2.2. |
| 4 | Cross-chargeability was described as two rules (spouse yes, child to either parent). INA 202(b) has **four**, adding the US-born rule and the rule for a person born where neither parent was born or resident. Both family rules also require that the target country has not reached its per-country level. | Fixed in §2.2; the app's helper text must cover all four and the condition. |
| 5 | §2.2 asserted a "quarterly pacing rule" limiting early-year use, with a percentage to be confirmed. No statutory basis was found. | Removed. Replaced with the verified quarterly test in INA 202(a)(5), plus an explicit instruction not to show a pacing percentage in the app. |

### Fixed — modeling errors that would have produced wrong numbers

| # | Finding | Disposition |
|---|---|---|
| 6 | Level A computed distance ÷ average net velocity. The user's question is a **first-passage time**; netting retrogressions out understates it, because a retrogression postpones first passage rather than undoing progress. | §6.1 rewritten to simulate monthly steps to first crossing; retrogression modeled as delay and as freeze risk. |
| 7 | Level B treated the queue as closed. People with **earlier** priority dates keep joining it after today. | §6.2 now requires an arrival process for earlier-PD demand from the PERM and I-140 pipeline. |
| 8 | The I-485 inventory is truncated by the Dates for Filing chart: people whose PD is behind the cutoff could not file, so the inventory reads as an empty queue and would produce a falsely short wait for exactly the longest-waiting users. | §6.2 now requires falling back to Level A for PDs later than the current DFF, and saying so in the confidence label. Added as risk 8 in §11. |
| 9 | "Approved I-140s minus filings" subtracted across incompatible dimensions: I-140 data is by approval fiscal year, the queue is by priority date. | §6.2 now requires a PERM-to-I-140 lag distribution from OFLC data to map approval years onto PD cohorts; until then, a wide prior. |
| 10 | Possible double counting between the USCIS inventory and the NVC consular waiting list when a case switches path. | §6.2 now requires netting with a documented assumption. |
| 11 | The cohort approval curve read month-over-month inventory decline as approvals. Decline also contains denials, withdrawals, transfers, and category switches. | §6.5 now calls it net decline, treats it as an upper bound on approval speed, and calibrates a denial allowance against DHS OHSS actual LPR counts. |
| 12 | The approval estimate used one clock ("current since"). A case filed years ago under DFF is pre-adjudicated and approves within weeks of a number appearing; a concurrent filer has the whole adjudication ahead. | §6.5 now conditions on both time-since-filing and time-since-current. |
| 13 | The 60/40 Level A/Level B blend was an unjustified constant. | §6.2 now derives the weights from backtested error, decaying with inventory age. |
| 14 | The backtest measured 6- and 12-month FAD error, but the app sells a multi-year "when will I be current" answer. | §10 adds a first-passage backtest scored in years with P10–P90 coverage, over PD months that became current 2018–2026. |
| 15 | Backtest leakage: files were to be filtered by snapshot date, but USCIS publishes them 1–3 months later. | §10 adds a leakage rule requiring both dates per record and filtering on publication date. |
| 16 | The risk score used "numbers left in the year," which State does not publish. | §6.4 now labels it an estimate derived from issuance statistics and inventory decline, with its error largest late in the year. |
| 17 | §6.1 mixed P25/P50/P75 inputs with P10/P50/P90 outputs. | Unified on P10/P50/P90. |
| 21 | Caught while proofreading the edits: §6.1 still opened by collapsing history to a mean annual advance and calling retrogression "handled naturally because it nets out," directly contradicting the new first-passage bullet. | Rewritten. Net annual advance is now labelled a descriptive statistic for the history chart, and the forecast keeps the empirical **monthly step distribution** rather than a mean, so October jumps, spring holds and summer retrogressions all survive into the simulation. |

### Fixed — sources and operations

| # | Finding | Disposition |
|---|---|---|
| 18 | Monthly IV issuance statistics are also on travel.state.gov, so the Cloudflare constraint applies to that Tier 2 row too. | Noted in the Tier 2 table. |
| 19 | Congress.gov requires an api.data.gov key; CourtListener needs a token for usable rate limits; PACER charges per page. | Noted in the Tier 3 table. |
| 20 | Priority-date retention exceptions were incomplete. | §1.1 now includes labor-certification revocation, and states that employer withdrawal after 180 days does not destroy the retained date. |

### Deferred to Phase 0 verification, not assumed

These were flagged as unverified rather than guessed. Each is cheap to settle by opening the file, and each can invalidate a modeling assumption. They are listed as a gate in §9 before Level B is designed.

1. Whether the USCIS inventory XLSX splits principals from dependents, or only reports a combined count.
2. Whether it cross-tabulates category × country × priority-date month simultaneously.
3. Whether a November 2025 DOS waiting-list report exists and is granular enough to apportion by priority date. Only the 2023 edition was confirmed.
4. Whether OFLC disclosure files carry both received and decision dates per case.
5. Whether immediate-relative admissions remain above 480,000, which is what makes the 226,000 floor bind (§1.5, risk 7).
7. The operative Other Workers sub-limit after any NACARA offset, from the October annual limits PDF. The statutory base is a flat 10,000.

### Second pass: independent audit (findings 22–46)

A second reviewer re-checked the plan against primary sources, **downloaded and parsed the actual August 2026 inventory spreadsheet**, and fetched the official September 2026 bulletin. That produced findings the first pass could not have reached by reasoning alone.

**Critical — wrong numbers**

| # | Finding | Disposition |
|---|---|---|
| 22 | The per-country limit was stated as 28,862 across all preferences, but Level B needs the **pro-rated per-category** figure. For EB-2 in FY2026 that is 0.07 × 0.286 × 186,317 ≈ 3,730. Feeding 28,862 into the supply model overstates a category's per-country supply roughly **eightfold**. | Fixed in §2.2 with the derivation and a required unit test. Independently confirmed against the bulletin, which refers to "India's pro-rated limit in the EB-1 category." |
| 23 | Level B was specified against an imagined spreadsheet. The real file has no India EB-2/EB-3 rows for priority dates 2016 or later, so **the app's modal user has zero inventory rows**; collapses everything older than ten years into one bucket; suppresses 12–27% of cells; double counts people holding two pending applications; and covers only five chargeability areas. | New §4.1 documents all of it. Level B is re-scoped and must degrade to Level A rather than report a falsely short queue. Added as risk in §11. |
| 24 | AC21 §104(c) was cited for the per-country cap-lift. That provision is about H-1B extensions beyond six years and has nothing to do with visa allocation. | Fixed in §2.2. The rule is INA 202(a)(5) alone. Citing §104(c) in user-facing copy would have been an affirmatively misleading legal citation. |
| 25 | Level A asked for Dates for Filing history back to FY2010. That chart did not exist before the October 2015 bulletin, which was itself revised days after publication. | Fixed in §6.1: separate series start dates, capped DFF windows, wider DFF bands, and content hashing to catch same-URL bulletin revisions. |

**High — accuracy and risk**

| # | Finding | Disposition |
|---|---|---|
| 26 | **The manual-ingest premise was wrong.** travel.state.gov is Cloudflare-blocked, but `adoption.state.gov` serves the identical content tree unblocked. Verified independently: the September 2026 bulletin, the October 2015 archive bulletin and the FY2026 limits PDF all return 200 with full content. | §8 rewritten around automated ingest from the mirror, with the manual path kept as a tested fallback. Removes a permanent monthly manual step and roughly a week of Phase 0. |
| 27 | The spouse cross-chargeability rule omitted that the spouse must be **accompanying or following to join as an immigrant**. A citizen or green-card-holding spouse confers nothing. The input form as drafted would have told an India-born applicant married to a US citizen of Canadian birth that they were Current. | Fixed in §2.2 and §7.1, which now gates the spouse question. This was the single most likely path to a harmful wrong answer. |
| 28 | Attrition was to be estimated from inventory change not explained by approvals. USCIS's own notes say the count also moves from priority-date-retention refilings, category transfers and retroactive revisions, so attrition is unidentified. | Fixed in §6.2: estimate only on cohorts frozen on both sides, else carry a wide prior. |
| 29 | The approval curve read cohort decline as processing speed, which also captures a retrogression as slow processing. | Fixed in §6.5: survival analysis with exposure counted only while the cohort is current, competing risks for non-approval exits, and a 15% agreement check against the USCIS "numbers used" figure before shipping. |
| 30 | Narrative keyword features would fire on every category every month, because the bulletin's Section C is generic boilerplate containing all of them. | Fixed in §6.4. The real signal is structural: the Visa Office publishes dedicated per-category sections when it has something specific to say. Feature is now section existence plus verb classification. |
| 31 | The spillover forecaster watched only consular issuance, missing family adjustment approvals at USCIS, which understates family usage and therefore **overstates** next year's employment supply. | Fixed in §3.1 by wiring DHS OHSS quarterly data into the forecast. |
| 32 | Level A's known cohort-density bias was to be fixed by Level B, but Level B cannot serve the affected users (finding 23). | Fixed in §4: OFLC PERM disclosure promoted in importance, because its received date *is* the priority date and it is the only public source of priority-date density beyond the filing cutoff. |
| 33 | "Nothing leaves the device" was inaccurate and would not survive store review. | §7.1 reworded, fetches required to be parameter-free so the URL cannot leak the user's inputs, privacy policy and crash-reporting decisions made explicit. |
| 34 | Apple guideline 5.1.1(ix) may require an organization account for regulated fields. | Added to §11.4 as a check to clear before Phase 1 ends, since forming an entity is slow. Unverified against current policy text. |

**Medium and low**

| # | Finding | Disposition |
|---|---|---|
| 35 | The mockup's claim that interviews are usually waived for employment cases is **stale**. USCIS restricted waiver criteria in early 2026; about 72% of employment cases still qualify, so more than one in four now get an interview. | Verified independently. Fixed in §7.2 and corrected in the published mockup. |
| 36 | Two dated events were missing and both are imminent: the **DHS public charge rule effective 18 September 2026** for adjustment applications, and the **EB-4 religious worker sunset on 30 September 2026**. | Verified the public charge date against the Federal Register notice. Both added to §3.4. |
| 37 | EAGLE Act S.3291 and IVES Act H.R.6542 are 118th Congress numbers, dead since January 2025, so polling them returns stale records forever. | Fixed in §3.1: track by sponsor and title, resolve numbers at query time. The dead numbers also appeared in **user-facing** mockup copy on the Disruptions screen; removed there and republished. |
| 38 | Priority-date helper text covered only PERM and I-140 cases although the app offers EB-4 and EB-5; retention grounds listed two of the four in 8 CFR 204.5(e). | Fixed in §1.1 and §7.1. |
| 39 | No CSPA guidance anywhere, although USCIS reverted to the Final Action Dates chart for child-age calculations in August 2025, meaning a "you can file" message has no age-freezing effect. | Added as a required caution in §7.2. |
| 40 | The annual limit is provisional until USCIS supplies immediate-relative counts mid-year. | Fixed in §4: `limits.json` versioned per fiscal year with estimate and final. |
| 41 | The consular waiting-list report has no priority-date breakdown, counts derivatives, and excludes the ~85% of employment cases that are adjustment cases. | Fixed in §3.2: treated as a scalar adjustment, "apportioned by priority date" removed from the spec. |
| 42 | The I-140 by-country dataset described in Tier 2 may not exist in that form; the located series is archived and covers 2008–2011. | Flagged in §4 as unconfirmed before Phase 2 depends on it. |
| 43 | "Fits a phone height without scrolling" conflicts with Dynamic Type at accessibility sizes, and the Advance/Hold/Retrogress states were encoded by colour alone. | Fixed in §7.3: scroll always enabled, icon and label on every status, contrast check required. |
| 44 | The EB-2 versus EB-3 comparison promised "a downgrade decision has a number attached" for a legal strategy whose costs the app cannot see. | Fixed in §6.2: descriptive presentation only, no recommendation, no single-number delta. |
| 45 | The NACARA reduction to Other Workers was assumed to be up to 5,000. The September 2026 bulletin states it is **116** for FY2026, so the cap is about 9,884. | Fixed in §2.1. Confirmed directly from the bulletin text. Hard-coding 5,000 from older write-ups would have been a real error. |
| 46 | §5's table omitted the Certain Religious Workers and EB-5 set-aside rows, and the parser assumed this month's five columns despite historical column churn. Events carried no provenance. | Fixed in §5, §6.6: tuple-based schema, plus required `verified_against` and `last_checked` fields, with the unverified event statuses listed by name. |

### Third pass: raised by the project owner (finding 47)

| # | Finding | Disposition |
|---|---|---|
| 47 | Not everyone in the queue will be able to use a visa number when their date becomes current. People who left an employer without a new I-140 being filed, or who left the country, remain in the published counts permanently. Both increase in a soft labour market, and the plan treated this only as a one-line "wide prior" in §11.1. | Written up as a **materialisation rate** in §6.2, with: the portability carve-out showing it barely affects already-filed cases; the concentration of the problem in the approved-but-never-filed bucket that dominates the India backlog; an estimator from the filing-chart natural experiment; a decay-with-cohort-age requirement; regime dependence; and asymmetric widening toward "sooner" rather than a point correction. Also recorded the structural consequence that **Level B counts these people as demand while Level A has already priced their absence into observed cutoff movement**, which makes Level B an upper bound on the wait. New demand-factor rows in §3.2, a user-facing explanation in §7.2, and risk 9 in §11. |

### Verified correct by the audit — do not re-litigate

Checked against primary sources and left unchanged: the fall-down chain direction; the 28.6/28.6/28.6/7.1/7.1 splits and the EB-5 set-aside breakdown; the INA 201(c) and (d) spillover directions; **every Final Action Date and Dates for Filing value in §5, which matched the official September 2026 bulletin exactly**; the FY2026 limits of 226,000 family, 186,317 employment, 28,862 per country; the 8 CFR 204.5(d) and (e) priority-date rules; that a principal cannot be charged to a child's birth country; and that the inventory includes dependents. The audit also confirmed the first pass's own corrections on the family-limit floor, the removal of the quarterly pacing claim, and the percentile and Jensen-bias problems in Level A.

### Accepted as already correct

Verified against the statute and left unchanged: the 28.6/28.6/28.6/7.1/7.1 category splits; the per-country limit as 7% of the combined family plus employment total, 2% for dependent areas (INA 202(a)(2)); INA 201(d) family-to-employment spillover timing; the priority date being the PERM receipt date rather than the certification date; and the Dates for Filing versus Final Action Dates distinction.
