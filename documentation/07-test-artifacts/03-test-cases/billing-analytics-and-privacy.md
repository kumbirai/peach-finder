---
title: Peach Finder — Test Cases — Billing, Analytics & Privacy
updated: 2026-09-04
---

# Test Cases — Billing, Analytics & Privacy (BILL, ANLY, PRIV)

## Document Control

| Field | Value |
|---|---|
| Upstream | `user-stories.md` §14 (E11 BILL), §13 (E10 ANLY), §17 (E14 PRIV), `frs.md` §13 MONET / §12 ANLY / §16 PRIV |
| Seed pack | `seed-billing` for BILL; `seed-core` for ANLY/PRIV |
| Status | Living document — updated in place |
| Note | Billing idempotency is this platform's other stop-the-line risk class alongside human-only moderation (`01-test-strategy.md` §2.2/§6). Every webhook/state-transition case here is written to fail on any double-charge, double-grant, or corrupted transition. |

## US-BILL-01 (M) — A free period I can trust

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-BILL-01a | Clock starts at publish, not registration | Provider registered 5 days ago, publishes today | Free-period start = today's publish timestamp |
| TC-BILL-01b | End date and consequence always visible | View provider dashboard at any point in the free period | Free-period end date and what happens after are shown |
| TC-BILL-01c | Trial-ending notification fires | Provider approaches the configured trial-ending threshold | "Trial ending soon" notification dispatched per E12 rules |

**Traces:** FR-MONET-01, FR-MONET-02, FR-ADM-06.

## US-BILL-02 (M) — One free period per person, enforced quietly

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-BILL-02a | Re-registration with used number resumes, doesn't grant new trial | Register a new account with a phone number that already has `phone_registry_history` | Resulting subscription starts directly in prior/payment-required billing state, not a fresh free period |
| TC-BILL-02b | Messaging is plain, not accusatory | Trigger the resumed-state case | Copy states the resumed billing state factually, with no accusatory framing |

**Traces:** FR-MONET-03.

## US-BILL-03 (M) — Painless self-serve billing

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-BILL-03a | Card capture never touches Peach Finder | Add a payment method | Card entry happens via PSP-hosted/tokenized capture; raw card data never appears in Peach Finder request logs or storage (SAQ-A) |
| TC-BILL-03b | Price shown before purchase | Attempt to add featuring | Price displayed before the purchase is confirmed |
| TC-BILL-03c | Cancel renewal keeps listing live to period end | Cancel renewal mid-period | Listing stays live/discoverable until the paid period's end, then follows the lapse lifecycle |
| TC-BILL-03d | Itemized billing history | View billing history after 2+ billing events | Itemized receipts available for each |

**Traces:** FR-MONET-06, SR-INT-03, SR-PRIV-03.

## US-BILL-04 (M) — Lapse with grace, return instantly

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-BILL-04a | Grace period, listing stays live, dunning sent | Seeded `Grace`-state provider | Listing remains publicly discoverable throughout grace; dunning notifications dispatched |
| TC-BILL-04b | Auto-unpublish at grace end, data retained | Grace period elapses unpaid | Profile auto-unpublished; all profile data/media/reviews retained intact |
| TC-BILL-04c | Instant republish on payment, no review step | Pay while `Unpublished` | Profile republished immediately; no admin review step anywhere in the path |
| TC-BILL-04d | Webhook idempotency — no double-charge/transition | Replay the identical PSP webhook event ID twice | Exactly one state transition, one invoice, one audit entry; second call is a fast no-op with zero side effects |
| TC-BILL-04e | Webhook signature verification | Send a tampered-payload webhook with an invalid signature | Rejected with 401 before touching any state or `processed_webhooks` record |
| TC-BILL-04f | Daily job heals a missed webhook | Simulate a PSP event that never arrives, run the daily lifecycle job | `free_listed → grace → unpublished` still transitions correctly from stored timestamps alone |
| TC-BILL-04g | Lapse messaging framed as billing, not moderation | View all copy shown during grace/unpublish | No moderation-toned language anywhere in the flow |

**Traces:** FR-MONET-04, SR-APP-12, FR-NOTIF-01.

## US-BILL-05 (M) — Buy fair featuring

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-BILL-05a | Featuring requires active listing | Attempt to buy featuring on a lapsed listing | Blocked until the listing itself is active |
| TC-BILL-05b | Listing lapse auto-suspends featuring | Provider with active featuring enters `Grace` then `Unpublished` | Featuring is force-lapsed in the same transaction as the listing transition — never a separate async step, never a hidden provider shown as featured |
| TC-BILL-05c | Ranking/labeling behaves per US-DISC-06 | Featured provider appears in results | Same rules as `TC-DISC-06b/c` apply unchanged |

**Traces:** FR-MONET-05, FR-SRCH-08.

**W-guard:** TC-BILL-GUARD-01 — audit every screen for any seeker-to-provider payment affordance (checkout, deposit, tip, "pay through us"); none may exist (FR-MONET-08).

---

## US-ANLY-01 (M) — My four numbers

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-ANLY-01a | Exactly the BR-17 metric set, with trend + comparison | View dashboard at default 30-day range | Profile views, search appearances, contact requests, most-searched services each show current total, trend, prior-period comparison |
| TC-ANLY-01b | Range selector | Switch between 7/30/90-day ranges | Metrics recompute correctly per range |
| TC-ANLY-01c | Definitions shown in-product | Locate metric definitions on the dashboard | View/appearance/contact defined exactly per FR-ANLY-02 wording |

**Traces:** FR-ANLY-01, FR-ANLY-02.

## US-ANLY-02 (M) — Aggregate always, identifiable never

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-ANLY-02a | No per-viewer identification anywhere | Inspect every analytics API response and UI surface | No field or view exposes who viewed/searched |
| TC-ANLY-02b | Small-count floor | Provider with 3 profile views in the period | Dashboard shows "< 5", never the literal small number |

**Traces:** FR-ANLY-03, FR-PRIV-06, SR-APP-08.

## US-ANLY-03 (M) — Demand signal I can act on

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-ANLY-03a | Platform-wide top tags with own tags highlighted | View "most-searched services" on a provider who doesn't offer a trending tag | Trending tag shown; provider's own offered tags visually distinguished from tags they don't offer |

**Traces:** FR-ANLY-04.

## US-ANLY-04 (S) — Cause and effect on the chart

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-ANLY-04a | Event annotations on trend chart | Provider went available 5× and became featured within the chart's period | Both event types annotated on the chart at their correct dates |

**Traces:** FR-ANLY-05.

**W-guard:** TC-ANLY-GUARD-01 — confirm no seeker-facing analytics, funnels, or export exist anywhere (FR-ANLY-06).

---

## US-PRIV-01 (M) — My number leaks nowhere I didn't allow

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-PRIV-01a | Server-side absence, not CSS-hidden | Provider phone-visibility OFF, anonymous request | Raw server response contains no phone field/value — verified at the network layer, not just the rendered DOM |

**Traces:** FR-PRIV-01, FR-PROF-08, SR-SEC-09. (Cross-ref `TC-PONB-07a`.)

## US-PRIV-02 (M) — My address isn't in the system at all

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-PRIV-02a | No street-address field anywhere | Audit every provider-facing form and the underlying schema | No field exists for street address at any granularity finer than area |
| TC-PRIV-02b | EXIF/GPS stripped | Cross-ref `TC-PONB-03c` | Same result applies |

**Traces:** FR-PROF-04, FR-PRIV-02, SR-MEDIA-03.

## US-PRIV-03 (M) — Data that expires on schedule

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-PRIV-03a | Identity docs purge ≤90 days post-decision | Seed a decided case at exactly 90 days and at 89 days | 90-day case purged (photo objects gone, decision metadata retained); 89-day case not yet purged |
| TC-PRIV-03b | Dormant thread purge at 24 months | Seed a thread with no activity for 24 months, and one at 23 months | 24-month thread purged; 23-month thread retained |
| TC-PRIV-03c | Deletion anonymization ≤30 days | Cross-ref `TC-ACC-05d` | Same result applies |
| TC-PRIV-03d | Raw analytics destroyed ≤90 days | Seed raw analytics events at 90 and 89 days | 90-day events destroyed, aggregates survive; 89-day events still present |

**Traces:** FR-PRIV-03/04/05, SR-DATA-03, SR-APP-10, SR-PRIV-05.

## US-PRIV-04 (M) — Terms I actually agreed to

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-PRIV-04a | Links present in all three locations | Check footer, sign-up, provider onboarding | Privacy policy and ToS linked from all three |
| TC-PRIV-04b | Affirmative acceptance required at registration | Attempt registration without checking acceptance | Registration blocked until affirmative acceptance is given |

**Traces:** FR-PRIV-07.

## Visual & interaction quality (billing/analytics surfaces)

| TC ID | Scenario | Expected result |
|---|---|---|
| TC-BILL-VIS-01 | Billing state never uses moderation-toned color | Grace/Unpublished states use neutral/informational styling, not a "violation" red or warning treatment that implies wrongdoing |
| TC-ANLY-VIS-01 | Charts use the accessible palette, never color-only encoding | Trend-chart series are distinguishable by more than hue alone (pattern/label), consistent with the Never-Color-Alone Rule's spirit |
