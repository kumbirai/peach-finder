---
title: E2E Spec Design — Identity Verification
updated: 2026-09-04
---

# E2E-4 — Identity verification, approve path and reject-then-resubmit path

## Document control

| Field | Value |
|---|---|
| execution | live-stack-seeded |
| stub_mode | forbidden |
| seed_pack | `seed-verification` |
| Traces | `user-stories.md` §19.4 sequence diagram; US-VERIF-01..03, US-ADMIN-02; FR-TRUST-02..04, FR-ADM-02 |

## Journey — approve path

1. Provider submits ID photo + selfie.
2. Assert submission enters the admin queue; provider dashboard shows pending.
3. Poll the profile throughout submission — assert visibility is byte-identical to a never-submitted seeded provider's profile.
4. Admin opens documents via pre-signed URL, approves.
5. Assert badge appears; provider notified.

## Journey — reject-then-resubmit path

1. Provider submits.
2. Admin rejects with a reason.
3. Assert provider sees the reason and a resubmit path; profile visibility unaffected throughout.
4. Provider resubmits; assert it re-enters the queue cleanly (no orphaned prior-case state).

## Key assertions

- Profile visibility (search presence, every field) is poll-and-compared byte-identical across pending / rejected / never-submitted / approved states — this is the strongest form of the "never affected" guarantee, per the LLD scenario's own framing.
- An unreviewed/pending submission never renders the badge under any condition.
- The badge-suppression case (verified provider changes identity-relevant data) is exercised too: assert badge disappears, case re-enters the queue, profile stays fully visible.

## Out of scope for this design

Admin console access control (covered at the LLD/unit level, `05-low-level-design/14-test-strategy.md` §2.8).
