---
title: Peach Finder — LLD — Reviews & Ratings
updated: 2026-08-20
---

# Reviews & Ratings — Low-Level Design

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Low-Level Design — `provider-reviews` module (`src/lib/server/modules/provider-reviews/`) |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | `00-foundations/shared-kernel.md`, `00-foundations/api-conventions.md`, `00-foundations/event-catalog.md`, `00-foundations/security-implementation.md`; HLD §6.1 (`provider-reviews` row), `clean-code-guidelines-per-module.md` §12 (`provider-reviews` row); FRS §9 (REV), user-stories §8 (E5) & §19.7 |
| Delivers | FR-REV-01..08 |
| Status | Living document — updated in place |

**Binding stance restated as a design constraint (FRS §1):** reviews publish **immediately on submission with no pre-moderation and no automated screening of any kind**. Removal of a review or a reply is **exclusively** an explicit human admin action, reaching this module only as a `ModerationActionTaken` event it subscribes to (§5.4). No code path in this module removes, hides, or gates review content on its own initiative. This constraint is asserted inline at every lifecycle transition below, not once here.

---

## 2. Module purpose & scope

`provider-reviews` owns the review aggregate, provider replies, the per-provider rating aggregate, and the eligibility rule. It delivers:

| FR | Covered in |
|---|---|
| FR-REV-01 — one review per provider, ≥24h-thread eligibility | §4, §5.1, §7 |
| FR-REV-02 — publish immediately, no pre-moderation; reportable, human-removable | §5.2, §5.4 |
| FR-REV-03 — average, count, newest-first list, reviewer first-name + initial, month/year | §7, §8 |
| FR-REV-04 — self edit/delete, aggregate update, "edited" marker | §5.3, §7 |
| FR-REV-05 — rating filter; "New" for zero-review providers; "highly rated" threshold | §8 |
| FR-REV-06 (S) — one provider reply per review, same report/remove path | §6 |
| FR-REV-07 — blocking never deletes reviews; removal is human-only | §5.4 |
| FR-REV-08 (W) — no verified-booking gating, no incentivized reviews, no seeker-of-seeker ratings | honored by omission |

Out of scope / owned elsewhere: eligibility fact (owned by `direct-messaging`, queried via facade §4); rating consumption for ranking (owned by `discovery-search`, fed by `RatingAggregateChanged` event §9 — `discovery-search` **never** queries `provider-reviews` tables); review notifications (owned by `user-notifications`, fed by `ReviewSubmitted`).

---

## 3. Data model — `provider-reviews` schema

Schema-per-module (shared-kernel §10). Cross-schema FKs are permitted **only** onto `identity_and_access.user(id)` (HLD §6.3.3); `provider_profile_id` is a plain UUID resolved through `provider-profile`'s facade at read time — **no** FK across to `provider-profile`.

```sql
create schema if not exists provider_reviews;

-- One review per (seeker, provider) pair — FR-REV-01.
create table provider_reviews.review (
  id                  uuid primary key,                       -- ReviewId, UUIDv7 (shared-kernel §2)
  provider_profile_id uuid not null,                          -- provider_profile.provider_profile.id — plain id, no cross-schema FK (HLD §6.3.3)
  seeker_id           uuid not null
                        references identity_and_access."user"(id),        -- cross-schema FK allowed onto identity_and_access.user
  rating              smallint not null check (rating between 1 and 5),  -- FR-REV-01
  body                text check (body is null or char_length(body) <= 1000),  -- FR-REV-01 length-capped; rating mandatory, text optional
  created_at          timestamptz not null,                   -- set from Clock (shared-kernel §4), UTC (SR-APP-09)
  edited_at           timestamptz,
  is_edited           boolean not null default false,         -- FR-REV-04 "edited" marker
  reply_body          text check (reply_body is null or char_length(reply_body) <= 1000),  -- FR-REV-06 one reply per review
  replied_at          timestamptz,
  constraint one_review_per_pair unique (provider_profile_id, seeker_id)  -- FR-REV-01 → REVIEW_ALREADY_EXISTS
);
-- Newest-first list per provider (FR-REV-03) is the only hot read; cursor pagination sorts on (created_at, id).
create index review_provider_created_idx on provider_reviews.review (provider_profile_id, created_at desc, id desc);
create index review_seeker_idx on provider_reviews.review (seeker_id);   -- "my reviews" + anonymization on account deletion (FR-ACC-07)

-- One row per provider that has ever received a review. Absent row ⇒ "New" (§8). Maintained in-transaction (§5.5).
create table provider_reviews.rating_aggregate (
  provider_profile_id uuid primary key,                       -- plain id (no FK across to provider)
  average             numeric(2,1),                           -- 1.0–5.0; null iff count = 0 (§8)
  count               integer not null default 0,
  updated_at          timestamptz not null
);
```

**Notes.**
- `body`/`reply_body` cap of 1000 chars is a domain invariant enforced in `Review.create`/`Review.reply` (clean-code §4) *and* the `check` constraint (belt-and-braces, shared-kernel §9).
- No `status`/`hidden` column exists. There is deliberately no "soft-hide" state a non-human path could flip — the only way review content leaves the profile is a hard delete performed by self-delete (§5.3) or by the `ModerationActionTaken` subscriber (§5.4). Omitting the column makes "a review can be gated by the system" *unrepresentable*, satisfying §1.
- `rating_aggregate` has no FK to `review`; it is a denormalized read-optimization recomputed from `review` rows (§5.5).

---

## 4. Eligibility check (FR-REV-01)

Eligibility is **not** computed in this module. `provider-reviews` asks `direct-messaging`'s facade (HLD §6.3 rule 1 — "the canonical example cited in the HLD itself"; clean-code §12 `provider-reviews` row — "never reimplemented"):

```typescript
// direct-messaging/index.ts (facade — owned by 05-direct-messaging)
hasEligibleThread(seekerId: UserId, providerProfileId: ProviderProfileId, minAgeHours: number): Promise<boolean>;
```

Rule: an eligible thread exists iff a `direct_messaging.thread(seeker_id, provider_profile_id)` row exists whose **`created_at` is at least 24h before now**:

```
now() - thread.created_at >= interval '24 hours'
```

- **Boundary clarified:** the 24h is measured from **thread creation**, not last activity. A thread created 23h ago is ineligible **even if messages were exchanged since** — recency of chatter does not reset or satisfy the clock; the clock is the age of the *relationship*, which is the drive-by-review-bombing guard FR-REV-01 §18(5) intends. A thread created 25h ago with no messages for the last day is eligible.
- `now()` is sourced once from the `Clock` port (shared-kernel §4), passed into the domain check — never `Date.now()`.
- `minAgeHours` is passed as `24` (a constant of this module, not platform config — FR-REV-01 fixes it; changing it is an LLD edit, not an admin action).

---

## 5. Review lifecycle

### 5.1 Submit — live immediately, no moderation gate

`commands/submit-review.ts` (clean-code §5 "authorize → load → decide → persist → publish"):

1. **Authorize:** `ctx.requireRole('seeker')`. Anonymous → routed through FR-ACC-05 upstream (never reaches here).
2. **Eligibility:** call `direct-messaging.hasEligibleThread(seekerId, providerProfileId, 24)`. False ⇒ return `Err({ kind: 'precondition_failed', reason: 'review_ineligible' })` → `REVIEW_INELIGIBLE` / 412 (§7). **This is a guard clause, not a moderation step** — it verifies engagement, it never inspects content (FR-REV-02, §1).
3. **Decide:** `Review.create({ rating, body, ... })` — refuses rating ∉ 1–5 and body > 1000 in its factory (clean-code §4). There is **no content check here or anywhere** — the review goes live exactly as written (FR-REV-02).
4. **Persist (one transaction, clean-code §5):** insert `review`; recompute `rating_aggregate` (§5.5); write outbox `ReviewSubmitted` + `RatingAggregateChanged`. Unique-violation on `one_review_per_pair` ⇒ `Err({ kind: 'conflict' })` → `REVIEW_ALREADY_EXISTS` / 409 (§7).
5. The review is **publicly visible the instant the transaction commits** — there is no queue, no pre-moderation, no automated screening (FR-REV-02; user-stories US-REV-02). Discovery reflects the new rating within ≤30s via the `RatingAggregateChanged` subscription (SR-APP-03).

### 5.2 Edit (self) — FR-REV-04

`commands/edit-review.ts`: `ctx.requireOwnership(review.seekerId)`; `Review.edit({ rating?, body? })` sets `edited_at`, `is_edited = true`. Same transaction recomputes `rating_aggregate` (rating may have changed) and publishes `RatingAggregateChanged`. No `ReviewSubmitted` re-fires (it is a one-time creation fact). Edits are live immediately — no re-moderation (§1).

### 5.3 Delete (self) — FR-REV-04

`commands/delete-review.ts`: `ctx.requireOwnership(review.seekerId)`; hard-deletes the `review` row (including any provider reply on it), recomputes `rating_aggregate`, publishes `RatingAggregateChanged`. Requires client confirmation (FR-UX-05) — enforced at delivery, not domain. Self-delete is distinct from admin removal: it needs no report and writes no `moderation_action`/audit entry (the actor is the owner, not an admin).

### 5.4 Report → admin-remove — cross-module, human-only

Reviews are **reported** and **removed** entirely through `trust-and-safety` (see `07-trust-and-safety/trust-and-safety-lld.md` §6–§7). This module's only role is to **react** to a completed human decision:

- A user reports a review via `trust-and-safety`'s report API with `target_type='review'`, `target_id=<reviewId>` (trust-and-safety-lld.md §10). `provider-reviews` is **not** involved in filing.
- An admin removes it via `trust-and-safety`'s moderation action `remove_review`, which publishes `ModerationActionTaken { action: 'remove_review', targetType: 'review', targetId, metadata }` (event-catalog §2).
- `provider-reviews` **subscribes** to `ModerationActionTaken` where `targetType='review'` (`infra/subscriptions.ts`):
  - `metadata.part = 'reply'` ⇒ null out `reply_body`/`replied_at` only (a reply removal, §6) — the review itself and its rating survive; **no** `RatingAggregateChanged`.
  - otherwise ⇒ hard-delete the `review` row, recompute `rating_aggregate`, publish `RatingAggregateChanged`.
  - **Idempotency:** processed-event ledger keyed `(event_id, 'provider-reviews')` (shared-kernel §6.4 mechanism 2) — a redelivered removal is a no-op success.
- **FR-REV-07 guarantee, asserted here:** blocking (`UserBlocked`) is **not** subscribed by this module and never touches reviews — a block prevents new contact only; existing reviews stand in both directions. The **only** removal path is the human `ModerationActionTaken` above. There is no automated, block-triggered, or report-triggered deletion (§1; user-stories US-REV-06).

### 5.5 Rating aggregate maintenance — application-layer recompute (decision)

**Decision: recompute in the application layer inside the writing command's transaction, not via a DB trigger.** Rationale: (a) a trigger is business logic living in the database, which clean-code §6 forbids ("business decisions found in `infra/` are defects" — a trigger is worse, invisible to the module); (b) recompute must be unit-testable against fake ports (clean-code §10 `app/` row); (c) the cost is trivial — one `AVG`/`COUNT` over a single provider's reviews (bounded, indexed by `review_provider_created_idx`). The repository runs:

```sql
-- provider-reviews/infra/rating-aggregate-repo.ts — sql template, parameterized (SR-SEC-06)
insert into provider_reviews.rating_aggregate (provider_profile_id, average, count, updated_at)
select $1,
       round(avg(rating)::numeric, 1),          -- null when no rows ⇒ average null (§8)
       count(*),
       $2                                        -- Clock.now()
from provider_reviews.review where provider_profile_id = $1
on conflict (provider_profile_id) do update
  set average = excluded.average, count = excluded.count, updated_at = excluded.updated_at;
```

Called by submit/edit/delete and the `remove_review` subscriber. `RatingAggregateChanged` carries the resulting `{ providerProfileId, average, count }` (event-catalog §2) so `discovery-search` updates its projection without querying this schema.

### 5.6 Decision table — review flow (reproduces user-stories §19.7)

| # | State / event | Condition | Transition / outcome | Guard |
|---|---|---|---|---|
| 1 | Seeker opens provider profile, taps "Write review" | thread with provider **≥24h old** (§4) | proceed to compose (rate 1–5 + optional text) | — |
| 2 | Same | thread **absent or <24h** | review action **explains eligibility in plain language** (200 payload, §7) — never hidden | FR-REV-01; user-stories US-REV-01 |
| 3 | Submit | first review for this pair | **LIVE immediately**, aggregate updated, `ReviewSubmitted`+`RatingAggregateChanged` | **no pre-moderation** (FR-REV-02, §1) |
| 4 | Submit | review already exists for pair | `REVIEW_ALREADY_EXISTS` / 409 | FR-REV-01 uniqueness |
| 5 | Live review | owner edits | aggregate recomputed, `is_edited=true`, "edited" marker | FR-REV-04; live, no re-moderation |
| 6 | Live review | owner deletes | hard-deleted (incl. reply), aggregate recomputed | FR-REV-04 |
| 7 | Live review | provider posts one reply | reply shown beneath; reportable via same path | FR-REV-06 |
| 8 | Live review or reply | reported | enters `trust-and-safety` admin queue (trust-and-safety-lld.md §6) — **no automated action** | FR-REV-02/07, §1 |
| 9 | Reported review/reply | admin **acts** (`remove_review`) | `ModerationActionTaken` → this module removes row / nulls reply, recomputes aggregate | **removal only by explicit admin decision** (FR-REV-07, FR-ADM-05) |
| 10 | Reported review | admin **dismisses** | nothing changes in `provider-reviews` | FR-ADM-03 |
| 11 | Either party blocks the other | — | **reviews untouched** in both directions | FR-REV-07; user-stories US-REV-06 |

---

## 6. Provider reply (FR-REV-06, S)

- `commands/reply-to-review.ts`: `ctx.requireRole('provider')` and ownership check that the review's `provider_profile_id` belongs to `ctx.userId` (resolved via `provider-profile`'s facade `getOwnerId(providerProfileId)` — no cross-schema read). Refuses if `reply_body` already set (one reply per review) ⇒ `Err({ kind: 'conflict' })`.
- Sets `reply_body`, `replied_at`. Publishes `ReviewReplied { reviewId }` (event-catalog §2; no cross-module subscriber today — notifications is a future add).
- Reply edit/removal by the provider: an edit overwrites `reply_body` (allowed, no re-moderation); the provider clearing their own reply nulls it (self action, no audit). Aggregate is unaffected by any reply operation.
- **Removing a reply by admin — decision (folded into `review` target, not a new target_type):** a reported reply uses `target_type='review'` with `metadata.part='reply'` on both the `trust_and_safety.report` and the `trust_and_safety.moderation_action`; removal reuses the `remove_review` moderation action + `moderation.remove_review` audit action (event-catalog §4) with `metadata.part='reply'`. The `provider-reviews` subscriber (§5.4) reads `metadata.part` to decide "null the reply" vs "delete the review". Rationale: avoids adding a `target_type` enum value and a parallel audit action for a sub-part of an existing entity; the report/remove path is *identical* as FR-REV-06 requires, differing only by a metadata flag.

---

## 7. API contract

Envelope, error shape, cursor pagination, idempotency, and rate-limit mechanism per `api-conventions.md` (§3/§4/§5/§6). Serializers per role are `provider-reviews/infra/serializers.ts` (clean-code §7, security-implementation §7).

| Method & path | Role | Request | Response (200 unless noted) | Serializer | Rate-limit bucket |
|---|---|---|---|---|---|
| `GET /api/reviews/eligibility/:providerProfileId` | seeker | — | `{ data: { eligible: boolean, reason?: string } }` — `reason` is plain-language when `eligible=false` (e.g. "You can review once you've been in contact for a day.") | `toEligibility` | `search_query` (IP) reuse; read-only |
| `POST /api/reviews` | seeker | `{ providerProfileId, rating, body? }` (`SubmitReviewRequestSchema`) | `{ data: <review> }` (201) | `toOwnReview` | `review_submit` (account, 10/day — security-implementation §5.2) |
| `PATCH /api/reviews/:reviewId` | seeker (owner) | `{ rating?, body? }` | `{ data: <review> }` | `toOwnReview` | `review_submit` |
| `DELETE /api/reviews/:reviewId` | seeker (owner) | — | `{ data: { deleted: true } }` | — | `review_submit` |
| `POST /api/reviews/:reviewId/reply` | provider (owner) | `{ body }` | `{ data: <review> }` | `toOwnReview` | `review_submit` |
| `GET /api/reviews/provider/:providerProfileId?cursor=&limit=` | anonymous+ | — | `{ data: [<publicReview>], meta: { nextCursor } }` newest-first (FR-REV-03), `limit` default 20 / max 50 | `toPublicReview` | `search_query` (IP) |

**Eligibility as a 200 payload, not an error — decision & justification.** The *pre-submit* check is a **`GET` returning 200 with `{ eligible, reason }`**, which the UI uses to decide whether to show the write control and, when ineligible, to render the plain-language explanation (FR-UX-05; user-stories US-REV-01 — "explains why … rather than hiding"). It is not modelled as an error because ineligibility is a normal, expected, non-failure state of the *page*. The **`POST` still hard-validates** eligibility server-side (§5.1 step 2) and returns `REVIEW_INELIGIBLE` / 412 if a client submits anyway — the friendly GET is a UX affordance, never the security control (clean-code §7 "UI hiding is never the control").

**Error codes** (registered in event-catalog §5): `REVIEW_INELIGIBLE` (`precondition_failed`/412), `REVIEW_ALREADY_EXISTS` (`conflict`/409), `VALIDATION_FAILED` (422), `RATE_LIMITED` (429), `FORBIDDEN` (403), `NOT_FOUND` (404).

**Serializer privacy (FR-REV-03, SR-SEC-09).** `toPublicReview` emits reviewer **first name + last initial** ("Thandi M.") and **month/year only** — never the exact `created_at` date, never the seeker's full name or id (coarse dating makes reviewer identification by the provider harder). Deleted-seeker reviews serialize the reviewer as **"Former user"** (FR-ACC-07) — this module reads the reviewer's display state via `identity-and-access`'s facade, which returns the anonymized form after deletion. `is_edited=true` renders the "edited" marker; `reply_body` renders beneath when present.

**Discovery consumes events, not this schema.** `discovery-search`'s ranking/filter query reads rating fields from its own projection, kept current by the `RatingAggregateChanged` subscription (§9). No discovery code path queries `provider_reviews.*` (clean-code §12 `discovery-search` determinism rule; HLD §6.4).

Facade (public `index.ts`): `exportFor(userId)` returns the subject's authored reviews plus replies on their provider profile (SR-DATA-07; platform-configuration LLD §9).

---

## 8. "New" vs zero-score display rule (FR-REV-05)

**Decision: a display-layer (serializer) rule, driven by the aggregate, not a data-model special case.**

- `rating_aggregate` rows are created lazily on first review (§5.5). A provider with no reviews has **no row** (or, after a delete-to-zero, a row with `count=0` and `average=null`).
- The rule, applied identically in `provider-reviews/infra/serializers.ts` (card + profile) and mirrored in `discovery-search`'s projection serialization: **`count = 0` OR no aggregate row ⇒ render "New"; never render `0.0`.** The serializer handles both shapes so neither DDL choice can produce a "zero-star" bug.
- **Minimum-rating filter (FR-SRCH-04/FR-REV-05):** providers with `count = 0`/no row are **excluded** from a min-rating filter (not treated as `0`) — this is enforced in `discovery-search`'s query against its projection (rating fields nullable; `null` fails `>= threshold`), consistent with this display rule.
- **"Highly rated" intent (FR-SRCH-02/FR-REV-05):** maps to `average >= 4.5 AND count >= 3` (defaults from `platform-configuration.getConfig('provider-reviews.highly_rated_min_average')` / `provider-reviews.highly_rated_min_reviews`, SR-APP-11) — evaluated in `discovery-search`, not here. Listed for traceability; the threshold is admin config, not hardcoded (clean-code §12 `discovery-search` row).

---

## 9. Domain events published (event-catalog §2)

| Event | When | Payload (facts) | Subscribers (per catalog) | Idempotency |
|---|---|---|---|---|
| `ReviewSubmitted` | review created (§5.1) | `reviewId, providerProfileId, rating` | `discovery-search` (rating refresh), `user-notifications` (S: provider notified) | natural key (`reviewId`) |
| `ReviewReplied` | provider reply posted (§6) | `reviewId` | — | n/a |
| `RatingAggregateChanged` | aggregate recompute on submit/edit/delete/`remove_review` (§5.5) | `providerProfileId, average, count` | `discovery-search` (projection rating fields) | natural key (upsert by `providerProfileId`) |

All three are published **inside the writing command's transaction** via the outbox (shared-kernel §6.2; clean-code §8) — an event can never exist without its state change. `RatingAggregateChanged` is the authoritative source of the numeric rating in `discovery-search`'s projection; `ReviewSubmitted` additionally drives the provider notification. This module **subscribes** to `ModerationActionTaken` (`targetType='review'`, §5.4) — the only event it consumes.

---

## 10. Open questions / assumptions

1. **Review body cap = 1000 chars (assumption).** FRS says "length-capped" without a number; 1000 chosen (≈ longer than the 600-char intro, short enough to stay scannable). If product wants this admin-configurable it becomes a `platform-configuration` config key — deferred; hardcoded for V1.
2. **Reply removal folded into `target_type='review'` + `metadata.part='reply'` (decision, §6).** Reconcile with the `08-moderation-admin` and `trust-and-safety` authors: the moderation action panel must set `metadata.part` when the admin removes a reply vs a whole review. Flagged for the `trust-and-safety` author (trust-and-safety-lld.md §7).
3. **Aggregate maintained in-app, not by trigger (decision, §5.5).** If load testing ever shows the per-write recompute is hot (it is bounded and indexed, so unlikely at SR-CAP-01 scale), the fallback is a batched recompute job — an LLD change, not a schema change.
4. **Phone-only clients cannot review (accepted, FRS §18.5).** A seeker who only ever phoned (FR-PROF-08 visibility) has no thread and is ineligible. Accepted for V1; no mitigation in this module.
5. **`RatingAggregateChanged` vs `ReviewSubmitted` for discovery (clarified, §9).** Both are listed as discovery subscribers in the catalog; this doc makes `RatingAggregateChanged` authoritative for the numeric fields to avoid double-write. No catalog change needed — noted so the `discovery-search` author subscribes to the right one.
