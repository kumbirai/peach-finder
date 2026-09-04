---
title: Peach Finder — Test Cases — Messaging & Notifications
updated: 2026-09-04
---

# Test Cases — Messaging & Notifications (MSG, NOTIF)

## Document Control

| Field | Value |
|---|---|
| Upstream | `user-stories.md` §7 (E4 MSG), §15 (E12 NOTIF), `frs.md` §8 MSG / §14 NOTIF, `srs.md` §5 APP |
| Seed pack | `seed-core`; `seed-blocking` for block-related cases |
| Status | Living document — updated in place |

## US-MSG-01 (M) — Start the conversation from the profile

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-MSG-01a | One thread per pair, reopens with history | Message a provider, leave, tap Message again | Same thread reopens with prior history — no duplicate thread created |
| TC-MSG-01b | Service-context prefill | Start a thread from a specific service's Message button | Composer prefills editable "Re: <service>" text |
| TC-MSG-01c | Blocked pair cannot start a thread | Either party has blocked the other | Message action is absent/disabled; no new thread creatable via any path (including a direct URL) |

**Traces:** FR-MSG-01, FR-MSG-04, FR-TRUST-08.

## US-MSG-02 (M) — A conversation that keeps up

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-MSG-02a | Live delivery within budget | Two online parties in a thread; one sends | Message appears to the counterpart ≤2s p95 without manual refresh |
| TC-MSG-02b | Sent/delivered/read states update live | Send a message, have the recipient open the thread | States progress and are visible to the sender without refresh |
| TC-MSG-02c | Polling fallback preserves functionality | Simulate WebSocket unavailability | Messages still deliver via polling fallback; latency degrades, delivery does not fail |

**Traces:** FR-MSG-02, SR-APP-05, SR-PERF-04.

## US-MSG-03 (M) — Arrange the time in words, not widgets

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-MSG-03a | Quick-start prompts insert plain editable text | Tap a quick-start prompt | Plain text inserted into the composer, fully editable, not a structured/locked element |
| TC-MSG-03b | No booking structure exists anywhere in the thread | Inspect the full thread UI and underlying API schema | No slot picker, booking-state field, confirmation control, or conflict-check exists |

**Traces:** FR-MSG-03, FR-MSG-04, FR-AVAIL-08 (guard).

## US-MSG-04 (M) — My inbox, at a glance

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-MSG-04a | Thread list ordering and unread state | Multiple threads with varying last-activity times, one with an unread message | List ordered by latest activity; unread thread visually flagged; unread count shown in app chrome |

**Traces:** FR-MSG-06, FR-MSG-07, FR-NOTIF-01/03.

## US-MSG-05 (M) — I know I'm on the clock (provider)

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-MSG-05a | Response-time measurement disclosed | Provider completes onboarding; opens a thread | Both onboarding and thread UI state plainly that first-reply speed is measured and displayed |
| TC-MSG-05b | Only first replies to new threads count | Provider replies once to a new thread, then exchanges 5 more messages in the same thread | Only the first reply counts toward the trailing-30-day metric; the later exchange is excluded |

**Traces:** FR-MSG-07, FR-MSG-08.

## US-MSG-06 (M) — Safety is two taps away, mid-conversation

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-MSG-06a | Report/block reachable in ≤2 taps from thread header | Open any active thread | Report and Block both reachable within 2 taps from the thread header |

**Traces:** FR-MSG-05, FR-TRUST-07, FR-TRUST-08. (Full block/report behavior verified in `reviews-trust-and-admin.md`.)

---

## US-NOTIF-01 (M) — The baseline event set

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-NOTIF-01a | Every baseline event dispatches on its correct channel(s) | Trigger each of: new message, identity review outcome, availability expiry warning, trial-ending, payment-failed, grace-warning, unpublished-for-nonpayment, moderation outcome, report receipt | Each fires on at least its M-priority channel set (email/in-app baseline; push where S-priority is implemented) |

**Traces:** FR-NOTIF-01, SR-APP-07.

## US-NOTIF-02 (M) — My channels, my choice — except what protects me

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-NOTIF-02a | Non-essential opt-out honored | User disables new-message push | New-message push no longer sent; email/in-app baseline unaffected unless separately disabled |
| TC-NOTIF-02b | Essential categories cannot be silenced | User disables all channels for their account | Billing, security, and moderation notices still deliver |

**Traces:** FR-NOTIF-02.

## US-NOTIF-03 (M) — Never a spam cannon

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-NOTIF-03a | Burst batching | Sender sends 6 messages within the batching window | Recipient gets exactly one notification for the burst |
| TC-NOTIF-03b | Block silence | Blocked party sends a message attempt / performs activity | Zero notifications generated for the blocker from that activity |

**Traces:** FR-NOTIF-03.

## US-NOTIF-04 (S) — Every notification lands me where I act

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TC-NOTIF-04a | Deep link accuracy | Trigger a new-message notification and a billing notification | Each deep-links directly to the relevant thread / billing page, not a generic inbox/dashboard landing |

**Traces:** FR-NOTIF-04.

## Visual & interaction quality (thread UI, premium feel)

| TC ID | Scenario | Expected result |
|---|---|---|
| TC-MSG-VIS-01 | Message bubbles use 14px radius nested-element corner style | Bubbles follow the smaller nested-element corner radius, not the 20px card radius |
| TC-MSG-VIS-02 | Composer and sheet elevation | Message composer/bottom sheet uses the Sheet shadow vocabulary (rising over content), not Ambient-rest |
| TC-MSG-VIS-03 | Unread indicator pairs color with a count/label | Unread state is never a bare colored dot with no number/label for screen-reader users |
