---
title: Peach Finder — LLD — Platform Configuration (config, gazetteer, lexicon, data-export)
updated: 2026-08-20
---

# Platform Configuration Module — Low-Level Design

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Module | `platform-configuration` (`src/lib/server/modules/platform-configuration/`, Postgres schema `platform_configuration`) |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | FRS §11 FR-ADM-06; SRS SR-APP-11, SR-INT-06, SR-OPS-07, SR-DATA-07, SR-PRIV-01; HLD §6.1 (`platform-configuration` row), §10.3 (config subsystem); clean-code-guidelines §12 (`platform-configuration` row) |
| Foundations (imported, not restated) | `00-foundations/shared-kernel.md` (IDs, `Result`, audit, outbox), `api-conventions.md` (envelope, errors, admin routes), `event-catalog.md` (`ConfigChanged`, `config.change` audit action, `CONFIG_KEY_UNKNOWN`), `security-implementation.md` §6 (config cache mechanism — this module is its implementation) |
| Downstream | `provider-profile`, `discovery-search` (FK onto `platform_configuration.area`); every module reading a config value via `platform-configuration.getConfig<T>()`; `discovery-search` (owns lexicon query-time matching; consumes storage here) |
| Status | Living document — updated in place |

**What this module is.** `platform-configuration` owns three bodies of admin-managed reference data — runtime **configuration**, the area **gazetteer**, and the search **lexicon storage** — plus the config-cache mechanism every other process reads through, and the admin-initiated subject-access **data export** (SR-DATA-07, §9). It is the module that makes SR-APP-11's "effective without deployment" true. It owns storage and admin CRUD; it does **not** own the *interpretation* of lexicon data (the `maps_to` contract and query-time matching are `discovery-search`'s — see §3.3).

**Ownership boundary (stated once, up front).** Other module LLDs were told to treat `platform_configuration.area`, `platform_configuration.config`, and `platform_configuration.lexicon_entry` as **mandated shapes authored here**. This file is the canonical DDL and the tiebreaker for config-key naming (§4, §10).

---

## 2. Module purpose & scope

| In scope | Requirement |
|---|---|
| Typed runtime config store + admin CRUD; effective ≤ 5 min without deploy | FR-ADM-06, SR-APP-11 |
| In-process config cache with `ConfigChanged` invalidation + 5-min TTL backstop | SR-APP-11, security-implementation.md §6 |
| Startup validation of every known config key (fail loudly on bad stored value) | clean-code-guidelines §12 (`platform-configuration`) |
| Area gazetteer storage + admin CRUD; one-time GeoNames ZA import | SR-INT-06, FR-PROF-04, FR-SRCH-06 |
| Lexicon **storage** + admin CRUD (interpretation improves without deploy) | SR-APP-02, SR-APP-11, FR-SRCH-02 |
| First-run bootstrap seed (config defaults, gazetteer, lexicon) | SR-OPS-07 |
| Publishes `ConfigChanged` | event-catalog.md §2 |
| Admin-initiated subject-access data export | SR-DATA-07, SR-PRIV-01, §9 |

| Out of scope (owned elsewhere) | Owner |
|---|---|
| Lexicon `maps_to` JSON contract + query-time matching (trigram/synonym resolution) | `discovery-search` (this module imports that Zod schema at lexicon write time — §6.3) |
| Service-tag vocabulary seed + CRUD (`provider_profile.service_tag`) | `provider-profile` |

---

## 3. Data model — `platform-configuration` schema

Three tables are the mandated shapes other modules reference. DDL is authoritative here.

### 3.1 `platform_configuration.area` (gazetteer — SR-INT-06)

```sql
create table platform_configuration.area (
  id               uuid primary key,                       -- UUIDv7 (shared-kernel §2)
  name             text not null,
  slug             text not null unique,                   -- url/display stable key, e.g. 'sandton'
  parent_area_id   uuid references platform_configuration.area(id),      -- self-FK: suburb → city → metro
  centroid_lat     double precision not null,              -- representative point (SR-INT-06); NOT an exact address
  centroid_lng     double precision not null,
  is_active        boolean not null default true,          -- soft-hide without breaking provider FKs
  created_at       timestamptz not null default now()
);
create index area_parent_idx      on platform_configuration.area (parent_area_id);
create index area_name_trgm_idx   on platform_configuration.area using gin (name gin_trgm_ops);  -- admin lookup + discovery proximity name-match assist
```

- **Cross-schema FK target.** `platform_configuration.area(id)` is one of only two schemas other modules may FK onto (shared-kernel §10). `provider_profile.provider_profile.area_id` and the discovery projection's `area_id` reference it. No FK from `platform-configuration` *into* another module.
- **No exact addresses** (FR-PRIV-02, SR-PRIV-02): centroid only; the schema has no street/postcode column by construction.
- `parent_area_id` supports "search Sandton includes its suburbs" — hierarchy walk is `discovery-search`'s query concern; storage is here.

### 3.2 `platform_configuration.config` (runtime configuration — SR-APP-11)

```sql
create table platform_configuration.config (
  key         text primary key,                            -- dotted namespace, e.g. 'listing-billing.grace_period_days'
  value       jsonb not null,                              -- typed per §4 registry; validated on read (§5) and at startup (§6)
  updated_at  timestamptz not null default now(),
  updated_by  uuid references identity_and_access."user"(id)          -- admin who last saved; null only for bootstrap seed
);
```

- Every value is `jsonb` so heterogeneous shapes (int, string, object) share one table; **type safety is restored at read** by a per-key Zod schema (§5) — the store is loose, the accessor is strict.
- `updated_by` FK onto `identity_and_access."user"(id)` is the second permitted cross-schema FK (shared-kernel §10).
- Writes are audit-logged (`config.change`, §6, event-catalog.md §4) and publish `ConfigChanged` in the same transaction.

### 3.3 `platform_configuration.lexicon_entry` (search lexicon **storage** — SR-APP-02)

```sql
create table platform_configuration.lexicon_entry (
  id          uuid primary key,
  term        text not null,                               -- surface form, e.g. 'deep tissue', 'sesotho', 'available now'
  entry_type  text not null,                               -- enumerated below; NOT a DB enum (admin adds terms freely, types are fixed)
  maps_to     jsonb not null,                              -- interpretation payload — CONTRACT OWNED BY discovery (see note)
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index lexicon_term_type_uq on platform_configuration.lexicon_entry (lower(term), entry_type) where is_active;
create index lexicon_term_trgm_idx on platform_configuration.lexicon_entry using gin (term gin_trgm_ops);  -- prefix/fuzzy; discovery owns the matching algorithm, this index backs it
```

- **`entry_type` fixed value set** (storage-level enumeration; the meaning of each is discovery's):
  `service_term`, `language`, `intent_availability`, `intent_rating`, `intent_verification`, `intent_proximity`, `synonym`.
  Stored as `text` (not a Postgres `enum`) so admin lexicon growth never needs a migration; the *set of valid types* is validated by a Zod enum in the admin write path (§6), not the DB.
- **`maps_to` contract is discovery's; this module enforces it at write.** `04-discovery-search` owns the per-`entry_type` JSON shape (e.g. `{ "serviceTagId": "..." }` for `service_term`, `{ "filter": "verified" }` for `intent_verification`). Admin create/edit imports `discovery-search`'s Zod schema from that module's facade and rejects a payload that does not match the `entry_type` (**Closed 2026-08-20** — write-time validation is no longer deferred). Query-time matching stays `discovery-search`'s. Split: **discovery owns matching + `maps_to` semantics; platform owns storage + admin CRUD + the trigram index, and applies discovery's schema at the write boundary.**
- The unique index prevents two active entries with the same `(term, type)`; re-adding a soft-deleted term is allowed.

---

## 4. Config value registry (single source of truth for key naming)

Every config key referenced anywhere in the LLD set that this module is aware of, with JSON value shape and default. **This table is the tiebreaker** — other module LLDs should match these names; §9 lists every naming choice for reconciliation. Defaults trace to FRS/SRS where a number exists; where the FRS says only "configurable" (free-period length, pricing), the default is a flagged assumption (§9).

| Key | JSON shape | Default | Admin-editable (FR-ADM-06)? | Source / consumer |
|---|---|---|---|---|
| `listing-billing.trial_period_days` | `number` (int days) | `14` *(assumption — see §9)* | Yes | FR-MONET-02; billing §5 trial clock |
| `listing-billing.grace_period_days` | `number` (int days) | `7` | Yes | FR-MONET-04; billing §4/§5 |
| `listing-billing.listing_price_cents` | `number` (int cents, ZAR) | `9900` *(assumption — see §9)* | Yes | FR-MONET-07; billing §8 see-price / renewal |
| `listing-billing.featuring_price_cents` | `number` (int cents, ZAR) | `4900` *(assumption — see §9)* | Yes | FR-MONET-07; billing §7 featuring |
| `listing-billing.dunning_offset_days` | `number[]` (days into grace) | `[1, 3, 6]` | Yes | FR-MONET-04; billing §5 dunning schedule |
| `provider-availability.expiry_minutes` | `number` (int minutes) | `240` (4 h) | Yes | FR-AVAIL-03; availability sweep |
| `provider-availability.reminder_lead_minutes` | `number` (int minutes) | `15` | Yes | FR-AVAIL-03; availability reminder |
| `provider-availability.active_week_window_days` | `number` (int days) | `7` | No *(computed rule, FR-AVAIL-06; stored as config for the job, not surfaced in FR-ADM-06 admin set)* | FR-AVAIL-06/FR-TRUST-06 |
| `provider-reviews.highly_rated_min_average` | `number` (float) | `4.5` | Yes | FR-REV-05; discovery "highly rated" |
| `provider-reviews.highly_rated_min_reviews` | `number` (int) | `3` | Yes | FR-REV-05 |
| `direct-messaging.response_time_window_days` | `number` (int days) | `30` | Yes | FR-MSG-08 |
| `user-notifications.batch_window_minutes` | `number` (int minutes) | `5` | Yes | FR-NOTIF-03 |
| `user-notifications.email_unread_delay_minutes` | `number` (int minutes) | `5` | Yes | FR-NOTIF-01 email fallback |
| `platform-configuration.operating_timezone` | `string` (IANA tz) | `"Africa/Johannesburg"` | Yes | shared-kernel §4 (delivery-layer formatting) |
| `platform-configuration.safety_info_html` | `string` (sanitized HTML) | seed copy | Yes | FR-TRUST-09 safety page |

- **Money keys are integer cents** (shared-kernel §5) — never floats; the `no-money-as-float` lint rule does not reach jsonb, so the per-key Zod schema for these keys asserts `z.number().int()`.
- **Service-tag vocabulary is NOT here.** FR-ADM-06 lists it as admin-editable, but HLD §6.1 makes tag vocabulary `provider-profile`-owned data (`provider_profile.service_tag`). Admin edits it via `provider-profile`'s facade; `platform-configuration` only seeds it by reference at bootstrap (§7).

---

## 5. Config cache mechanism (this module *is* `platform-configuration.getConfig<T>()`)

Reference: security-implementation.md §6 — this section is its concrete implementation, not a redefinition.

```typescript
// platform-configuration/infra/config-cache.ts  — the ONLY sanctioned cross-module read path for config
// Exposed through platform-configuration/index.ts as the read-only facade accessor:  platform-configuration.getConfig<T>(key)

type ConfigKey = keyof ConfigRegistry;          // union of the §4 keys — compile error on an unknown key
type ConfigValue<K extends ConfigKey> = z.infer<ConfigRegistry[K]>;

export function getConfig<K extends ConfigKey>(key: K): ConfigValue<K>;
```

- **Population.** Each process (`web`, `worker`) holds an in-process `Map<ConfigKey, unknown>` loaded fully at boot (§6 startup validation guarantees every key is present + valid before the first request). No per-request DB read on the config hot path.
- **Invalidation.** Two mechanisms, per security-implementation.md §6:
  1. **Event-driven:** a shared cache-invalidation subscriber (the single cross-module `ConfigChanged` subscriber named in event-catalog.md §2) re-fetches the changed key on `ConfigChanged`. Because `web` and `worker` are separate processes, the *outbox dispatch* delivers `ConfigChanged` to both; each updates its own `Map`.
  2. **TTL backstop:** a ≤ 5-minute periodic re-fetch of the full config set (part of the worker minute-tick and a `web`-side interval), guarding against a missed/dead-lettered `ConfigChanged`. This is what upper-bounds SR-APP-11's "within ≤ 5 minutes" even in the failure case.
- **Type discipline.** `getConfig` returns the Zod-inferred type for the key; a caller reading `listing-billing.grace_period_days` gets `number`, statically. Reading an unregistered key is a compile error, not a runtime `CONFIG_KEY_UNKNOWN` (that error is for the *admin write* path in §6, where the key is a runtime string).

---

## 6. Admin config API (FR-ADM-06) + fail-loud startup

### 6.1 Per-key Zod registry (the validation contract)

```typescript
// platform-configuration/domain/config-registry.ts  — pure; the single declaration of every key's schema + default
export const ConfigRegistry = {
  'listing-billing.trial_period_days':          z.number().int().positive(),
  'listing-billing.grace_period_days':          z.number().int().positive(),
  'listing-billing.listing_price_cents':        z.number().int().nonnegative(),
  'listing-billing.featuring_price_cents':      z.number().int().nonnegative(),
  'listing-billing.dunning_offset_days':        z.array(z.number().int().nonnegative()),
  'provider-availability.expiry_minutes':        z.number().int().positive(),
  'provider-availability.reminder_lead_minutes': z.number().int().positive(),
  'provider-availability.active_week_window_days': z.number().int().positive(),
  'provider-reviews.highly_rated_min_average':   z.number().min(1).max(5),
  'provider-reviews.highly_rated_min_reviews':   z.number().int().nonnegative(),
  'direct-messaging.response_time_window_days': z.number().int().positive(),
  'user-notifications.batch_window_minutes':          z.number().int().positive(),
  'user-notifications.email_unread_delay_minutes':    z.number().int().positive(),
  'platform-configuration.operating_timezone':        z.string().refine(isValidIanaTz),
  'platform-configuration.safety_info_html':          z.string().min(1),  // sanitizer runs at write (§6.3); Zod checks non-empty only
} as const;
```

### 6.2 Fail loudly at startup (clean-code-guidelines §12 `platform-configuration` row)

On process boot, **before** the `web`/`worker` accepts traffic or ticks a job:

```
for each key in ConfigRegistry:
  row = select value from platform_configuration.config where key = :key
  if row missing            -> throw ConfigBootError(`missing config key ${key}`)   // crash, do not default silently
  parsed = ConfigRegistry[key].safeParse(row.value)
  if !parsed.success        -> throw ConfigBootError(`malformed config ${key}: ${issues}`)  // crash
  cache.set(key, parsed.data)
```

A missing or malformed stored value **crashes startup** — never silently defaults at use (the §4 defaults are the *seed* written by bootstrap, not a runtime fallback). This is the concrete meaning of "a bad stored value fails loudly at startup, not silently at use."

### 6.3 Admin CRUD endpoints

All under `/admin/api/platform/...` on the admin subdomain (api-conventions.md §2); RBAC floor `role === 'admin'` enforced at the hook before any handler. Envelope + errors per api-conventions.md §3.

| Method + path | Purpose | Notes |
|---|---|---|
| `GET /admin/api/platform/config` | List all keys + current values + schema hints | Read from cache; admin console config screen |
| `PUT /admin/api/platform/config/:key` | Update one config value | Body validated against `ConfigRegistry[key]` **and** the cross-key rules below; unknown key → `CONFIG_KEY_UNKNOWN` (event-catalog.md §5); in TX: update row + `writeAudit(config.change)` + outbox(`ConfigChanged`) → commit. `Idempotency-Key` accepted (api-conventions.md §5) |
| `GET /admin/api/platform/areas` | List/search gazetteer areas | Cursor pagination (api-conventions.md §4); `?q=` uses `area_name_trgm_idx` |
| `POST /admin/api/platform/areas` | Create area | Validates centroid ranges (lat −90..90, lng −180..180), unique slug |
| `PUT /admin/api/platform/areas/:id` | Edit area (name, centroid, parent, is_active) | Deactivating never hard-deletes (provider FKs); republish-safe |
| `GET /admin/api/platform/lexicon` | List/search lexicon entries | Filter by `entry_type`; trigram search on `term` |
| `POST /admin/api/platform/lexicon` | Create lexicon entry | `entry_type` validated against the fixed enum; `maps_to` validated against `discovery-search`'s per-type Zod schema (imported from that facade) |
| `PUT /admin/api/platform/lexicon/:id` | Edit / deactivate entry | Makes FR-SRCH-02 "interpretation improves without deployment" true |
| `POST /admin/api/platform/export/:userId` | Subject-access dump (SR-DATA-07) | §9; audits `admin.export_user_data` |

- **Config write is a state-transition path** (SR-APP-12): audit-logged in-transaction. `config.change` requires no reason (event-catalog.md §4 — the value diff plus actor+timestamp is self-explanatory).
- **Cross-key validation (same PUT, before commit)** — a write that would disable a required path is rejected with `VALIDATION_FAILED`, not stored:
  - `provider-availability.reminder_lead_minutes` must be **strictly less than** `provider-availability.expiry_minutes` (availability LLD §10 — otherwise T3 never fires). Evaluated against the *resulting* pair (the key being written plus the current/cached sibling).
  - every element of `listing-billing.dunning_offset_days` must be `< listing-billing.grace_period_days`.
- Lexicon/area writes are audit-logged in-transaction as `platform-configuration.lexicon_change` / `platform-configuration.area_change` (event-catalog.md §4). `maps_to` that fails discovery's schema is never persisted.
- `platform-configuration.safety_info_html` is sanitized through the fixed allowlist sanitizer **at this write** (the sole sanctioned `{@html}` sink, security-implementation §8) before store.

---

## 7. Seed / bootstrap data (SR-OPS-07)

First-run bootstrap (the SR-OPS-07 job, runs once, idempotent — re-run is a no-op via `on conflict do nothing`):

| Seed | Content | Notes |
|---|---|---|
| Default config set | Every §4 key at its default value, `updated_by = null` | Must complete before §6.2 startup validation can pass — bootstrap is ordered ahead of first real boot |
| Gazetteer | One-time GeoNames **ZA** extract → `platform_configuration.area` (suburbs/neighborhoods + centroids), plus manual admin edits thereafter | SR-INT-06 "locally cached/owned data — no paid per-query geocoding on the hot path"; import is a scripted worker job, not a runtime dependency |
| Lexicon seed | `service_term` entries derived from the FR-PROF-03 tag vocabulary; `language` entries; `intent_*` phrases from the BRD §13 example query intents; `synonym` entries | Seeds SR-APP-02's parser vocabulary; `maps_to` shapes populated per discovery's contract |
| Service-tag vocabulary | **Referenced, not duplicated** — `provider-profile` owns `provider_profile.service_tag` seeding (per `02-provider-profile`). Lexicon `service_term.maps_to` references those tag IDs | Cross-module: bootstrap ordering must seed provider tags before lexicon `service_term` rows that map to them |

---

## 8. Domain events published

| Event | When | Payload | Subscribers | Mechanism |
|---|---|---|---|---|
| `ConfigChanged` (v1) | Admin saves a config value (§6.3 `PUT config`) | `configKey`, `newValue` | shared config-cache invalidation subscriber → `discovery-search`, `provider-availability`, `listing-billing`, `provider-reviews`, `user-notifications` (batch/unread windows) | natural key (cache set is idempotent) — event-catalog.md §2 |

Published via outbox inside the config-update transaction (shared-kernel §6.2). Gazetteer/lexicon edits do **not** publish `ConfigChanged`; discovery re-reads lexicon/area data on its own cadence (discovery's concern) — `ConfigChanged` is scoped to `platform_configuration.config` keys only, matching the event-catalog payload (`configKey`).

Facade (public `index.ts`): `readAuditLog(filters, cursor)` is the admin console's read path over `shared.audit_log` (FR-ADM-08) — SELECT only; never UPDATE/DELETE. `exportUserData(userId, actor)` is the SR-DATA-07 orchestrator (§9).

---

## 9. Data export (SR-DATA-07, SR-PRIV-01)

Admin-initiated, machine-readable dump of **one** user's personal data, from the account-lookup surface. This is subject-access readiness (POPIA), **not** a browse of other people's inboxes (FR-MSG-09 / FR-ADM-04 still hold: there is no general message-browser; the dump is a packaged artifact for a DSAR).

### 9.1 Orchestrator

`platform-configuration.exportUserData(userId, actor: AuthContext)` — `requiredRole = 'admin'` at the hook. One command, one transaction **only for the audit row**; the module slices are read-only facade calls (no cross-schema `SELECT`).

```
1. ctx.requireRole('admin')
2. slices = await Promise.all([
     identity-and-access.exportFor(userId),
     provider-profile.exportFor(userId),          // empty object if no profile
     provider-availability.exportFor(userId),
     direct-messaging.exportFor(userId),
     provider-reviews.exportFor(userId),
     trust-and-safety.exportFor(userId),
     listing-billing.exportFor(userId),
     user-notifications.exportFor(userId),
     media-processing.exportFor(userId),          // public photo URLs only
   ])
3. in TX: writeAudit({ action: 'admin.export_user_data', target_type: 'user', target_id: userId })
4. return { generatedAt, userId, slices }
```

`discovery-search` and `provider-analytics` are **not** called: the search projection is derived state, and analytics `viewer_key`s are not seeker identity (FR-ANLY-03 / FR-PRIV-06).

### 9.2 Slice contract (`exportFor` on each module's `index.ts`)

Each owning module returns a JSON object of **that subject's** rows. Empty object if the user has none. Rules:

| Module | Includes | Excludes |
|---|---|---|
| `identity-and-access` | display name, email, phone (E.164), status, timestamps, linked OAuth *providers* (google/apple), session metadata (created/last_seen/ip — no `token_hash`) | password hash, OTP/reset secrets, TOTP secret, phone HMAC pepper |
| `provider-profile` | profile fields, services, tags, languages, phone-visibility flag, publish state | — |
| `provider-availability` | current status + history events | — |
| `direct-messaging` | threads the user is a participant in, **including message bodies they already had access to**; counterpart identified by `userId` + `displayName` only | counterpart email/phone; threads the user is not in |
| `provider-reviews` | reviews the user authored + replies on their provider profile | other seekers' reviews except as they appear on the subject's own profile |
| `trust-and-safety` | verification **case metadata** (status, dates, reasons); reports the user filed; blocks they created | identity-document **binaries**; other parties' report free-text beyond what the reporter already wrote |
| `listing-billing` | subscription state, invoices/receipts (amounts, dates, PSP invoice refs) | `psp_customer_ref`, authorization codes |
| `user-notifications` | preferences + in-app notification log (title/body/deep-link) | push endpoint keys |
| `media-processing` | `media`-bucket photo ids + public variant URLs owned by the user | `identity-docs` objects (binaries never leave the deny-by-default bucket; case metadata is in the trust slice) |

### 9.3 Delivery

`POST /admin/api/platform/export/:userId` (moderation-admin §7) returns `{ data: { generatedAt, userId, slices } }` with `Content-Disposition: attachment; filename="peach-finder-export-<userId>-<date>.json"`. `Idempotency-Key` accepted; a retry with the same key returns the same payload without a second audit row. No async job — SR-CAP-01 scale fits a synchronous read.

---

## 10. Open questions / assumptions (config-key naming tiebreaker)

Every naming/value choice made here, so other LLDs reconcile against this file:

1. **`listing-billing.trial_period_days` default `14`** — FRS says only "platform-configured length" (FR-MONET-02) and BRD BR-19 gives no number. `14` is a flagged assumption; the value is admin-editable so the launch number is an ops decision, not a code change. **Billing LLD (§5) must cite this exact key name.** Confirmed consistent with billing section authored in parallel.
2. **`listing-billing.grace_period_days` default `7`** — matches FR-MONET-04's stated 7-day default. Billing §4/§5 cites this key.
3. **`listing-billing.listing_price_cents` / `listing-billing.featuring_price_cents`** — no BRD/FRS numbers (FR-MONET-07 "platform configuration"). Defaults `9900` / `4900` cents ZAR are placeholders for bootstrap; real prices set in console pre-launch.
4. **`listing-billing.dunning_offset_days` default `[1,3,6]`** — dunning schedule within a 7-day grace; FR-MONET-04 mandates "dunning notifications" but not offsets. Coordinated with billing §5.
5. **`provider-availability.active_week_window_days`** — marked **not** FR-ADM-06-editable (FR-AVAIL-06 defines the 7-day rule as computed, not admin-tunable); stored as config only so the recompute job has one source. Availability LLD reads the same key; do not hardcode a second 7.
6. **Area/lexicon audit actions** — **Closed 2026-08-20:** `platform-configuration.area_change` / `platform-configuration.lexicon_change` in event-catalog.md §4; written in-transaction on §6.3 area/lexicon CRUD.
7. **Lexicon `maps_to` schema** — **Closed 2026-08-20:** this module imports `discovery-search`'s per-`entry_type` Zod schema at write time (§6.3). Discovery remains authoritative for the shape.
8. **`reminder_lead_minutes < expiry_minutes`** — **Closed 2026-08-20:** rejected at this module's PUT (§6.3), so availability T3 cannot be silently disabled by config.
