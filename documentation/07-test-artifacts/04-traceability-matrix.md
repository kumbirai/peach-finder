---
title: Peach Finder — Test Artefacts — Traceability Matrix
updated: 2026-09-04
---

# Traceability Matrix — BR → FR → SR → US → TC

## Document Control

| Field | Value |
|---|---|
| Upstream | `brd.md` §7 (24 BRs), `frs.md` §17 (BR→FR), `srs.md` §17 (BR/FR→SR), `user-stories.md` §20 (FRS module→stories) |
| Status | Living document — updated in place |

This matrix does not re-derive BR→FR or FR→SR traceability — `frs.md` §17 and `srs.md` §17 already own those and are the source of truth; duplicating them here would drift the moment either upstream document changes. This matrix adds the layer those documents don't have: **which test cases in `03-test-cases/` and which Playwright design in `05-playwright-spec-designs/` prove each business requirement**, at BR granularity (the level a sign-off conversation actually happens at), plus a completeness check against `04-solution-architecture` and `03-user-stories`'s own W-guard list.

## 1. BR → Epic → Test artefact

| BR | FR module(s) (see `frs.md` §17) | Epic(s) | Test-case file | E2E design | DDD |
|---|---|---|---|---|---|
| BR-1 | AVAIL | E8 AVAIL | `availability-and-discovery.md` §US-AVAIL-01..02 | `e2e-availability-lifecycle` | [US-AVAIL-01](../08-development-deliverable-documents/E8-AVAIL/US-AVAIL-01-one-tap-im-available.ddd.md) |
| BR-2 | SRCH | E1 DISC | `availability-and-discovery.md` §US-DISC-01 | `e2e-search-to-contact` | [US-DISC-01](../08-development-deliverable-documents/E1-DISC/US-DISC-01-homepage-answers-who-is-available-now.ddd.md) |
| BR-3 | SRCH | E1 DISC | `availability-and-discovery.md` §US-DISC-06 | `e2e-search-to-contact` | [US-DISC-06](../08-development-deliverable-documents/E1-DISC/US-DISC-06-availability-outranks-everything-honestly.ddd.md) |
| BR-4 | SRCH | E1 DISC | `availability-and-discovery.md` §US-DISC-02/03 | `e2e-search-to-contact` | [US-DISC-02](../08-development-deliverable-documents/E1-DISC/US-DISC-02-search-the-way-id-say-it.ddd.md) |
| BR-5 | SRCH, REV | E1 DISC, E5 REV | `availability-and-discovery.md` §US-DISC-04; `reviews-trust-and-admin.md` §US-REV-04 | `e2e-search-to-contact` | [US-DISC-04](../08-development-deliverable-documents/E1-DISC/US-DISC-04-filter-and-refine-without-losing-my-place.ddd.md); [US-REV-04](../08-development-deliverable-documents/E5-REV/US-REV-04-ratings-i-can-search-by-fairly.ddd.md) |
| BR-6 | PROF | E2 VIEW, E7 PONB | `provider-profile-and-media.md` §US-VIEW-01, §US-PONB-03 | `e2e-provider-onboarding-publish` | [US-VIEW-01](../08-development-deliverable-documents/E2-VIEW/US-VIEW-01-everything-i-need-to-decide-on-one-screen.ddd.md); [US-PONB-03](../08-development-deliverable-documents/E7-PONB/US-PONB-03-build-the-profile-itself.ddd.md) |
| BR-7 | PROF, UX | E2 VIEW | `provider-profile-and-media.md` §US-VIEW-01..06 | `e2e-search-to-contact` | [US-VIEW-01](../08-development-deliverable-documents/E2-VIEW/US-VIEW-01-everything-i-need-to-decide-on-one-screen.ddd.md) |
| BR-8 | PROF, PRIV | E2 VIEW, E7 PONB, E14 PRIV | `provider-profile-and-media.md` §US-VIEW-03, §US-PONB-07; `billing-analytics-and-privacy.md` §US-PRIV-01 | `e2e-search-to-contact` | [US-VIEW-03](../08-development-deliverable-documents/E2-VIEW/US-VIEW-03-contact-actions-where-my-thumb-is.ddd.md); [US-PONB-07](../08-development-deliverable-documents/E7-PONB/US-PONB-07-control-my-phone-numbers-exposure.ddd.md); [US-PRIV-01](../08-development-deliverable-documents/E14-PRIV/US-PRIV-01-my-number-leaks-nowhere-i-didnt-allow.ddd.md) |
| BR-9 | TRUST | E2 VIEW | `provider-profile-and-media.md` §US-VIEW-04 | `e2e-visual-quality-design-system` | [US-VIEW-04](../08-development-deliverable-documents/E2-VIEW/US-VIEW-04-badges-that-explain-themselves.ddd.md) |
| BR-10 | TRUST, ADM | E9 VERIF, E13 ADMIN | `reviews-trust-and-admin.md` §US-VERIF-01..03, §US-ADMIN-02 | `e2e-identity-verification` | [US-VERIF-01](../08-development-deliverable-documents/E9-VERIF/US-VERIF-01-submit-my-identity-claim.ddd.md); [US-ADMIN-02](../08-development-deliverable-documents/E13-ADMIN/US-ADMIN-02-work-the-identity-queue.ddd.md) |
| BR-11 | AVAIL, TRUST | E8 AVAIL | `availability-and-discovery.md` §US-AVAIL-04 | `e2e-availability-lifecycle` | [US-AVAIL-04](../08-development-deliverable-documents/E8-AVAIL/US-AVAIL-04-active-this-week-earned-automatically.ddd.md) |
| BR-12 | TRUST, ADM | E6 SAFE, E13 ADMIN | `reviews-trust-and-admin.md` §US-SAFE-01..02, §US-ADMIN-03 | `e2e-report-resolution`, `e2e-block-unblock` | [US-SAFE-01](../08-development-deliverable-documents/E6-SAFE/US-SAFE-01-report-anything-from-anywhere-in-two-taps.ddd.md); [US-ADMIN-03](../08-development-deliverable-documents/E13-ADMIN/US-ADMIN-03-work-the-reports-queue-to-human-resolution.ddd.md) |
| BR-13 | MSG, AVAIL | E4 MSG | `messaging-and-notifications.md` §US-MSG-01..03 | `e2e-search-to-contact` | [US-MSG-01](../08-development-deliverable-documents/E4-MSG/US-MSG-01-start-the-conversation-from-the-profile.ddd.md) |
| BR-14 | ACC, PROF | E3 ACC, E2 VIEW | `identity-and-access.md` §US-ACC-01; `provider-profile-and-media.md` §US-VIEW-03 | `e2e-search-to-contact` | [US-ACC-01](../08-development-deliverable-documents/E3-ACC/US-ACC-01-browse-everything-without-an-account.ddd.md); [US-VIEW-03](../08-development-deliverable-documents/E2-VIEW/US-VIEW-03-contact-actions-where-my-thumb-is.ddd.md) |
| BR-15 | MSG | E4 MSG | `messaging-and-notifications.md` §US-MSG-05 | — | [US-MSG-05](../08-development-deliverable-documents/E4-MSG/US-MSG-05-i-know-im-on-the-clock-provider.ddd.md) |
| BR-16 | REV | E5 REV | `reviews-trust-and-admin.md` §US-REV-01..06 | `e2e-review-lifecycle` | [US-REV-01](../08-development-deliverable-documents/E5-REV/US-REV-01-leave-a-review-that-counts.ddd.md) |
| BR-17 | ANLY | E10 ANLY | `billing-analytics-and-privacy.md` §US-ANLY-01..04 | — | [US-ANLY-01](../08-development-deliverable-documents/E10-ANLY/US-ANLY-01-my-four-numbers.ddd.md) |
| BR-18 | MONET, SRCH | E11 BILL | `billing-analytics-and-privacy.md` §US-BILL-01, §US-BILL-04 | `e2e-billing-lifecycle` | [US-BILL-01](../08-development-deliverable-documents/E11-BILL/US-BILL-01-a-free-period-i-can-trust.ddd.md); [US-BILL-04](../08-development-deliverable-documents/E11-BILL/US-BILL-04-lapse-with-grace-return-instantly.ddd.md) |
| BR-19 | MONET, ADM | E11 BILL | `billing-analytics-and-privacy.md` §US-BILL-01..02 | `e2e-billing-lifecycle` | [US-BILL-01](../08-development-deliverable-documents/E11-BILL/US-BILL-01-a-free-period-i-can-trust.ddd.md) |
| BR-20 | MONET, SRCH | E11 BILL | `billing-analytics-and-privacy.md` §US-BILL-05 | `e2e-billing-lifecycle` | [US-BILL-05](../08-development-deliverable-documents/E11-BILL/US-BILL-05-buy-fair-featuring.ddd.md) |
| BR-21 | MONET, MSG | E11 BILL | `billing-analytics-and-privacy.md` §US-BILL guard | — (negative assertion only) | — |
| BR-22 | UX, SRCH, PROF | E1 DISC, E2 VIEW | `availability-and-discovery.md` §US-DISC-08 (visual); `provider-profile-and-media.md` §US-VIEW-03 | `e2e-visual-quality-design-system` | [US-DISC-08](../08-development-deliverable-documents/E1-DISC/US-DISC-08-cards-i-can-shortlist-from.ddd.md); [US-VIEW-03](../08-development-deliverable-documents/E2-VIEW/US-VIEW-03-contact-actions-where-my-thumb-is.ddd.md) |
| BR-23 | UX | all UI-facing epics | every "Visual & interaction quality" table across `03-test-cases/` | `e2e-visual-quality-design-system` | — |
| BR-24 | UX, SRCH | E1 DISC | `availability-and-discovery.md` §US-DISC-01, §US-DISC-03 | `e2e-performance-and-perceived-quality` | [US-DISC-01](../08-development-deliverable-documents/E1-DISC/US-DISC-01-homepage-answers-who-is-available-now.ddd.md); [US-DISC-03](../08-development-deliverable-documents/E1-DISC/US-DISC-03-suggestions-as-i-type.ddd.md) |

## 2. Coverage completeness check

Every BR row above resolves to at least one test-case file and, where the requirement is cross-module/critical-path, an E2E design. No BR in `brd.md` §7 (BR-1 through BR-24) is without a row. Cross-checked against `user-stories.md` §20's FRS-module→stories table: every FRS module listed there (ACC, AVAIL, SRCH, PROF, MSG, REV, TRUST, ADM, ANLY, MONET, NOTIF, UX, PRIV) has a corresponding test-case file section — no module was silently dropped between FRS and this stage.

## 3. W-priority guards — traced as negative assertions, not features

Per `user-stories.md` §20, these are "honoured by omission." This stage makes that omission testable rather than merely documented:

| Guard | FR | Where tested |
|---|---|---|
| No forward-looking availability | FR-AVAIL-08 | `availability-and-discovery.md` TC-AVAIL-GUARD-01 |
| No personalized ranking | FR-SRCH-13 | `availability-and-discovery.md` TC-DISC-02b |
| No business/spa profiles | FR-PROF-13 | Not independently tested — no multi-therapist account type exists to test against; re-verify if account model changes |
| No calls/payments/booking-confirmations in messaging | FR-MSG-10 | `messaging-and-notifications.md` TC-MSG-03b |
| No verified-booking review gating / incentivized reviews | FR-REV-08 | `reviews-trust-and-admin.md` §US-REV-01 (eligibility is thread-age only, no booking/incentive path exists to test against) |
| No third-party ID vendor / license badge | FR-TRUST-10 | `reviews-trust-and-admin.md` TC-VERIF-01b (badge set is closed to exactly two, verified in `provider-profile-and-media.md` TC-VIEW-04a) |
| No seeker analytics or exports | FR-ANLY-06 | `billing-analytics-and-privacy.md` TC-ANLY-GUARD-01 |
| No tiered plans/coupons/auctions/commissions | FR-MONET-09 | `billing-analytics-and-privacy.md` TC-BILL-GUARD-01 (adjacent — pricing-model guard, not itself independently cased; flagged as a genuine gap below) |

## 4. Genuine gaps surfaced by writing this matrix

Flagged rather than silently patched over, consistent with this project's convention of surfacing rather than inventing (see Memento `peach-finder`/`ledger-kit` DDD-writing precedent):

1. **FR-PROF-13 and FR-MONET-09 have no dedicated negative test case** — both guards are "no such feature exists," and there's no natural UI surface to assert against until the account/pricing model is actually implemented. Recommend a lightweight schema/API-surface scan (similar to `TC-ADMIN-05b`'s impersonation-absence check) be added once the corresponding LLD modules (`provider-profile`, `listing-billing`) are implemented — tracked for the DDD pass, not resolved here.
2. **BR-15 (response time) has no E2E design** — it's fully covered at the story-test-case level (`TC-MSG-05a/b`) but doesn't participate in any of the 8 critical-path journeys from the LLD test-strategy. This is a legitimate scope boundary, not an oversight — response-time computation is a backend/analytics concern, not a user-observable journey step.
3. **BR-17 (analytics) has no E2E design** for the same reason — analytics dashboards are read-surfaces tested at the story level, not part of a golden-path journey.

None of these gaps block this stage's exit criteria (`01-test-strategy.md` §5) — they're scoping notes for whoever authors the DDDs and implementation-sequence doc next.
