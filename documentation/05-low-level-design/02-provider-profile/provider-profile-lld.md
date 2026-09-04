---
title: Peach Finder — LLD — Provider Profile Module
updated: 2026-08-20
---

# Provider Profile (`provider-profile`) — Low-Level Design

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Low-Level Design — `provider-profile` module (`src/lib/server/modules/provider-profile/`) |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | FRS §7 (PROF), §2 (Actors), §18; SRS §5 (SR-APP-01), §6 (DATA), §11 (SR-SEC-05/09); HLD §6.1 (`provider-profile` row), §6.3, §7.4, §10.2; `03-user-stories` E2 (US-VIEW), E7 (US-PONB), §19.2 |
| Foundations (binding) | `00-foundations/shared-kernel.md`, `00-foundations/api-conventions.md`, `00-foundations/event-catalog.md`, `00-foundations/security-implementation.md` |
| Owns downstream contracts | `provider_profile.service_tag`, `provider_profile.service_tag_proposal` shared shapes (curated vocabulary per FR-PROF-03) |
| Status | Living document — updated in place |

**What this document is:** the module that owns the ProviderProfile aggregate — the mini-landing-page (BR-7) a seeker judges without a phone call. It owns profile content, services, the curated service-tag vocabulary, language selections, photo *metadata* (bytes live in `media-processing`), publish state, and the phone-visibility rule that is the crux of FR-PROF-08. It does **not** own: presence/online-status (owned by `direct-messaging`, §7), badges (owned by `trust-and-safety`, §8), rating aggregates (owned by `provider-reviews`), response time (owned by `direct-messaging`), listing/billing state (owned by `listing-billing`), or photo bytes/processing (owned by `media-processing`). Those are composed at read time through facades.

**Binding stances honoured:** no pre-publication gating of any kind (FRS §1) — publish and every edit are live immediately; the module contains no code path that reviews, screens, or holds content. `PROFILE_INCOMPLETE` is a completeness check, never a content judgement (FR-PROF-02, FR-PROF-05).

---

## 2. Module purpose & scope

| In scope | Out of scope (owner) |
|---|---|
| ProviderProfile aggregate: intro, area reference, publish state, phone-visibility flag | Display name, legal name, registration phone — `identity-and-access` (`identity_and_access.user`) |
| Services (name, description, duration, price in integer cents) | Presence / online status, response-time bucket — `direct-messaging` (§7) |
| Curated service-tag vocabulary + tag proposals (FR-PROF-03) | Badge state (identity-verified, active-this-week) — `trust-and-safety` (§8) |
| Language selection against a config-seeded reference list (FR-PROF-01) | Rating average + count — `provider-reviews` |
| Photo *metadata* + gallery ordering + primary flag (FR-PROF-01) | Photo bytes, variants, EXIF strip, MinIO — `media-processing` (`12-media-processing`) |
| Publish/unpublish state machine (§4) incl. reactions to billing/moderation events | Listing/free-period/lapse lifecycle — `listing-billing`; discovery/ranking — `discovery-search` |
| Per-role serialization enforcing phone visibility (FR-PROF-08, §5.6) | Admin tag-review workflow UI/queue — `08-moderation-admin` (this doc only owns the proposal table + submission endpoint, §8) |
| Preview-as-seeker (FR-PROF-12), share-link metadata (FR-PROF-11) | Search projection updates — `discovery-search` (reacts to this module's events) |

**One-provider-one-profile (FR-PROF-13):** enforced by a unique constraint on `provider_profile.owner_id` (§3.4). No business/spa/multi-therapist model exists.

---

## 3. Data model — `provider-profile` schema (Postgres DDL)

Conventions from `shared-kernel.md` §10: schema-per-module; cross-schema FKs permitted **only** onto `identity_and_access.user(id)` and `platform_configuration.area(id)`; every other cross-module reference is a bare UUID resolved via facade. All IDs UUIDv7 (`shared-kernel.md` §2). Money is integer cents (`shared-kernel.md` §5). Timestamps `timestamptz` UTC (`shared-kernel.md` §4, SR-APP-09).

### 3.1 Enums

```sql
create type provider_profile.publish_state    as enum ('draft', 'published', 'unpublished');
create type provider_profile.unpublish_reason as enum ('owner', 'admin', 'billing_lapse');
create type provider_profile.photo_status     as enum ('pending', 'ready', 'failed'); -- mirrors media_processing.photo.status, §8
create type provider_profile.proposal_status  as enum ('pending', 'accepted', 'rejected');
```

### 3.2 `provider_profile.service_tag` — curated vocabulary (owned here, admin-edited via console; FR-PROF-03)

```sql
create table provider_profile.service_tag (
  id          uuid primary key,
  name        text not null,                 -- display, e.g. 'Deep tissue'
  slug        text not null unique,          -- stable key, e.g. 'deep-tissue'; used by discovery lexicon seed (SR-APP-02)
  is_active   boolean not null default true, -- soft-retire: inactive tags stop being selectable/suggested, existing selections unaffected
  created_at  timestamptz not null default now()
);
create index service_tag_active_idx on provider_profile.service_tag (is_active) where is_active;
```

- **Ownership note (LLD-level clarification of HLD §6.1):** the tag vocabulary is listed under `provider-profile`'s ownership in HLD's module table. The admin console edits it, but the admin route (`/admin/api/provider/service-tags`, §5.3) calls into **`provider-profile`'s facade** (`provider-profile.adminCreateTag` / `adminUpdateTag` / `adminRetireTag`) — the console is a delivery surface, not an owner (HLD §6.1 "admin console is a delivery surface, not a module"). Seeded at bootstrap from the FR-PROF-03 example set (SR-OPS-07). The `discovery-search` lexicon (SR-APP-02) is seeded from `slug` values but is a separate `platform-configuration`-owned dataset — this table is the authority for *selectable* tags.
- Tags are **data, never a code enum** (clean-code §12, `provider-profile` row).

### 3.3 `provider_profile.service_tag_proposal` — provider-proposed missing tags (FR-PROF-03; owned here)

```sql
create table provider_profile.service_tag_proposal (
  id           uuid primary key,
  proposed_by  uuid not null references identity_and_access."user"(id),
  name         text not null,                        -- free-typed proposed name
  status       provider_profile.proposal_status not null default 'pending',
  created_at   timestamptz not null default now()
);
create index service_tag_proposal_status_idx on provider_profile.service_tag_proposal (status, created_at)
  where status = 'pending';                          -- admin queue, oldest-first
```

- The proposal **never blocks the profile** (FR-PROF-03). Submission endpoint in §5.3. The admin review/accept/reject workflow (which, on accept, creates a `service_tag` row) is specified in **`08-moderation-admin`** — this document owns only the table and the submission path.

### 3.4 `provider_profile.provider_profile` — the aggregate root

```sql
create table provider_profile.provider_profile (
  id                uuid primary key,
  owner_id          uuid not null unique references identity_and_access."user"(id),  -- FR-PROF-13: one profile per account
  area_id           uuid references platform_configuration.area(id),                    -- FR-PROF-04 general service location; null in draft until set
  intro             text,                                                 -- FR-PROF-01 plain text, ~600 char cap enforced in domain + Zod (§5.2)
  publish_state     provider_profile.publish_state not null default 'draft',
  unpublish_reason  provider_profile.unpublish_reason,                            -- non-null iff publish_state = 'unpublished' (§4)
  phone_visible     boolean not null default false,                       -- FR-PROF-08 default OFF (privacy-safe opt-in)
  first_published_at timestamptz,                                         -- set once, on first draft→published transition; billing free-period anchor (FR-MONET-02) is billing-owned but this is the provider-side fact
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint unpublish_reason_consistency check (
    (publish_state = 'unpublished') = (unpublish_reason is not null)
  )
);
create index provider_profile_area_idx  on provider_profile.provider_profile (area_id);
create index provider_profile_state_idx on provider_profile.provider_profile (publish_state);
```

- **No phone number column, no display-name column.** Both are owned by `identity-and-access` (`identity_and_access.user(display_name, ...)` per shared kernel; the OTP-verified registration phone lives in `identity-and-access`). Serialization resolves them via `identity-and-access`'s facade (§5.6). This is privacy-by-construction (HLD §10.2) and the single-source-of-truth rule — the phone is stored once, in `identity-and-access`.
- **No exact address field anywhere** (FR-PROF-04, FR-PRIV-02, SR-PRIV-02) — `area_id` is the finest location the schema can express.
- `intro` cap ~600 chars (FR-PROF-01): enforced in the domain factory and the Zod schema; the column itself is unbounded `text` (belt-and-braces at the two layers per `shared-kernel.md` §9, not a DB `varchar(600)` that would truncate silently).
- No response-time columns (owned by `direct-messaging`, §7). No rating columns (owned by `provider-reviews`). No badge columns (owned by `trust-and-safety`).

### 3.5 `provider_profile.service` — services offered (FR-PROF-01)

```sql
create table provider_profile.service (
  id                   uuid primary key,
  provider_profile_id  uuid not null references provider_profile.provider_profile(id) on delete cascade,
  name                 text not null,
  description          text,                       -- optional (FR-PROF-01)
  duration_minutes     integer not null check (duration_minutes > 0 and duration_minutes <= 600),
  price_cents          integer not null check (price_cents >= 0),  -- Money integer cents, ZAR (shared-kernel.md §5); starting-price shown on cards (FR-SRCH-11)
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now()
);
create index service_profile_idx on provider_profile.service (provider_profile_id, sort_order);
```

- At least one service **with a price** is a publish minimum (FR-PROF-02, §4.3). `price_cents` typed `integer` per the shared-kernel Money convention and the `no-money-as-float` lint rule (`shared-kernel.md` §5).

### 3.6 `provider_profile.provider_service_tag` — profile × tag join (FR-PROF-03)

```sql
create table provider_profile.provider_service_tag (
  provider_profile_id  uuid not null references provider_profile.provider_profile(id) on delete cascade,
  service_tag_id       uuid not null references provider_profile.service_tag(id),
  primary key (provider_profile_id, service_tag_id)
);
create index provider_service_tag_tag_idx on provider_profile.provider_service_tag (service_tag_id);
```

- Both FKs are intra-schema, so real referential integrity applies. Selecting an unknown/inactive tag ID returns `SERVICE_TAG_NOT_FOUND` (§5.3) — the domain re-checks `is_active` at set time.

### 3.7 `provider_profile.language` + `provider_profile.provider_language` — languages spoken (FR-PROF-01)

FR-PROF-01 says languages come "from a standard language list" → modelled as a small **config-seeded static reference table**, not free text (parallels the tag rationale: a closed list makes the `speaks Zulu` search intent and the language filter coherent, FR-SRCH-02/04).

```sql
create table provider_profile.language (
  code        text primary key,             -- BCP-47 primary subtag / ISO 639-1, e.g. 'en', 'zu', 'af', 'xh', 'st'
  name        text not null,                -- English display name, e.g. 'Zulu'
  is_active   boolean not null default true,
  sort_order  integer not null default 0
);

create table provider_profile.provider_language (
  provider_profile_id  uuid not null references provider_profile.provider_profile(id) on delete cascade,
  language_code        text not null references provider_profile.language(code),
  primary key (provider_profile_id, language_code)
);
```

- Seeded at bootstrap (SR-OPS-07) with the launch-market language set (English, Zulu, Afrikaans, Xhosa, Sotho, … — the acceptance query "speaks Zulu", BRD §13, must resolve). Editable as reference data; not a code enum. Unlike tags, providers cannot *propose* languages (FR-PROF-01 constrains to the standard list; no proposal path required).

### 3.8 `provider_profile.provider_photo` — gallery metadata (FR-PROF-01; bytes owned by `media-processing`)

```sql
create table provider_profile.provider_photo (
  id                   uuid primary key,
  provider_profile_id  uuid not null references provider_profile.provider_profile(id) on delete cascade,
  photo_id             uuid not null,           -- media_processing.photo(id); NO FK (cross-module, resolved via media facade / MediaProcessed payload)
  status               provider_profile.photo_status not null default 'pending',  -- mirrors media processing; §8
  sort_order           integer not null default 0,
  is_primary           boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (provider_profile_id, photo_id)
);
create index provider_photo_profile_idx on provider_profile.provider_photo (provider_profile_id, sort_order);
create unique index provider_photo_one_primary_idx
  on provider_profile.provider_photo (provider_profile_id) where is_primary;   -- at most one primary per profile
create index provider_photo_photo_idx on provider_profile.provider_photo (photo_id);  -- for MediaProcessed/MediaRemoved lookup
```

- **Metadata only** — no bucket/object-key/variant columns; the variant URLs are resolved from `media-processing`'s facade / carried on `MediaProcessed` (§8). `provider_photo` holds the *gallery* facts: which photos belong to this profile, their order, and which is primary (first is primary, FR-PROF-01; reorderable, US-PONB-03).
- Gallery size **1–12** (FR-PROF-01): the 12-max is enforced at attach time in the domain (`PHOTO_LIMIT_REACHED` surfaces from `media-processing` at upload, §5.5; provider also rejects a 13th attach defensively). At least one `status='ready'` photo is a publish minimum (§4.3).
- `photo_status='pending'` rows are excluded from every public serializer (§5.6) and from the publish-readiness count — a still-processing or failed upload never appears on the profile.

---

## 4. Publish-state machine

The aggregate's lifecycle. States are `provider_profile.publish_state`; the domain models transitions as pure functions returning the next state or a typed error (clean-code §4, "state machines are explicit"). Discovery visibility additionally requires an active listing (billing) — this module owns *publish* state only; `discovery-search` ANDs `is_published` with `is_listed` per FR-SRCH-09 (see §6 note).

### 4.1 Transition table

| # | From | Trigger | Guard | To | Events published | Audit |
|---|---|---|---|---|---|---|
| T1 | (none) | `createDraftProfile(ownerId, areaId?)` — provider-registration route (§5.1) | one per `owner_id` (FR-PROF-13) | `draft` | — | — |
| T2 | `draft` | owner taps Publish (`POST …/publish`) | `isPublishReady` predicate holds (§4.3) else `PROFILE_INCOMPLETE` | `published` (set `first_published_at` if null) | `ProviderPublished{providerProfileId, ownerId, areaId}` | — (owner action, not a moderation/money action; no audit row per shared-kernel §7) |
| T3 | `unpublished(owner)` / `unpublished(admin)` | owner taps Publish/Republish | `isPublishReady` holds | `published` (clear `unpublish_reason`) | `ProviderPublished` | — |
| T4 | `published` | owner taps Unpublish (`POST …/unpublish`) | ownership | `unpublished` reason `owner` | `ProviderUnpublished{…, reason:'owner'}` | — |
| T5 | any published/unpublished | `ModerationActionTaken{action:'moderation.unpublish', targetType:'provider_profile'}` subscription (from `trust-and-safety`) | idempotent (processed-ledger, §8) | `unpublished` reason `admin` | `ProviderUnpublished{…, reason:'admin'}` | audit written by `trust-and-safety` in its own action tx (`moderation.unpublish`, event-catalog §4) — **not** here |
| T6 | `published` | `ListingLapsed{subscriptionId, providerProfileId}` subscription (from `listing-billing`) | idempotent (natural key on state) | `unpublished` reason `billing_lapse` | `ProviderUnpublished{…, reason:'billing_lapse'}` | audit written by `listing-billing` (`listing-billing.state_transition`) — not here |
| T7 | `unpublished(billing_lapse)` | reactivation: `SubscriptionActivated` **or** `PaymentSucceeded` subscription (from `listing-billing`) | only if current reason is `billing_lapse` **and** `isPublishReady` | `published` | `ProviderPublished` | — |
| T8 | any | edit intro/area/services/tags/languages/photos/phone-visibility | ownership; no state change | (unchanged) | `ProfileUpdated{providerProfileId, changedFields[]}` | — |

- **Republish is never admin- or review-gated** (FR-PROF-09, FR-MONET-04, US-ADMIN-04): an admin-unpublished (T5) or lapse-unpublished (T6) profile returns to `published` by the owner's own Publish (T3) or by billing reactivation (T7). Admin unpublish is not a republish gate.
- **T5 vs T4 vs T6 are distinct reasons** so downstream (notifications, provider dashboard copy) can frame billing lapse as *billing state, never moderation* (FR-MONET-04, US-BILL-04) and admin unpublish with the admin's reason (FR-ADM-05).

### 4.2 Event-cascade safety (why T7 emitting `ProviderPublished` is not a forbidden chain)

Clean-code §8 forbids event chains for workflows. T7 is triggered by a `listing-billing` event and itself emits `ProviderPublished`, which `listing-billing` subscribes to ("starts/**resumes** free-period clock", event-catalog §2). This terminates safely because `listing-billing`'s `ProviderPublished` handler is idempotent/state-aware: the free period is anchored once at first publish (`TrialStarted` natural-key idempotent on `providerProfileId`); a republish for a profile whose trial/subscription already exists is a **no-op** in billing. The meaningful consumer of the T7 `ProviderPublished` is `discovery-search` (projection re-add). Documented here so a reviewer does not flag the §13-checklist item #7 falsely. *(Open question 9.3 tracks final reconciliation with the billing LLD on which reactivation event is canonical.)*

### 4.3 Publish-readiness predicate (FR-PROF-02) — explicit spec

A pure domain function; the edit screen renders it as a checklist (US-PONB-02), Publish enforces it (T2/T3).

```
isPublishReady(profile): Result<true, { kind:'incomplete', missing: MissingField[] }>

MissingField ∈ { 'photo', 'intro', 'priced_service', 'language', 'area' }

ready ⟺ ALL of:
  (a) ≥ 1 provider_photo with status = 'ready'                      → else 'photo'
  (b) intro is non-empty after trim (1..600 chars)                 → else 'intro'
  (c) ≥ 1 service with price_cents present (price_cents >= 0 row)   → else 'priced_service'
  (d) ≥ 1 provider_language row                                     → else 'language'
  (e) area_id is not null                                           → else 'area'
```

- **Completeness only** — no content evaluation (FR-PROF-02, §1). A profile with one 1×1-pixel photo and the intro "." publishes; nothing here judges quality.
- The `POST …/publish` handler returns `422 PROFILE_INCOMPLETE` with `fields` = the `missing[]` list mapped to friendly per-field messages (api-conventions §3.2/§8), so the client can highlight exactly what's outstanding (FR-UX-05).

---

## 5. API contract

All routes follow `api-conventions.md`: envelope §3, error mapping §3.3, cursor pagination §4 (none of these endpoints paginate — profiles/services/photos are bounded lists returned whole), CSRF §9, standard headers §12. Ownership is enforced in the application layer via `AuthContext.requireOwnership(profile.ownerId)` (`shared-kernel.md` §8), never in the UI (SR-SEC-05, clean-code §5). Role floor is declared per route in its `+server.ts`/`+page.server.ts` (`security-implementation.md` §2 step 5).

### 5.1 Profile lifecycle & core fields

| Method / path | Role & ownership | Request (Zod, colocated) | Response (serializer) | Errors | Events |
|---|---|---|---|---|---|
| `GET /provider/:providerProfileId` (SSR page + `GET /api/provider/profile/:id`) | `anonymous`+ | — | `toPublicProfile` per viewer role (§5.6) | `NOT_FOUND` (unpublished/lapsed to non-owner → 404 not 403, anti-enumeration SR-SEC-05 / api-conventions §3.3) | — |
| `GET /api/provider/me/profile` | `provider`, owner | — | `toOwnerProfile` (full, incl. readiness checklist, phone_visible, publish_state) | — | — |
| `POST /api/provider/profile` (facade `createDraftProfile`) | `provider-profile`, self | `{ areaId? }` | `toOwnerProfile` (draft) | `409 conflict` if a profile already exists for owner (FR-PROF-13) | — |
| `PATCH /api/provider/profile` | `provider`, owner | `{ intro?: string(1..600) }` | `toOwnerProfile` | `VALIDATION_FAILED` | `ProfileUpdated{changedFields:['intro']}` |
| `PUT /api/provider/profile/area` | `provider`, owner | `{ areaId: zId<AreaId> }` | `toOwnerProfile` | `VALIDATION_FAILED`; `NOT_FOUND` if area inactive/unknown (checked via `platform-configuration` facade) | `ProfileUpdated{changedFields:['area']}` |
| `POST /api/provider/profile/publish` | `provider`, owner | — | `toOwnerProfile` (state `published`) | `422 PROFILE_INCOMPLETE` (fields=missing[]) | `ProviderPublished` |
| `POST /api/provider/profile/unpublish` | `provider`, owner | — | `toOwnerProfile` (state `unpublished/owner`) | — | `ProviderUnpublished{reason:'owner'}` |
| `PUT /api/provider/profile/phone-visibility` | `provider`, owner | `{ visible: boolean }` | `toOwnerProfile` | — | `ProfileUpdated{changedFields:['phone_visible']}` |

- **Draft creation (§5.1 row 3):** the provider-registration flow is a delivery-layer orchestration (`src/routes`, allowed to call multiple facades) that calls `identity-and-access` (account + OTP, FR-ACC-03) then `provider-profile.createDraftProfile(ownerId, areaId)`. No command handler calls another module's command (clean-code §3). `createDraftProfile` is create-if-absent and idempotent on `owner_id`.

### 5.1a Facade (module public surface, `index.ts`)

| Method | Used by | Purpose |
|---|---|---|
| `createDraftProfile(ownerId, areaId?)` | delivery-layer registration | Create-if-absent draft (FR-ACC-03 / FR-PROF-13) |
| `getSnapshot(providerProfileId)` | `discovery-search` hydrate / hourly reconcile | Intro, tags, languages, prices, area, ownerId, primary photo |
| `getProfileByOwnerId(userId)` | `trust-and-safety` | Resolve profile from owner for verification/report flows |
| `getGalleryCount(ownerId)` | `media-processing` upload gate | Live `ready` photo count vs FR-PROF-01 1–12 cap |
| `listPublishedAndListed()` | `discovery-search` hourly reconcile | Authoritative membership set |
| `listTagProposals()` / `resolveTagProposal(id, decision)` | admin console | FR-PROF-03 proposal review |
| `updatedAtSince(providerProfileId, since)` | `trust-and-safety` active-this-week job | Boolean — profile write in window; never a raw timestamp |
| `exportFor(userId)` | `platform-configuration.exportUserData` (SR-DATA-07) | Subject-access slice of the owner's profile/services/tags/languages/publish state (platform-configuration LLD §9) |

### 5.2 Services (FR-PROF-01)

| Method / path | Role | Request | Errors | Events |
|---|---|---|---|---|
| `POST /api/provider/profile/services` | provider, owner | `{ name:string(1..120), description?:string(0..1000), durationMinutes:int(1..600), priceCents:int(>=0) }` | `VALIDATION_FAILED` | `ProfileUpdated{changedFields:['services']}` |
| `PATCH /api/provider/profile/services/:serviceId` | provider, owner | partial of above | `NOT_FOUND`, `VALIDATION_FAILED` | `ProfileUpdated{changedFields:['services']}` |
| `DELETE /api/provider/profile/services/:serviceId` | provider, owner | — | `NOT_FOUND` | `ProfileUpdated{changedFields:['services']}` |
| `PUT /api/provider/profile/services/order` | provider, owner | `{ order: ServiceId[] }` | `VALIDATION_FAILED` | `ProfileUpdated{changedFields:['services']}` |

### 5.3 Tags: selection + proposal; language & area selection

| Method / path | Role | Request | Response / errors | Events |
|---|---|---|---|---|
| `GET /api/provider/service-tags` | anonymous+ (for the selection UI & filter chips) | — | active `service_tag` list | — |
| `PUT /api/provider/profile/tags` | provider, owner | `{ tagIds: ServiceTagId[] }` (full replace of selection) | `SERVICE_TAG_NOT_FOUND` if any id absent or `is_active=false` (event-catalog §5) | `ProfileUpdated{changedFields:['tags']}` |
| `POST /api/provider/service-tag-proposals` | provider | `{ name: string(1..60) }` | 201; proposal `pending` | — (admin review in `08-moderation-admin`; profile never blocked, FR-PROF-03) |
| `GET /api/provider/languages` | anonymous+ | — | active `language` list | — |
| `PUT /api/provider/profile/languages` | provider, owner | `{ codes: string[] }` | `VALIDATION_FAILED` if any code unknown/inactive | `ProfileUpdated{changedFields:['languages']}` |
| **Admin** `POST/PATCH/DELETE /admin/api/provider/service-tags[/:id]` | `admin` (hook floor, security-impl §2) | tag CRUD | — | — |

- **Admin tag CRUD (last row) — LLD-level clarification (flag):** HLD §6.1 describes tag vocabulary under the admin console; this LLD pins that the console route calls **`provider-profile`'s facade** (`adminCreateTag`/`adminUpdateTag`/`adminRetireTag`) — the domain and table stay owned by `provider-profile`; the console is delivery only. Retiring a tag sets `is_active=false` (never hard-deletes; existing `provider_service_tag` selections are preserved, they simply stop being suggested/filterable). Config-cache invalidation for the `discovery-search` lexicon is `platform-configuration`'s concern via `ConfigChanged` if the lexicon seed is re-derived — out of scope here.

### 5.4 Photos (metadata; upload/processing in `media-processing`, §8)

| Method / path | Role | Request | Response / errors | Events |
|---|---|---|---|---|
| `POST /api/provider/profile/photos` | provider, owner | `{ photoId: PhotoId }` (obtained from `media-processing` upload-init, §8) | creates `provider_photo` (`status` mirrors media; appended to gallery; `is_primary=true` iff first photo). `PHOTO_LIMIT_REACHED` if gallery already 12 (defensive; media enforces at upload) | `PhotoAdded` deferred until `MediaProcessed` marks it `ready` (§8) — *not* emitted on the pending attach |
| `PUT /api/provider/profile/photos/order` | provider, owner | `{ order: PhotoId[] }` | `VALIDATION_FAILED` | `ProfileUpdated{changedFields:['photos']}` |
| `PUT /api/provider/profile/photos/:photoId/primary` | provider, owner | — | sets `is_primary` (clears prior); `NOT_FOUND` | `ProfileUpdated{changedFields:['photos']}` |
| `DELETE /api/provider/profile/photos/:photoId` | provider, owner | — | removes row; calls `media-processing.remove(photoId)` facade | `PhotoRemoved{providerProfileId, photoId}` |

### 5.5 Preview-as-seeker (FR-PROF-12) & share metadata (FR-PROF-11)

| Method / path | Role | Behaviour |
|---|---|---|
| `GET /api/provider/me/profile/preview?as=anonymous\|seeker` | provider, owner | Returns `toPublicProfile` rendered with a **forced** viewer role, so the owner sees exactly the anonymous vs signed-in view (they differ only by phone visibility, §5.6). Read-only; no state change. |
| Share metadata | anonymous+ | The SSR `+page.server.ts` `load` for `/provider/:id` emits Open Graph tags for correct link previews (FR-PROF-11, SR-APP-01): `og:title` = display name (via `identity-and-access` facade), `og:description` = intro extract (first ~150 chars, plain text), `og:image` = primary photo `card_640` variant URL (via `media-processing`). No phone ever appears in OG tags regardless of `phone_visible` (share links are public, anonymous-equivalent). |

### 5.6 Serializers & the phone-visibility rule (crux of FR-PROF-08)

Per `security-implementation.md` §7 and `api-conventions.md` §11 — server-side per-role serializers in `provider-profile/infra/serializers.ts`; a field a role may not see is **never constructed** on the DTO (SR-SEC-09, FR-PRIV-01: "hiding must be server-side, not CSS"). The DTO type makes `phone` optional so there is no branch that could leak it.

```typescript
// provider-profile/infra/serializers.ts  — builds on security-implementation.md §7's exact example
export function toPublicProfile(p: ProviderProfileView, viewer: AuthContext): PublicProfileDTO {
  return {
    id: p.id,
    displayName: p.displayName,        // resolved via identity facade
    intro: p.intro,
    area: p.area,                      // { name, slug, centroidLat, centroidLng } via platform facade — never an address
    services: p.services,
    tags: p.tags,
    languages: p.languages,
    photos: p.photos.filter(ph => ph.status === 'ready'),   // pending/failed never served
    badges: p.badges,                  // via trust facade (§8) — identity_verified only if trust says granted & not suppressed
    rating: p.rating,                  // via reviews facade — { average, count } or { state:'new' } when count 0 (FR-REV-05)
    responseTime: p.responseTime,      // via messaging facade — coarse bucket or null (FR-MSG-08)
    onlineStatus: p.onlineStatus,      // via messaging facade — 'online' | 'today' | 'this_week' | 'a_while_ago' (§7)
    // FR-PROF-08 / FR-PRIV-01 — the one rule this module exists to get right:
    phone: (p.phoneVisible || viewer.role !== 'anonymous') ? p.phone : undefined,
  };
}
```

| Viewer role | `phone_visible = false` (default) | `phone_visible = true` |
|---|---|---|
| `anonymous` | phone **absent from DTO & markup** (FR-PROF-08 default OFF; FR-PRIV-01 server-side) | tap-to-call number present |
| `seeker` (signed in) | phone present (signed-in seekers see it either way — messaging already identity-gates them, FR-PROF-08) | present |
| `provider` viewing another profile | same as `seeker` | present |
| owner (own profile) | `toOwnerProfile` — always sees own number + the setting itself | same |

- The phone value itself is fetched from `identity-and-access`'s facade (`identity-and-access.getContactPhone(ownerId)`) inside the read-model assembly, **only** when the serializer will include it — the number is not loaded into memory for an anonymous+OFF request at all. `displayName`, `badges`, `rating`, `responseTime`, `onlineStatus`, `area` are likewise composed from facades at read time (this is a transactional read / read-side facade composition, HLD §6.4 — not the `discovery-search` projection, which serves search cards).
- **Rate limits:** none of the `provider-profile` write routes appear in the `security-implementation.md` §5.2 bucket table (profile edits are low-frequency, authenticated, ownership-scoped). Global auth/session protections and Cloudflare bot mitigation apply; no module-specific bucket is declared. (If abuse is observed, a `profile_write` per-account bucket is the tuning point — added to §5.2, not invented here.)

---

## 6. Domain events published & subscribed (cite `event-catalog.md` §2)

**Published** (payloads exactly per catalog; IDs + immutable facts only, `shared-kernel.md` §6.1):

| Event | When | Payload | Subscribers (per catalog) |
|---|---|---|---|
| `ProviderPublished` | T2/T3/T7 | `providerProfileId, ownerId, areaId` | `discovery-search` (projection upsert), `listing-billing` (starts/resumes free-period clock, idempotent — §4.2) |
| `ProviderUnpublished` | T4/T5/T6 | `providerProfileId, reason:'owner'\|'admin'\|'billing_lapse'` | `discovery-search` (projection remove) |
| `ProfileUpdated` | T8 (any field save) | `providerProfileId, changedFields[]` | `discovery-search` (projection refresh) — **not** `trust-and-safety`; FR-TRUST-04 rides `IdentityAttributesChanged` from `identity-and-access` |
| `PhotoAdded` | on `MediaProcessed` finalizing a pending gallery photo (§8) | `providerProfileId, photoId` | `discovery-search` (projection refresh) |
| `PhotoRemoved` | on photo delete (owner) or moderation removal (§8) | `providerProfileId, photoId` | `discovery-search` (projection refresh) |

**Subscribed** (this module's `infra/subscriptions.ts`; every handler idempotent per `shared-kernel.md` §6.4):

| Event | Publisher | Handler action | Idempotency |
|---|---|---|---|
| `ListingLapsed` | `listing-billing` | T6 — unpublish reason `billing_lapse` | natural key (no-op if already `unpublished/billing_lapse`) |
| `SubscriptionActivated` / `PaymentSucceeded` | `listing-billing` | T7 — republish iff currently `unpublished/billing_lapse` & ready | natural key (no-op if already `published`) |
| `ModerationActionTaken{action:'moderation.unpublish'}` | `trust-and-safety` | T5 — unpublish reason `admin` | processed-ledger (`shared.processed_events`, subscriber `provider:moderation`) |
| `MediaProcessed` | `media-processing` | finalize pending `provider_photo` → `ready`, publish `PhotoAdded` (§8) | natural key on `provider_photo(photo_id)` |
| `MediaRemoved` | `media-processing` | prune any dangling `provider_photo` for `photoId` | natural key (no-op if row gone) |

- **Discovery membership:** a projection row's *existence* is the discoverable predicate (FR-SRCH-09). This module emits `ProviderPublished` / `ProviderUnpublished`; `listing-billing`'s `ListingLapsed` deletes the row; T7 republish re-inserts it. There is no `is_published` × `is_listed` column pair on the projection.

---

## 7. Online-status / presence display

**Raw presence is owned by `direct-messaging` (SR-APP-06), not here.** `direct-messaging` owns the authenticated-session heartbeat and the coarsening logic; this module only *renders* the coarse bucket returned by `direct-messaging`'s facade.

- Serialization calls `direct-messaging.getPresence(ownerId, now): 'online' | 'today' | 'this_week' | 'a_while_ago'` — a value already coarsened server-side. This module never sees, stores, or exposes a raw `last_seen` timestamp (SR-APP-06, clean-code §12 `direct-messaging` row: "raw timestamps never leave the module").
- Response-time bucket is likewise `direct-messaging.getResponseTime(providerProfileId): 'within_30_min' | 'within_a_few_hours' | 'within_a_day' | null` (FR-MSG-08); `null` renders as *no claim* (US-VIEW-02), never a fabricated one.
- This module reimplements neither. If `direct-messaging` is unavailable, the serializer renders `onlineStatus`/`responseTime` as absent (graceful degradation, SR-AVL-06) — the profile still loads.

---

## 8. Edge cases

### 8.1 Photo lifecycle across the `provider-profile`/`media-processing` boundary
1. Client calls `media-processing` upload-init (scope `profile_photo`, §12-media-processing §7) → `photoId` (status `pending`) + staging target; uploads bytes.
2. Client calls `POST /api/provider/profile/photos { photoId }` → `provider_photo` row created `status='pending'`, appended, `is_primary` iff first. (Ownership: the photo's `ownerId` must equal `ctx.userId` — resolved via `media-processing` facade — else `403`.)
3. `media-processing` worker finishes → `MediaProcessed{photoId, ownerId, variantUrls}`. This module's subscriber finds the `provider_photo` by `photo_id`, flips to `ready`, publishes **`PhotoAdded`** → `discovery-search` refresh. Only now does the photo appear in public serializers (§5.6 filters `status='ready'`) and count toward publish-readiness (§4.3).
4. `media-processing` failure → `status='failed'`; the poll/status surface (media §7) shows the plain-language retryable error (FR-UX-05); no `PhotoAdded`, nothing published to discovery. The owner can delete the failed row and retry.
5. Removal (owner `DELETE`, or admin `ModerationActionTaken{moderation.remove_photo}` → `trust-and-safety` calls `media-processing.remove`, which emits `MediaRemoved`): `provider_photo` pruned, `PhotoRemoved` published. If the removed photo was primary, the domain promotes the next-in-order photo to primary so a published profile never loses its primary (keeps FR-PROF-01 "first is primary" invariant).

### 8.2 Identity-relevant field change → badge suppression (FR-TRUST-04)
- **This module does not know about badges** and does **not** trigger suppression. Display name and the OTP-verified registration phone are owned by `identity-and-access`. Those writes go through `identity-and-access`'s facade and publish `IdentityAttributesChanged`; `trust-and-safety` subscribes to that event (event-catalog §2). This module's `ProfileUpdated.changedFields` enumerate provider-owned fields only (`intro, area, services, tags, languages, photos, phone_visible`).

### 8.3 One-provider-one-profile guard (FR-PROF-13)
- `provider_profile.owner_id` is `unique`. `createDraftProfile` is create-if-absent; a second attempt returns the existing profile (idempotent), never a second row. No business/spa accounts exist (FR-PROF-13 W-guard honoured by omission).

### 8.4 Tag proposal path (admin-facing) — scope boundary
- This document owns `service_tag_proposal` (§3.3) and the submission endpoint (§5.3). The review/accept/reject workflow, admin notification, and the accept-creates-`service_tag` action are specified in **`08-moderation-admin`**. The profile is *never* blocked on a proposal outcome (FR-PROF-03).

### 8.5 Anonymous vs signed-in profile fetch of an unpublished/lapsed profile
- A `draft`/`unpublished`/lapsed profile is reachable by URL **only** to its owner and admins (FR-SRCH-09). To any other viewer, `GET /provider/:id` returns `404 NOT_FOUND` (not 403) — existence is not confirmed (SR-SEC-05 anti-enumeration, api-conventions §3.3).

---

## 9. Open questions / assumptions

| # | Item | Assumption taken (so build is unblocked) | Needs alignment with |
|---|---|---|---|
| 9.1 | FR-TRUST-04 trigger | **Closed:** `identity-and-access` publishes `IdentityAttributesChanged`; this module does not put `display_name`/`phone` on `ProfileUpdated` | — |
| 9.2 | Discovery re-add on T7 | **Closed:** `ProviderPublished` upserts the projection row; membership = row existence | — |
| 9.3 | Canonical T7 billing event | **Closed:** subscribe to both `SubscriptionActivated` and `PaymentSucceeded`; billing T8 emits both | — |
| 9.4 | Language reference: BCP-47 vs ISO 639-1 codes, and the exact seed set | ISO 639-1 primary subtags, seeded with the launch-market set incl. Zulu (`zu`) to satisfy BRD §13 "speaks Zulu" | `platform-configuration` bootstrap (SR-OPS-07), `discovery-search` lexicon |
| 9.5 | Whether a `profile_write` rate-limit bucket is needed | None declared (authenticated + ownership-scoped, low frequency); add to security-impl §5.2 only if abuse observed | `security-implementation.md` §5.2 |
| 9.6 | Presence/response-time facade names | **Closed:** `direct-messaging.getPresence(userId, now)` and `direct-messaging.getResponseTime(providerProfileId)` with buckets `within_30_min` / `within_a_few_hours` / `within_a_day` | — |

**Assumptions of record:** languages are a closed config-seeded reference list (not free text), mirroring the tag rationale (§3.7); the profile view is a transactional read composed from facades, not the `discovery-search` projection (§5.6); phone number is stored once in `identity-and-access` and never duplicated in `provider-profile` (§3.4).
