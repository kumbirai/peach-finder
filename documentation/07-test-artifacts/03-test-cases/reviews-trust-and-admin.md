---
title: Peach Finder — Test Cases — Reviews, Trust & Admin
updated: 2026-09-04
---

# Test Cases — Reviews, Safety, Verification & Admin (REV, SAFE, VERIF, ADMIN)

## Document Control

| Field | Value |
|---|---|
| Upstream | `user-stories.md` §8 (E5 REV), §9 (E6 SAFE), §12 (E9 VERIF), §16 (E13 ADMIN), `frs.md` §9 REV / §10 TRUST / §11 ADM |
| Seed pack | `seed-reviews`, `seed-reports`, `seed-verification`, `seed-blocking` |
| Status | Living document — updated in place |
| Note | This is the platform's highest-scrutiny cluster (`01-test-strategy.md` §2.2/§6) — human-only moderation and admin power. Every case here that touches a moderation-equivalent action is written to fail if any automated consequence occurs. |

## US-REV-01 (M) — Leave a review that counts

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-REV-01a | Eligibility boundary | Seeker with a thread exactly 23h59m59s old; another exactly 24h00m00s old | First is ineligible, second is eligible — assert at the exact boundary, not just "roughly a day" |
| TC-REV-01b | Ineligible action explains, doesn't hide | Ineligible seeker opens the review action | Plain-language explanation shown ("You can review after you've been in contact for a day"), not a hidden/disabled control with no reason |
| TC-REV-01c | One review per pair | Eligible seeker submits a review, then attempts a second | Second submission is rejected/merged into edit, never a duplicate |

**Traces:** FR-REV-01.

## US-REV-02 (M) — Live immediately, human-removable only

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-REV-02a | Immediate publish, no pre-moderation | Submit a review | Visible on the profile immediately; no queue/pending state at any point |
| TC-REV-02b | Aggregate updates atomically | Submit a review | Average rating and count both reflect the new review in the same read, never a stale-count/updated-average mismatch |
| TC-REV-02c | Removal only via explicit admin action | Attempt to find any automated removal trigger (report volume, keyword) | None exists; removal happens only through `TC-ADMIN-04` |

**Traces:** FR-REV-02, FR-REV-07, FR-ADM-05.

## US-REV-03 (M) — Change my mind

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-REV-03a | Edit updates aggregate, shows marker | Edit own review's rating | Aggregate recalculates; "edited" marker appears |
| TC-REV-03b | Delete removes from aggregate | Delete own review | Aggregate recalculates without it; both edit and delete require confirmation |

**Traces:** FR-REV-04.

## US-REV-04 (M) — Ratings I can search by, fairly

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-REV-04a | "Highly rated" maps to configured threshold | Search "highly rated" against providers at 4.4/3 reviews, 4.5/2 reviews, 4.5/3 reviews | Only the 4.5-avg-with-≥3-reviews provider matches the default threshold |
| TC-REV-04b | No-review providers show "New", excluded from rating filter | Filter by minimum rating on a mix including a zero-review provider | Zero-review provider excluded from filtered results; shows "New" (not "0.0") elsewhere |

**Traces:** FR-REV-05, FR-SRCH-02.

## US-REV-05 (S) — The provider's right of reply

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-REV-05a | One reply per review | Provider replies once, attempts a second reply to the same review | First succeeds and renders beneath the review; second is rejected |
| TC-REV-05b | Reply is reportable/removable | Report a provider's reply | Enters the same admin report path as a review |

**Traces:** FR-REV-06.

## US-REV-06 (M) — Blocking doesn't rewrite history

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-REV-06a | Existing reviews survive a block | Seeker and provider have a mutual history including a review; one blocks the other | Review remains visible in both directions; only new contact is prevented |

**Traces:** FR-REV-07, FR-TRUST-08.

---

## US-SAFE-01 (M) — Report anything, from anywhere, in two taps

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-SAFE-01a | Reachable in ≤2 taps from profile and thread | From a profile, and separately from a thread | Report reachable within 2 taps from both surfaces |
| TC-SAFE-01b | Exact reason taxonomy | Open the report reason list | Exactly: safety concern, fake profile/photos, harassment, spam/scam, other (+free text) — no additional reasons |
| TC-SAFE-01c | Receipt confirmed, zero automated consequence | File a report against a target with no other reports | Reporter sees receipt confirmation; target's profile/state is unchanged in every observable way (search rank, badge, publish state) immediately and repeated over N rapid reports from different reporters |

**Traces:** FR-TRUST-07, FR-MSG-05, FR-NOTIF-01.

## US-SAFE-02 (M) — Block: instant, silent, messages both ways

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-SAFE-02a | Instant bidirectional message block | A blocks B | Neither can message the other from that point forward, immediately |
| TC-SAFE-02b | Asymmetric discovery hide | A (blocker) blocks B (blocked) | A is hidden from B's future search/browse results; B is **not** hidden from A's search — directionality matters, verify both sides explicitly |
| TC-SAFE-02c | Silent to the blocked party | A blocks B | B receives no notification of the block; B's subsequent activity never generates a notification for A |
| TC-SAFE-02d | View/undo own blocks | A views block settings, unblocks B | A's block list shows B; unblocking restores prior state within the documented eventual-consistency window |

**Traces:** FR-TRUST-08, FR-NOTIF-03.

## US-SAFE-03 (S) — Know what the badges actually mean

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-SAFE-03a | Safety page linked from badge area and footer | From any profile's badge area, and from the footer | Both link to the same safety-information page covering badge meaning, incall meeting-safety basics, and how to report |

**Traces:** FR-TRUST-09.

---

## US-VERIF-01 (M) — Submit my identity claim

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-VERIF-01a | Submission enters queue, status visible | Provider submits ID photo + selfie | Enters admin queue; provider dashboard shows pending status |
| TC-VERIF-01b | Documents private, never product-displayed | Inspect every product surface a non-admin can reach | Submitted documents never render anywhere outside the admin console |
| TC-VERIF-01c | Profile visibility unaffected at every stage | Submit, then check profile while pending, after reject, and never-submitted | Profile visibility identical in all three states |

**Traces:** FR-TRUST-02, FR-TRUST-03, FR-PRIV-05, SR-MEDIA-01.

## US-VERIF-02 (M) — A human decides; the badge follows

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-VERIF-02a | Pending/unreviewed never renders the badge | Provider with a pending submission | Badge absent on card and profile |
| TC-VERIF-02b | Approval grants + notifies; rejection returns reason + resubmit | Admin approves one case, rejects another with a reason | Approved case: badge appears + provider notified. Rejected case: reason returned, resubmit path available |

**Traces:** FR-TRUST-02, FR-ADM-02, FR-NOTIF-01.

## US-VERIF-03 (M) — Badge suppression on identity-relevant changes

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-VERIF-03a | Suppressed, not revoked | Verified provider changes verified phone number | Badge hidden pending re-review (case re-enters queue), not permanently revoked; explanation + path shown; profile visibility untouched |

**Traces:** FR-TRUST-04.

---

## US-ADMIN-01 (M) — A hardened console for a powerful job

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-ADMIN-01a | TOTP mandatory | Attempt admin login without 2FA enrolled | Login blocked until TOTP is enrolled |
| TC-ADMIN-01b | Idle timeout ≤12h | Leave an authenticated admin session idle past 12h | Session is no longer valid |

**Traces:** FR-ADM-01, SR-SEC-08.

## US-ADMIN-02 (M) — Work the identity queue

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-ADMIN-02a | Oldest-first ordering, documents beside profile | Open the identity queue with `seed-verification` | Oldest pending case first; documents render alongside the provider's live profile |
| TC-ADMIN-02b | Pre-signed URL TTL | Open a document, capture its URL, wait past 5 minutes, retry the URL | URL access fails after TTL expiry |
| TC-ADMIN-02c | Decision notifies and audit-logs | Approve one case | Provider notified; audit log entry written with actor/action/target/timestamp/reason in the same transaction |

**Traces:** FR-ADM-02, SR-MEDIA-01, FR-ADM-08.

## US-ADMIN-03 (M) — Work the reports queue to human resolution

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-ADMIN-03a | Report shows full context | Open a message-thread report | Reporter, reported party, reason, the reported thread's content, reported party's prior history all shown |
| TC-ADMIN-03b | Every report reaches recorded resolution | Leave a report open across a long simulated period | Report never auto-resolves or auto-expires; remains open until an explicit admin decision |
| TC-ADMIN-03c | No general message-browsing capability | Attempt to browse any thread not attached to a filed report from the console | No such capability exists |

**Traces:** FR-ADM-03, FR-ADM-04, FR-MSG-09.

## US-ADMIN-04 (M) — The only hands that take content down

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-ADMIN-04a | Each action requires a recorded reason | Attempt to remove a photo/review/unpublish/suspend without entering a reason | Action is blocked until a reason is entered |
| TC-ADMIN-04b | Affected party notified, audit-logged same transaction | Unpublish a profile | Provider notified with reason; audit entry committed atomically with the state change (SR-APP-12) |
| TC-ADMIN-04c | Admin unpublish is not a republish gate | Admin unpublishes a provider | Provider can self-edit and self-republish with no admin action required |
| TC-ADMIN-04d | These are the only takedown mechanisms | Audit the codebase/API surface for any other content-removal path | None exists outside this action set |

**Traces:** FR-ADM-05, FR-TRUST-05, FR-ADM-08, SR-DATA-05.

## US-ADMIN-05 (M) — Look up anyone, impersonate no one

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-ADMIN-05a | Lookup by name/email/phone | Search each identifier type | Each returns the correct account with profile/badge/billing/report/moderation history |
| TC-ADMIN-05b | No impersonation capability | Search the console for any "log in as" affordance | None exists |

**Traces:** FR-ADM-07.

## US-ADMIN-06 (M) — Tune the platform without a deploy

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-ADMIN-06a | Each configurable setting takes effect ≤5min, no deploy | Change free-period length, availability expiry, "highly rated" threshold, response-time window, tag vocabulary, search lexicon entry, and pricing, one at a time | Each change is live within 5 minutes with no deployment/restart |
| TC-ADMIN-06b | Cross-key validation | Set `reminder_lead_minutes` ≥ current `expiry_minutes` | Rejected with a validation error, not persisted |

**Traces:** FR-ADM-06, FR-MONET-07, SR-APP-11.

## US-ADMIN-07 (M) — Everything I do is on the record

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-ADMIN-07a | Every admin action logged | Perform one of each action type (approval, rejection, removal, suspension, config change) | Each writes a complete who/what/whom/when/reason entry |
| TC-ADMIN-07b | Append-only, no edit/delete path | Attempt to modify or delete an existing audit entry via any API/UI path | No such path exists at the application level |

**Traces:** FR-ADM-08, SR-DATA-05.

## US-ADMIN-08 (S) — See the scaling wall coming

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-ADMIN-08a | Ops dashboard reflects real queue state | Seed a known identity-queue depth/age and reports-queue depth/age | Dashboard numbers match the seeded state exactly |

**Traces:** FR-ADM-09, SR-OBS-07.

## Visual & interaction quality (admin Ink exception, consumer-console distinction)

| TC ID | Scenario | Expected result |
|---|---|---|
| TC-ADMIN-VIS-01 | Admin strip uses Ink, not a third hue | The `peach·finder Admin` identity strip uses the neutral Ink color, never Terracotta/Pine/any new hue |
| TC-ADMIN-VIS-02 | Admin KPI density stays admin-only | Dense KPI-tile treatment never appears on any consumer (seeker/provider-facing) screen |
| TC-REV-SAFE-VIS-01 | Report/block controls meet consumer visual bar | Report and Block affordances use the same pill-shaped, icon+label pattern as the rest of the consumer product — not a bare admin-style control leaking into consumer UI |
