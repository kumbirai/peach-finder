---
title: Peach Finder — LLD — Discovery & Search Module
updated: 2026-08-20
---

# Discovery & Search — Low-Level Design

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Low-Level Design — `discovery-search` module (`src/lib/server/modules/discovery-search/`, schema `discovery_search`) |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | FRS §6 (SRCH), FR-REV-05 (highly-rated threshold), FR-PROF-04/08 (area, phone visibility); SRS SR-APP-02 (deterministic parser), SR-APP-03 (index + ≤30 s freshness + ranking-in-SQL), SR-PERF-01/02/06, §16 D-5 (no LLM/ML on search path); HLD §6.4 (CQRS projection), §7.1 (search runtime flow), HLD-DEC-04 (Postgres FTS + pg_trgm as the search engine); user-stories §4 (E1, BRD §13 acceptance set), §19.1 (golden path); clean-code-guidelines §12 (`discovery-search` — "determinism is law") |
| Foundations (cited, not restated) | `00-foundations/shared-kernel.md`, `00-foundations/api-conventions.md` (envelope, cursor pagination §4, per-role serializers §11), `00-foundations/event-catalog.md` §2, `00-foundations/security-implementation.md` §5.2 (`search_query`, `search_suggest`), §6 (config cache) |
| Contract this LLD **defines** for others | The `platform_configuration.lexicon_entry.maps_to` JSON shape per `entry_type` (§5) — storage/admin-CRUD is owned by `13-platform-configuration`, but discovery is the sole interpreter and therefore owns the shape |
| Status | Living document — updated in place |

**What this module is:** the entire read side of "who is available now?" (BRD §2). It owns a denormalized, event-fed **search projection** (one row per published-and-listed provider), a fully **deterministic lexicon parser** (SR-APP-02, D-5 — no ML, no per-user state, no external call), the **ranking SQL** that enforces availability-first ordering and the featured-never-outranks-available rule in `ORDER BY` (SR-APP-03), the suggestions endpoint, and empty-result relaxation. It **publishes no domain events** (pure read side, HLD §6.1); it subscribes widely to keep the projection fresh.

**Determinism is law (clean-code §12).** Identical (normalized query + filters + coordinates) yields byte-identical result ordering for every user (FR-SRCH-13). This is achieved by construction, not testing: the parser is a pure function of `(query, lexicon snapshot, filters, coords)`; ranking is a single SQL `ORDER BY` terminating in a total-order tiebreak (`provider_profile_id`); nothing on the path reads per-user state, a clock for ranking, randomness, or a network.

---

## 2. Module purpose & scope

| Requirement | What this module delivers |
|---|---|
| FR-SRCH-01 | Homepage "who is available now?" feed; below-the-fold "Active this week" tier when nobody is available (§7) |
| FR-SRCH-02 | Free-text → structured filters via the deterministic lexicon parser (§5) |
| FR-SRCH-03 | Availability-first, availability-recency ordering, in filtered results too (§6) |
| FR-SRCH-04 | Manual filters (price, language, min-rating, verified) combining with the query (§5.7, §6) |
| FR-SRCH-05 | Parsed intents returned as removable chips (§10 response) — parser output is the chip source |
| FR-SRCH-06 | Proximity: haversine distance to provider **area** centroid, never an address (§6) |
| FR-SRCH-07 | Suggestions (service terms/areas/intents only — **never** provider names) (§8) |
| FR-SRCH-08 | Featured boost that never bypasses relevance (a/8a) or outranks availability (c/8c) (§6) |
| FR-SRCH-09 | Only published + currently-listed providers appear (projection membership = this rule) (§4) |
| FR-SRCH-10 | Empty-result relaxation with a deterministic single-filter suggestion (§9) |
| FR-SRCH-13 / D-5 | No personalization, no ML, no external call on the search path — proven by construction (§5.6) |
| SR-APP-02/03 | Parser deterministic; ranking in SQL; projection fresh ≤ 30 s (§4) |
| SR-PERF-01/02/06 | Search API p95 ≤ 500 ms, suggest p95 ≤ 100 ms; 60 s discovery-cache freshness bound (delivery layer, §10) |

**Not owned here:** the lexicon *storage* and admin CRUD (`platform-configuration`/`13-platform-configuration`); the availability *state* (`provider-availability`); rating *aggregates* (`provider-reviews`); badge *state* (`trust-and-safety`); featured *billing state* (`listing-billing`). Discovery consumes all of these via events into its projection — never by cross-schema `SELECT` (HLD §6.3.3: FK/query only onto `identity_and_access.user`/`platform_configuration.area`; everything else via events/facades).

---

## 3. Boundary discipline — how discovery reads other modules' facts

Discovery must never `SELECT` from `provider_profile.*`, `provider_availability.*`, `provider_reviews.*`, `trust_and_safety.*`, or `listing_billing.*` on the query path — that would weld contexts and break the ≤ 500 ms budget with cross-schema joins. Instead:

- **Steady state:** every fact it ranks on is mirrored into `discovery_search.search_projection` by an event subscriber (§4). The search query touches only the `discovery-search` schema (+ FK-permitted `platform_configuration.area` for centroids).
- **Self-healing:** an hourly reconcile sweep (§4.3) *is* allowed to call the owning modules' **facades** (not their tables) to rebuild drifted rows — this runs on the worker, off the request path, so its latency is irrelevant.

The only cross-schema FK on the projection is `area_id → platform_configuration.area(id)` (permitted). `provider_profile_id` is a plain `uuid` PK with **no** FK onto `provider_profile.provider_profile` (same boundary rule as the availability LLD §3.1) — projection membership is lifecycle-driven by `ProviderPublished`/`ProviderUnpublished`, not by a database constraint.

---

## 4. Search projection data model

One row per **published, currently-listed** provider (FR-SRCH-09). A row's *existence* is the "discoverable" predicate: publish/list events insert it, unpublish/lapse/suspend events delete it. The query therefore needs no `is_published` flag — if a row is there, it is discoverable.

### 4.1 DDL — `discovery_search.search_projection`

```sql
create schema if not exists discovery_search;
create extension if not exists pg_trgm;   -- HLD-DEC-04 fuzzy/prefix matching

create table discovery_search.search_projection (
  provider_profile_id   uuid primary key,                 -- no FK (boundary rule §3); membership = discoverability
  owner_id              uuid not null,                    -- identity_and_access.user id; needed for FR-TRUST-08 block exclusion
  display_name          text not null,
  -- Free-text relevance corpus: intro + service names + tag names, denormalized on write.
  search_text           text not null default '',
  intro_tsvector        tsvector
                          generated always as (to_tsvector('english', coalesce(search_text, ''))) stored,
  -- Structured filter columns (all fed by events):
  service_tag_ids       uuid[]  not null default '{}',    -- provider_profile.provider_service_tag → tag ids
  language_codes        text[]  not null default '{}',    -- provider_profile.provider_language → ISO codes
  area_id               uuid    not null references platform_configuration.area(id),   -- permitted cross-schema FK
  price_min_cents       integer,                          -- min across the provider's services
  price_max_cents       integer,                          -- max across the provider's services
  -- Availability mirror (from availability module events):
  availability_state    text not null default 'not_available',  -- 'available' | 'not_available' (expiry_warned collapses to available for discovery)
  availability_set_at   timestamptz,                      -- mirrors provider-availability.set_at; null when not available
  -- Quality / trust / commercial mirrors:
  rating_average        numeric(2,1),                     -- null when no reviews → card shows "New" (FR-REV-05)
  rating_count          integer not null default 0,
  badge_identity_verified boolean not null default false,
  badge_active_this_week  boolean not null default false, -- FR-TRUST-01 / FR-SRCH-01; fed by BadgeGranted/Revoked, not a local proxy
  is_featured           boolean not null default false,
  featured_since        timestamptz,                      -- stable ordering anchor within a featured cohort
  -- Activity recency for homepage tier-2 among Active-this-week (FR-SRCH-01):
  last_activity_at      timestamptz,
  photo_primary_url     text,
  published_at          timestamptz not null,
  updated_at            timestamptz not null default now()
);
```

### 4.2 Indexes

```sql
-- Free-text relevance (leftover tokens → ts_rank). FR-SRCH-02.
create index search_projection_tsv_idx  on discovery_search.search_projection using gin (intro_tsvector);
-- Fuzzy / prefix over the relevance corpus (main-query fallback matching). HLD-DEC-04.
create index search_projection_trgm_idx on discovery_search.search_projection using gin (search_text gin_trgm_ops);
-- Tag / language array containment filters. FR-SRCH-02/04.
create index search_projection_tags_idx on discovery_search.search_projection using gin (service_tag_ids);
create index search_projection_lang_idx on discovery_search.search_projection using gin (language_codes);
-- Area filter/join for proximity. FR-SRCH-06.
create index search_projection_area_idx on discovery_search.search_projection (area_id);
create index search_projection_owner_idx on discovery_search.search_projection (owner_id);
-- The ranking ORDER BY's leading keys (§6): availability tier, recency, featured. Supports the homepage/empty-filter fast path.
create index search_projection_rank_idx on discovery_search.search_projection
  ((availability_state = 'available') desc, availability_set_at desc, is_featured desc);
```

### 4.3 Companion table — block exclusion (viewer-dependent, cannot live on the row)

Block exclusion follows **FR-TRUST-08**: hide the **blocker** from the **blocked party's** future search/browse. Messages are blocked both ways (messaging's job); discovery hide is **directed**, not an unordered pair. Discovery keeps a directed mirror fed by `UserBlocked` / `UserUnblocked`:

```sql
create table discovery_search.blocked_pair (
  blocker_id uuid not null,
  blocked_id uuid not null,
  primary key (blocker_id, blocked_id)
);
```

At query time, for a signed-in viewer `V`, exclude any provider whose owner **blocked** `V` (`blocker_id = owner_id AND blocked_id = V`). A seeker blocking a provider does **not** remove that provider from the seeker's own results. Anonymous viewers have no blocks, so the clause is omitted. `owner_id` lives on the projection row (§4.1).

---

## 4A. Projection maintenance — event subscribers

Every subscriber handler is idempotent (natural key = `provider_profile_id`, shared-kernel §6.4) and lives in `discovery-search/infra/subscriptions.ts`. Cross-referenced against event-catalog §2; the task's subscribe list plus the catalog's `MediaProcessed`/`MediaRemoved`/`UserBlocked` rows (which also name `discovery-search`).

| Subscribed event | Publisher | Projection effect |
|---|---|---|
| `ProviderPublished` | provider-profile | **Insert** row (upsert). Hydrate all columns from the event + a one-time facade fetch of the current profile snapshot (intro, tags, languages, prices, area, owner_id). First-publish or republish both land here |
| `ProviderUnpublished` | provider-profile | **Delete** row (`reason` ∈ owner/admin/billing_lapse) |
| `ProfileUpdated` | provider-profile | Refresh `search_text` (rebuilds tsvector), `service_tag_ids`, `language_codes`, `area_id`, `price_min/max_cents`, `display_name`; set `last_activity_at = occurredAt` |
| `PhotoAdded` / `PhotoRemoved` | provider (via media) | Refresh `photo_primary_url` (first photo = primary, FR-PROF-01) |
| `MediaProcessed` / `MediaRemoved` | media-processing | Refresh `photo_primary_url` if the changed photo is the profile primary (catalog §2) |
| `AvailabilitySet` | provider-availability | `availability_state='available'`, `availability_set_at=setAt`, `last_activity_at=greatest(last_activity_at, setAt)` |
| `AvailabilityCleared` | provider-availability | `availability_state='not_available'`, `availability_set_at=null` |
| `AvailabilityExpired` | provider-availability | `availability_state='not_available'`, `availability_set_at=null` |
| `RatingAggregateChanged` | provider-reviews | `rating_average=average`, `rating_count=count` (authoritative aggregate) |
| `ReviewSubmitted` | provider-reviews | **No projection write** — superseded by `RatingAggregateChanged`, which reviews always emits alongside (see §11 note). Subscribed only as a defensive trigger to reconcile if an aggregate event is ever missed; the handler is a no-op fast path keyed on already-current `rating_count` |
| `VerificationDecided` | trust-and-safety | On `decision='approved'`: `badge_identity_verified=true` (the `BadgeGranted` that follows is the authoritative flip; this is belt-and-braces) |
| `BadgeGranted` | trust-and-safety | If `badge='identity_verified'` → `badge_identity_verified=true`. If `badge='active_this_week'` → `badge_active_this_week=true` (authoritative FR-TRUST-06 signal; homepage tier-2 uses this column, §7) |
| `BadgeRevoked` | trust-and-safety | If `badge='identity_verified'` → `badge_identity_verified=false`; if `badge='active_this_week'` → `badge_active_this_week=false` |
| `ModerationActionTaken` | trust-and-safety | On `action ∈ {unpublish, suspend}`: **delete** row; other actions (remove_photo/remove_review) → refresh affected column |
| `UserBlocked` | trust-and-safety | Upsert `(blocker_id, blocked_id)` into `discovery_search.blocked_pair` — does not touch `search_projection` (§4.3) |
| `UserUnblocked` | trust-and-safety | `DELETE FROM discovery_search.blocked_pair WHERE blocker_id = :blockerId AND blocked_id = :blockedId` (restores FR-TRUST-08 visibility) |
| `IdentityAttributesChanged` | identity-and-access | If `changedFields` contains `display_name` and a projection row exists for this owner: refresh `display_name` from `identity-and-access.getDisplayIdentity` |
| `FeaturingActivated` | listing-billing | `is_featured=true`, `featured_since=occurredAt` |
| `FeaturingLapsed` | listing-billing | `is_featured=false`, `featured_since=null` (catalog payload carries `reason ∈ {cancelled, payment_failed, listing_lapsed}`; discovery ignores `reason` — any lapse clears the flag) |
| `SubscriptionActivated` | listing-billing | No-op for discovery (listing already live) — subscribed for completeness/audit only |
| `ListingLapsed` | listing-billing | **Delete** row (grace expired unpaid → not discoverable, FR-MONET-04) |

### 4A.1 Freshness argument (SR-APP-03 ≤ 30 s)

Event dispatch (outbox poll → pg-boss enqueue → handler) is sub-second at SR-CAP-01 volume (≤ 2,000 providers, low event rate) — comfortably inside the ≤ 30 s bound. This is the **primary** freshness mechanism. Because "event delivery should never drift" is a hope, not a guarantee, a **second, self-healing** statement runs hourly (HLD §8):

```sql
-- Hourly reconcile sweep (worker, off request path). Rebuilds any drifted row from the owning
-- modules' FACADES (not their tables), and deletes rows that should no longer be discoverable.
-- Pseudocode over facades; each facade call is a permitted synchronous read.
for each providerProfileId in providerFacade.listPublishedAndListed():   -- authoritative membership
    snapshot ← compose(providerFacade.getSnapshot(id),
                       availabilityFacade.getState(id),
                       reviewsFacade.getAggregate(id),
                       trustFacade.getBadges(id),
                       billingFacade.getFeaturing(id))
    upsert discovery_search.search_projection from snapshot
delete from discovery_search.search_projection
 where provider_profile_id not in (providerFacade.listPublishedAndListed())
```

Self-healing beats "should never happen": a missed/dead-lettered event surfaces as at most one hour of staleness on one row, auto-corrected — never a permanent divergence.

---

## 5. The lexicon parser (SR-APP-02, D-5) — deterministic pseudocode

The parser turns raw free text into a `StructuredQuery`. It is a **pure function** of `(rawQuery, lexiconSnapshot, manualFilters, coords)` — no per-user state, no clock, no randomness, no I/O (the lexicon is the in-process config-cache snapshot, security-implementation §6). This is the D-5 / FR-SRCH-13 guarantee *by construction* (§5.6).

### 5.1 The `maps_to` contract (defined here; storage owned by `13-platform-configuration`)

`platform_configuration.lexicon_entry(id, term, entry_type, maps_to jsonb, is_active)` — `entry_type ∈ {service_term, language, intent_availability, intent_rating, intent_verification, intent_proximity, synonym}`. Discovery is the sole interpreter of `maps_to`, so it defines the exact JSON shape per `entry_type`:

| `entry_type` | `maps_to` JSON | Meaning |
|---|---|---|
| `service_term` | `{ "serviceTagId": "<uuid>" }` | Term maps to a curated service tag (FR-PROF-03), e.g. "deep tissue" → the deep-tissue tag id |
| `language` | `{ "languageCode": "<iso-639-1>" }` | e.g. "zulu"/"speaks zulu" → `"zu"` |
| `intent_availability` | `{ "filter": "available_now" }` | Any availability phrase — including "tonight"/"this weekend" (see §5.5) |
| `intent_rating` | `{ "filter": "min_rating", "value": <number>, "minCount": <int> }` | "highly rated" → `value` and `minCount` **default from config** (§5.4), but a lexicon entry may pin explicit numbers |
| `intent_verification` | `{ "filter": "verified" }` | "verified"/"id verified" |
| `intent_proximity` | `{ "filter": "near_me" }` | "near me"/"close by"/"nearby" |
| `synonym` | `{ "resolvesToTermId": "<uuid>" }` | Points to another `lexicon_entry` (single hop; a synonym never targets a synonym — invariant enforced by platform-configuration at write, platform-configuration LLD §6.3) |

**Ownership split (stated for the reviewer):** *discovery's LLD defines the `maps_to` contract (this table); `13-platform-configuration`'s LLD owns storage, admin CRUD, seed data, and write-time validation against this schema.* The Zod schemas live in `discovery-search` and are exported from `index.ts` as `mapsToSchemaByEntryType` — `platform-configuration` imports that (facade only) on lexicon write. A synonym whose `resolvesToTermId` points at another synonym is rejected at that write.

### 5.2 `StructuredQuery` — the parser's output type

```typescript
// discovery-search/domain/structured-query.ts
export interface StructuredQuery {
  readonly serviceTagIds: ServiceTagId[];   // AND-of-none / union of matched service_term + manual tag chips
  readonly languageCodes: string[];         // union of matched language + manual language chips
  readonly availableNow: boolean;           // intent_availability OR manual "available now" chip
  readonly verified: boolean;               // intent_verification OR manual verified chip
  readonly nearMe: boolean;                 // intent_proximity; effective only if coords present (§5.7)
  readonly minRating: number | null;        // most-restrictive of intent_rating.value and manual min-rating
  readonly minRatingCount: number;          // companion to minRating (default from config)
  readonly priceMinCents: number | null;    // manual only (no price lexicon intents in V1)
  readonly priceMaxCents: number | null;
  readonly freeText: string;                // leftover unmatched tokens → relevance signal only, never a hard filter
  readonly appliedIntents: AppliedIntent[]; // provenance for FR-SRCH-05 removable chips
}
export type AppliedIntent =
  | { source: 'query' | 'manual'; kind: 'available_now' | 'verified' | 'near_me' }
  | { source: 'query' | 'manual'; kind: 'min_rating'; value: number }
  | { source: 'query' | 'manual'; kind: 'service_tag'; serviceTagId: ServiceTagId; label: string }
  | { source: 'query' | 'manual'; kind: 'language'; languageCode: string; label: string };
```

### 5.3 The algorithm

```
parse(rawQuery, lexicon, manualFilters, coords) -> StructuredQuery:

  # (a) NORMALIZE — pure string ops, locale-independent
  s := NFKC(rawQuery)                       # Unicode canonical form
  s := lowercase(s)
  s := replace all punctuation except intra-word apostrophe/hyphen with space
  s := collapse runs of whitespace to single space; trim
  tokens := s.split(' ')  (drop empty)

  # (b) LONGEST-MATCH-FIRST PHRASE DETECTION
  # lexicon.byTerm is a Map<normalizedTerm, LexiconEntry[]> built once per snapshot.
  # N := lexicon.maxPhraseWordCount (precomputed; e.g. "deep tissue massage" = 3).
  matches := []            # ordered list of matched LexiconEntry
  leftover := []           # tokens that matched nothing
  i := 0
  while i < tokens.length:
    matched := false
    for len := min(N, tokens.length - i) down to 1:        # greedy: longest window first
      phrase := tokens[i .. i+len-1].join(' ')
      entry  := lexicon.byTerm.get(phrase)  where is_active   # deterministic pick if multiple: lowest entry.id
      if entry exists:
        matches.push(entry); i += len; matched := true; break
    if not matched:
      if tokens[i] not in STOPWORDS: leftover.push(tokens[i])   # STOPWORDS is a fixed, versioned constant set
      i += 1

  # (c) RESOLVE SYNONYMS (single hop) then APPLY maps_to
  sq := empty StructuredQuery seeded from manualFilters (see 5.7)
  for entry in matches:
    if entry.entry_type == 'synonym':
      entry := lexicon.byId.get(entry.maps_to.resolvesToTermId)   # single hop; invariant: target is not a synonym
    switch entry.entry_type:
      'service_term':        sq.serviceTagIds  ∪= entry.maps_to.serviceTagId
                             sq.appliedIntents += {source:'query', kind:'service_tag', ...}
      'language':            sq.languageCodes  ∪= entry.maps_to.languageCode ; append chip
      'intent_availability': sq.availableNow := true            ; append chip (idempotent)
      'intent_verification': sq.verified := true                ; append chip
      'intent_proximity':    sq.nearMe := true                  ; append chip
      'intent_rating':       v := entry.maps_to.value ?? config('provider-reviews.highly_rated_min_average')   # 5.4
                             c := entry.maps_to.minCount ?? config('provider-reviews.highly_rated_min_reviews')
                             sq.minRating := max(sq.minRating ?? -∞, v)      # most-restrictive wins
                             sq.minRatingCount := max(sq.minRatingCount, c)  ; append chip

  # (d) LEFTOVER -> FREE TEXT (relevance only, never a hard filter)
  sq.freeText := leftover.join(' ')

  # (e) return sq   # a total, deterministic function of its inputs
  return sq
```

Key properties: **longest-match-first** means "deep tissue massage available now near me" resolves to `service_tag(deep tissue)` + `intent_availability` + `intent_proximity`, with "massage" falling to `freeText` — the phrase "deep tissue" is consumed as a unit before "deep"/"tissue" are considered individually. Ties (two active entries for the same term) break on lowest `entry.id` — a fixed, data-independent rule, preserving determinism even under lexicon ambiguity.

### 5.4 Config-driven thresholds (SR-APP-11, via config cache §6)

| Config key | Default | Used for |
|---|---|---|
| `provider-reviews.highly_rated_min_average` | `4.5` | `intent_rating` value when the lexicon entry doesn't pin one (FR-REV-05). Canonical name in `platform-configuration` §4. |
| `provider-reviews.highly_rated_min_reviews` | `3` | companion min review count for "highly rated" (FR-REV-05) |

Read from the config cache at parse time (in-process, no query). An admin retuning "highly rated" (FR-ADM-06) takes effect ≤ 5 min (SR-APP-11) with no deploy — the lexicon and thresholds are data.

### 5.5 "tonight" / "this weekend" → `available_now`

V1 has no forward-looking availability (FR-AVAIL-08 — availability is strictly present-tense). Colloquial future phrasings ("available tonight", "available this weekend") are therefore lexicon `intent_availability` entries mapping to `{ "filter": "available_now" }` — the system answers "who is available *now*", which is the only availability signal that exists. This is a **deliberate lexicon-data decision**, not parser logic: the parser treats every `intent_availability` entry identically; product/admin decides which phrases carry that type. Documented so a reviewer doesn't read "available tonight → available_now" as the parser inventing time semantics.

### 5.6 Determinism proof (D-5, FR-SRCH-13)

`parse` reads only its four arguments. `rawQuery` is client input; `lexiconSnapshot` is the in-process config-cache `Map` (identical across all `web`/`worker` processes within the 5-min TTL, and versioned by `ConfigChanged`); `manualFilters` are client input; `coords` are client input (transient, never stored — FR-PRIV-02). No branch consults a user id, session, clock, RNG, or network. Therefore two requests with identical arguments produce an identical `StructuredQuery`; feeding it to the identical ranking SQL (§6), which terminates in a total-order `provider_profile_id` tiebreak, produces an identical ordered row set. Personalization is impossible by construction — there is no seam where per-user data could enter.

### 5.7 Merging manual filters + intent conflicts

Manual filter chips (FR-SRCH-04) and parsed intents are **unioned** into the same `StructuredQuery` (both tagged `source` for the chip UI). Conflict rules, all deterministic:

- **Set-valued** (`serviceTagIds`, `languageCodes`): union.
- **Boolean** (`availableNow`, `verified`, `nearMe`): logical OR (a chip and an intent both asking for it is one filter).
- **Scalar `minRating`**: the **most restrictive** (max) of manual and intent values — asking "highly rated" (4.5) with a manual "≥4.0" yields 4.5.
- **`nearMe` without coords**: kept as an applied intent (so the chip shows and is removable) but has **no effect** on the WHERE/ORDER — proximity degrades gracefully to "no distance ordering" (FR-SRCH-06 graceful fallback); the UI offers manual area entry.

### 5.8 Worked examples — BRD §13 acceptance set

Walking each of the five example queries through §5.3 (≥ 3 shown in full per the mandate; all five tabulated):

**"Deep tissue massage near me"** — normalize → `[deep, tissue, massage, near, me]`. i=0: try "deep tissue massage" (no entry), "deep tissue" → `service_term {serviceTagId: T_deep}` ✓, consume 2. i=2: "massage" → no entry, not a stopword → leftover. i=3: "near me" → `intent_proximity {near_me}` ✓, consume 2. Result: `{ serviceTagIds:[T_deep], nearMe:true, freeText:"massage", appliedIntents:[service_tag(deep tissue), near_me] }`. → WHERE `service_tag_ids @> {T_deep}`; ORDER includes distance term (if coords).

**"Massage therapist who speaks Zulu"** — normalize → `[massage, therapist, who, speaks, zulu]`. i=0 "massage"→leftover; "therapist"→leftover; "who"→STOPWORD (dropped); i=3 try "speaks zulu" → `language {languageCode:"zu"}` ✓ (a two-word lexicon entry), consume 2. Result: `{ languageCodes:["zu"], freeText:"massage therapist", appliedIntents:[language(Zulu)] }`. → WHERE `language_codes && {'zu'}`.

**"Highly rated massage therapist"** — normalize → `[highly, rated, massage, therapist]`. i=0 "highly rated" → `intent_rating` with no pinned value → `value=config(4.5)`, `minCount=config(3)` ✓, consume 2. "massage","therapist"→leftover. Result: `{ minRating:4.5, minRatingCount:3, freeText:"massage therapist", appliedIntents:[min_rating(4.5)] }`. → WHERE `rating_average >= 4.5 and rating_count >= 3`.

| Query | Parsed `StructuredQuery` (hard filters) | freeText |
|---|---|---|
| "Massage therapist available now" | `availableNow:true` | "massage therapist" |
| "Deep tissue massage near me" | `serviceTagIds:[deep tissue]`, `nearMe:true` | "massage" |
| "Massage therapist available tonight" | `availableNow:true` (§5.5) | "massage therapist" |
| "Highly rated massage therapist" | `minRating:4.5`, `minRatingCount:3` | "massage therapist" |
| "Massage therapist who speaks Zulu" | `languageCodes:["zu"]` | "massage therapist" |

Each resolves to a sensible filtered set (US-DISC-02 acceptance). "massage"/"therapist" as leftover free text only nudges relevance among already-filtered rows — never excludes anyone (the vertical is massage; a hard filter on it would be meaningless).

---

## 6. The ranking SQL (SR-APP-03, FR-SRCH-03/08c)

Actual SQL (not pseudocode). All filters are bound parameters derived from the `StructuredQuery` — never string-concatenated (SR-SEC-06, clean-code §6). Each `ORDER BY` term is commented with the FR/SR it implements (clean-code §12).

```sql
-- discovery-search/infra/search-query.sql.ts (sql`` template, auto-parameterized)
-- $ params: available_now, verified, min_rating, min_rating_count, lang_codes, service_tag_ids,
--           price_min, price_max, free_text, lat, lng (nullable), viewer_user_id (nullable), limit, cursor tuple.
select
    p.provider_profile_id,
    p.display_name, p.photo_primary_url,
    p.availability_state, p.availability_set_at,
    p.rating_average, p.rating_count,
    p.badge_identity_verified, p.is_featured,
    p.price_min_cents, p.language_codes,
    -- proximity: haversine (km) from viewer coords to the provider AREA centroid (FR-SRCH-06, never an address)
    case when $lat is null then null else
      6371 * acos( least(1, greatest(-1,
        cos(radians($lat)) * cos(radians(a.centroid_lat)) *
        cos(radians(a.centroid_lng) - radians($lng)) +
        sin(radians($lat)) * sin(radians(a.centroid_lat))
      )) )
    end                                                            as distance_km,
    ts_rank(p.intro_tsvector, plainto_tsquery('english', $free_text)) as rel_rank
from discovery_search.search_projection p
join platform_configuration.area a on a.id = p.area_id
where
    -- ===== HARD FILTERS (parsed intents + manual) — a row either qualifies or it doesn't =====
    ( $available_now      = false or p.availability_state = 'available' )              -- FR-SRCH-02 availability intent
    and ( $verified       = false or p.badge_identity_verified = true )               -- FR-SRCH-04 verified filter
    and ( $min_rating     is null or (p.rating_average >= $min_rating
                                      and p.rating_count >= $min_rating_count) )       -- FR-REV-05 highly-rated
    and ( $lang_codes     is null or p.language_codes && $lang_codes )                 -- FR-SRCH-04 language (overlap)
    and ( $service_tag_ids is null or p.service_tag_ids @> $service_tag_ids )          -- FR-SRCH-02 service tags (contains all)
    and ( $price_max      is null or p.price_min_cents <= $price_max )                 -- FR-SRCH-04 price band overlap
    and ( $price_min      is null or p.price_max_cents >= $price_min )
    and ( $free_text = '' or p.intro_tsvector @@ plainto_tsquery('english', $free_text)
                          or p.search_text % $free_text )                              -- FR-SRCH-02 free-text (FTS or trigram); relevance, applied as membership only when free_text present
    -- block exclusion for signed-in viewers (FR-TRUST-08), viewer-dependent, off the projection row (§4.3)
    and ( $viewer_user_id is null or not exists (
            select 1 from discovery_search.blocked_pair b
            where b.blocker_id = p.owner_id and b.blocked_id = $viewer_user_id ) )
order by
    (p.availability_state = 'available') desc,        -- 1. FR-SRCH-03/08c: available outranks not-available (the protected tier)
    p.availability_set_at desc nulls last,            -- 2. FR-SRCH-03: within available, most-recently-set first (BR-2/BR-3)
    p.is_featured desc,                               -- 3. FR-SRCH-08: featured boost — AFTER availability, so it can never cross the tier or recency (proof below)
    rel_rank desc,                                    -- 4. FR-SRCH-02: free-text relevance
    distance_km asc nulls last,                       -- 5. FR-SRCH-06: nearer first (null when no coords → no effect)
    p.badge_active_this_week desc,                    -- 6. FR-SRCH-01: homepage tier-2 "Active this week" first
    p.last_activity_at desc nulls last,               -- 7. recency within that cohort
    p.rating_average desc nulls last, p.rating_count desc,  -- 8. quality tiebreak
    p.provider_profile_id                             -- 9. TOTAL-ORDER tiebreak → determinism (FR-SRCH-13) + stable cursor
limit $limit;
```

### 6.1 Why the column order proves FR-SRCH-08c

`is_featured` (term 3) sits strictly **after** both availability sort keys (terms 1–2). In a lexicographic `ORDER BY`, a later term can only reorder rows that are **equal on every earlier term**. Therefore:

- Two rows differing in `availability_state` (available vs not) are ordered entirely by term 1 — `is_featured` is never consulted. **A featured-but-unavailable provider can never appear above a non-featured available one** (FR-SRCH-08c, US-DISC-06). ∎
- Two rows both available but differing in `availability_set_at` are ordered by term 2 — again `is_featured` is not consulted, so featuring cannot jump a stale-available provider above a fresher one.
- `is_featured` decides only among rows **tied on availability tier and recency** — most consequentially the entire not-available cohort (all have `availability_set_at = null`, tied under NULLS LAST), and the homepage tier-2 feed. This is exactly the intended product: **featuring boosts where availability does not already differentiate, and never where it does.** Because hard filters (WHERE) already guarantee every returned row matches the query, featured rows are boosted *among genuine matches only* — featuring boosts rank, never bypasses relevance (FR-SRCH-08a).

### 6.2 Cursor pagination (api-conventions §4)

Sort is multi-column with query-derived terms (`rel_rank`, `distance_km`), so the cursor is a **composite keyset**, not an offset. The opaque base64 token encodes the last row's full sort tuple plus a hash binding it to the query:

```jsonc
{ "qh":"<sha256(normalizedQuery+filters+coordsBucket)>",   // reject if a later page arrives with different filters
  "av": 1,                       // (availability_state='available') as 0|1
  "sa": "2026-07-23T10:02:00Z",  // availability_set_at (or null)
  "ft": 1,                       // is_featured 0|1
  "rr": 0.0631,                  // rel_rank
  "dk": 4.82,                    // distance_km (or null)
  "aw": 1,                       // badge_active_this_week 0|1
  "la": "2026-07-22T18:00:00Z",  // last_activity_at (or null)
  "ra": 4.8, "rc": 12,           // rating_average, rating_count
  "id": "018f...c3" }            // provider_profile_id — the total-order anchor
```

The next page's predicate is the lexicographic "strictly after the tuple" comparison in the same ORDER BY direction, expanded as the standard OR-cascade (equal on the leading keys, greater on the next). Because term 8 is a unique total order, the keyset is exact — no skipped or duplicated rows even as the projection mutates under the reader (the reason offset pagination is disallowed, api-conventions §4). `rel_rank`/`distance_km` are recomputable and identical across pages because `qh` guarantees identical query params; a cursor presented with mismatched filters (`qh` differs) is rejected with `VALIDATION_FAILED` rather than silently returning garbage. Row-level authorization (block exclusion) is re-applied on **every** page regardless of cursor contents (api-conventions §4).

---

## 7. Homepage query (FR-SRCH-01)

The homepage is the ranking query (§6) with an **empty** `StructuredQuery` (no hard filters, `free_text=''`, coords optional). No UNION or separate query is needed — the master `ORDER BY` produces the required tiering as a single computed sort:

- Term 1 puts the **available cohort** first (ordered by term 2 recency, term 3 featured) — "who is available now?", most-recent first (BR-2, US-DISC-01).
- The **not-available cohort** follows, all tied on terms 1–2 (`set_at` null), so term 3 (featured) then term 6 (`badge_active_this_week desc`) then term 7 (`last_activity_at desc`) order them — remaining published providers **always** appear below, never only when the available cohort is empty (FR-SRCH-01, US-DISC-01). With no free text, term 4 (`rel_rank`) is constant `0`; with no coords, term 5 (`distance`) is null — neither perturbs the tiering.

So **the page is never empty and never apologises** (US-DISC-01) because every published+listed provider is a projection row and the sort simply degrades from availability-recency to Active-this-week across the fold. Homepage therefore reuses the search endpoint with default (empty) parameters (§10).

`badge_active_this_week` is the **authoritative** FR-AVAIL-06 / FR-TRUST-06 badge, flipped by `BadgeGranted`/`BadgeRevoked` from `trust-and-safety`'s four-signal OR. `last_activity_at` is only the recency sort among that cohort (fed by `AvailabilitySet` and `ProfileUpdated`). Search cards serialize both badges from these columns (FR-TRUST-01).

Applied-filter demand (FR-ANLY-04) is captured fire-and-forget: after a successful search the delivery layer calls `provider-analytics.captureFilterUsage(appliedFilters)` — discovery never blocks on it (analytics LLD).

---

## 8. Suggestions endpoint (FR-SRCH-07, SR-PERF-02 ≤ 100 ms server budget)

Instant type-ahead over a **curated, non-personal corpus**: lexicon terms, service tag names, and area names — **never** individual provider display names (FR-SRCH-07: "discovery is by service, not people-lookup"). The projection's `display_name` is deliberately **not** a suggestion source; there is no role variant that surfaces provider names in V1 (the guard is total, not merely anonymous-only), which is the simplest way to honour the FR-SRCH-07 safety posture.

```sql
-- discovery-search/infra/suggest-query.sql.ts — prefix + trigram over the non-personal corpus.
-- Corpus is a small materialized set (discovery_search.suggest_term) refreshed on ConfigChanged/tag/area updates,
-- kept tiny and GIN-trigram-indexed so p95 ≤ 100 ms (SR-PERF-02). $q = normalized prefix.
select term, kind          -- kind ∈ 'service_term' | 'area' | 'intent'
from discovery_search.suggest_term
where is_active
  and ( term ilike $q || '%'      -- fast prefix
        or term % $q )            -- trigram fuzzy for typo tolerance
order by (term ilike $q || '%') desc,   -- exact-prefix matches first
         similarity(term, $q) desc,
         term                            -- total-order tiebreak (determinism)
limit 8;
```

`discovery_search.suggest_term(term, kind, is_active)` is a denormalized suggestion corpus (GIN `gin_trgm_ops` on `term`) fed from `platform_configuration.lexicon_entry` (active service_term + intent phrases), `provider_profile.service_tag` names, and `platform_configuration.area` names via `ConfigChanged`/tag/area events — small enough to stay pre-warmed in shared buffers, meeting SR-PERF-02 with margin. **Serializer:** `toSuggestions()` (a single variant) returns `{ term, kind }` only — it has no code path that reads or emits a provider name, making the FR-SRCH-07 guard a property of the query + serializer, not a client-side filter. Rate-limited by `search_suggest` (§10).

---

## 9. Empty-result relaxation (FR-SRCH-10)

When the ranking query returns zero rows, the empty state names the constraining filters and offers **one** one-tap relaxation (US-DISC-07). Which filter to suggest removing first is **deterministic** — a fixed priority order (most-transient / least-semantically-core relaxed first), suggesting exactly the first *present* filter:

```
RELAXATION_PRIORITY (first present wins):
  1. available_now      # most transient — availability changes minute to minute
  2. min_rating         # a threshold, easily loosened
  3. near_me / distance # widen the area (or drop the distance constraint)
  4. price band         # widen price
  5. verified           # drop the verified requirement
  6. language           # drop a language filter
  7. service_tag        # the most semantically core intent — relaxed last
```

`suggestRelaxation(sq)` scans this list and returns the first filter present in the `StructuredQuery`, plus a re-run URL with that one filter removed. If removing it still yields zero, the *next* empty state suggests the next present filter — one relaxation at a time, never a bulk "clear all", so the seeker converges on a near-hit (US-DISC-07). Deterministic: identical `StructuredQuery` → identical suggested relaxation. The empty-state copy follows FR-UX-05 (plain language, next step offered).

---

## 10. API contract

Envelope, error mapping, cursor pagination, headers per api-conventions §3/§4/§12. All discovery routes are anonymous-accessible (FR-ACC-01 — no login wall on search/browse); `viewer_user_id` is null for anonymous and enables only the block-exclusion clause when present.

| Endpoint | Method / path | Auth | Params | Success | Notes |
|---|---|---|---|---|---|
| **Search** | `GET /api/discovery/search` | anonymous OK | `q` (free text), manual filter params (`available`, `verified`, `minRating`, `lang[]`, `tag[]`, `priceMin`, `priceMax`), `lat`/`lng` (optional, transient — never stored, FR-PRIV-02), `cursor`, `limit` | `200 { data: Card[], meta: { nextCursor, appliedIntents } }` | `appliedIntents` drives the removable chips (FR-SRCH-05). `limit` default 20, max 50. Serializer `toSearchCard(row, viewer)` — per api-conventions §11, phone/exact-location never on the wire (§11 below) |
| **Homepage** | reuses `GET /api/discovery/search` with no params | anonymous OK | — | as above | §7 — empty `StructuredQuery`; SSR-rendered `load` (HLD §7.1) |
| **Suggestions** | `GET /api/discovery/suggest` | anonymous OK | `q` (prefix) | `200 { data: { term, kind }[] }` | §8; server p95 ≤ 100 ms (SR-PERF-02); `toSuggestions()` — no provider names, ever |

**Rate limits (security-implementation §5.2, exact numbers — cited, not redefined):**

| Route | Bucket | Key | Window | Limit |
|---|---|---|---|---|
| `GET /api/discovery/search` (incl. homepage) | `search_query` | IP | 1 min | **60** |
| `GET /api/discovery/suggest` | `search_suggest` | IP | 1 min | **120** (higher — fires per keystroke) |

Exceeding either returns `429 RATE_LIMITED` with `Retry-After` (api-conventions §6).

**Freshness / caching (SR-PERF-06):** discovery responses may be cached at Cloudflare/app layer but **never** present availability older than **60 s** — the "who is available now" promise wins over cache-hit ratio (D-8). Enforced at the delivery layer via short `Cache-Control` max-age / Cloudflare page rules on discovery HTML/data (HLD §11 PERF, §7.1); this module's data is always live-queried per request inside that bound. Static assets/media cache long (SR-MEDIA-04); discovery does not.

---

## 11. Server-side privacy filtering (api-conventions §11, SR-SEC-09)

Search cards are shaped by `discovery-search/infra/serializers.ts::toSearchCard(row, viewer)`:

- **Phone number is never on a search card** for anyone — the card's primary action is "Message"/"View"; tap-to-call lives on the *profile* page, gated by `provider-profile`'s own `toPublicProfile` phone-visibility serializer (FR-PROF-08, FR-PRIV-01). Discovery's projection deliberately does **not** store the phone number, so it cannot leak one.
- **Exact location is never stored or served** — only `area_id`/area name and a computed *distance to area* (FR-PROF-04, FR-PRIV-02). No centroid-reverse-geocoding to an address anywhere.
- **`rating_average` null → "New"** at the serializer, never a zero score (FR-REV-05, US-DISC-04).

Because these fields are absent from the projection or the DTO type, there is no runtime branch that could serialize them and rely on the client to hide them (SR-SEC-09).

---

## 12. Domain events subscribed (cross-reference) & open questions

### 12.1 Full subscription cross-reference (against event-catalog §2)

| Event | In catalog's "Subscribers"? | This LLD's handling |
|---|---|---|
| `ProviderPublished` / `ProviderUnpublished` / `ProfileUpdated` | ✓ discovery | insert / delete / refresh (§4A) |
| `PhotoAdded` / `PhotoRemoved` / `MediaProcessed` / `MediaRemoved` | ✓ discovery | refresh `photo_primary_url` |
| `AvailabilitySet` / `AvailabilityCleared` / `AvailabilityExpired` | ✓ discovery | availability mirror |
| `RatingAggregateChanged` | ✓ discovery | rating fields |
| `ReviewSubmitted` | ✓ discovery | **no-op** (superseded by `RatingAggregateChanged`) — see note |
| `VerificationDecided` / `BadgeGranted` / `BadgeRevoked` | ✓ discovery | badge flag |
| `ModerationActionTaken` | ✓ discovery | delete on unpublish/suspend |
| `UserBlocked` / `UserUnblocked` | ✓ discovery | directed `blocked_pair` upsert / delete |
| `IdentityAttributesChanged` | ✓ discovery | `display_name` refresh |
| `ListingLapsed` | ✓ discovery | delete row |
| `SubscriptionActivated` | ✓ discovery (n/a) | no-op |
| `FeaturingActivated` / `FeaturingLapsed` | **appended by this LLD** | `is_featured` flag |
| `ConfigChanged` | ✓ discovery | lexicon/threshold cache invalidation via shared config-cache subscriber (security-implementation §6) — not a discovery-specific handler |

### 12.2 Open questions / assumptions

1. **`maps_to` contract** — discovery defines the JSON shape; `platform-configuration` imports that Zod schema at lexicon write time. **Closed 2026-08-20** (platform-configuration LLD §6.3 / §10.7).
2. **Featuring events** — **Closed:** catalog + billing emit `FeaturingActivated` / `FeaturingLapsed` including `listing_lapsed`.
3. **`owner_id` on the projection** — **Closed 2026-08-20:** column added in §4.1; block SQL uses it.
4. **`ReviewSubmitted` redundancy** — **Closed:** `RatingAggregateChanged` is authoritative; `ReviewSubmitted` remains a defensive no-op.
5. **`provider-availability.expiry_warned` collapse** — **Closed:** warned still ranks as available.
6. **FTS language configuration** — `to_tsvector('english', …)` is used for leftover free text only. Revisit post-launch if Zulu/isiXhosa relevance is poor; a `simple` config is additive.
