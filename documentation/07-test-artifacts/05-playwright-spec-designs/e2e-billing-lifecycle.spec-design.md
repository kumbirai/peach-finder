---
title: E2E Spec Design — Billing Lifecycle
updated: 2026-09-04
---

# E2E-6 — Billing: trial → paid → simulated failed renewal → grace → auto-unpublish → pay → republish

## Document control

| Field | Value |
|---|---|
| execution | live-stack-seeded |
| stub_mode | forbidden |
| seed_pack | `seed-billing` |
| Traces | `user-stories.md` §19.6 state diagram; US-BILL-01..04; FR-MONET-01..04, SR-APP-12 |

## Journey

1. Seeded `FreeListed` provider pays before free-period end → assert transition to `PaidListed`.
2. Simulate a renewal-payment failure via the fake PSP adapter's webhook → assert transition to `Grace`.
3. Assert listing stays live/discoverable throughout `Grace`; dunning notification dispatched.
4. Advance to grace-period end unpaid → assert auto-transition to `Unpublished`, all profile data retained.
5. Pay while `Unpublished` → assert immediate republish, `PaidListed`, no review step anywhere.
6. Replay the exact webhook event ID from step 2 a second time.

## Key assertions

- Listing visibility (in search/homepage) exactly matches the state diagram at each node — `Grace` is visible, `Unpublished` is not, `PaidListed` is.
- Step 6's replayed webhook produces **zero** additional state transition, invoice, or audit entry — this is the idempotency guarantee and the design's central assertion; treat a failure here as a stop-the-line finding per `01-test-strategy.md` §7.
- A tampered-signature webhook variant is rejected with 401 before any state read/write.
- Featuring add-on (if seeded active) force-lapses in the same transaction as the `Grace`/`Unpublished` transition, never a separate step.
- All copy shown during `Grace`/`Unpublished` reads as billing state, never as a moderation/violation message.

## Out of scope for this design

Free-period anti-abuse phone-reuse logic (covered at story level, `billing-analytics-and-privacy.md` TC-BILL-02a).
