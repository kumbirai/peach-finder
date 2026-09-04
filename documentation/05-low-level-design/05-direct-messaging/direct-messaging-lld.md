---
title: Peach Finder — LLD — Messaging Module
updated: 2026-08-20
---

# Messaging — Low-Level Design

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Low-Level Design — `direct-messaging` module (`src/lib/server/modules/direct-messaging/`, schema `direct_messaging`) |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | `01-frs` §8 (MSG), §16 (PRIV); `02-srs` §5 (SR-APP-05/06), §8 (SR-PERF-04); `04-hld` §6.1, HLD-DEC-06, §7.2; `04-clean-code-guidelines` §12 (`direct-messaging` row) |
| Foundations (mandatory) | `00-foundations/shared-kernel.md`, `00-foundations/api-conventions.md` (esp. §10 WS), `00-foundations/event-catalog.md`, `00-foundations/security-implementation.md` §5.2 |
| Delivers FRS | FR-MSG-01..09 (10 = W-guard); supports FR-PROF-06 (online status), FR-ACC-07 (deleted-account display), FR-REV-01 (eligibility facade) |
| Status | Living document — updated in place |

**What this module is.** Messaging is the endpoint of the golden path (user-stories §19.1): a seeker and provider arrange a time inside a thread, with the platform supplying **speed and safety but never structure** (FR-MSG-03). It owns threads, messages, delivery/read state, the presence heartbeat (and the coarse last-seen coarsening exposed to `provider-profile`, shared-kernel §12), and provider response-time statistics.

This document **extends, and never contradicts, `api-conventions.md` §10** — messaging is the primary implementer of the WebSocket protocol defined there.

---

## 2. Module purpose & scope

| In scope | Requirement |
|---|---|
| One persistent thread per seeker–provider pair, created on first message | FR-MSG-01 |
| Near-real-time text delivery with sent/delivered/read state | FR-MSG-02, SR-APP-05, SR-PERF-04 |
| No structure on booking arrangements (no slots/states/confirmations) | FR-MSG-03 (W-guard) |
| Thread list per role, latest-activity order, unread counts | FR-MSG-06 |
| Presence heartbeat + coarse online/last-seen facade | FR-PROF-06, SR-APP-06 |
| Response-time computation (first reply to new threads) | FR-MSG-08 |
| Report/block entry points surfaced; block enforcement | FR-MSG-05, FR-TRUST-08 |
| Deleted-account thread display | FR-ACC-07 |

| Explicitly NOT this module | Owner |
|---|---|
| Report/block **actions** (create report, create block) | `trust-and-safety` (07) — messaging surfaces the entry points and enforces the resulting block |
| New-message **notifications** (email/push/in-app, batching, delay) | `user-notifications` (11) — messaging only publishes `MessageSent` |
| Booking calendar / slot system / conflict tracking | nobody — deliberately absent (FR-MSG-03, FR-AVAIL-08) |
| Voice/video, in-thread payments, booking-confirmation flows | nobody — FR-MSG-10 (W) |

**Binding module rules** (clean-code §12, `direct-messaging` row), each realized below and cited at its mechanism:
1. **Message bodies never appear in logs or in outbox event payloads** — IDs only. (§4.4, §9)
2. **Presence coarsening happens in the facade** — a raw `Instant` never leaves the module. (§5)
3. **Block checks live in queries, not post-filtering.** (§7)

---

## 3. Data model — schema `direct_messaging`

All IDs are branded UUIDv7 (shared-kernel §2); all timestamps `timestamptz` UTC (shared-kernel §4). Cross-schema FKs are permitted **only** onto `identity_and_access.user(id)` (shared-kernel §10); `provider_profile_id` is a plain UUID resolved through `provider-profile`'s facade at read time.

### 3.1 `thread`

```sql
create table direct_messaging.thread (
  id                  uuid primary key,
  seeker_id           uuid not null references identity_and_access."user"(id),
  provider_profile_id uuid not null,               -- provider_profile.provider_profile(id); no FK (cross-module)
  created_at          timestamptz not null,        -- anchor for response-time (§6); = first seeker message sent_at
  last_activity_at    timestamptz not null,        -- bumped on every message; drives thread-list order
  unique (seeker_id, provider_profile_id)          -- FR-MSG-01: exactly one thread per pair
);
-- Thread lists (FR-MSG-06), one index per role's viewing axis, newest-activity first:
create index thread_seeker_activity_idx   on direct_messaging.thread (seeker_id, last_activity_at desc);
create index thread_provider_activity_idx on direct_messaging.thread (provider_profile_id, last_activity_at desc);
```

The `unique (seeker_id, provider_profile_id)` constraint makes "start a thread" idempotent at the database level (§8.1): a concurrent double-tap resolves to one thread via `ON CONFLICT`.

### 3.2 `message`

```sql
create table direct_messaging.message (
  id                        uuid primary key,
  thread_id                 uuid not null references direct_messaging.thread(id),
  sender_id                 uuid not null references identity_and_access."user"(id),
  body                      text not null,              -- length-capped in the domain (≤ 4000 chars, LLD assumption §10)
  sent_at                   timestamptz not null,
  delivered_at              timestamptz,                -- set when recipient's client acks WS push or fetches via poll
  read_at                   timestamptz,                -- set when the counterpart marks read (§8.4)
  is_deleted_sender_account boolean not null default false  -- FR-ACC-07: sender deleted their account
);
create index message_thread_sent_idx   on direct_messaging.message (thread_id, sent_at);
create index message_unread_idx         on direct_messaging.message (thread_id) where read_at is null;   -- unread-count hot path
create index message_sender_sent_idx    on direct_messaging.message (sender_id, sent_at desc);           -- response-time job (§6) + presence fallback (§5)
```

Each message has exactly **one recipient** — the thread participant who is not `sender_id` — so `read_at`/`delivered_at` are unambiguous (they are the recipient's read/delivery time). Unread count for a viewer `u` = messages in `u`'s threads where `sender_id <> u` and `read_at is null`.

`is_deleted_sender_account` is a **denormalized flag**, not a fetch through `identity-and-access`: a thread renders many messages and the header must show "Deleted account" without an `identity-and-access` facade round-trip per row on the message-list hot path (SR-PERF-04). It is set by the `AccountDeletionRequested` subscriber (§9.2).

### 3.3 `presence` (unlogged)

```sql
create unlogged table direct_messaging.presence (   -- HLD §8: presence heartbeats are unlogged; crash-loss acceptable
  user_id           uuid primary key references identity_and_access."user"(id),
  last_heartbeat_at timestamptz not null
);
```

Unlogged (HLD-DEC-04): no WAL cost, excluded from PITR/backups. Crash loss is acceptable — presence re-establishes on the next 30 s heartbeat (api-conventions §10.2). A cold row simply reads as "offline / a while ago" until the client's next heartbeat.

### 3.4 `response_time_stat` (materialized rollup)

```sql
create table direct_messaging.response_time_stat (
  provider_profile_id uuid primary key,        -- provider_profile.provider_profile(id); no FK
  bucket              text,                     -- 'within_30_min' | 'within_a_few_hours' | 'within_a_day' | null
  sample_count        integer not null default 0,
  computed_at         timestamptz not null
);
```

Rolled up by a daily job (§6.4), **never computed live per profile load** (FR-MSG-08; the profile page reads one indexed row). `bucket = null` means "not enough data — display no claim" (§6.3).

### 3.5 `block_cache` (local mirror of `trust_and_safety.block`)

```sql
create table direct_messaging.block_cache (
  blocker_id uuid not null,     -- identity_and_access.user(id); no FK (mirror, refreshed by events)
  blocked_id uuid not null,     -- identity_and_access.user(id)
  created_at timestamptz not null,
  primary key (blocker_id, blocked_id)
);
create index block_cache_blocked_idx on direct_messaging.block_cache (blocked_id);   -- reverse-direction lookup
```

**Decision — local denormalized mirror over query-time facade call.** Block enforcement is on the message **send** and **thread-read** hot paths, both inside the SR-PERF-04 ≤ 2 s p95 budget. Calling `trust-and-safety`'s facade on every send/read would add a synchronous cross-module round-trip to the hottest path in the module. Instead we mirror `trust_and_safety.block` into `direct_messaging.block_cache`, refreshed by the `UserBlocked` (insert) and `UserUnblocked` (delete) events (§9.2), and enforce blocks with a local indexed lookup that folds into the query (§7). The mirror is eventually consistent within the outbox dispatch bound; a block takes effect within seconds, which is well inside the product intent of "blocking immediately prevents further messages" for the realistic case (the blocked party is not mid-keystroke at the microsecond the block lands), and messaging additionally re-checks on send so a just-arrived block is honored on the next attempt. `trust-and-safety` remains the sole **system of record**; this is a read-optimization cache only.

> **Coordination note:** `UserUnblocked` is **appended to `event-catalog.md` §2 by this LLD** (publisher `trust-and-safety`, subscribers `direct-messaging` + `discovery-search`) — the catalog previously registered only `UserBlocked`, but FR-TRUST-08 requires undo, and both `direct-messaging` (`block_cache`) and `discovery-search` (result exclusion) need the removal signal for correctness. `trust-and-safety` (07) owns the publisher side. See §10 open items.

---

## 4. WebSocket protocol extension

Messaging is the primary consumer of the single `/ws` endpoint (api-conventions §10). Envelope, connection lifecycle, heartbeat cadence (30 s), reconnect backoff (1/2/4/8 s → cap 30 s, jittered), and the polling-fallback trigger (3 failed reconnects → `GET …/poll` every 4 s) are **defined in api-conventions §10 and not restated here**. This section registers only messaging's own message types and the send flow.

### 4.1 Message types (registered in `event-catalog.md` §6)

| `type` | Direction | Payload | Notes |
|---|---|---|---|
| `presence.heartbeat` | client→server | `{}` | Updates `direct_messaging.presence.last_heartbeat_at` (§5). Already registered. |
| `message.sent` | server→client (to **recipient**) | `{ threadId, messageId, senderId, bodyPreview, sentAt }` | `bodyPreview` = first ≤ 140 chars of the body — see §4.4. Already registered. |
| `message.delivered` | server→client (to **sender**) | `{ threadId, messageId, deliveredAt }` | **Appended to §6 by this LLD.** Fires when the recipient's client acks `message.sent` or fetches via poll; updates the sender's "sent → delivered" indicator (FR-MSG-02). |
| `message.read` | server→client (to **sender**) | `{ threadId, messageId, readerId }` | Direct WS push, **not** an outbox event (§9.1). Already registered. |
| `thread.typing` | client→server, server→client (relayed to the other participant) | `{ threadId }` | Ephemeral; never persisted. Already registered. |

`error` (`{ code, message }`, connection-level only) and `connected` (`{ sessionId }`) are shared lifecycle types owned by the connection layer (api-conventions §10.2), not messaging.

### 4.2 Send-message flow (extends HLD §7.2)

```mermaid
sequenceDiagram
    participant S as Seeker/Provider (sender browser)
    participant W as web (API + WS hub)
    participant PG as PostgreSQL
    participant WK as worker (outbox dispatch)
    participant R as Recipient (browser)

    S->>W: POST /api/messaging/threads/:id/messages (Zod-validated, rate-limited message_send)
    W->>W: participant + block check (block_cache) → else BLOCKED / THREAD_NOT_FOUND
    W->>PG: TX { insert message; update thread.last_activity_at; publish outbox(MessageSent = IDs only) }
    PG-->>W: commit
    W-->>S: 200 { message } + optimistic render already shown
    alt recipient has a live WS connection
        W->>R: WS message.sent { …, bodyPreview }   (post-commit, same request — SR-PERF-04 ≤ 2s p95)
        R-->>W: client ack
        W->>PG: set message.delivered_at
        W->>S: WS message.delivered { messageId, deliveredAt }
    else recipient offline / no socket
        Note over R: recipient's next GET /threads/:id/poll?since=<cursor> returns the message;<br/>handler sets delivered_at and the poll response carries the same body
    end
    WK->>PG: outbox dispatch → notifications (new-message fan-out, FR-NOTIF-01)
    Note over WK: notifications owns batching, unread-delay email, block silence — NOT messaging
```

The WS push and the poll response are **thin adapters over the same `direct-messaging` query** (api-conventions §10.2 point 6) — delivery correctness never depends on which transport the recipient is using.

### 4.3 Delivery/read state machine (per message, from the recipient's side)

`sent` (persisted) → `delivered` (recipient client received it, via WS ack or poll fetch → `delivered_at`) → `read` (recipient marked the thread read past this message → `read_at`, §8.4). States are monotonic and set-once; a later transition never regresses an earlier timestamp.

### 4.4 Body-in-payload vs body-in-log — the critical distinction

- **Outbox `MessageSent` payload carries IDs only** (`threadId`, `messageId`, `senderId`) — never the body (clean-code §12; shared-kernel §6.1 "IDs + immutable facts, never entity snapshots"). `user-notifications` fetches whatever preview it needs through the messaging facade at dispatch time.
- **Logs never contain message bodies** (SR-OBS-05, clean-code §9) — the log serializer allowlist excludes `body` and `bodyPreview`.
- **The `message.sent` WS frame carries a `bodyPreview` to the recipient's own client.** This is **not a log and not an event** — it is the *actual delivery of the message to its intended recipient* over an authenticated, origin-checked socket that only that recipient holds (api-conventions §10.2 point 2). Delivering a message to the person it was sent to is the product working, not a privacy leak. The preview is a length cap (≤ 140 chars) for payload economy, not a redaction; the recipient fetches the full body via the thread query on render.

---

## 5. Presence & online-status facade (SR-APP-06, FR-PROF-06)

Presence is exposed to other modules (only `provider-profile`, for the profile's online status per FR-PROF-06) through **one facade method that returns a coarse bucket — never an `Instant`** (shared-kernel §12; clean-code §12 "raw timestamps never leave the module").

```typescript
// direct-messaging/index.ts (public facade)
export type PresenceBucket = 'online' | 'today' | 'this_week' | 'a_while_ago';
export type ResponseTimeBucket = 'within_30_min' | 'within_a_few_hours' | 'within_a_day';
export function getPresence(userId: UserId, now: Instant): Promise<PresenceBucket>;
export function getResponseTime(providerProfileId: ProviderProfileId): Promise<ResponseTimeBucket | null>;
export function hasEligibleThread(seekerId: UserId, providerProfileId: ProviderProfileId, now: Instant): Promise<boolean>; // FR-REV-01: thread ≥ 24 h
export function getThreadForReport(threadId: ThreadId): Promise<{ threadId: ThreadId; participantIds: UserId[] } | null>;
export function hasSentSince(userId: UserId, since: Instant): Promise<boolean>; // trust active-this-week; never a raw Instant
export function exportFor(userId: UserId): Promise<object>; // SR-DATA-07: threads the user is in + message bodies they already saw; counterpart = userId + displayName only
```

### 5.1 Heartbeat mechanism

- Client sends `presence.heartbeat` every **30 s** while a socket is open (api-conventions §10.2 point 4).
- Server `upsert`s `direct_messaging.presence (user_id, last_heartbeat_at = now)`.
- **Message send also refreshes presence** (`last_heartbeat_at = now` in the same request) so a user actively typing but between heartbeats reads as online.

### 5.2 Online window — exact boundary

`online` iff `now − last_heartbeat_at ≤ 90 s`.

This reconciles with api-conventions §10.2 point 4 ("missing 2 consecutive heartbeats ⇒ offline"): at a 30 s cadence, two consecutive misses plus jitter tolerance is a 90 s silence window. One dropped heartbeat (network blip) does not flip a live user offline; two does.

### 5.3 Coarse last-seen buckets — exact boundaries

When not `online`, the bucket is computed from `lastSeen = GREATEST(presence.last_heartbeat_at, latest direct_messaging.message.sent_at where sender_id = userId)` — the second term is a single indexed lookup (`message_sender_sent_idx`) covering a user who was active but whose socket has since closed. All comparisons are in the platform operating timezone `platform-configuration.getConfig('platform-configuration.operating_timezone')` (default `Africa/Johannesburg`, shared-kernel §4, SR-APP-09):

| Bucket | Condition (evaluated most-specific-first) |
|---|---|
| `online` | `now − lastSeen ≤ 90 s` |
| `today` | not online, and `lastSeen` falls on the **same operating-tz calendar date** as `now` |
| `this_week` | not today, and `lastSeen ≥ start of the current operating-tz calendar week` (week begins Monday) |
| `a_while_ago` | `lastSeen` before the start of the current calendar week, or no presence/message record at all |

**No API anywhere returns a raw last-seen timestamp** (SR-APP-06, FR-PROF-06 "never exact timestamps, to avoid enabling monitoring of an individual's routine"). The facade signature makes this structural: its return type is `PresenceBucket`, so there is no code path by which an `Instant` reaches `provider-profile` or the wire.

---

## 6. Response-time computation (FR-MSG-08)

Displayed on the profile as an honest bucket: *"usually replies within 30 minutes / within a few hours / within a day"*, or nothing at all when data is thin.

### 6.1 "First reply to a new inbound thread" — resolved definition

FR-MSG-08: *"Only first replies to new inbound threads count — ongoing chatter does not."* Resolved precisely:

- A **new inbound thread** is a `direct_messaging.thread` — thread creation is triggered by the seeker's first message (FR-MSG-01), so `thread.created_at` is the seeker's opening timestamp.
- A **sample** for a provider = `(sent_at of the provider's first message in that thread) − thread.created_at`, computed for each thread created **within the trailing window** where the provider did reply.
- Exactly **one sample per thread** (the first provider reply). All later provider messages in the thread are "ongoing chatter" and are excluded.
- Threads where the provider has **not yet replied** contribute **no sample** (not an infinite/penalty sample). *Known bias, flagged §10:* a provider who answers some enquiries quickly and ignores the rest looks fast; FR-MSG-08 defines the metric as first-reply latency, so we follow the spec and flag the bias for post-launch review.

### 6.2 Window & configuration

Trailing window is **config-driven**, key `direct-messaging.response_time_window_days`, default **30** (FR-MSG-08; admin-editable per FR-ADM-06, effective without deploy per SR-APP-11, read via `platform-configuration.getConfig`). Only threads with `created_at ≥ now − window` are considered.

### 6.3 Statistic, buckets, and minimum sample count

- The representative statistic is the **median** first-reply latency over the samples in-window (median, not mean, to resist a single outlier reply).
- **Minimum sample count = 3** before any claim displays (LLD-level assumption — FR-MSG-08 mandates "too little data → no claim" but does not fix a number; 3 mirrors the FR-REV-05 "highly rated" floor for consistency, and is flagged §10). Below 3 samples: `bucket = null`, profile shows no response-time claim.
- Bucket thresholds on the median `m`:

| Median first-reply latency `m` | `bucket` |
|---|---|
| `m ≤ 30 min` | `within_30_min` |
| `30 min < m ≤ 6 h` | `within_a_few_hours` |
| `6 h < m ≤ 24 h` | `within_a_day` |
| `m > 24 h` | `null` — no claim (an honest "no data-worthy speed" rather than a "within a week" that reads as a demerit, consistent with FR-AVAIL-05's "absence of a signal is neutral") |

### 6.4 Scheduled job — daily

Response-time is recomputed by a **daily** worker job (pg-boss cron, SR-APP-10), writing one `response_time_stat` row per provider with ≥ 1 in-window thread. **Daily, not hourly:** the output buckets are coarse (30 min / hours / day), so up to 24 h of staleness is invisible in the rendered claim; a daily pass over a 30-day window at 2,000-provider scale (SR-CAP-01) is trivial and keeps the worker's minute-cadence tick free for latency-sensitive sweeps (availability). The job is idempotent (full recompute per provider, natural-key upsert on `provider_profile_id`), logs a completion summary, and pings its healthchecks.io check (clean-code §9).

> **SRS note:** the SR-APP-10 job table does not currently list a response-time job — this messaging-owned daily job should be added to that table. Flagged §10 (cannot edit SRS from this LLD).

---

## 7. Report / block reachability & enforcement (FR-MSG-05, FR-TRUST-08)

- **Report and block *actions* are owned by `trust-and-safety`** (07). Messaging surfaces the **entry points** in the thread header — the API exposes the thread's counterpart identity so the client can render "Report" and "Block" reaching `trust-and-safety`'s endpoints in ≤ 2 taps (FR-MSG-05, NFR BRD §8). Messaging writes no report and creates no block.
- **Block *enforcement* is messaging's job.** Every thread-scoped query and the send handler apply a block filter **inside the SQL/handler, not as a post-filter** (clean-code §12):
  - **Send** (`POST …/messages`, `POST /threads`): reject if a `block_cache` row exists in **either direction** between the two participants → `BLOCKED` (see §8.5 error mapping).
  - **Thread read / list**: a blocked counterpart's thread is treated as non-existent for the blocked party per anti-enumeration — see §8.5 (`THREAD_NOT_FOUND`, 404).
- `block_cache` is refreshed by the `UserBlocked`/`UserUnblocked` subscribers (§9.2). Blocking is **silent** (FR-TRUST-08) — messaging emits no notification and no WS frame to either party on a block; the block simply begins failing/altering subsequent requests.

---

## 8. API contract

All routes follow api-conventions: envelope §3, `UseCaseError`→HTTP §3.3, cursor pagination §4, rate-limit contract §6, per-role serializers §11. Auth is resolved once by the server hook (security-implementation §2); every route below declares `requiredRole` and every handler additionally enforces **participant ownership** (`ctx` must be the thread's seeker or the owner of its `provider_profile_id`) — ownership is application-layer, never hook-level (shared-kernel §8, clean-code §5).

### 8.1 Endpoints

| Method / path | Role | Purpose | Rate-limit bucket (security-impl §5.2) |
|---|---|---|---|
| `POST /api/messaging/threads` | seeker | Start-or-reopen thread with a provider and post the first message. Body `{ providerProfileId, body, serviceContext? }`. Idempotent on `unique(seeker_id, provider_profile_id)` via `ON CONFLICT` — a re-tap reopens the existing thread and appends (US-MSG-01). | `thread_create` (account, 1 h, **20**) **and** `message_send` |
| `POST /api/messaging/threads/:threadId/messages` | seeker \| provider (participant) | Send a message in an existing thread. Body `{ body }`. | `message_send` (account, 1 min, **30**) |
| `GET /api/messaging/threads?cursor=&limit=` | seeker \| provider | Thread list for the caller's role, `last_activity_at desc`, each item carrying counterpart display, last-message preview, unread count. `limit` default 20, max 50. | — |
| `GET /api/messaging/threads/:threadId/messages?cursor=&limit=` | participant | Message history, `sent_at` order, cursor-paginated. `limit` default 30, max 50. | — |
| `POST /api/messaging/threads/:threadId/read` | participant | Mark read up to a message. Body `{ upToMessageId }`. Pushes `message.read` to the sender. | — |
| `GET /api/messaging/threads/:threadId/poll?since=<cursor>` | participant | **Polling fallback** (api-conventions §10.2 point 6): returns messages after `since`, plus delivery/read deltas; sets `delivered_at` on returned inbound messages as a side effect (mirrors the WS ack path, §4.2). | `search_query`-class N/A — polled at 4 s, no dedicated bucket; participant-scoped |

Presence is **not** an HTTP route — `provider-profile` obtains online status via the in-process facade `getPresence(userId, now)` (§5). `thread.typing`, `message.sent`, `message.delivered`, `message.read` are WS-only (§4.1).

### 8.2 Request validation

Zod schemas colocated with each route, named `<Verb><Noun>RequestSchema` (shared-kernel §9): `CreateThreadRequestSchema`, `SendMessageRequestSchema`, `MarkReadRequestSchema`. IDs parse via `zId<T>()`; `body` is `z.string().min(1).max(4000)` with a friendly `.message()`. The domain re-validates its own invariants (non-empty, cap) regardless (belt-and-braces, shared-kernel §9).

### 8.3 Serializers (server-side privacy shaping, api-conventions §11)

- `toThreadListItem(thread, viewer)` / `toMessageDTO(message, viewer)` / `toThreadDTO(...)` in `direct-messaging/infra/serializers.ts`.
- A message whose `is_deleted_sender_account = true` serializes the sender as `{ displayName: 'Deleted account' }` (FR-ACC-07) — the serializer never emits the deleted user's real identity, and never a raw presence `Instant` (§5).
- Counterpart identity/display is resolved through `provider-profile`/`identity-and-access` facades at list-build time and cached per response; message bodies are emitted only to participants (enforced by the ownership check upstream, not by the serializer).

### 8.4 Mark-read semantics

`POST …/read { upToMessageId }` sets `read_at = now` for messages in the thread where `sender_id <> caller AND read_at IS NULL AND sent_at ≤ (sent_at of upToMessageId)`, then pushes one `message.read { threadId, messageId, readerId }` to each affected sender's live socket (best-effort; a read state also surfaces on the sender's next poll). Idempotent: re-marking an already-read range is a no-op.

### 8.5 Error codes (event-catalog §5)

| Condition | Code | `UseCaseError.kind` → HTTP |
|---|---|---|
| Message to/from a blocked counterpart | `BLOCKED` | `forbidden` → 403 |
| Thread not owned by caller, non-existent, **or** blocked-and-hidden | `THREAD_NOT_FOUND` | `not_found` → **404** (anti-enumeration, SR-SEC-05 / api-conventions §3.3 / event-catalog §5 — a blocked or foreign thread returns 404, never 403, so existence is not probeable) |
| Rate limit exceeded | `RATE_LIMITED` | `rate_limited` → 429 + `Retry-After` |
| Body empty / over cap / bad ID | `VALIDATION_FAILED` | `validation_failed` → 422 (`fields` populated) |
| Sender's email unverified (FR-ACC-02 gate on first send) | `EMAIL_NOT_VERIFIED` | `forbidden`-class → 403 (raised via `identity-and-access` facade check; held messages release on `EmailVerified`, event-catalog §2) |

---

## 9. Domain events

### 9.1 Published

| Event | Outbox? | Payload (IDs/facts only) | Subscribers | Idempotency |
|---|---|---|---|---|
| `ThreadCreated` | **Yes** (outbox, in send-thread TX) | `threadId, seekerId, providerProfileId` | `provider-analytics` (contact-request, FR-ANLY-02) | natural key (`threadId`) |
| `MessageSent` | **Yes** (outbox, in send TX) | `threadId, messageId, senderId` | `user-notifications` (new-message fan-out) | natural key (`messageId`) |
| `MessageRead` | **No — direct WS push only** | `threadId, messageId, readerId` | none (no cross-module consumer) | n/a |

**`MessageRead` is not an outbox event.** It has no durable cross-module subscriber — the only consumer is the sender's live client, reached by a direct `message.read` WS frame (§4.1). Writing it to the outbox would add a durable row, a dispatch job, and a delivery guarantee for data whose entire value is ephemeral and best-effort (a read receipt the sender may never even have a socket open to receive). The read state itself **is** durably persisted (`message.read_at`, §8.4) and reconciles on the sender's next thread fetch/poll, so nothing is lost. This LLD **corrects the `MessageRead` row in `event-catalog.md` §2** to state "direct WS push, not an outbox event" explicitly (this module owns the row; the refinement is exactly the kind expected of the owning LLD).

> The `MessageSent` catalog row also notes an in-process "response-time calc" consumer. That is realized as the **daily batch job** (§6.4) reading the `thread`/`message` tables directly — **not** as a synchronous per-`MessageSent` subscriber. No per-event response-time handler exists; the daily recompute is simpler, idempotent, and avoids doing latency arithmetic on the send hot path.

### 9.2 Subscribed

| Event | Publisher | Handler action | Idempotency |
|---|---|---|---|
| `EmailVerified` | `identity-and-access` | Release any messages held pending email verification for that user (FR-ACC-02) | natural key |
| `AccountDeletionRequested` | `identity-and-access` | `UPDATE direct_messaging.message SET is_deleted_sender_account = true WHERE sender_id = :userId`; threads remain visible to the other party (FR-ACC-07) | processed-ledger (`shared.processed_events`, subscriber `direct-messaging.account_deletion`) |
| `UserBlocked` | `trust-and-safety` | `INSERT` mirror row into `direct_messaging.block_cache (blocker_id, blocked_id, created_at)` | natural key (PK upsert) |
| `UserUnblocked` | `trust-and-safety` | `DELETE FROM direct_messaging.block_cache WHERE blocker_id = :blockerId AND blocked_id = :blockedId` | natural key (delete is idempotent) |

All subscribers are registered in `direct-messaging/infra/subscriptions.ts`, each small and failure-isolated (clean-code §8). `AccountDeletionRequested` uses the processed-event ledger because the UPDATE is not naturally idempotent under the "mark once" intent and pairs with a durable side effect (shared-kernel §6.4).

### 9.3 Dormant-thread purge (FR-PRIV-04, SR-APP-10, SR-DATA-03)

A daily worker job deletes threads (and their messages) with `last_activity_at < now() - interval '24 months'` when **both** accounts still exist. Threads involving a deleted account follow FR-ACC-07 display rules until this job or the counterpart's own deletion. The job is idempotent, logged, and pings healthchecks.io. This is the SR-APP-10 "Dormant-thread purge (24 months)" row.

---

## 10. Open questions & assumptions

| # | Item | Disposition |
|---|---|---|
| 1 | **`UserUnblocked`** | **Closed:** catalog + `trust-and-safety` publish; this module and `discovery-search` consume. |
| 2 | **`message.delivered` WS type** | **Closed:** in event-catalog §6. |
| 3 | **Response-time job** | **Closed 2026-08-20:** listed in SRS SR-APP-10. |
| 4 | **Minimum response-time sample count = 3** and **message body cap = 4000 chars** | LLD-level assumptions (FRS fixes neither). Config-tunable if needed. |
| 5 | **Response-time bias**: providers who ignore some enquiries look fast | Accepted for V1 per FR-MSG-08; monitor post-launch. |
| 6 | **`block_cache` eventual consistency** | Accepted — `trust-and-safety` is system-of-record. |
| 7 | **Photo attachments** (FR-MSG-02, S) | Deferred to S delivery. |
