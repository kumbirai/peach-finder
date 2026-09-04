---
title: Peach Finder — LLD — Shared Kernel
updated: 2026-07-22
---

# Shared Kernel — Low-Level Design

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Low-Level Design — Shared Kernel (`src/lib/server/shared/`) |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | `04-solution-architecture/hld.md` §6.1 (`shared-kernel` row), §6.5 (event bus); `04-solution-architecture/clean-code-guidelines-per-module.md` |
| Downstream | Every module LLD in this folder imports these types and conventions without restating them |
| Status | Living document — updated in place |

**What this document is:** the one piece of the codebase every module is allowed to depend on. It is deliberately small — types, not behavior. If a rule here needs to change, every module LLD that cites it is affected; treat this file as the highest-blast-radius document in `05-low-level-design`.

---

## 2. Identity types (branded IDs)

All entity identifiers are **UUIDv7** (time-ordered — sorts naturally by creation, keeps B-tree index locality better than UUIDv4 at the SR-CAP-01 row-count scale) wrapped in a TypeScript **branded type** so `UserId` and `ThreadId` are not mutually assignable even though both are strings at runtime.

```typescript
// shared/ids.ts
type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId              = Brand<string, 'UserId'>;
export type ProviderProfileId   = Brand<string, 'ProviderProfileId'>;
export type PhotoId             = Brand<string, 'PhotoId'>;
export type ServiceId           = Brand<string, 'ServiceId'>;
export type ServiceTagId        = Brand<string, 'ServiceTagId'>;
export type AreaId              = Brand<string, 'AreaId'>;
export type AvailabilityEventId = Brand<string, 'AvailabilityEventId'>;
export type ThreadId            = Brand<string, 'ThreadId'>;
export type MessageId           = Brand<string, 'MessageId'>;
export type ReviewId            = Brand<string, 'ReviewId'>;
export type VerificationCaseId  = Brand<string, 'VerificationCaseId'>;
export type ReportId            = Brand<string, 'ReportId'>;
export type ModerationActionId  = Brand<string, 'ModerationActionId'>;
export type BlockId             = Brand<string, 'BlockId'>;
export type SubscriptionId      = Brand<string, 'SubscriptionId'>;
export type InvoiceId           = Brand<string, 'InvoiceId'>;
export type NotificationId      = Brand<string, 'NotificationId'>;
export type AnalyticsEventId    = Brand<string, 'AnalyticsEventId'>;
export type AuditLogEntryId     = Brand<string, 'AuditLogEntryId'>;
export type SessionId           = Brand<string, 'SessionId'>;
export type OutboxEventId       = Brand<string, 'OutboxEventId'>;

export function newId<T extends string>(): Brand<string, T> {
  return uuidv7() as Brand<string, T>;
}
export function asId<T extends string>(raw: string): Brand<string, T> {
  if (!UUID_V7_RE.test(raw)) throw new InvalidIdError(raw);
  return raw as Brand<string, T>;
}
```

**Rule:** a repository never accepts or returns a raw `string` where an ID is meant — this is what makes "passed the wrong ID to the wrong facade" a compile error instead of a production incident.

---

## 3. `Result<T, E>` and the `UseCaseError` taxonomy

Application-layer handlers never throw for expected failures (clean-code-guidelines §5).

```typescript
// shared/result.ts
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const Ok  = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

`UseCaseError` is a discriminated union shared by **every** module — this is the single vocabulary the delivery layer maps to HTTP status (see `api-conventions.md` §3):

```typescript
export type UseCaseError =
  | { kind: 'not_found';          resource: string }
  | { kind: 'forbidden';          reason: string }
  | { kind: 'conflict';           reason: string }
  | { kind: 'validation_failed';  issues: ValidationIssue[] }
  | { kind: 'rate_limited';       retryAfterSeconds: number }
  | { kind: 'unavailable';        dependency: string }   // e.g. PSP down
  | { kind: 'precondition_failed'; reason: string };      // e.g. thread < 24h old
```

Modules **may** extend this with module-specific literal `kind` values (e.g. `'review_ineligible'`) as long as they remain part of this same union shape — see `api-conventions.md §3.2` for the full enumerated code list every module must register into.

---

## 4. Clock

No domain or application code calls `Date.now()`, `new Date()`, or reads the system clock directly (clean-code-guidelines §4). Every function that needs "now" takes an `Instant` parameter, sourced once at the top of the request/job from a `Clock` port.

```typescript
// shared/clock.ts
export type Instant = Brand<string, 'Instant'>;   // ISO-8601 UTC, e.g. 2026-07-22T14:03:11.000Z

export interface Clock { now(): Instant; }

export class SystemClock implements Clock {
  now(): Instant { return new Date().toISOString() as Instant; }
}

export class FixedClock implements Clock {
  constructor(private t: Instant) {}
  now(): Instant { return this.t; }
  advance(ms: number) { this.t = new Date(new Date(this.t).getTime() + ms).toISOString() as Instant; }
}
```

**Rule (SR-APP-09):** all stored timestamps are UTC `timestamptz`. Locale/timezone display formatting happens only at the delivery layer, using the platform's single configured operating timezone (`platform-configuration.getConfig('platform-configuration.operating_timezone')`, default `Africa/Johannesburg`) — never per-user.

---

## 5. Money

```typescript
// shared/money.ts
export interface Money {
  readonly cents: number;      // integer, never float
  readonly currency: 'ZAR';    // single currency at launch; widen only with an explicit LLD change
}
export function money(cents: number): Money {
  if (!Number.isInteger(cents)) throw new Error('Money must be integer cents');
  return { cents, currency: 'ZAR' };
}
export const addMoney = (a: Money, b: Money): Money => money(a.cents + b.cents);
```

Every column storing an amount is `integer` (cents), never `numeric`/`float`. Enforced by the `listing-billing` LLD's schema and by a lint rule (`no-money-as-float`) flagging any column named `*_amount`/`*_price`/`*_fee` typed as float in a Drizzle schema diff.

---

## 6. The event bus (outbox pattern)

### 6.1 Event envelope

Every domain event, regardless of publishing module, has this shape (clean-code-guidelines §8):

```typescript
// shared/events.ts
export interface DomainEvent<Name extends string = string, Payload = unknown> {
  eventId: OutboxEventId;
  eventName: Name;            // PascalCase, past tense: 'ProviderPublished'
  version: 1;                 // additive evolution only; breaking change = new eventName
  occurredAt: Instant;
  payload: Payload;           // IDs + immutable facts only — never entity snapshots
  correlationId: string;      // propagated from the originating request/job
}
```

The full registry of concrete event names, versions, publishers, payload shapes, and subscribers lives in **`event-catalog.md`** (same folder) — that document is the cross-module contract; this section defines only the mechanism.

### 6.2 `shared.outbox` table (DDL)

```sql
create table shared.outbox (
  event_id        uuid primary key,
  event_name      text not null,
  version         smallint not null default 1,
  occurred_at     timestamptz not null,
  correlation_id  text not null,
  payload         jsonb not null,
  published_at    timestamptz not null default now(),  -- when the row was committed
  -- dispatch bookkeeping (updated by the worker, not by publishers)
  dispatched_at   timestamptz,
  attempt_count   integer not null default 0
);
create index outbox_undispatched_idx on shared.outbox (published_at) where dispatched_at is null;
```

**Publish contract:** `publish(event)` is called *only* inside the command handler's transaction, immediately before commit. There is no separate "publish" step outside a transaction — an outbox row can never exist without the state change that produced it, and vice versa (HLD §6.5).

### 6.3 Dispatch (worker side)

The worker polls `shared.outbox where dispatched_at is null order by published_at` (batched, `SELECT … FOR UPDATE SKIP LOCKED`) and, for each row, enqueues **one pg-boss job per registered subscriber** of that `event_name`. A subscriber's job carries the full envelope. Dispatcher marks `dispatched_at` once every subscriber job for that row has been successfully enqueued (enqueue is the durable point — the pg-boss job table is itself transactional Postgres state, so this is not a second at-most-once hop).

Per-subscriber delivery is **at-least-once** with pg-boss's own retry/backoff (exponential, max 5 attempts, then dead-letter into `shared.outbox_dead_letter` — same shape plus `failed_reason text`, `subscriber text`). A dead-lettered event pages the on-call channel (SR-OBS-03) — see `14-test-strategy/test-strategy.md` for the failure-injection test that proves this path.

### 6.4 Subscriber idempotency

Every subscriber handler is idempotent by one of two mechanisms, chosen per handler and documented in that module's LLD:

1. **Natural key** — the write itself is naturally idempotent (e.g. `upsert` into the search projection keyed by `provider_profile_id`).
2. **Processed-event ledger** — for handlers with side effects that aren't naturally idempotent (e.g. "send a notification"), the handler first inserts into `shared.processed_events (event_id, subscriber, processed_at)` (unique constraint on `(event_id, subscriber)`) inside the same transaction as its side effect's durable record; a retry that hits the unique-violation short-circuits with a no-op success.

```sql
create table shared.processed_events (
  event_id    uuid not null,
  subscriber  text not null,
  processed_at timestamptz not null default now(),
  primary key (event_id, subscriber)
);
```

---

## 7. Audit log

```sql
create table shared.audit_log (
  id           uuid primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,                 -- null for system-initiated actions
  actor_role   text not null,        -- 'admin' | 'provider' | 'seeker' | 'system'
  action       text not null,        -- e.g. 'identity.approve', 'report.dismiss'
  target_type  text not null,        -- e.g. 'provider_profile', 'review'
  target_id    uuid not null,
  reason       text,                 -- required for admin actions per FR-ADM-08; null for pure state-transition logs
  metadata     jsonb not null default '{}',
  correlation_id text not null
);
create index audit_log_target_idx on shared.audit_log (target_type, target_id);
create index audit_log_actor_idx  on shared.audit_log (actor_id);

-- append-only at the platform level (SR-DATA-05), not merely by convention:
revoke update, delete on shared.audit_log from app_role;
grant insert, select on shared.audit_log to app_role;
```

The **only** code path allowed to write this table is `shared/audit.ts`'s `writeAudit(tx, entry)`, called from within a command handler's transaction — never from a route, never from `infra/`. A module LLD that has an admin/moderation/money action **must** cite the exact `action` string and `target_type` it writes; the full registry is `event-catalog.md` §4 (audit actions are catalogued alongside events since both are "facts that happened").

---

## 8. `AuthContext`

Resolved once per request by the SvelteKit server hook (see `security-implementation.md` §2) and attached to `event.locals.auth`; passed explicitly into every application-layer handler call — never re-derived deeper in the call stack.

```typescript
// shared/auth-context.ts
export type Role = 'anonymous' | 'seeker' | 'provider' | 'admin';

export interface AuthContext {
  readonly userId: UserId | null;     // null iff role === 'anonymous'
  readonly role: Role;
  readonly sessionId: SessionId | null;
  readonly ipAddress: string;         // from CF-Connecting-IP, SR-SEC-03
  readonly hasRole: (r: Role) => boolean;
  readonly requireRole: (r: Role) => void;              // throws AuthorizationBug if unmet — see below
  readonly requireOwnership: (ownerId: UserId) => void; // throws AuthorizationBug if userId !== ownerId
}
```

`requireRole`/`requireOwnership` **throw** rather than return a `Result` — an authorization failure reaching this call means a route failed to check `UseCaseError.forbidden` upstream, which is a programming bug, not a user-facing expected failure. The top-level error boundary catches `AuthorizationBug`, logs it at `error` level with correlation ID, and renders the generic FR-UX-05 friendly error — it must never leak "you tried to access someone else's X" detail that would aid probing.

---

## 9. Zod conventions

- Every route/action/WS message has its request schema **colocated** with the route file, named `<Verb><Noun>RequestSchema` (e.g. `SetAvailabilityRequestSchema`).
- Branded IDs parse via a shared `zId<T>()` helper that validates UUIDv7 shape and returns the branded type — schemas never use bare `z.string()` for an ID field.
- Domain re-validates its own invariants regardless of Zod having already validated the shape (belt-and-braces at two layers, not duplicated logic — Zod checks *shape*, domain checks *business rules*).

---

## 10. Database convention: schema-per-module

One PostgreSQL database, one **Postgres schema** per bounded context. Schema names are the snake_case of the kebab context name in HLD §6.1 (`identity_and_access`, `provider_profile`, `provider_availability`, `discovery_search`, `direct_messaging`, `provider_reviews`, `trust_and_safety`, `listing_billing`, `provider_analytics`, `user_notifications`, `media_processing`, `platform_configuration`), plus `shared` for the tables in this document. Module folders and a future `{context}-service` extract keep the kebab name; SQL uses snake_case because unquoted PostgreSQL identifiers cannot contain hyphens.

- Cross-schema **foreign keys** are permitted only onto `identity_and_access.user(id)` and `platform_configuration.area(id)` (HLD §6.3.3) — every other cross-module reference is a plain UUID column with **no FK constraint**, resolved through the owning module's facade at read time.
- Migration files are named `<schema>/<NNNN>_<description>.sql`, generated by Drizzle, forward-only, reviewed as code (SR-DATA-06). `NNNN` is a per-schema monotonic counter, not a global one — schemas evolve independently.
- The application's Postgres role (`app_role`) has `SELECT/INSERT/UPDATE/DELETE` on all module schemas except `shared.audit_log`, which is `SELECT/INSERT` only (§7).

---

## 11. Outbound HTTP wrapper

`shared/http.ts` provides the **only** sanctioned way to make an outbound HTTP call from `infra/`:

```typescript
export interface FetchOptions {
  timeoutMs: number;         // required — no unbounded outbound calls
  retries?: { max: number; backoffMs: number };
  allowedHosts: string[];    // SSRF guard: reject if resolved host isn't in this allowlist
}
export async function safeFetch(url: string, opts: FetchOptions): Promise<Response>;
```

Raw `fetch` in an `infra/` adapter is a lint-blocked pattern (SR-SEC-06). Provider adapters (Paystack, Clickatell, SES, Google/Apple OAuth) each pass their own `allowedHosts` and a timeout tuned to that provider's SLA — concrete values are specified per adapter in the owning module's LLD.

---

## 12. What is deliberately **not** in the shared kernel

To keep this the lowest-blast-radius file in the codebase, the following are explicitly module-owned, never promoted here even though they're used by more than one module:

- **Presence/last-seen coarsening logic** — lives in `direct-messaging` (owns the raw heartbeat) and is exposed to `provider-profile` only through `direct-messaging`'s facade.
- **Rate-limit bucket implementation** — lives in `shared/rate-limit.ts` as a *mechanism* (documented in `security-implementation.md`), but the concrete bucket definitions (which action, what limit) are declared per-route in each module's delivery layer, not centralized as data every module must edit.
- **Notification templates/copy** — owned by `user-notifications`.
- **The search lexicon** — owned by `discovery-search`/`platform-configuration`, not shared kernel, despite being config-driven like everything else in `platform-configuration`.
