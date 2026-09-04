---
title: E2E Spec Design — Block/Unblock
updated: 2026-09-04
---

# E2E-8 — Block/unblock

## Document control

| Field | Value |
|---|---|
| execution | live-stack-seeded |
| stub_mode | forbidden |
| seed_pack | `seed-blocking` |
| Traces | US-SAFE-02; FR-TRUST-08, FR-NOTIF-03 |

## Journey

1. Seeded pair A (blocker) and B (blocked) with prior message/review history.
2. A blocks B from the thread header.
3. Assert neither party can send a new message to the other, in either direction, immediately.
4. Search as B → assert A does not appear in B's results (blocker hidden from blocked party's discovery).
5. Search as A → assert B still appears in A's results (asymmetric — the blocked party is not hidden from the blocker).
6. Trigger an activity on B's side that would normally notify A (e.g., B updates their profile) → assert A receives no notification from it.
7. A unblocks B via settings → assert both directions restore within the documented eventual-consistency window.

## Key assertions

- Directionality is asserted explicitly both ways (steps 4 and 5) — a symmetric-hide bug is the most likely regression here and the LLD's own test-strategy calls this out as a fixture-collision risk (§2.5 `block_cache` eventual-consistency window).
- B receives no notification of being blocked at any point.
- Existing message history and any prior review between A and B remain visible and unchanged throughout — blocking never rewrites history (cross-ref `TC-REV-06a`).
- Unblock restores full bidirectional messaging and, per the LLD's documented healing behavior, the discovery hide clears within the accepted window — this design asserts the *healed* end state, not just the immediate gap.

## Out of scope for this design

WebSocket reconnect mechanics around the block-cache propagation window (LLD/unit level, `05-low-level-design/14-test-strategy.md` §2.5).
