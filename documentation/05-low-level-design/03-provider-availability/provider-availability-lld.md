---
title: Peach Finder — LLD — Availability Module
updated: 2026-08-20
---

# Availability — Low-Level Design

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Low-Level Design — `provider-availability` module (`src/lib/server/modules/provider-availability/`, schema `provider_availability`) |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | FRS §5 (AVAIL); SRS SR-APP-04/09/10/11, SR-PERF-06; HLD §6.1 (`provider-availability` row), §7.5 (auto-expiry flow), §6.4/§6.5 (events); user-stories §11 (E8), §19.3 (state diagram); clean-code-guidelines §12 (`provider-availability` row) |
| Foundations (cited, not restated) | `00-foundations/shared-kernel.md` (IDs, `Result`, `Clock`, outbox, audit, schema-per-module), `00-foundations/api-conventions.md` (envelope, error mapping, rate-limit contract), `00-foundations/event-catalog.md` §2 (event rows), `00-foundations/security-implementation.md` §5.2 (rate buckets), §6 (config cache) |
| Downstream consumers | `discovery-search` (projection mirror of availability state), `trust-and-safety` (Active-this-week badge computation, consumes this module's activity facade), `user-notifications` (renewal-prompt on `AvailabilityExpiryWarned`) |
| Status | Living document — updated in place |

**What this module is:** the keeper of the product's principal signal (BRD §2). Its single job is to make "Available now" *trivially easy to set and impossible to leave stale* (user-stories §11). It owns one current-state row per provider plus an append-only history, a once-per-minute expiry sweep, a once-per-minute pre-expiry warning, and the raw activity signal that `trust-and-safety` turns into the "Active this week" badge. It publishes four events; it subscribes to none for its own writes (it is a pure command/sweep module).

---

## 2. Module purpose & scope

### 2.1 In scope

| Requirement | What this module delivers |
|---|---|
| FR-AVAIL-01 | Single-tap **set** "Available now"; timestamp recorded on every set/re-set |
| FR-AVAIL-02 | Single-tap **clear** |
| FR-AVAIL-03 | Auto-**expiry** after configurable duration (default 4 h); pre-expiry **warning** at configurable lead (default 15 min) with one-tap renewal |
| FR-AVAIL-04 | **Renew/re-set** moves the timestamp forward (raising the provider in availability-recency ordering), idempotent regardless of current state |
| FR-AVAIL-05 | State + recency phrasing surfaced downstream; no negative marker when not available |
| FR-AVAIL-06 | Supplies the **raw activity signal** (availability set/renew counts) for the "Active this week" computation — the badge itself is owned by `trust-and-safety` (see §9) |
| FR-AVAIL-07 | Provider-facing **transparency**: why they do/don't hold "Active this week" and when "Available now" expires |
| SR-APP-04 | Transitions timestamped UTC; expiry enforced by a sweep **every minute**, an expired status never surviving past `expires_at + 60 s` |
| SR-APP-09 | All timestamps UTC `timestamptz`, sourced from the injected `Clock` (shared-kernel §4) — **never** `Date.now()` |
| SR-APP-11 | Expiry duration + reminder lead read from `platform_configuration.config` via the shared cache (security-implementation §6) |

### 2.2 Out of scope (guarded)

- **No forward-looking availability** — no schedules, future slots, "available from 18:00" (FR-AVAIL-08). The domain type cannot express a future start; there is exactly one present-tense window with an end.
- **The "Active this week" badge state** is *not* stored or decided here — `trust-and-safety` owns badge lifecycle (HLD §6.1, FR-TRUST-06). This module only exposes the activity count query the daily job consumes.
- **Notifications** — the renewal prompt is sent by `user-notifications` on receipt of `AvailabilityExpiryWarned`; this module only publishes the event (FR-NOTIF-01).

---

## 3. Data model — `provider-availability` schema

Two tables. `availability_status` is the mutable current-state row (one per provider, upserted). `availability_history` is the append-only transition log feeding FR-ANLY-05 dashboard annotations and the FR-AVAIL-06 activity signal.

### 3.1 `availability_status` (current state, one row per provider)

```sql
create schema if not exists provider_availability;

create type provider_availability.state as enum ('not_available', 'available', 'expiry_warned');

create table provider_availability.availability_status (
  provider_profile_id  uuid primary key,          -- NO cross-schema FK (see note below)
  state                provider_availability.state not null default 'not_available',
  set_at               timestamptz,               -- when the current window was set/last renewed; null in not_available
  expires_at           timestamptz,               -- set_at + expiry_duration; null in not_available
  warned_at            timestamptz,               -- when AvailabilityExpiryWarned fired for the current window; null until warned or after renew/clear
  updated_at           timestamptz not null default now()
);

-- Sweep scan: "rows whose window is overdue" (§5). Partial index keeps it to only live rows.
create index availability_status_expiry_idx
  on provider_availability.availability_status (expires_at)
  where state in ('available', 'expiry_warned');

-- Warning scan: "live, un-warned windows entering the lead-time band" (§5).
create index availability_status_warn_idx
  on provider_availability.availability_status (expires_at)
  where state = 'available' and warned_at is null;
```

**No cross-schema FK on `provider_profile_id`.** Per HLD §6.3.3 and shared-kernel §10, cross-schema foreign keys are permitted **only** onto `identity_and_access.user(id)` and `platform_configuration.area(id)`. `provider_profile.provider_profile` is neither, so `provider_profile_id` is a plain `uuid` column with no FK constraint. Referential integrity is maintained by lifecycle, not by the database: a row is created lazily on first set (§7.1); an orphaned row (provider deleted) is harmless (it is never read by discovery once `ProviderUnpublished`/deletion removes the projection row) and is reaped by the account-deletion anonymization job in `identity-and-access`/`provider-profile` calling this module's facade `purgeFor(providerProfileId)`. *(The task brief's "FK provider_profile.provider_profile" is overridden here by the mandated boundary rule; called out so a reviewer sees the deviation is deliberate.)*

**`warned_at` semantics.** Reset to `null` on every set/renew so each fresh window can warn exactly once (§5.2 idempotency). Its non-null presence within a window is the one-shot guard against double-warning.

### 3.2 `availability_history` (append-only transition log)

```sql
create type provider_availability.history_event as enum ('set', 'renewed', 'cleared', 'warned', 'expired');

create table provider_availability.availability_history (
  id                   uuid primary key,                 -- AvailabilityEventId (UUIDv7, shared-kernel §2)
  provider_profile_id  uuid not null,                    -- no cross-schema FK, same rule as §3.1
  event_type           provider_availability.history_event not null,
  occurred_at          timestamptz not null,             -- Clock-sourced instant of the transition
  set_at               timestamptz,                      -- window's set_at at the time of the event (for 'set'/'renewed'); null otherwise
  correlation_id       text not null
);

-- FR-ANLY-05 annotations + FR-AVAIL-06 activity query: "this provider's events since T".
create index availability_history_provider_idx
  on provider_availability.availability_history (provider_profile_id, occurred_at);

-- Activity-count query hot path (§9): only the two activity-qualifying types.
create index availability_history_activity_idx
  on provider_availability.availability_history (provider_profile_id, occurred_at)
  where event_type in ('set', 'renewed');
```

Append-only by convention here (unlike `shared.audit_log`, this is not privilege-revoked — it is operational data, not a compliance record). Rows are never updated; a transition is one insert. The sweep and warning jobs insert `expired`/`warned` rows in the **same transaction** as the `availability_status` update (§5).

---

## 4. State machine (domain layer)

Reproduces user-stories §19.3 exactly. States: `NotAvailable`, `Available`, `ExpiryWarned`. This is the discriminated union mandated by clean-code-guidelines §4 — illegal transitions are unrepresentable because each transition function accepts only the state(s) from which it is legal and returns the next state or a typed domain error.

### 4.1 Transition table

| # | State | Trigger | New state | Side effects (history + event) | Notes |
|---|---|---|---|---|---|
| T1 | `NotAvailable` | Provider taps **Available now** | `Available` | history `set`; publish `AvailabilitySet` | `set_at = now`, `expires_at = now + duration`, `warned_at = null` |
| T2 | `Available` | Provider **re-sets / renews** | `Available` | history `renewed`; publish `AvailabilitySet` | timestamp refreshed → moves up recency ordering (FR-AVAIL-04); `warned_at` reset to null so the fresh window can warn again |
| T3 | `Available` | Warning job, **T-lead** (window entering the lead-time band) | `ExpiryWarned` | history `warned`; publish `AvailabilityExpiryWarned` | `warned_at = now`; one-shot per window (§5.2) |
| T4 | `ExpiryWarned` | Provider taps **Still available** (renew) | `Available` | history `renewed`; publish `AvailabilitySet` | same as T2 — new window, `warned_at` cleared |
| T5 | `ExpiryWarned` | Sweep, **`expires_at` reached** | `NotAvailable` | history `expired`; publish `AvailabilityExpired` | auto-expire, sweep ≤ 60 s of deadline (SR-APP-04) |
| T6 | `Available` | Sweep, **`expires_at` reached** (warning never fired) | `NotAvailable` | history `expired`; publish `AvailabilityExpired` | direct expiry if the warning job missed the window (e.g. `reminder_lead ≥ duration`, or a skipped tick) — the sweep matches on `expires_at` regardless of `warned_at`, so credibility is protected even if the warning path failed |
| T7 | `Available` | Provider **clears** | `NotAvailable` | history `cleared`; publish `AvailabilityCleared` | FR-AVAIL-02; `set_at/expires_at/warned_at` nulled |
| T8 | `ExpiryWarned` | Provider **clears** | `NotAvailable` | history `cleared`; publish `AvailabilityCleared` | clear is legal from either live state |
| — | `NotAvailable` | Provider **clears** | `NotAvailable` | none — idempotent no-op | returns `AVAILABILITY_ALREADY_SET`-class 200 no-op (event-catalog §5); not an error |

No transition produces a future-dated `set_at` or a second concurrent window — FR-AVAIL-08 is unrepresentable by construction.

### 4.2 TypeScript domain sketch

```typescript
// provider-availability/domain/availability-status.ts
import type { Instant } from '$shared/clock';
import type { ProviderProfileId } from '$shared/ids';
import { Ok, Err, type Result } from '$shared/result';

export type AvailabilityStatus =
  | { readonly kind: 'NotAvailable'; readonly providerProfileId: ProviderProfileId }
  | { readonly kind: 'Available';    readonly providerProfileId: ProviderProfileId; readonly setAt: Instant; readonly expiresAt: Instant }
  | { readonly kind: 'ExpiryWarned'; readonly providerProfileId: ProviderProfileId; readonly setAt: Instant; readonly expiresAt: Instant; readonly warnedAt: Instant };

export type AvailabilityTransitionError = { kind: 'illegal_transition'; from: AvailabilityStatus['kind']; trigger: string };

// Duration/lead are passed in (sourced from config cache at the app layer) — the domain never reads config or the clock itself.
export interface Window { readonly setAt: Instant; readonly expiresAt: Instant; }

// T1/T2/T4 — set or renew is legal from ANY state (idempotent per FR-AVAIL-04). Always yields a fresh Available window.
export function setAvailable(
  s: AvailabilityStatus, now: Instant, expiresAt: Instant,
): { next: Extract<AvailabilityStatus, { kind: 'Available' }>; historyType: 'set' | 'renewed' } {
  const historyType = s.kind === 'NotAvailable' ? 'set' : 'renewed';
  return { next: { kind: 'Available', providerProfileId: s.providerProfileId, setAt: now, expiresAt }, historyType };
}

// T7/T8 — clear is legal from any live state; no-op from NotAvailable.
export function clear(s: AvailabilityStatus): Result<{ kind: 'NotAvailable' }, { kind: 'noop' }> {
  return s.kind === 'NotAvailable' ? Err({ kind: 'noop' }) : Ok({ kind: 'NotAvailable' });
}

// T3 — warn is legal only from Available (compile-time guard via the accepted type).
export function warn(
  s: Extract<AvailabilityStatus, { kind: 'Available' }>, now: Instant,
): Extract<AvailabilityStatus, { kind: 'ExpiryWarned' }> {
  return { ...s, kind: 'ExpiryWarned', warnedAt: now };
}

// T5/T6 — expire is legal from Available or ExpiryWarned.
export function expire(
  s: Extract<AvailabilityStatus, { kind: 'Available' | 'ExpiryWarned' }>,
): { kind: 'NotAvailable'; providerProfileId: ProviderProfileId } {
  return { kind: 'NotAvailable', providerProfileId: s.providerProfileId };
}
```

The sweep and warning jobs express their set logic in SQL (§5) for throughput, but the SQL is the mechanical projection of these same transitions — the "expiry logic exists exactly once (domain), used by both the sweep and reads" rule (clean-code §12) is honoured by having both the SQL predicate and any per-row read use the single helper `windowIsOverdue(expiresAt, now)` / `windowInWarnBand(expiresAt, now, lead)` derived from the domain, never re-deriving the arithmetic inline.

---

## 5. Scheduled jobs — the sweep and the warning

Both run on the worker's minute-cadence tick (SR-APP-10, pg-boss cron). Each tick sources **one** `now` from the injected `Clock` at the top and passes it as a bound parameter — the whole tick is anchored to a single instant, never `now()` re-read mid-batch.

### 5.1 Expiry sweep (SR-APP-04, HLD §7.5 — "one SQL statement expires overdue statuses")

Single statement, batch `UPDATE … RETURNING`, run inside one transaction per tick. It flips every overdue live row to `not_available` and returns the affected rows for the per-row publish loop.

```sql
-- $1 = now (Clock instant, bound param). One statement, per HLD §7.5.
-- SR-APP-04: an expired status must never survive past expires_at + 60 s; running every minute
-- with a <1 s statement at SR-CAP-01 scale (≤2,000 rows, partial index) satisfies this with margin.
with expired as (
  update provider_availability.availability_status
     set state      = 'not_available',
         set_at     = null,
         expires_at = null,
         warned_at  = null,
         updated_at = $1
   where state in ('available', 'expiry_warned')   -- matches T5 + T6; predicate ignores warned_at deliberately
     and expires_at <= $1                            -- overdue at the tick's single instant
  returning provider_profile_id
)
insert into provider_availability.availability_history (id, provider_profile_id, event_type, occurred_at, correlation_id)
select $2 /* per-row UUIDv7 */, provider_profile_id, 'expired', $1, $3 /* tick correlation id */
from expired
returning provider_profile_id;
```

*(In practice the two writes are issued as a single CTE where the history `id` is generated per row via `gen_random_uuid()` or a `uuidv7()` SQL function; shown split for clarity. The `RETURNING` set is the exact list of providers to publish `AvailabilityExpired` for.)*

**Per-row publish loop.** After the UPDATE, for each returned `provider_profile_id`, `publish(AvailabilityExpired{ providerProfileId, expiredAt: now })` writes one outbox row (shared-kernel §6) — **inside the same tick transaction**. One event per expired provider, never one bulk event (event-catalog §3): every subscriber's contract is identical whether the state change came from a user tap or the sweep.

**Idempotency / crash safety.** The whole tick is one transaction: the UPDATE, the history inserts, and the outbox inserts commit together or not at all. If the worker crashes mid-tick, nothing committed and the next tick re-selects the same overdue rows. If a tick committed but the dispatcher had not yet delivered, the outbox guarantees at-least-once delivery (subscribers are idempotent on natural key). A re-run can never double-expire: once a row is `not_available`, `state in ('available','expiry_warned')` no longer matches it, so it is simply not re-selected.

### 5.2 Pre-expiry warning job (FR-AVAIL-03)

Runs on the same minute tick, **before** the sweep in the tick ordering (so a window is warned in the tick before the one that would expire it, given `lead ≥ 1 min`). Reminder lead is read from config (§6).

```sql
-- $1 = now; $2 = reminder_lead_minutes (from config cache). One statement.
with warned as (
  update provider_availability.availability_status
     set state      = 'expiry_warned',
         warned_at  = $1,
         updated_at = $1
   where state = 'available'                                   -- only from Available (T3)
     and warned_at is null                                     -- one-shot guard: never re-warn a window
     and expires_at >  $1                                      -- not already overdue (the sweep owns those)
     and expires_at <= $1 + make_interval(mins => $2)          -- inside the lead-time band
  returning provider_profile_id, expires_at
)
insert into provider_availability.availability_history (id, provider_profile_id, event_type, occurred_at, correlation_id)
select $3, provider_profile_id, 'warned', $1, $4 from warned
returning provider_profile_id, expires_at;
```

**Per-row publish loop.** For each returned row, `publish(AvailabilityExpiryWarned{ providerProfileId, expiresAt })`. `user-notifications` subscribes and sends the one-tap renewal prompt (FR-NOTIF-01).

**Double-warn prevention.** `warned_at` is set in the *same statement* that selects the row, so two concurrent ticks (should the cron ever overlap) cannot both match the same row — the first to commit sets `warned_at`, the second re-evaluates `warned_at is null` under READ COMMITTED and skips it. A renew (T2/T4) clears `warned_at`, arming the next window's warning. This is the "processed-ledger" idempotency of the `AvailabilityExpiryWarned` row in event-catalog §2, implemented via the `warned_at` column rather than a separate ledger table.

---

## 6. Configuration dependency

Two runtime config values, read through the shared config cache (`platform-configuration.getConfig<T>(key)`, security-implementation §6 — in-process `Map`, refreshed on `ConfigChanged` and a 5-minute TTL backstop). Read once per tick / per command at the application layer and passed as values into the domain and the SQL — never read inside the domain or a repository.

| Config key | Type | Default | Drives | Requirement |
|---|---|---|---|---|
| `provider-availability.expiry_minutes` | integer (minutes) | `240` (4 h) | `expires_at = set_at + duration` on set/renew (T1/T2/T4) | FR-AVAIL-03, FR-ADM-06 |
| `provider-availability.reminder_lead_minutes` | integer (minutes) | `15` | lead-time band in the warning job (§5.2) | FR-AVAIL-03, FR-ADM-06 |

An admin change takes effect within ≤ 5 min (SR-APP-11) and applies to **new** windows — a change to `expiry_minutes` does not retroactively move the `expires_at` of already-live windows (they expire on their originally-computed deadline; the next renew adopts the new duration). This is stated to the admin at the config screen and flagged in §10.

---

## 7. API contract

All routes are provider-only and ownership-checked. Envelope, error mapping, and headers per api-conventions §3/§12. Request schemas colocated per shared-kernel §9. The provider's `providerProfileId` is resolved from `AuthContext.userId` via the `provider-profile` facade (the caller never supplies it in the body — you can only set *your own* availability), so ownership is intrinsic, not a body-supplied target.

| Endpoint | Method / path | Auth | Body | Success | Notes |
|---|---|---|---|---|---|
| **Set / renew** | `POST /api/availability/status` | `requiredRole = 'provider'` + ownership (intrinsic) | *(empty)* | `200 { data: { state, setAt, expiresAt } }` | Idempotent set-or-renew (T1/T2/T4). Moves `set_at` forward **regardless of current state** (FR-AVAIL-04). Same endpoint serves the profile "Available now" control and the notification's "Still available" renewal deep-link |
| **Clear** | `DELETE /api/availability/status` | `provider` + ownership | *(empty)* | `200 { data: { state: 'not_available' } }` | T7/T8; no-op 200 if already not available (event-catalog §5 — `AVAILABILITY_ALREADY_SET` documented there as *not* an error) |
| **Transparency** (FR-AVAIL-07) | `GET /api/availability/status/me` | `provider` + ownership | — | `200 { data: { availability, activeThisWeek } }` | Read-only. `provider-availability`: current state, `setAt`, `expiresAt`, `expiresInSeconds` (computed at the delivery layer from Clock, for the countdown). `activeThisWeek`: `{ qualifies, signals: { availabilitySetCount, sinceIso }, ... }` — this module supplies its own contribution; the delivery layer composes it with the other three qualifying signals fetched from `trust-and-safety`'s facade (§9). "The signals describing me are never a mystery to me" (user-stories §11 US-AVAIL-05) |

**Renewal is set.** There is no separate `/renew` route — renewing *is* setting, per FR-AVAIL-04, so the client (and the notification deep-link) always POSTs the same endpoint. This keeps the idempotent-forward-move behaviour in exactly one handler.

### 7.1 Command handler shape (set/renew)

`provider-availability/app/commands/set-availability.ts` — one transaction (clean-code §5):

1. `ctx.requireRole('provider')`; resolve `providerProfileId` via `provider-profile` facade; `ctx.requireOwnership(ownerId)`.
2. Load current `availability_status` (or synthesize `NotAvailable` if no row yet).
3. Read `provider-availability.expiry_minutes` from config cache; `now = clock.now()`; `expiresAt = now + duration`.
4. Domain `setAvailable(current, now, expiresAt)` → next state + `historyType`.
5. **Upsert** `availability_status` (`insert … on conflict (provider_profile_id) do update`), insert `availability_history` (`historyType`), and `publish(AvailabilitySet{ providerProfileId, setAt: now })` — all in one transaction.
6. Return the shaped state.

`AvailabilitySet` is emitted on both set and renew (natural-key upsert on the discovery side — idempotent, event-catalog §2). Discovery's projection mirror thus always reflects the latest `set_at` within the ≤ 30 s bound.

### 7.2 Rate limiting — a new bucket

Availability set/clear is **not** in the SR-SEC-10 enumerated buckets (security-implementation §5.2 lists auth/otp/message/thread/review/report/search — no availability bucket). A pathological or stuck client could hammer set/clear; while harmless to correctness (idempotent), it produces `AvailabilitySet` churn on the outbox and discovery projection. A modest per-account bucket is warranted. **Appended** to security-implementation §5.2:

| Bucket | Key | Window | Limit | Driving requirement |
|---|---|---|---|---|
| `availability_toggle` | account | 1 min | 30 | this LLD (§7.2) — generous enough no plausible human tapping "Available/Done"/"Still available" hits it; caps runaway-client outbox churn |

Applied to both `POST` and `DELETE /api/availability/status`. Exceeding it returns `429 RATE_LIMITED` per api-conventions §6. *(This is the only append this module makes to §5.2; existing rows untouched.)*

---

## 8. Domain events published

All four are already registered in event-catalog §2 (rows unchanged by this LLD). Payloads carry IDs + facts only (shared-kernel §6.1).

| Event | v | Trigger (state transition) | Payload | Publisher-side idempotency |
|---|---|---|---|---|
| `AvailabilitySet` | 1 | T1/T2/T4 (set/renew) | `providerProfileId`, `setAt` | Natural-key upsert on the subscriber side (discovery keys on `provider_profile_id`); re-emitting with a newer `setAt` is a safe overwrite |
| `AvailabilityCleared` | 1 | T7/T8 (clear) | `providerProfileId` | Natural key |
| `AvailabilityExpired` | 1 | T5/T6 (sweep, per row) | `providerProfileId`, `expiredAt` | Natural key; sweep re-run cannot re-emit (row already `not_available`, not re-selected — §5.1) |
| `AvailabilityExpiryWarned` | 1 | T3 (warning job, per row) | `providerProfileId`, `expiresAt` | One-shot-per-window via `warned_at` (§5.2) — the "processed-ledger" mechanism in the catalog, realized as a column guard |

This module **publishes no WS messages** (api-conventions §10.0: availability-expiry countdown is client-side timer driven, not pushed; only messaging rides `/ws`). The provider's live countdown is computed client-side from `expiresAt` returned by §7's transparency endpoint.

---

## 9. Supplying the "Active this week" activity signal (FR-AVAIL-06)

The badge is computed and owned by `trust-and-safety` (`07-trust-and-safety/trust-and-safety-lld.md`, FR-TRUST-06), evaluated at least daily. "Active this week" qualifies on **any of four** trailing-7-day activities (FR-AVAIL-06): sign-in (`identity-and-access`), availability set/renew (**this module**), profile edit (`provider-profile`), message sent (`direct-messaging`). Each owning module exposes its own activity count; `trust-and-safety`'s daily job ORs them.

This module exposes exactly one facade method for that job — it does **not** compute or store the badge:

```typescript
// provider-availability/app/facade.ts
export interface AvailabilityFacade {
  // FR-AVAIL-06 contribution: count of set/renew transitions in [since, now).
  // Read against availability_history's activity partial index (§3.2).
  getRecentActivityCount(providerProfileId: ProviderProfileId, since: Instant): Promise<number>;
  exportFor(userId: UserId): Promise<object>; // SR-DATA-07 slice; empty if no profile/status (platform-configuration LLD §9)
}
```

```sql
-- getRecentActivityCount — served by availability_history_activity_idx (§3.2)
select count(*)::int
from provider_availability.availability_history
where provider_profile_id = $1
  and event_type in ('set', 'renewed')
  and occurred_at >= $2;   -- $2 = now - 7 days, computed by trust's job from the Clock
```

`> 0` means this signal qualifies the provider; `trust-and-safety` combines it with the other three. The transparency endpoint (§7, FR-AVAIL-07) surfaces this same count to the provider so the badge is never a black box.

---

## 10. Edge cases & concurrency

- **Renew-vs-sweep race (renew must win).** Under READ COMMITTED, the sweep's `UPDATE … where expires_at <= $1` re-evaluates its predicate against the *latest committed* version of any row it contends for (Postgres EvalPlanQual). If a renew commits before the sweep locks the row, the sweep sees the renewed `expires_at` (now in the future), the predicate fails, and the row is skipped — renew wins by normal MVCC, no explicit locking needed. If the renew commits *after* the sweep updates the row, the renew blocks on the sweep's row lock, then applies on top of `not_available`, restoring `Available` with a fresh window — renew still wins. Either interleaving leaves the provider available, which is the correct, credibility-preserving outcome. The sweep's single-instant `$1` (captured once per tick) is what makes "overdue at transaction start" a crisp, race-free predicate.
- **Clock skew tolerance.** All comparisons are UTC `timestamptz` against the injected `Clock` (SR-APP-09, clean-code §12). Worker and DB run on the same host (HLD §2 two-processes-one-image), so wall-clock skew between them is sub-millisecond; the SR-APP-04 "+60 s" allowance absorbs any residual scheduling jitter. No tolerance window is added to the predicates themselves — `expires_at <= now` is exact; the 60 s budget lives entirely in the sweep *cadence*, not in fuzzing the comparison.
- **Config change mid-window.** A change to `expiry_minutes` never rewrites live `expires_at` (§6) — live windows keep their computed deadline; the next renew adopts the new duration. Avoids a config edit silently extending or truncating thousands of active windows.
- **Warning skipped when `lead ≥ duration`.** If an admin sets `reminder_lead_minutes ≥ expiry_minutes`, a freshly-set window is already inside (or past) the lead band before the warning job runs, so T3 may not fire before T6 expires it directly. This is acceptable (T6 exists precisely for it) — the signal still expires on time; only the courtesy warning is skipped. **Prevented at write:** `platform-configuration` rejects `lead ≥ duration` (platform-configuration LLD §6.3 / §10.8), so this path is only reachable from a pre-validation seed or a direct DB edit.
- **Lazy row creation.** A provider who has never set availability has no `availability_status` row; reads synthesize `NotAvailable`. First set inserts the row (§7.1 upsert). This keeps the table proportional to providers who have *ever* gone available, not all providers.
- **"Active this week" ≠ "Available now".** A provider can be `not_available` yet still "Active this week" (recent set/renew/edit/message). The two signals are independent; this module supplies raw counts, never conflates them (FR-AVAIL-05: absence of availability is neutral, never a demerit).

---

## 11. Open questions / assumptions

1. **`provider_profile_id` FK deviation** — the task brief specified an FK onto `provider_profile.provider_profile`; the mandated boundary rule (HLD §6.3.3, shared-kernel §10) forbids it. Resolved here as a plain `uuid` with lifecycle-maintained integrity (§3.1). Assumption: reviewers accept event-driven integrity over a cross-schema FK, consistent with every other module. *(No action needed unless the boundary rule itself changes.)*
2. **Config validation `lead < duration`** — **Closed 2026-08-20:** `platform-configuration` rejects `provider-availability.reminder_lead_minutes ≥ provider-availability.expiry_minutes` at admin-save time (§6.3).
3. **`ConfigChanged` cache invalidation** — this module subscribes to `ConfigChanged` only through the shared config-cache invalidation subscriber (event-catalog §2, security-implementation §6); it holds no config-specific handler of its own. The shared subscriber covers `provider-availability.*` keys with no per-module registration. Confirmed against the catalog row; no append needed.
4. **Activity signal completeness** — `getRecentActivityCount` covers only this module's contribution (set/renew). The full FR-AVAIL-06 OR across four signals is `trust-and-safety`'s composition; if `trust-and-safety` instead wants a single pre-ORed boolean, that is a `trust-and-safety` LLD decision — this module deliberately exposes the raw count, not a verdict.
5. **History retention** — `availability_history` has no purge job specified in SR-APP-10. Assumption: it is low-volume operational data (bounded by set/renew frequency × providers) and rides account-deletion anonymization (`purgeFor`) plus any future analytics-retention sweep; not treated as SR-DATA-03 personal data. Flag for `10-provider-analytics`/`13-platform-configuration` if a retention window is later required.
