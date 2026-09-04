---
title: Peach Finder — Test Cases — Provider Profile & Media
updated: 2026-09-04
---

# Test Cases — Provider Profile Building & Viewing (PONB, VIEW)

## Document Control

| Field | Value |
|---|---|
| Upstream | `user-stories.md` §5 (E2 VIEW), §10 (E7 PONB), `frs.md` §7 PROF, `srs.md` §7 MEDIA |
| Seed pack | `seed-onboarding` for PONB; `seed-core` for VIEW |
| Status | Living document — updated in place |

## US-PONB-01 (M) — Register as a provider

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-PONB-01a | Registration creates draft profile | Register with display name, mobile number, general area | Draft profile created; user dropped into onboarding checklist |
| TC-PONB-01b | OTP verification gate | Register, receive OTP, enter wrong code 5×, then correct code late | 6th attempt on a code is rejected (rate-limited) per SR-INT-02; a fresh code still works within its own limits |
| TC-PONB-01c | Form survives OTP failure | Fill registration form, trigger an OTP failure | Previously entered display name/area are not lost on error redisplay |

**Traces:** FR-ACC-03, SR-INT-02, FR-UX-05.

## US-PONB-02 (S) — Guided onboarding that converts

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-PONB-02a | Checklist is resumable across sessions | Complete photos + intro steps, close browser, return later | Checklist resumes at services step, not step 1 |
| TC-PONB-02b | Publish-readiness reflects the minimum field set | Complete only photos + intro | Checklist shows publish blocked, naming the still-missing fields (≥1 priced service, ≥1 language, area) |

**Traces:** FR-UX-07, FR-PROF-02.

## US-PONB-03 (M) — Build the profile itself

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-PONB-03a | Gallery bounds and reorder | Upload 1 photo, then attempt a 13th | 1st upload succeeds as primary; 13th is rejected with a plain-language limit message; existing photos are reorderable |
| TC-PONB-03b | Upload validation is technical-only | Upload a valid JPEG under 10MB; upload a 15MB file; upload a `.jpg`-renamed non-image | First succeeds; second rejected pre-storage (size); third rejected as undecodable — none are content-reviewed |
| TC-PONB-03c | EXIF/GPS stripped invisibly | Upload a JPEG with embedded GPS EXIF | Every generated variant (thumb/card/gallery/2048px archival) has zero EXIF/GPS tags; provider sees no manual "strip metadata" step |
| TC-PONB-03d | Intro length cap with live count | Type into the intro field past ~600 chars | Live counter shown; input capped at the limit, not silently truncated on save |
| TC-PONB-03e | Tag proposal never blocks publish | Propose a tag not in the curated vocabulary, then complete the rest of the checklist and publish | Proposal recorded for admin review; profile publishes normally regardless of proposal outcome |
| TC-PONB-03f | Location is area-only | Attempt to enter a street address in the location field | UI offers only area/suburb granularity — no free-text street-address field exists |

**Traces:** FR-PROF-01, FR-PROF-03, FR-PROF-04, SR-MEDIA-02/03.

## US-PONB-04 (M) — I publish it. Nobody else.

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-PONB-04a | Publish with minimum fields is instant | Complete minimum fields (≥1 photo, intro, ≥1 priced service, ≥1 language, area), tap Publish | Profile is publicly live immediately; no approval step, review-queue state, or pending-content-check screen appears anywhere in the flow |
| TC-PONB-04b | Free period starts at publish, not registration | Provider registered 3 days ago, publishes now | Free-period start timestamp = publish time, not registration time |
| TC-PONB-04c | Search visibility within 30s | Publish a new profile | Profile appears in a matching search query within ≤30s |

**Traces:** FR-ACC-04, FR-PROF-02, FR-MONET-02, SR-APP-03.

## US-PONB-05 (M) — Edit live, always

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-PONB-05a | Edits are live on save, no gate | Edit intro text and save | Change is publicly visible immediately; no review/re-approval/temporary-unpublish state occurs |
| TC-PONB-05b | Identity-relevant edit suppresses badge only | Verified provider changes display name | Identity badge disappears from the profile pending re-review; profile itself stays fully visible and unaffected; provider sees a plain-language explanation |

**Traces:** FR-PROF-05, FR-TRUST-04.

## US-PONB-06 (M) — Unpublish and come back freely

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-PONB-06a | Unpublish/republish round-trip is lossless | Unpublish a complete profile, wait, republish | All prior fields/photos intact on republish; no re-approval step; profile reappears in search within the freshness bound |

**Traces:** FR-PROF-09.

## US-PONB-07 (M) — Control my phone number's exposure

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-PONB-07a | Default OFF, server-side hiding | New profile, phone-visibility never touched | Setting defaults OFF; number absent from the anonymous-served HTML/JSON entirely (inspect raw response, not just rendered DOM) |
| TC-PONB-07b | ON reveals to everyone | Provider toggles ON | Anonymous and signed-in visitors both see tap-to-call number |
| TC-PONB-07c | Signed-in seekers always see it regardless | Setting OFF, viewer is a signed-in seeker | Number is visible to the signed-in seeker despite the anonymous-facing setting being OFF |

**Traces:** FR-PROF-08, FR-PRIV-01.

## US-PONB-08 (S) — See myself as seekers see me

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-PONB-08a | Preview mode shows both audiences | Provider with phone-visibility OFF opens "preview as seeker" | Anonymous-view preview omits phone number; signed-in-view preview shows it — both clearly labeled which audience they represent |

**Traces:** FR-PROF-12.

---

## US-VIEW-01 (M) — Everything I need to decide, on one screen

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-VIEW-01a | Full field set renders | Open a fully-populated profile | Photos, intro, services+prices, tags, languages, reviews, response time, online status, contact actions all present |
| TC-VIEW-01b | Trust signals above the fold at 360px | Load profile at 360px viewport | Badges + rating/count are visible without scrolling |
| TC-VIEW-01c | Anonymous access and SSR | Anonymous session, cold load | Profile viewable with no account; server-rendered HTML contains meaningful content (not just a client-hydration shell) with correct link-preview metadata |

**Traces:** FR-PROF-01, FR-PROF-10, FR-ACC-01, FR-UX-02, FR-UX-08.

## US-VIEW-02 (M) — Honest presence, not surveillance

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-VIEW-02a | Presence shows coarse buckets only | Provider inactive for 2 days; inspect the profile's rendered presence and raw API response | UI/API show one of "today"/"this week"/"a while ago" — never an exact timestamp anywhere in the response |
| TC-VIEW-02b | Response-time buckets, or no claim | Provider with <5 replies of history | No response-time claim rendered (not a fabricated bucket) |

**Traces:** FR-PROF-06, FR-MSG-08, SR-APP-06.

## US-VIEW-03 (M) — Contact actions where my thumb is

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-VIEW-03a | Message is sticky and primary | Scroll a profile at mobile viewport | Message button remains reachable/sticky throughout scroll |
| TC-VIEW-03b | Call visibility follows phone-visibility + auth state | Anonymous viewer, provider phone OFF; then same viewer signed in | No phone number/markup in anonymous case; tap-to-call appears once signed in |

**Traces:** FR-PROF-07, FR-PROF-08, FR-PRIV-01, FR-UX-01.

## US-VIEW-04 (M) — Badges that explain themselves

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-VIEW-04a | Exactly two badges exist | Audit every screen/component in the prototype and design tokens | No badge/checkmark/trust icon exists beyond "Identity verified" and "Active this week" |
| TC-VIEW-04b | Tap/hover reveals explanation | Tap a badge | One-line plain-language explanation shown; link to safety-information page present |

**Traces:** FR-TRUST-01, FR-TRUST-09.

## US-VIEW-05 (M) — Reviews I can weigh

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-VIEW-05a | Review list fields and ordering | Open a profile with 5+ reviews | Newest-first; each shows rating, text, "First I.", month/year only (never an exact date) |
| TC-VIEW-05b | Edited marker and provider reply | View an edited review and one with a provider reply | "edited" marker present; reply rendered beneath its review |

**Traces:** FR-REV-03, FR-REV-04, FR-REV-06.

## US-VIEW-06 (S) — Share a profile

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-VIEW-06a | Copy-link and share sheet | Tap Share on a profile | Copy-link works; OS share sheet opens where supported |
| TC-VIEW-06b | Shared link preview | Open a copied link fresh (no prior session) | Public profile opens with correct title + primary-photo preview metadata |

**Traces:** FR-PROF-11, SR-APP-01.

## Visual & interaction quality (photo-forward, Warm Shadow, Never-Color-Alone)

| TC ID | Scenario | Expected result |
|---|---|---|
| TC-PROF-VIS-01 | Card/profile elevation | Cards use Ambient-rest shadow at idle and Lift-hover (Terracotta-tinted, not neutral gray) on hover/focus/press |
| TC-PROF-VIS-02 | Availability pill on cards and profile | 6px Terracotta dot + "Available now" text together (never dot alone); pulse animation disabled under `prefers-reduced-motion` |
| TC-PROF-VIS-03 | Badge color-plus-icon-plus-text | Verified badge always ships checkmark glyph + "Identity verified" text, never the Pine color alone |
| TC-PROF-VIS-04 | Photography placeholder treatment | Absent-photo surfaces use the documented clearly-labeled placeholder, never a blank/broken-image state or a stock/fabricated photo |
| TC-PROF-VIS-05 | Typography discipline | Fraunces appears only at Display/Headline sizes on the profile (therapist name at Headline scale); body copy stays Plus Jakarta Sans |
