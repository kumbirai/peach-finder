---
title: Peach Finder — LLD — Notifications Module
updated: 2026-08-20
---

# Notifications — Low-Level Design

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Low-Level Design — `user-notifications` module (`src/lib/server/modules/user-notifications/`, schema `user_notifications`) |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | `01-frs` §14 (NOTIF), §16 (PRIV); `02-srs` §5 (SR-APP-07), §3 (SR-INT-01/02/05), §13 (SR-OBS-04); `04-hld` §6.1, §7.2; `04-clean-code-guidelines` §12 (`user-notifications` row) |
| Foundations (mandatory) | `00-foundations/shared-kernel.md`, `00-foundations/api-conventions.md`, `00-foundations/event-catalog.md`, `00-foundations/security-implementation.md` |
| Delivers FRS | FR-NOTIF-01..04 |
| Status | Living document — updated in place |

**What this module is.** The single subsystem that consumes domain events and turns them into user-facing nudges across **email, web push, and in-app** — honoring per-user preferences (FR-NOTIF-02), block silence and burst-batching (FR-NOTIF-03), and deep-linking to the point of action (FR-NOTIF-04). It is the **authoritative owner of the question "does this event notify anyone, and how?"** — sender modules never pre-filter (clean-code §12, `user-notifications` row).

**Binding module rules** (clean-code §12), each realized below:
1. **Preference, block-silence, and batching checks are centralized here** — no sender module pre-filters. (§4, §5, §7)
2. **A channel adapter's failure degrades that channel only** — never another channel, never the triggering user action. (§6)

---

## 2. Module purpose & scope (FR-NOTIF-01..04, SR-APP-07)

| In scope | Requirement |
|---|---|
| Fan-out policy: event → category → channel(s) | FR-NOTIF-01, SR-APP-07 |
| Per-user, per-channel preferences for non-essential categories | FR-NOTIF-02 |
| Always-deliver essential categories (billing, security, moderation) | FR-NOTIF-02 |
| Burst batching (several messages → one notification) | FR-NOTIF-03 |
| Block silence (a blocked party's activity notifies nobody) | FR-NOTIF-03 |
| "Email only if still unread after a delay" for new messages | FR-NOTIF-01 |
| In-app notification store with read state, listed/paginated | FR-NOTIF-01/04 |
| Channel adapters: email (SES), web push (VAPID), in-app (DB) | SR-INT-01/05, SR-APP-07 |
| Delivery-health signal (`NotificationDispatched`) | SR-OBS-04 |

| Explicitly NOT this module | Owner / note |
|---|---|
| **SMS as a notification channel** | **Does not exist.** SMS is **OTP-only** (SR-INT-02, `identity-and-access`). Notifications are push / email / in-app only (FR-NOTIF-01). Stated here to kill scope confusion — no SMS adapter, port, or config appears in this module. |
| Deciding *what happened* (the domain events) | every publishing module — notifications only reacts |
| Notification *copy authorship* beyond templates | templates/copy are owned here (shared-kernel §12), authored plain-language per FR-NOTIF-04 |

---

## 3. Data model — schema `user_notifications`

Branded UUIDv7 IDs, `timestamptz` UTC. FK onto `identity_and_access.user(id)` only (shared-kernel §10).

### 3.1 `notification_preference`

Normalized per-`(user, category, channel)`. **Rows exist only for opt-out-able categories** — essential categories (billing / security / moderation, FR-NOTIF-02) are never represented here, so there is no toggle a user or a bug could flip to silence them.

```sql
create table user_notifications.notification_preference (
  user_id  uuid not null references identity_and_access."user"(id),
  category text not null,     -- opt-out-able categories only (§4 table, 'opt-out?' = Y)
  channel  text not null,     -- 'email' | 'push' | 'in_app'
  enabled  boolean not null default true,
  primary key (user_id, category, channel)
);
```

Default is opt-in (`enabled = true`): a user with no row for a `(category, channel)` is treated as enabled. Dispatch for essential categories **skips this table entirely** (§4.2).

### 3.2 `notification_log`

The delivery record **and** the in-app inbox (in-app rows are the surfaced notifications; email/push rows are delivery-tracking records).

```sql
create table user_notifications.notification_log (
  id                  uuid primary key,
  user_id             uuid not null references identity_and_access."user"(id),
  category            text not null,
  channel             text not null,                 -- 'email' | 'push' | 'in_app'
  status              text not null,                 -- 'queued' | 'sent' | 'failed'
  title               text,                          -- rendered copy (populated for in_app; also used for push)
  body                text,                          -- rendered copy (in_app / push); NOT a message body (§7)
  deep_link_path      text,                          -- FR-NOTIF-04 (e.g. '/messages/:threadId')
  related_entity_type text,                          -- 'thread' | 'verification_case' | 'subscription' | 'report' | ...
  related_entity_id   uuid,
  read_at             timestamptz,                   -- in_app only: when the user read it in the app chrome
  dispatched_at       timestamptz,                   -- transition to sent/failed
  created_at          timestamptz not null,
  correlation_id      text not null                  -- propagated from the source event (shared-kernel §6.1)
);
create index notif_inapp_inbox_idx on user_notifications.notification_log (user_id, created_at desc)
  where channel = 'in_app';                          -- in-app list (FR-NOTIF-01), newest first
create index notif_inapp_unread_idx on user_notifications.notification_log (user_id)
  where channel = 'in_app' and read_at is null;      -- unread badge
create index notif_health_idx on user_notifications.notification_log (channel, status, dispatched_at);  -- SR-OBS-04
```

### 3.3 `notification_batch_window`

Tracks an **open burst-batching window** per `(user, category, source)`. **Chosen as a durable DB table, not in-memory** (FR-NOTIF-03): a `worker` restart must not drop an open window — that would silently lose the batched notification, and "silent notification loss is an availability defect" for a reachability product (SR-OBS-04). A durable window survives restart and is flushed by the next tick.

```sql
create table user_notifications.notification_batch_window (
  user_id        uuid not null references identity_and_access."user"(id),
  category        text not null,        -- 'new_message' (the only bursting category in V1)
  source_key      text not null,        -- the burst source, e.g. sender user id (per FR-NOTIF-03 "from X")
  opened_at       timestamptz not null,
  flush_after     timestamptz not null, -- opened_at + N minutes (§5)
  message_count   integer not null default 1,
  last_message_id uuid,                 -- newest batched message; drives the still-unread check at flush (§5)
  status          text not null default 'open',   -- 'open' | 'flushed'
  primary key (user_id, category, source_key)      -- at most one open window per (user, category, source)
);
create index batch_window_flush_idx on user_notifications.notification_batch_window (flush_after) where status = 'open';
```

### 3.4 `push_subscription` (Web Push / VAPID)

```sql
create table user_notifications.push_subscription (
  id         uuid primary key,
  user_id    uuid not null references identity_and_access."user"(id),
  endpoint   text not null unique,      -- browser push endpoint
  p256dh     text not null,             -- client public key
  auth       text not null,             -- client auth secret
  created_at timestamptz not null,
  last_ok_at timestamptz                -- last successful push; a 404/410 from the push service prunes the row
);
create index push_sub_user_idx on user_notifications.push_subscription (user_id);
```

### 3.5 `block_cache` (local mirror of `trust_and_safety.block`)

Identical shape and rationale to `direct_messaging.block_cache` (messaging LLD §3.5), maintained here independently — each module owns its own schema and subscribes to the same events. Used for block-silence (§7).

```sql
create table user_notifications.block_cache (
  blocker_id uuid not null,
  blocked_id uuid not null,
  created_at timestamptz not null,
  primary key (blocker_id, blocked_id)
);
create index notif_block_blocked_idx on user_notifications.block_cache (blocked_id);
```

---

## 4. Event-to-notification mapping (FR-NOTIF-01)

Every domain event in `event-catalog.md` §2 that lists `user-notifications` as a subscriber maps to exactly one notification category. Channels follow the FR-NOTIF-01 table; **push (`*`) is S-priority, email + in-app are the M baseline.**

### 4.1 Mapping table

| Source event (catalog §2) | Category | Default channel(s) | Opt-out-able? (FR-NOTIF-02) | Batches? |
|---|---|---|---|---|
| `MessageSent` | `new_message` | push* / email-if-unread-after-delay / in-app | **Yes** | **Yes** (§5) |
| `VerificationDecided` | `identity_outcome` | email + in-app | No (account-status outcome) | No |
| `AvailabilityExpiryWarned` | `availability_expiry_warning` | push* / in-app | **Yes** | No |
| `ReviewSubmitted` | `review_received` | email + in-app (S) | **Yes** | No |
| `ReportFiled` | `report_receipt` (to the reporter) | in-app | No (receipt confirmation) | No |
| `ReportResolved` | `report_resolution` (S) | in-app (+ email S) | **Yes** | No |
| `ModerationActionTaken` | `moderation_outcome` (to affected party, **with reason**) | email + in-app | **No** (moderation — always delivered) | No |
| `PaymentSucceeded` / `PaymentFailed` | `billing_payment` | email + in-app | **No** (billing) | No |
| `GraceEntered` | `billing_grace` (dunning) | email + in-app | **No** (billing) | No |
| `ListingLapsed` | `billing_unpublished` (unpublished for non-payment) | email + in-app | **No** (billing) | No |
| `TrialStarted` | *(no immediate dispatch)* | — | — | — |
| `UserRegistered` | `account_welcome` (S) | email (S) | Yes | No |

**Notes:**
- `TrialStarted` triggers **no immediate notification**. The "trial ending soon" reminder is driven by the **daily billing/dunning job** re-reading subscription state (`trialEndsAt`) per event-catalog §2's `TrialStarted` row and SR-APP-10 — not by this event. When that job decides a reminder is due it publishes/triggers a `billing_trial_ending` notification (essential, email + in-app). Listed for completeness; the trigger is the scheduled job, not the event.
- `AvailabilityExpired` does **not** notify — the renewal prompt was already sent on `AvailabilityExpiryWarned` (event-catalog §2, `AvailabilityExpired` row).

### 4.2 Essential-category dispatch path

For categories marked **opt-out-able = No**, the dispatcher **never reads `notification_preference`** — the row cannot exist (§3.1), and the code path branches on a compile-time `ESSENTIAL_CATEGORIES` set so "always delivered" is structural, not a runtime lookup that could regress (FR-NOTIF-02: "silence noise without being able to silence consequences").

### 4.3 Catalog correction — `ListingLapsed`

The catalog's `ListingLapsed` row previously listed subscribers `provider-profile`, `discovery-search` only, but FR-NOTIF-01 requires an "unpublished-for-non-payment" notice to the provider. This LLD **adds `user-notifications` as a subscriber of `ListingLapsed` in `event-catalog.md` §2** (the module is the authoritative owner of "does this event notify anyone", per the authoring brief). Idempotency: processed-ledger.

---

## 5. Batching algorithm (FR-NOTIF-03) & the unread-email-delay rule (FR-NOTIF-01)

Only `new_message` bursts in V1. Constants are LLD-level config (flagged §10):
- `N = user-notifications.batch_window_minutes`, default **5**.
- `emailUnreadDelay = user-notifications.email_unread_delay_minutes`, default **5** (equal to `N`, so the unread check and the batch flush coincide — one tick handles both).

### 5.1 On a `MessageSent`-derived eligibility check (per recipient)

Let `recipient` = the thread's other participant; `source_key` = `senderId` (FR-NOTIF-03 "from X"). In one transaction:

1. **Block silence & preference gate first** (§7): if a `block_cache` row exists either direction, or the recipient has disabled `new_message` on all channels → record nothing, stop.
2. **Upsert the window** keyed `(recipient, 'new_message', senderId)`:
   - If **no open window**: insert one (`opened_at = now`, `flush_after = now + N`, `message_count = 1`, `last_message_id = messageId`). Fire the **timely channels immediately** for this first message — **push** and **in-app** (a single nudge now; the user shouldn't wait 5 minutes to learn someone messaged). Do **not** send email yet.
   - If an **open window exists**: `message_count += 1`, `last_message_id = messageId`. Send **nothing** now — the burst is being collapsed. The `flush_after` is **not extended** (a fixed window from the first message), so continuous chatter still flushes on schedule rather than deferring forever.

### 5.2 Flush tick (worker, every minute — SR-APP-10 cadence)

For each `open` window with `flush_after ≤ now`:

- **In-app**: if `message_count ≥ 2`, update the already-created in-app row's copy to the collapsed form — *"N new messages from {senderName}"* (FR-NOTIF-03). If `message_count = 1`, the single-message in-app row already created at §5.1 stands.
- **Email**: send **one** email **iff** (a) the recipient's `new_message` email preference is enabled, **and** (b) the batched messages are **still unread** at flush time — checked via `direct-messaging`'s facade (are messages up to `last_message_id` still unread by the recipient?). If the recipient already read the thread (they were online, saw the live message, FR-NOTIF-01 "email if unread after a delay"), **suppress the email** — it would be redundant noise. Copy: *"You have {N} new message(s) from {senderName}"* deep-linking to the thread.
- Mark the window `status = 'flushed'`. A later message from the same source opens a fresh window.

This gives: an instant in-app/push nudge, a burst collapsed into one, and email only as a fallback for messages the recipient genuinely missed.

---

## 6. Channel adapters (ports & failure isolation)

Each channel is a **port** defined in `app/ports.ts`, with one real adapter and one fake (clean-code §6). Dispatch to each channel is a **separate fire-and-forget pg-boss job** (one job per `(notification, channel)`), enqueued by the event subscriber — **never inline in the request path** (SR-APP-07, HLD §7.2). A provider outage fails only its own job (retried with pg-boss backoff, then dead-lettered + alerted, shared-kernel §6.3); it cannot block another channel or the user action that produced the event.

| Channel | Port | Real adapter | Priority | Failure isolation & notes |
|---|---|---|---|---|
| Email | `EmailSender` | `SesEmailSender` (Amazon SES, HLD-DEC-12) via `safeFetch` with SES `allowedHosts` + timeout (shared-kernel §11) | M | Async, queued, retried with backoff (SR-INT-01). Bounces/complaints captured for SR-OBS-04. SPF/DKIM/DMARC on the sending domain. |
| Web push | `WebPushSender` | `VapidWebPushSender` (standard VAPID, SR-INT-05) | **S** | Per-subscription send; a `404/410` from the push service prunes the `push_subscription` row. Push failure **silently falls back** to the email/in-app baseline (SR-INT-05) — never surfaced to the user. |
| In-app | `InAppSink` | `PgInAppSink` (writes a `notification_log` row, `channel='in_app'`) | M | A DB write in the same store as the log; surfaced in app chrome with read-state (§8). The most reliable channel — the baseline everything degrades to. |
| ~~SMS~~ | — | — | — | **Not a notification channel** (§2). SMS is OTP-only (SR-INT-02). |

Every dispatch, on completion, writes/updates its `notification_log` row (`status = sent | failed`, `dispatched_at`) and publishes `NotificationDispatched` (§9) for delivery-health metrics.

---

## 7. Block-silence enforcement (FR-NOTIF-03)

**Decision — local `user_notifications.block_cache` mirror, consistent with `direct-messaging`.** Both modules face the identical problem ("is there a block between these two users?") on a hot-ish async path, and the authoring brief requires a consistent approach. Notifications mirrors `trust_and_safety.block` into `user_notifications.block_cache`, refreshed by `UserBlocked` (insert) / `UserUnblocked` (delete) subscribers (§9.2), and checks it **before dispatching any actor-attributed notification** (currently `new_message`, `review_received`) — if a block exists in either direction between the actor and the recipient, **zero notifications are produced** (FR-NOTIF-03).

The check lives at the **single dispatch-eligibility chokepoint** (§5.1 step 1 and the generic dispatcher), not scattered per channel — one gate, all channels silenced together. `trust-and-safety` remains system-of-record; this mirror is a read cache (same eventual-consistency acceptance as messaging LLD §3.5). Note that `direct-messaging` already blocks message *creation* between blocked parties, so `new_message` block-silence is defense-in-depth; it is load-bearing for other actor-attributed categories (e.g. a review left before a block).

---

## 8. API contract

api-conventions envelope §3, `UseCaseError`→HTTP §3.3, cursor pagination §4. All routes `requiredRole` ≥ `seeker`/`provider` (authenticated); every handler enforces `requireOwnership(user_id)` — a user reads/edits only their own preferences and in-app inbox (shared-kernel §8).

| Method / path | Purpose | Notes |
|---|---|---|
| `GET /api/notifications/preferences` | Return the caller's per-category/per-channel preferences | Essential categories are returned as **read-only, always-on** (rendered but not togglable) so the UI can explain "always delivered" (FR-NOTIF-02) |
| `PUT /api/notifications/preferences` | Update non-essential preferences. Body `{ category, channel, enabled }[]` | Attempting to toggle an essential category → `VALIDATION_FAILED` (422). Upserts `notification_preference`. |
| `GET /api/notifications/in-app?cursor=&limit=` | List in-app notifications, `created_at desc` | Cursor-paginated (api-conventions §4); `limit` default 20, max 50. Serializer emits `title/body/deepLinkPath/readAt` — never a raw message body (§7) |
| `POST /api/notifications/in-app/read` | Mark in-app notifications read. Body `{ upToId }` or `{ ids: [...] }` | Sets `read_at = now`; idempotent |
| `GET /api/notifications/push/vapid-public-key` | Return the server VAPID public key | Public key only; the private key is a secret (SR-SEC-07), never served |
| `POST /api/notifications/push/subscribe` | Register a browser push subscription. Body `{ endpoint, keys: { p256dh, auth } }` | Upsert on `endpoint`; ties to `user_id` |
| `DELETE /api/notifications/push/subscribe` | Remove a push subscription. Body `{ endpoint }` | Idempotent |

No dedicated rate-limit buckets — these are low-frequency, session-authenticated, ownership-scoped routes (security-implementation §5.2 defines no `user-notifications` bucket; none is warranted).

Facade (public `index.ts`): `exportFor(userId)` returns the subject's preferences and in-app notification log (title/body/deep-link), never push endpoint keys (SR-DATA-07; platform-configuration LLD §9).

---

## 9. Domain events

### 9.1 Published — `NotificationDispatched`

**Appended to `event-catalog.md` §2 by this LLD** (HLD §6.1 names it as published by `user-notifications`; it was absent from the catalog registry).

| Field | Value |
|---|---|
| Name / version | `NotificationDispatched` / `1` |
| Publisher | `user-notifications` |
| Trigger | A channel dispatch completes (transition to `sent` or `failed`) |
| Payload (IDs/facts only) | `notificationId, userId, category, channel, status` |
| Subscribers | — (terminal; consumed as **delivery-health metrics** per SR-OBS-04 — email/push/in-app success/failure rates. No domain reaction) |
| Idempotency | natural key (`notificationId` + `channel`) |

Rationale: SR-OBS-04 requires tracking push/email delivery health ("silent notification loss is an availability defect"). Emitting `NotificationDispatched` at the dispatch chokepoint feeds those metrics uniformly (delivery health is derived from these facts in Grafana, HLD-DEC-08), and leaves a durable hook for any future subscriber without coupling one now.

### 9.2 Subscribed — full cross-reference against `event-catalog.md` §2

Notifications should subscribe to **every event with a "notify the affected user" component**. Verified against the catalog:

| Event | Category (→ §4) | Idempotency | Catalog status |
|---|---|---|---|
| `MessageSent` | `new_message` (batched) | natural key (`messageId`) | listed ✓ |
| `VerificationDecided` | `identity_outcome` | processed-ledger | listed ✓ |
| `AvailabilityExpiryWarned` | `availability_expiry_warning` | processed-ledger | listed ✓ |
| `ReviewSubmitted` | `review_received` (S) | natural key | listed ✓ |
| `ReportFiled` | `report_receipt` | natural key | listed ✓ |
| `ReportResolved` | `report_resolution` (S) | processed-ledger | listed ✓ |
| `ModerationActionTaken` | `moderation_outcome` | processed-ledger | listed ✓ |
| `PaymentSucceeded` / `PaymentFailed` | `billing_payment` | processed-ledger | listed ✓ |
| `GraceEntered` | `billing_grace` | natural key | listed ✓ |
| `ListingLapsed` | `billing_unpublished` | processed-ledger | **catalog corrected — notifications added as subscriber (§4.3)** |
| `UserRegistered` | `account_welcome` (S) | natural key | listed ✓ |
| `UserBlocked` / `UserUnblocked` | *(no notification — maintains `block_cache`, §7)* | natural key | `UserBlocked` listed for `direct-messaging`/`discovery-search`; `UserUnblocked` appended by messaging LLD — notifications also subscribes for `block_cache` |

Handlers are registered in `user-notifications/infra/subscriptions.ts`; those with a non-idempotent side effect (an actual send) use the processed-event ledger (`shared.processed_events`, subscriber-scoped) so a redelivered event never double-notifies (shared-kernel §6.4, SR-APP-12).

> `UserUnblocked` and `NotificationDispatched` are new catalog rows (appended); `ListingLapsed` gains `user-notifications` as a subscriber (row correction). All three edits are within the authoring brief's permitted catalog appends/corrections.

---

## 10. Open questions & assumptions

| # | Item | Disposition |
|---|---|---|
| 1 | **Batch window `N` = 5 min** and **email-unread delay = 5 min** are LLD assumptions (FR-NOTIF-01/03 say "quick succession" / "after a delay" without numbers). | Config keys `user-notifications.batch_window_minutes` / `user-notifications.email_unread_delay_minutes`, admin-tunable per SR-APP-11. Equal by default so one flush tick handles both. |
| 2 | **`identity_outcome` and `report_receipt` classified as essential (non-opt-out-able).** FR-NOTIF-02 names only billing/security/moderation as always-delivered. | LLD decision: an identity-verification result and a report-receipt confirmation are account-status facts the user must receive; classified essential. Reversible if product wants them opt-out-able. Flagged. |
| 3 | **`NotificationDispatched`** appended to catalog with no domain subscriber (metrics-only). | If a future feature needs to react (e.g. re-try orchestration), add a subscriber then — additive (api-conventions §7). |
| 4 | **`billing_trial_ending`** is triggered by the daily billing job, not by `TrialStarted` (§4.1). | Consistent with event-catalog §2's `TrialStarted` note; the billing LLD (09) owns that job's trigger. Coordination item. |
| 5 | **`ListingLapsed` subscriber correction** and **`UserUnblocked` dependency** require the owning modules (`listing-billing` 09 / `trust-and-safety` 07) to be aware. | Flagged for the team lead; catalog rows updated so the contract is visible to those authors. |
| 6 | **In-app is the guaranteed-delivery baseline**; if a user has push disabled/unsubscribed and email suppressed (read-in-time), only the in-app row exists. | Intended (FR-NOTIF-01 makes in-app the M baseline alongside email). No further fallback needed. |
