---
title: E2E Spec Design — Report → Human Resolution
updated: 2026-09-04
---

# E2E-5 — Report → human resolution (no automation, ever)

## Document control

| Field | Value |
|---|---|
| execution | live-stack-seeded |
| stub_mode | forbidden |
| seed_pack | `seed-reports` |
| Traces | `user-stories.md` §19.5 process flow; US-SAFE-01, US-ADMIN-03/04; FR-TRUST-07, FR-ADM-03/04/05 |

## Journey

1. Signed-in user files a report against a profile (and, separately, against a message thread) with a reason from the fixed taxonomy.
2. Assert receipt confirmation shown to reporter; report enters admin queue.
3. Poll the reported party's public profile continuously from filing through resolution.
4. Admin resolves one seeded report by dismissal (with note) and another by taking an explicit action (e.g., unpublish with reason).
5. Assert reporter-visible closure on both paths.

## Key assertions (this is the platform's highest-consequence guard)

- **Zero observable effect on the reported party between filing and the admin's decision** — the continuous poll from step 3 must show no change in search rank, badge state, publish state, or any other observable signal at any point before the human decision lands. This is the single assertion this design exists to prove; treat any deviation as a stop-the-line finding, not an ordinary failure.
- Message-content access for the admin is scoped to only the reported thread — attempt to browse an unrelated thread from the admin session mid-scenario and assert it's unreachable.
- Dismissed and acted paths both produce a reporter-visible closure state, not silence.
- The affected party is notified with a reason only on the acted path, never on dismissal.

## Out of scope for this design

Block behavior (see `e2e-block-unblock`), admin console authentication hardening (LLD/unit level).
