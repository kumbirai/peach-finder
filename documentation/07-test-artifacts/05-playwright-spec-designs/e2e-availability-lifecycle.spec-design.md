---
title: E2E Spec Design — Availability Lifecycle
updated: 2026-09-04
---

# E2E-3 — Availability set → auto-expire

## Document control

| Field | Value |
|---|---|
| execution | live-stack-seeded |
| stub_mode | forbidden |
| seed_pack | `seed-availability` |
| Traces | `user-stories.md` §19.3 state diagram; US-AVAIL-01..03; FR-AVAIL-01/03/04, SR-APP-03/04 |

## Journey

1. Seeded provider at `NotAvailable` sets "Available now" from the dashboard.
2. Assert homepage/search reflect the status within ≤30s (a separate anonymous session polls).
3. Advance to the seeded T-15min boundary provider; assert expiry-warning notification and one-tap "Still available" renewal are present.
4. Tap renewal; assert timestamp refreshes and the countdown resets.
5. Advance to the seeded past-`expires_at` provider; run/await the sweep.
6. Assert status clears within `expires_at + 60s` even with no client reconnect.

## Key assertions

- Status visible immediately on homepage/search after set — not just on the provider's own dashboard.
- Expiry-warning notification fires at the T-15min boundary, not earlier or later.
- Auto-expire never survives past `expiry + 60s`, verified against the seeded past-deadline fixture specifically (not just "eventually clears").
- Expired state renders with zero negative marker — same neutral styling as a provider who was never available.

## Out of scope for this design

Discovery ranking effects of availability (see `e2e-search-to-contact`'s availability-first assertion).
