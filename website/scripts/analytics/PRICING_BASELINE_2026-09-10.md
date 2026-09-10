# Pricing-page before-state — 2026-09-10

Frozen BEFORE the pricing work, so a later read compares against measured
numbers rather than memory. Nothing in production was changed to produce this.

Window: 90 days to 2026-09-10, `app_name='semora_site'`, automated traffic
excluded. Sample sizes are small — treat every rate here as directional.

No revenue or paid-conversion counts in here, and none belong. This repository
is public: traffic and funnel shape are worth versioning next to the code they
describe, purchase numbers are not. Keep those in the private notes.

## The page as it stood
| property | value |
|---|---|
| words in `<main>` | 4,403 |
| sections (h2) | 10 |
| FAQ items | 12 |
| buy/signup buttons inside the three pricing cards | **0** |
| first CTA position in the page | **75% down** |
| CTAs that lead to Pro | 0 (both go to free signup) |
| distinct telemetry placement for pricing CTAs | none |

## Traffic
| page | sessions | landed here | clicked from inside |
|---|---|---|---|
| `/` | 160 | — | — |
| `/download` | 38 | 30 | 10 |
| `/support` | 16 | 14 | 2 |
| `/pricing` | 11 | 5 | 6 |
| `/compare` | 10 | 4 | 7 |
| `/blog` | 7 | 3 | 5 |
| `/features` | 5 | 4 | 1 |

Total sessions in window: 285. Sessions that reached `/pricing` or
`/es/precios`: 11 (3.9%). Of those, 3 fired `signup_click`. Site-wide
`signup_click` sessions: 69.

Nav at the time: Features (dropdown), Compare, Blog, Support, Get the app.
Pricing was footer-only.

## Search Console context (from SEO_BASELINE_2026-09-09.md)
`/pricing`: 65 impressions, 2 clicks, position 5.3 over 90 days.

## What to re-measure at 28 days (2026-10-08)
- sessions reaching `/pricing`, and how many arrived from inside the site
- `signup_click` by the new placements: `pricing-free`, `pricing-pro-monthly`,
  `pricing-pro-annual`
- whether `/blog` internal arrivals fell after losing its nav slot
- `/pricing` impressions, clicks and position in Search Console
