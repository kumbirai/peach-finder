---
title: Peach Finder — LLD — Provider Analytics
updated: 2026-08-20
---

# Analytics Module — Low-Level Design

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Module | `provider-analytics` (`src/lib/server/modules/provider-analytics/`, Postgres schema `provider_analytics`) |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | FRS §12 FR-ANLY-01..06; SRS SR-APP-08, SR-APP-10, SR-PRIV-02/05/06, SR-PERF; HLD §6.1 (`provider-analytics` row — terminal consumer), §6.4 (aggregates), §10.2 (privacy chokepoints); clean-code-guidelines §12 (`provider-analytics` row); user-stories §13 E10 |
| Foundations (imported, not restated) | `shared-kernel.md` (IDs, clock, `Result`), `api-conventions.md` (envelope, pagination, serializers), `event-catalog.md` (`ThreadCreated` subscription), `security-implementation.md` §6 (config cache) |
| Cross-module shapes consumed | `provider_profile.provider_profile` / `provider_profile.provider_service_tag` (facade — dedup key + "your tags highlighted" §8); subscribes `ThreadCreated` from `direct-messaging` |
| Status | Living document — updated in place |

**Opening guard clause (clean-code-guidelines §12 `provider-analytics` row, SR-APP-08).** Analytics capture is **fire-and-forget: the event endpoint never blocks or breaks a page.** Every capture path either runs off the request's critical path or is wrapped so a failure is swallowed + counted, never propagated to the caller. A page render must never wait on, or fail because of, an analytics write. This is the single most important property of the module and is restated at each capture site (§4).

---

## 2. Module purpose & scope

| In scope | Requirement |
|---|---|
| Capture profile views, search appearances, contact requests, tap-to-call (fire-and-forget) | FR-ANLY-02, SR-APP-08 |
| Dedup: view per viewer per day; appearance per results-set-view | FR-ANLY-02 |
| Hourly rollup into aggregates; raw events destroyed ≤ 90 days | SR-APP-08, SR-APP-10, SR-PRIV-05 |
| Provider dashboard: 4 metrics × (current total, trend, prior-period comparison) over 7/30/90 days | FR-ANLY-01 |
| Most-searched services, provider's own tags highlighted | FR-ANLY-04 |
| "< 5" small-count floor at **read** time only | FR-ANLY-03, SR-PRIV-06 |
| Aggregate-only, no seeker identifiable | FR-ANLY-03, SR-PRIV-02/06 |

| Explicitly NOT in scope | Requirement |
|---|---|
| Seeker-side analytics, conversion funnels, exportable reports | FR-ANLY-06 (W) |
| Publishing any domain event | HLD §6.1 — terminal consumer |
| Tying any count to a seeker identity | FR-ANLY-03 — never, by construction |

---

## 3. Data model — `provider-analytics` schema

```sql
-- Raw events, retained <= 90 days then destroyed (SR-APP-08, SR-PRIV-05)
create table provider_analytics.raw_event (
  id                   uuid primary key,                       -- AnalyticsEventId (UUIDv7)
  event_type           text not null,                          -- 'profile_view'|'search_appearance'|'contact_request'|'tap_to_call'|'search_filter_applied'
  provider_profile_id  uuid,                                   -- null only for platform-wide events (search_filter_applied)
  viewer_key           text,                                   -- daily-rotating dedup key (see §5); NEVER an IP or persistent id, NEVER a seeker identity
  occurred_at          timestamptz not null default now(),     -- UTC (shared-kernel §4)
  metadata             jsonb not null default '{}',            -- e.g. { serviceTagIds: [...] } for search_filter_applied
  constraint raw_event_type_chk check (event_type in
    ('profile_view','search_appearance','contact_request','tap_to_call','search_filter_applied'))
);
create index raw_event_rollup_idx on provider_analytics.raw_event (occurred_at);                         -- hourly rollup scan + purge
create index raw_event_provider_idx on provider_analytics.raw_event (provider_profile_id, occurred_at);  -- rollup grouping

-- Dedup guards: at-most-one per (provider, viewer, day) per dedupable type (§5)
create unique index raw_event_view_dedup_idx
  on provider_analytics.raw_event (provider_profile_id, viewer_key, (occurred_at::date))
  where event_type = 'profile_view';
create unique index raw_event_appearance_dedup_idx
  on provider_analytics.raw_event (provider_profile_id, viewer_key, (occurred_at::date))
  where event_type = 'search_appearance';

-- Hourly aggregates, retained INDEFINITELY (raw events destroyed; aggregates survive — SR-APP-08)
create table provider_analytics.hourly_rollup (
  provider_profile_id  uuid not null,
  hour_bucket          timestamptz not null,                   -- date_trunc('hour', occurred_at)
  profile_views        integer not null default 0,
  search_appearances   integer not null default 0,
  contact_requests     integer not null default 0,            -- new threads + tap-to-call (FR-ANLY-02 definition)
  primary key (provider_profile_id, hour_bucket)
);

-- Optional dashboard read cache (see §3 note); not on any SR-PERF hard budget
create table provider_analytics.dashboard_metric_cache (
  provider_profile_id  uuid not null,
  range_days           smallint not null,                      -- 7|30|90
  computed_at          timestamptz not null default now(),
  payload              jsonb not null,                         -- pre-shaped 4-metric response (floor NOT yet applied — applied at serialize, §7)
  primary key (provider_profile_id, range_days)
);
```

**`dashboard_metric_cache` — table, TTL-refreshed (justified).** The dashboard is **not** in the SR-PERF-01..07 hard-budget list (those cover home/search/profile/suggestions/messaging), so a slightly heavier query is acceptable. I use a lightweight materialized table refreshed lazily (on read if `computed_at` older than a few minutes) rather than a Postgres materialized view, because per-provider refresh is cheaper than a global `REFRESH MATERIALIZED VIEW` and the read is naturally single-provider. **The floor (§7) is applied at serialize time, not stored in this cache** — the cache holds true counts so it can also feed internal aggregation (§8) that needs accurate numbers.

---

## 4. Capture endpoint — fire-and-forget semantics (SR-APP-08)

Two capture mechanisms, chosen per event by whether the event already rides an existing transaction. Both satisfy "never blocks or breaks a page"; the choice is a latency optimization, justified below.

| Event | Mechanism | Justification |
|---|---|---|
| `profile_view`, `search_appearance` | **Inline insert wrapped in try/catch that swallows + counts failures**, fired from the SSR `load` function | These fire from server-rendered page loads on the hot path; an extra queue hop (pg-boss enqueue) adds latency to *every* profile/search render for no benefit. A wrapped inline `INSERT ... ON CONFLICT DO NOTHING` is one cheap indexed write; on any error it increments an `analytics_capture_failures` counter (SR-OBS-02) and returns — the `load` never rejects. |
| `search_filter_applied` | Inline wrapped (same as above), fired from discovery's read path calling `provider-analytics.captureFilterUsage()` facade | Platform-wide demand signal; same fire-and-forget wrap. |
| `contact_request` (new thread) | **Event subscription** on `ThreadCreated` (§10) | Already goes through messaging's committed transaction + outbox; reusing that path is free and durable — no separate client call, and it inherits at-least-once delivery + the subscriber idempotency ledger. |
| `tap_to_call` | Queued pg-boss job from a thin `POST /api/analytics/tap` | A user gesture, not a page render; a fast 202 + async job keeps the tap responsive and tolerates a burst. |

- **The swallow is real and counted:** the wrapper catches everything, increments a failure metric, and returns success to the caller. Analytics failure is invisible to the seeker/provider by design (SR-APP-08).
- **Capture endpoints are internal**, called by other modules' facades (`provider-analytics.captureView()`, `.captureAppearance()`, `.captureFilterUsage()`) or the SSR `load`, **not** by client JS directly — the events that can be fired server-side (view, appearance) are, so an ad-blocker or JS failure never suppresses them (also keeps them honest per FR-ANLY-02). `tap_to_call` is the one client-initiated capture (a real user gesture the server can't observe otherwise).

---

## 5. Dedup algorithm (FR-ANLY-02)

**`viewer_key` definition (privacy-minimizing, SR-PRIV-02).** Recommended: a **daily-rotating salted hash** of `(session_id or anonymous_cookie_id, date)` — `viewer_key = sha256(dailySalt || sessionOrAnonId || occurredAt::date)`. Properties:
- **NOT** an IP address, and **NOT** any persistent identifier — the key changes every day, so it cannot correlate a viewer across days (data minimization by construction, SR-PRIV-02).
- **NEVER tied to a specific seeker identity** for provider-facing display (FR-ANLY-03) — the hash is one-way and salted; the provider only ever sees counts, never the key.
- Anonymous viewers (no session) get the first-party `pf_anon` cookie id minted by the server hook (`security-implementation.md` §2 step 5; SR-PRIV-04 — first-party only) folded into the same hash; a viewer with cookies disabled falls back to a per-request random key (counts as a distinct viewer that day — acceptable over-count, never an under-count of dedup that would leak identity).

| Event type | Dedup key | Window | Mechanism |
|---|---|---|---|
| `profile_view` | `(provider_profile_id, viewer_key, date)` | per viewer per day | unique index + `INSERT ... ON CONFLICT DO NOTHING` — a repeat view the same day is a silent no-op |
| `search_appearance` | `(provider_profile_id, viewer_key, date)` | per viewer per day; fired **once per provider per results-set-view**, not per card re-render | same `ON CONFLICT DO NOTHING`; discovery fires one appearance per provider card in a rendered result set, and re-scrolls/re-renders within the same day dedup away |
| `contact_request` | naturally deduped — one per thread | per thread | driven by `ThreadCreated` (one per new seeker-provider pair), not per message (§10) |
| `tap_to_call` | its own `raw_event` type, counted separately | per tap | **not** deduped against `contact_request`; FR-ANLY-02 counts contact requests = new threads **plus** tap-to-call taps where phone visibility is on, so taps are their own rows and summed into `contact_requests` at rollup |

- **tap_to_call is its own raw_event type** (per §3 DDL) and is summed into the `contact_requests` rollup column alongside new-thread events — matching FR-ANLY-02's "contact request = new thread + tap-to-call taps."

---

## 6. Rollup job (SR-APP-10, hourly)

Runs hourly on the `worker`; **idempotent** via upsert.

```sql
-- Aggregate the prior hour's raw events into hourly_rollup (idempotent upsert)
insert into provider_analytics.hourly_rollup (provider_profile_id, hour_bucket, profile_views, search_appearances, contact_requests)
select
  provider_profile_id,
  date_trunc('hour', occurred_at) as hour_bucket,
  count(*) filter (where event_type = 'profile_view')                            as profile_views,
  count(*) filter (where event_type = 'search_appearance')                       as search_appearances,
  count(*) filter (where event_type in ('contact_request','tap_to_call'))        as contact_requests
from provider_analytics.raw_event
where occurred_at >= :hour_start and occurred_at < :hour_end
  and provider_profile_id is not null
group by provider_profile_id, date_trunc('hour', occurred_at)
on conflict (provider_profile_id, hour_bucket) do update
  set profile_views      = excluded.profile_views,
      search_appearances = excluded.search_appearances,
      contact_requests   = excluded.contact_requests;
```

- **Idempotent** (SR-APP-10): re-running for the same hour recomputes the same aggregate and upserts — `do update` (not `+=`) so a re-run is a replace, never a double-count.
- **Raw-event purge** (SR-DATA-03/SR-PRIV-05, daily job): `delete from provider_analytics.raw_event where occurred_at < now() - interval '90 days'`. After purge, only `hourly_rollup` (indefinite) survives — this is why the rollup must be a complete aggregate, not a sample. `search_filter_applied` rows are aggregated by §8's query before purge and are also destroyed at 90 days.

---

## 7. The "< 5" floor (FR-ANLY-03) — read-time only

**Applied at the dashboard serializer, never at write/rollup time.** Raw counts and rollups stay accurate internally — the platform's own aggregation (§8 most-searched-services) needs true counts. The floor is a **display-layer privacy rule** that prevents single-visitor inference on a provider's own dashboard.

```typescript
// provider-analytics/infra/serializers.ts  — the ONE place the floor lives (SR-PRIV-06)
export function formatCount(n: number): string {
  return n < 5 ? '< 5' : String(n);   // 1-4 -> '< 5'; 0 -> '< 5' too (never reveal "exactly nobody"); 5+ -> exact
}
```

- Applied to every provider-facing metric total and per-period comparison. Trend charts plot floored values for display but compute deltas on true counts internally, then floor the rendered figure.
- **Never** applied to `hourly_rollup` storage or to §8's internal top-tags aggregation — only at the moment a number is serialized to a provider.

---

## 8. Most-searched services (FR-ANLY-04)

- **Raw event added:** `search_filter_applied` (in §3 DDL) captures which `service_tag_ids` were in the applied filter set, in `metadata.serviceTagIds`. **Discovery publishes filter-usage** by calling `provider-analytics.captureFilterUsage(serviceTagIds)` from its own read path — the same fire-and-forget inline-wrapped pattern (§4). *(Recommended over a dedicated client call: discovery already knows the applied filters server-side; capturing there is honest and free.)*
- **Aggregation query** — platform-wide top-N tags over the dashboard's selected period, with the viewing provider's own tags highlighted:

```sql
-- Top service tags across all providers over the selected range (TRUE counts, no floor — internal aggregation)
select tag_id, count(*) as demand
from provider_analytics.raw_event, jsonb_array_elements_text(metadata->'serviceTagIds') as tag_id
where event_type = 'search_filter_applied' and occurred_at >= :range_start
group by tag_id order by demand desc limit :n;
```

- **The one query that reads provider's tag data:** highlighting the viewing provider's own offered tags requires their `provider_service_tag` set — fetched via **`provider-profile`'s facade**, then intersected in application code against the top-N. This is **not** a raw cross-schema join (shared-kernel §10 forbids it) — top-tags comes from `provider_analytics.raw_event`, the provider's own tags come from the provider facade, and the "highlighted" flag is computed in the serializer.
- Floor does **not** apply here — this is platform-wide demand, not per-seeker inference; but the response is still aggregate-only (tag → demand rank), never seeker-identifiable.

---

## 9. API contract

| Method + path | Purpose | Notes |
|---|---|---|
| `provider-analytics.captureView(providerProfileId, viewerKey)` (facade) | Profile-view capture | Internal; called from provider profile SSR `load`; fire-and-forget inline (§4) |
| `provider-analytics.captureAppearance(providerProfileIds[], viewerKey)` (facade) | Search-appearance capture | Internal; called from discovery results SSR render; one row per provider per results-set-view (§5) |
| `provider-analytics.captureFilterUsage(serviceTagIds[])` (facade) | Demand-signal capture | Internal; called from discovery read path (§8) |
| `POST /api/analytics/tap` | tap-to-call capture | Client gesture; 202 + queued job; body `{ providerProfileId }`; rate-limited (reuse a lightweight per-IP bucket) |
| `GET /api/analytics/dashboard?range=7\|30\|90` | Provider dashboard | RBAC `role === 'provider'` + `requireOwnership`; returns the 4 metrics each as `{ currentTotal, trend[], priorPeriodComparison }` with `formatCount` floor applied (§7); default `range=30` (FR-ANLY-01). Reads `hourly_rollup` (+ §8 for most-searched); may serve/refresh `dashboard_metric_cache` |

- **Dashboard response shape** (FR-ANLY-01): `profileViews`, `searchAppearances`, `contactRequests` each `{ currentTotal, trend, priorPeriodComparison }`; `mostSearchedServices` as top-N `{ tag, demandRank, isMine }`. Metric definitions rendered in-product (FR-ANLY-02) so providers trust the numbers.
- Only a provider can read **their own** dashboard — ownership enforced application-layer (`requireOwnership`), never UI hiding (SR-SEC-05). No cross-provider or admin "see anyone's analytics" endpoint in V1.
- Envelope/pagination/error codes per api-conventions.md.

---

## 10. Domain events

**Publishes:** none — analytics is a terminal consumer (HLD §6.1).

**Subscribes:**

| Event | Publisher | Reaction | Idempotency |
|---|---|---|---|
| `ThreadCreated` | `direct-messaging` | Insert one `contact_request` raw_event for `providerProfileId` (FR-ANLY-02 "new thread = contact request") | `shared.processed_events (event_id, subscriber='provider-analytics')` ledger — a redelivered `ThreadCreated` never double-counts |

**Catalog reconciliation:** `ThreadCreated` **already lists `provider-analytics` as a subscriber** in event-catalog.md §2 (row: subscriber "`provider-analytics` (contact-request event, FR-ANLY-02)"). No append was needed — verified present; this LLD is the field-level spec of that already-registered subscription. (The task note anticipated it might be missing; it was not.)

---

## 11. Open questions / assumptions

1. **`viewer_key` source** — **Closed 2026-08-20:** the server hook mints a first-party `pf_anon` cookie for anonymous viewers (`security-implementation.md` §2 step 5); authenticated viewers use the session id. Neither is a privilege token. Cookie-blocked clients use the per-request-random fallback in §5.
2. **`dashboard_metric_cache` as table vs. materialized view** — chose a lazily-refreshed table (§3). If ops prefers a scheduled `REFRESH MATERIALIZED VIEW`, that's a drop-in change; the dashboard's exclusion from SR-PERF hard budgets makes either acceptable.
3. **`search_filter_applied` capture ownership** — **Closed 2026-08-20:** discovery's homepage/search path calls `provider-analytics.captureFilterUsage` fire-and-forget (discovery LLD §7).
4. **Floor on zero** (§7): `formatCount(0)` returns `'< 5'` deliberately (never reveal "exactly nobody viewed you"); if product wants an explicit `0` shown to the provider for their *own* dashboard, that's a one-line change — flagged since FR-ANLY-03 speaks to seeker-inference, not the provider's own zero.
