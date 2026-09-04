---
title: Development Deliverable Documents — Implementation Sequence
updated: 2026-09-04
---

# Implementation sequence

Dependency-ordered build waves across all 76 stories. This informs a future `implement-stories.sh`-style driver's iteration order; it does not itself write code (per this stage's own scope — see `00-overview.md` §1).

**Source of the ordering:** `user-stories.md` §18's suggested build order ("E3+E7 → E8+E1 → E2+E4 → E6+E13 → E11 → E5, E9, E10, E12, E14 threads woven throughout"), cross-checked against the LLD index's own module dependency notes (`05-low-level-design/00-foundations/lld-index.md` §4 — e.g. "availability is discovery's primary event source", "nearly every notification category originates from a messaging event"), with one addition ahead of everything else: the frontend foundation, because this delivery's visual/premium mission means the component library and token pipeline are a build-blocking dependency for every subsequent UI-facing story, not an afterthought.

## Wave 0 — Frontend & platform foundations (blocks all UI-facing waves)

- `00-foundations/frontend-design-system-implementation.ddd.md` — token pipeline, component library, motion primitives, performance-budget scaffolding.
- LLD foundations (`shared-kernel`, `api-conventions`, `event-catalog`, `security-implementation`) — the branded-ID types, outbox event mechanism, response envelope, RBAC hook, and session lifecycle every module below depends on. These are LLD artifacts, already written; this wave is where they get implemented, not designed.
- `13-platform-configuration` — bootstrapped early because `01-identity-and-access`, `03-provider-availability`, `06-provider-reviews`, and `09-listing-billing` all read config values (free-period length, expiry duration, highly-rated threshold) from it at runtime.

## Wave 1 — Accounts & profiles (E3 ACC + E7 PONB)

`01-identity-and-access` before `02-provider-profile`: every profile FKs onto the identity-and-access `user` aggregate (LLD index §3, row 1). Within this wave: US-ACC-01..03, 05 and US-PONB-01 (registration) land first; US-PONB-02..08 (profile-building, publish, edit-live, phone visibility) follow once the identity aggregate and media pipeline (`12-media-processing`, needed for US-PONB-03's photo upload) exist. US-ACC-04 (dual role) can land any time after US-ACC-01..03.

## Wave 2 — Availability & discovery (E8 AVAIL + E1 DISC)

`03-provider-availability` before `04-discovery-search`: availability is discovery's primary event source (LLD index §4). US-AVAIL-01..03 land first (the "available now" state machine and its expiry sweep), then US-DISC-01..09 (the search projection consumes availability's domain events). This wave delivers the platform's principal proposition — treat it as the first genuinely demoable slice. US-AVAIL-04/05 ("Active this week" badge job and the dashboard that explains it) wait until Wave 4: `trust-and-safety` is the only writer of `active_this_week` (LLD index §4; `trust-and-safety-lld.md` §5), and that daily job calls `direct-messaging.hasSentSince`, which does not exist until Wave 3. US-PRIV-01/02 (phone-visibility serializer, EXIF/GPS stripping) have no dependency beyond `provider-profile`/`media-processing`, both already built in Wave 1 — the wave table below places them here rather than deferring them to Wave 6.

## Wave 3 — Profile view & messaging (E2 VIEW + E4 MSG)

`02-provider-profile` (read side, already built in Wave 1) feeds US-VIEW-01..06 directly. `05-direct-messaging` is the wave's main build: US-MSG-01..06, unblocking US-ACC-02's continuity flow (message-draft preservation across the sign-up interruption) and US-VIEW-03's contact actions. `11-user-notifications`' baseline event set (US-NOTIF-01) should land alongside messaging since "nearly every notification category originates from a messaging event" (LLD index §4).

## Wave 4 — Safety & admin, before public launch (E6 SAFE + E13 ADMIN)

`07-trust-and-safety` (report/block domain logic) before `08-moderation-admin` (the console delivery surface, which the LLD explicitly notes contains no new domain logic — every admin route delegates to owning-module facades). US-SAFE-01..03 land first (the module exists), then US-AVAIL-04 (the daily four-signal OR that is the only writer of `active_this_week` — facades from Waves 1–3 are all present) and US-AVAIL-05 (dashboard transparency over that badge plus "Available now" expiry), then US-ADMIN-01..08. This wave also completes US-VERIF-01..03 (E9) since identity-verification review is one of the admin console's two queues (US-ADMIN-02) and the badge-suppression mechanic (US-PONB-05's exception clause) depends on it.

## Wave 5 — Billing, before free periods start expiring (E11 BILL)

`09-listing-billing`: US-BILL-01..05. Must land before any Wave-1 provider's free period (started at first publish, Wave 1) actually expires — the LLD index flags this as a genuine sequencing constraint, not just a suggestion.

## Wave 6 — Remaining threads woven throughout (E5 REV, E10 ANLY, E12 NOTIF remainder, E14 PRIV remainder)

- `06-provider-reviews` (US-REV-01..06) — depends on `05-direct-messaging`'s 24h-thread-age eligibility facade (Wave 3).
- `10-provider-analytics` (US-ANLY-01..04) — depends on discovery/profile view/messaging events existing to capture (Waves 2-3).
- `11-user-notifications` remainder (US-NOTIF-02..04) — channel preferences and deep-linking, layered onto the Wave-3 baseline.
- US-PRIV-03's cross-module retention jobs and US-PRIV-04's ToS-acceptance capture are genuinely last — they depend on every module whose data they purge already existing. (US-PRIV-01/02 are Wave 2 — see above.)

## Explicit non-sequencing

Pre-launch activities (load testing against SR-CAP-01, penetration testing SR-SEC-12, restore-drill exercises SR-AVL-05) are operational activities under this stage's own scope, not story-sequenced build waves — see `05-low-level-design/00-foundations/lld-index.md` §6.

## Wave table (machine-readable — driver source of truth)

One row per story, grouped under its wave heading. A future driver script (e.g. `scripts/implement-brd.sh`) parses this table rather than hardcoding story IDs, so it can never silently drift from the prose above. Wave 0 has no story rows — see §"Wave 0" above; it is a one-time foundation bootstrap, not a per-story task.

### Wave 1
| `US-ACC-01` |
| `US-ACC-02` |
| `US-ACC-03` |
| `US-ACC-04` |
| `US-ACC-05` |
| `US-PONB-01` |
| `US-PONB-02` |
| `US-PONB-03` |
| `US-PONB-04` |
| `US-PONB-05` |
| `US-PONB-06` |
| `US-PONB-07` |
| `US-PONB-08` |

### Wave 2
| `US-AVAIL-01` |
| `US-AVAIL-02` |
| `US-AVAIL-03` |
| `US-DISC-01` |
| `US-DISC-02` |
| `US-DISC-03` |
| `US-DISC-04` |
| `US-DISC-05` |
| `US-DISC-06` |
| `US-DISC-07` |
| `US-DISC-08` |
| `US-DISC-09` |
| `US-PRIV-01` |
| `US-PRIV-02` |

### Wave 3
| `US-VIEW-01` |
| `US-VIEW-02` |
| `US-VIEW-03` |
| `US-VIEW-04` |
| `US-VIEW-05` |
| `US-VIEW-06` |
| `US-MSG-01` |
| `US-MSG-02` |
| `US-MSG-03` |
| `US-MSG-04` |
| `US-MSG-05` |
| `US-MSG-06` |
| `US-NOTIF-01` |

### Wave 4
| `US-SAFE-01` |
| `US-SAFE-02` |
| `US-SAFE-03` |
| `US-AVAIL-04` |
| `US-AVAIL-05` |
| `US-ADMIN-01` |
| `US-ADMIN-02` |
| `US-ADMIN-03` |
| `US-ADMIN-04` |
| `US-ADMIN-05` |
| `US-ADMIN-06` |
| `US-ADMIN-07` |
| `US-ADMIN-08` |
| `US-VERIF-01` |
| `US-VERIF-02` |
| `US-VERIF-03` |

### Wave 5
| `US-BILL-01` |
| `US-BILL-02` |
| `US-BILL-03` |
| `US-BILL-04` |
| `US-BILL-05` |

### Wave 6
| `US-REV-01` |
| `US-REV-02` |
| `US-REV-03` |
| `US-REV-04` |
| `US-REV-05` |
| `US-REV-06` |
| `US-ANLY-01` |
| `US-ANLY-02` |
| `US-ANLY-03` |
| `US-ANLY-04` |
| `US-NOTIF-02` |
| `US-NOTIF-03` |
| `US-NOTIF-04` |
| `US-PRIV-03` |
| `US-PRIV-04` |
