# SEO before-state snapshot — 2026-09-09

Frozen baseline taken BEFORE any SEO changes, so later checkpoints compare
against measured numbers rather than memory. Nothing in production was
changed to produce this file.

REVENUE AND PAID-CONVERSION FIGURES ARE DELIBERATELY NOT IN HERE. This
repository is public. Traffic, index coverage and funnel shape are useful to
version alongside the code they describe; purchase counts and revenue are not
worth publishing to read them back later. Keep those in the private notes and
leave this file to the parts a stranger reading it only learns method from.

Site launched 2026-08-02. Marketing-site analytics began 2026-08-23, so the
first-party funnel below covers **17 days**, not 30. Search Console covers 90.

## How to reproduce
- `node scripts/gsc.mjs status` — sitemap + per-URL index verdicts
- `node scripts/gsc.mjs queries 28` — disclosed queries
- `supabase db query --linked --file website/scripts/analytics/organic-funnel.sql`
- Channel + funnel-by-type SQL: see this file's companion queries in the audit

## Index coverage (URL Inspection API, all 92 sitemap URLs)
| metric | value |
|---|---|
| indexed | 74 (80%) |
| crawled at least once | 76 (83%) |
| NEVER crawled | 16 |
| crawled but not indexed | 2 (`/compare/myhomework`, `/es/seguimiento-de-fechas-de-canvas`) |
| canonical conflicts | 0 |
| rich results detected | Breadcrumbs on 43 pages; no FAQ rich results |

Crawl dates cluster hard: **44 of 92 URLs were crawled on 2026-08-27**, and
essentially everything crawled got indexed.

Never-crawled URLs (16): `/studyfetch-alternative`, `/dormway-alternative`,
`/compare/dormway`, `/compare/shovel`, `/features/lecture-recording`,
`/features/apple-watch`, `/ai-study-planner-for-college`,
`/blog/what-assignment-weights-mean`, `/blog/first-two-weeks-of-semester`,
`/blog/how-to-study-for-midterms`, plus 6 `/es/*`.

## Search Console — 90 days to 2026-09-07
| metric | value |
|---|---|
| impressions | 2,562 |
| clicks | 70 |
| CTR | 2.7% |
| disclosed-query impressions | 421 (16% of total) |
| brand impressions / clicks | 206 / 17 (CTR 8.3%) |
| non-brand impressions / clicks | 215 / 2 (CTR 0.93%) |

28-day window: 2,472 impressions, 63 clicks, CTR 2.5%, avg position 18.2.

~84% of impressions and ~73% of clicks sit in anonymized long tail and cannot
be characterized by query. Do not tune titles against the disclosed subset.

### Commercial-page impressions/clicks (90d)
| page | impr | clicks | pos |
|---|---|---|---|
| `/` | 307 | 31 | 5.5 |
| `/features/syllabus-scanner` | 172 | 10 | 5.6 |
| `/blog/canvas-deadline-reminders` | 697 | 4 | 8.8 |
| `/ai-syllabus-scanner` | 62 | 3 | 5.7 |
| `/blackboard-assignment-tracker` | 40 | 3 | 9.7 |
| `/pricing` | 65 | 2 | 5.3 |
| `/compare` | 68 | 1 | 7.3 |
| all `/compare/*` + `/*-alternative` | ~30 | 0 | 26-58 |
| `/blog/weighted-gpa-calculator` | 275 | 0 | 71.7 |

## First-party funnel — 17 days (2026-08-23 to 2026-09-09)
Entry sessions by channel (252 total): direct 146 (58%), Google organic 66
(26%), AI assistant 14 (6%), other search 11 (4%), referral spam ~7.

Organic + AI sessions by landing-page type:
| landing type | sessions | signup click | signed in | activated |
|---|---|---|---|---|
| homepage | 47 | 30 | 30 | 14 |
| product/feature | 25 | 11 | 12 | 5 |
| blog/informational | 13 | 1 | 0 | 0 |
| pricing/download | 3 | 1 | 1 | 0 |
| comparison | 1 | 0 | 0 | 0 |
| **total** | **91** | **43** | **44** | **19** |

Rates: signup-click 47%, activation 21%. Paid-conversion counts are tracked
privately — see the note at the top of this file.

## Measurement limits (do not paper over these)
- Every iOS purchase shows "no site visit joined". A phone app and a desktop
  browser have different `device_id`s, so this is NOT evidence the site failed
  to influence them. iOS attribution is simply unavailable, which is the single
  biggest limit on anything this file claims about what search is worth.
- `semora_site` events carry no `user_id`; the site-to-app bridge is
  `device_id`, which held for only 59 of 272 site browsers.
- GA4 has never loaded in production (`NEXT_PUBLIC_GA_ID` unset on Vercel).
- Referrers are client-supplied. Sample sizes here are small enough that one
  or two sessions move a percentage several points.

## Checkpoints
| when | date | what to re-measure |
|---|---|---|
| 7-day | 2026-09-16 | never-crawled count, crawl dates |
| 14-day | 2026-09-23 | indexed count, commercial-page impressions |
| 28-day | 2026-10-07 | non-brand clicks/CTR, funnel by landing type |
| 90-day | 2026-12-08 | organic conversion (tracked privately) |
