---
title: E2E Spec Design — Provider Onboarding → Publish
updated: 2026-09-04
---

# E2E-2 — Provider onboarding → publish

## Document control

| Field | Value |
|---|---|
| execution | live-stack-seeded |
| stub_mode | forbidden |
| seed_pack | `seed-onboarding` |
| Traces | `user-stories.md` §19.2 process flow; US-PONB-01..04; FR-ACC-03/04, FR-PROF-01/02, FR-MONET-02, SR-APP-03 |

## Journey

1. Register a fresh provider account (name, mobile, area) → OTP verify.
2. Assert draft profile created, onboarding checklist opens.
3. Walk photos → intro → services → languages → area steps to completion.
4. Assert publish-readiness checklist reflects the minimum field set is met.
5. Tap Publish.
6. Assert the profile is publicly live **immediately** — no pending/review UI state renders anywhere in this journey.
7. Assert free-listing-period start timestamp equals the publish moment, not registration.
8. Poll public search for the new profile.

## Key assertions

- No approval step, review queue, or pending-content-check screen appears at any point between tapping Publish and the profile being fetchable by an anonymous session.
- Profile appears in a matching search query within ≤30s of publish (SR-APP-03).
- Onboarding checklist is resumable — kill the session mid-flow and resume; assert it re-enters at the first incomplete step, not step 1.

## Out of scope for this design

Identity verification (separate optional flow — see `e2e-identity-verification`), billing lifecycle beyond free-period start (see `e2e-billing-lifecycle`).
