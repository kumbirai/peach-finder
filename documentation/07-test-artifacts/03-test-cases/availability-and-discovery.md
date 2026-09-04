---
title: Peach Finder — Test Cases — Availability & Discovery
updated: 2026-09-04
---

# Test Cases — Availability & Discovery (AVAIL, DISC)

## Document Control

| Field | Value |
|---|---|
| Upstream | `user-stories.md` §11 (E8 AVAIL), §4 (E1 DISC), `frs.md` §5 AVAIL / §6 SRCH, `srs.md` §5 APP |
| Seed pack | `seed-availability` for AVAIL; `seed-core` for DISC |
| Status | Living document — updated in place |

## US-AVAIL-01 (M) — One tap: I'm available

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-AVAIL-01a | Single-tap set from dashboard and profile | Provider taps "Available now" from dashboard; separately from own profile view | Both entry points set status in one tap, reachable within one screen of opening the app signed-in |
| TC-AVAIL-01b | Timestamp recorded and propagated ≤30s | Set status, then poll homepage/search as another user | Timestamp recorded at set-time; discovery surfaces reflect it within ≤30s |
| TC-AVAIL-01c | Re-set refreshes timestamp and ordering | Provider already available; re-tap "Available now" | Timestamp updates; provider moves up recency ordering ahead of providers set earlier |

**Traces:** FR-AVAIL-01, FR-AVAIL-04, SR-APP-03/04.

## US-AVAIL-02 (M) — One tap: I'm done

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-AVAIL-02a | Single-tap clear | Provider available, taps clear | Status clears in one tap; disappears from "available now" surfaces on next fetch |

**Traces:** FR-AVAIL-02.

## US-AVAIL-03 (M) — The signal can't go stale

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-AVAIL-03a | Auto-expiry at configured duration | Seeded provider at `expires_at` exactly in the past | Sweep transitions to NotAvailable within 60s of the deadline (SR-APP-04) |
| TC-AVAIL-03b | T-15min warning with renewal | Seeded provider at the T-15min boundary | Provider receives pre-expiry notification with one-tap "Still available"; tapping it refreshes the timestamp and cancels the pending expiry |
| TC-AVAIL-03c | Expiry leaves no negative marker | Provider's status expires | Card/profile shows the neutral not-available state — no "expired"/warning badge, no demerit styling |

**Traces:** FR-AVAIL-03, FR-AVAIL-05, SR-APP-04/10.

## US-AVAIL-04 (M) — "Active this week", earned automatically

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-AVAIL-04a | Badge computed from any of the four signals | Provider with only a sign-in in the trailing 7 days, no other activity | Badge appears; recomputation runs at least daily |
| TC-AVAIL-04b | No manual grant path exists | Search the admin console for any control to directly set this badge | No such control exists anywhere in the product |

**Traces:** FR-AVAIL-06, FR-TRUST-06.

## US-AVAIL-05 (S) — No black boxes about my own signals

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-AVAIL-05a | Dashboard explains badge state and expiry | Provider views dashboard | Exact reason for current "Active this week" state shown; "Available now" expiry countdown/time shown if active |

**Traces:** FR-AVAIL-07.

**W-guard:** TC-AVAIL-GUARD-01 — audit every availability UI surface for any future-dated control ("available from 18:00", a weekly schedule editor); none may exist (FR-AVAIL-08).

---

## US-DISC-01 (M) — The homepage answers "who is available now?"

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-DISC-01a | Available cohort ordered by recency, first | Load homepage with `seed-core` (mixed availability) | Available providers appear first, most-recently-set/renewed first |
| TC-DISC-01b | Remaining providers always shown below, never empty | Load homepage when zero providers are currently available | Page still lists remaining published providers by "Active this week" recency — never an empty state |
| TC-DISC-01c | Freshness bound and recency phrasing | Load homepage, then set a provider available elsewhere; reload within 60s | New availability reflected; card shows recency phrasing ("Available now — updated N min ago") |
| TC-DISC-01d | Interactivity budget | Load homepage on reference-class device profile (throttled 4G) | Interactive ≤3s; meaningful content present in server-rendered HTML |

**Traces:** FR-SRCH-01, FR-AVAIL-05, FR-UX-02, FR-UX-08.

## US-DISC-02 (M) — Search the way I'd say it

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-DISC-02a | Every BRD §13 example query resolves sensibly | Run each of the 5 example queries verbatim | Each returns a sensibly filtered, non-empty-by-surprise result set matching its intent |
| TC-DISC-02b | Determinism across users | Same query/filters/location from two different (unauthenticated) sessions | Identical ordering and result set both times |
| TC-DISC-02c | Derived filters shown as removable chips | Run a natural-language query | Resulting structured filters render as the same chip component as manual filters, individually removable |

**Traces:** FR-SRCH-02, FR-SRCH-05, FR-SRCH-13, SR-APP-02.

## US-DISC-03 (M) — Suggestions as I type

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-DISC-03a | Suggestion latency | Type a partial service term | Suggestions render ≤200ms after keystroke |
| TC-DISC-03b | No provider names surfaced to anonymous name-search | Anonymous user types a seeded provider's exact name | No individual provider name appears in suggestions |

**Traces:** FR-SRCH-07, SR-PERF-02.

## US-DISC-04 (M) — Filter and refine without losing my place

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-DISC-04a | Filters combine, update without reload | Apply price + language + rating filters together | Results narrow to the intersection ≤1s, no full page reload |
| TC-DISC-04b | Active filters visible and removable | Apply 2 filters | Both shown as chips; removing one re-runs with the other still applied |
| TC-DISC-04c | No-review providers show "New" under rating filter | Filter by minimum rating ≥4 | Zero-review providers are excluded from the filtered set, and elsewhere show "New" rather than a 0 score |

**Traces:** FR-SRCH-04, FR-REV-05, SR-PERF-03.

## US-DISC-05 (M) — "Near me" without giving up my privacy

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-DISC-05a | Permission grant path | Tap "Near me", grant location | Results ordered/filtered by distance to provider's stated area |
| TC-DISC-05b | Graceful degradation on denial | Tap "Near me", deny permission | Manual area-entry offered inline; proximity search still functions on the typed area |
| TC-DISC-05c | Coordinates never persisted | Grant location, inspect server-side request logs/storage | Device coordinates present only in the transient request, absent from any persisted record |

**Traces:** FR-SRCH-06, FR-PROF-04, FR-PRIV-02, SR-INT-06.

## US-DISC-06 (M) — Availability outranks everything, honestly

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-DISC-06a | Available-first in any result set | Run a filtered search matching both available and unavailable providers | Available providers rank above unavailable ones regardless of relevance score |
| TC-DISC-06b | Featured-but-unavailable never beats non-featured available | Seed a featured-unavailable provider with high relevance and a non-featured-available provider with lower relevance | The available provider ranks above the featured one in an availability-ordered view |
| TC-DISC-06c | Featured label always visible | View a featured card | "Featured" label always visible, never conditional on hover |
| TC-DISC-06d | Only published/listed providers appear | Seed an unpublished and a lapsed-unpaid provider | Neither appears in any homepage/search surface |

**Traces:** FR-SRCH-03, FR-SRCH-08, FR-SRCH-09.

## US-DISC-07 (M) — Empty results that help instead of a dead end

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-DISC-07a | Empty state names constraints, offers relaxations | Filter to a combination matching nobody | Empty state names the constraining filter(s); one-tap relaxation options are offered and each re-runs the search |

**Traces:** FR-SRCH-10, FR-UX-05.

## US-DISC-08 (S) — Cards I can shortlist from

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-DISC-08a | Card field completeness | View a result card | Photo, name, intro extract, availability+recency, badges, rating+count, starting price, languages, distance, primary contact action all present |
| TC-DISC-08b | Legibility over photography at 360px | View cards at 360px viewport | Text over photo regions remains legible (contrast treatment present); tap targets remain ≥44px |

**Traces:** FR-SRCH-11, FR-UX-01, FR-UX-04.

## US-DISC-09 (C) — Re-run my recent searches

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-DISC-09a | Recent search stored, re-runnable, clearable | Run a query, revisit the app, tap the recent-search entry, then clear it | One tap re-runs the exact query+filters; clearing removes it; storage is first-party/per-device only |

**Traces:** FR-SRCH-12.

## Visual & interaction quality (Two-Hue Rule, Warm Shadow, motion)

| TC ID | Scenario | Expected result |
|---|---|---|
| TC-DISC-VIS-01 | Featured label never introduces a third hue | "Featured" renders as a neutral ink-on-paper label — not Terracotta, not Pine, not any new color |
| TC-DISC-VIS-02 | Availability pulse respects reduced motion | With `prefers-reduced-motion: reduce` set, the availability-dot pulse animation is disabled |
| TC-DISC-VIS-03 | Sticky search bar and filter chips | Search bar remains sticky while scrolling results; filter chip selected-state inverts to Ink background (never a color-only cue) |
