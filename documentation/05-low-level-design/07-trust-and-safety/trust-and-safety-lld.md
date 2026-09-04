---
title: Peach Finder — LLD — Trust & Safety
updated: 2026-08-20
---

# Trust & Safety — Low-Level Design

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Low-Level Design — `trust-and-safety` module (`src/lib/server/modules/trust-and-safety/`) |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | `00-foundations/shared-kernel.md`, `00-foundations/api-conventions.md`, `00-foundations/event-catalog.md`, `00-foundations/security-implementation.md`; HLD §6.1 (`trust-and-safety` row = **TRUST + ADM moderation domain**), §6.3; `clean-code-guidelines-per-module.md` §12 (`trust-and-safety` row); FRS §10 (TRUST) & §11 (ADM domain logic); user-stories §9 (E6), §12 (E9), §16 (E13), §19.4/§19.5 |
| Delivers | FR-TRUST-01..10; the moderation **domain logic** behind FR-ADM-02/03/05/07/08 (the admin *console* delivery surface is `08-moderation-admin/moderation-admin-lld.md`) |
| Status | Living document — updated in place |

**Design constraint 0 — human-only moderation (FRS §1, SRS §1, clean-code §12 `trust-and-safety`):** *no code path in this module takes automated action on content, accounts, or reports.* Automation here does exactly two things and nothing else: **computes badges** (identity badge state transitions driven by admin decisions; "active this week" driven purely by activity computation) and **routes queues** (orders pending items for humans). Every content takedown, every suspension, every badge revocation is the direct result of an explicit admin decision, recorded with a reason, written to `shared.audit_log` **in the same transaction** as the state change. This constraint is restated inline at every section it governs — a reader must never have to scroll up to find it.

This is the largest LLD in the trust/safety/admin cluster; it owns identity verification, badges, reports, blocking, and the moderation-action taxonomy.

---

## 2. Module purpose & scope

| FR | Covered in |
|---|---|
| FR-TRUST-01 — exactly two badges | §3 (`badge_state`), §5 |
| FR-TRUST-02..05 — identity verification flow, doc isolation, badge suppression, revocation | §3, §4 |
| FR-TRUST-06 — "active this week" purely computed, no human grant | §5 |
| FR-TRUST-07 — reporting taxonomy, every report → human resolution | §3, §6 |
| FR-TRUST-08 — blocking: symmetric, silent, undoable | §3, §8 |
| FR-TRUST-09 (S) — safety-info page | §10 |
| FR-TRUST-10 (W) — no 3rd-party ID vendor, no license badge, no auto fraud detection | honored by omission |
| FR-ADM-05 — human moderation actions (domain logic) | §7 |
| FR-ADM-08 — audit log on every admin action | §3–§7 (in-transaction writes) |

**Boundary note (HLD §6.1):** `trust-and-safety` owns **all** moderation domain logic. `08-moderation-admin` is a *delivery surface* that calls this module's facade — it holds no domain logic. Cross-module effects of moderation (profile publish-state flip, discovery projection removal, notifications) are delivered by **events** this module publishes (§7, §11); the security-critical account-status/session part of suspension is the one documented synchronous exception (§9).

---

## 3. Data model — `trust-and-safety` schema

Schema-per-module (shared-kernel §10). Cross-schema FKs allowed **only** onto `identity_and_access.user(id)` (HLD §6.3.3); `provider_profile_id` and `media_processing.photo` ids are plain UUIDs resolved via the owning module's facade — **no** cross-schema FK to `provider-profile` or `media-processing`.

```sql
create schema if not exists trust_and_safety;

-- ── Identity verification (FR-TRUST-02..05, FR-ADM-02) ───────────────────────
create table trust_and_safety.verification_case (
  id                  uuid primary key,                       -- VerificationCaseId, UUIDv7
  provider_profile_id uuid not null,                          -- provider_profile.provider_profile.id — plain id (HLD §6.3.3)
  status              text not null
                        check (status in ('pending','approved','rejected')),  -- §4 state machine
  doc_photo_ids       uuid[] not null,                        -- media_processing.photo ids in the identity-docs bucket (SR-MEDIA-01); no FK across to media
  submitted_at        timestamptz not null,
  decided_at          timestamptz,                            -- null while pending
  decided_by          uuid references identity_and_access."user"(id),    -- the reviewing admin; null while pending
  rejection_reason    text,                                   -- required on reject (FR-TRUST-02, FR-ADM-08)
  docs_purged_at      timestamptz,                            -- set by the purge job (FR-PRIV-05); metadata retained
  constraint decided_fields_consistent check (
    (status = 'pending'  and decided_at is null and decided_by is null) or
    (status = 'approved' and decided_at is not null and decided_by is not null) or
    (status = 'rejected' and decided_at is not null and decided_by is not null and rejection_reason is not null)
  )
);
-- At most one OPEN case per provider (FR-TRUST → VERIFICATION_ALREADY_PENDING). Resolved cases are historical.
create unique index verification_one_open_per_provider
  on trust_and_safety.verification_case (provider_profile_id) where status = 'pending';
-- Admin identity queue, oldest-first (FR-ADM-02).
create index verification_queue_idx on trust_and_safety.verification_case (submitted_at) where status = 'pending';

-- ── Badge state (FR-TRUST-01/06). Exactly two badges exist product-wide. ──────
create table trust_and_safety.badge_state (
  provider_profile_id     uuid primary key,                   -- plain id
  identity_verified       boolean not null default false,     -- granted only by admin approval (§4)
  identity_verified_since timestamptz,
  suppressed              boolean not null default false,     -- identity badge hidden pending re-review (FR-TRUST-04)
  suppressed_reason       text,
  active_this_week        boolean not null default false,     -- ADDED (this module's schema to evolve, §5) — purely computed, FR-TRUST-06
  active_this_week_since  timestamptz,
  updated_at              timestamptz not null
);
-- "Identity verified" is displayed iff (identity_verified AND NOT suppressed) — enforced in the serializer/projection (§4, §5).

-- ── Reports (FR-TRUST-07, FR-ADM-03) ─────────────────────────────────────────
create table trust_and_safety.report (
  id             uuid primary key,                            -- ReportId, UUIDv7
  reporter_id    uuid not null references identity_and_access."user"(id),
  target_type    text not null
                   check (target_type in ('profile','review','photo','thread')),  -- FR-TRUST-07
  target_id      uuid not null,                               -- id in the owning module; resolved via facade for context
  reason         text not null
                   check (reason in ('safety_concern','fake_profile_photos','harassment','spam_scam','other')),  -- FR-TRUST-07 taxonomy (user-stories stance 4)
  free_text      text check (free_text is null or char_length(free_text) <= 2000),
  status         text not null default 'open'
                   check (status in ('open','dismissed','acted')),  -- §6; nothing auto-resolves
  resolved_at    timestamptz,
  resolved_by    uuid references identity_and_access."user"(id),         -- the resolving admin
  resolution_note text,                                       -- required on dismiss (FR-ADM-03 "dismiss with note")
  metadata       jsonb not null default '{}',                 -- e.g. { "part": "reply" } for a reply report (provider-reviews-lld.md §6)
  created_at     timestamptz not null,
  constraint resolution_consistent check (
    (status = 'open'      and resolved_at is null) or
    (status = 'dismissed' and resolved_at is not null and resolved_by is not null and resolution_note is not null) or
    (status = 'acted'     and resolved_at is not null and resolved_by is not null)
  )
);
create index report_queue_idx on trust_and_safety.report (created_at) where status = 'open';   -- oldest-first (FR-ADM-03)
create index report_target_history_idx on trust_and_safety.report (target_type, target_id);    -- reported party's history (FR-ADM-03)

-- ── Moderation actions (FR-ADM-05) ───────────────────────────────────────────
create table trust_and_safety.moderation_action (
  id           uuid primary key,                              -- ModerationActionId, UUIDv7
  admin_id     uuid not null references identity_and_access."user"(id),
  action       text not null
                 check (action in ('remove_photo','remove_review','unpublish','suspend','reinstate','revoke_badge')),  -- FR-ADM-05, FR-TRUST-05
  target_type  text not null,                                 -- 'photo'|'review'|'provider_profile'|'user'
  target_id    uuid not null,
  reason       text not null,                                 -- ALWAYS required (FR-ADM-05, FR-ADM-08) — check enforces presence
  report_id    uuid references trust_and_safety.report(id),              -- nullable: action may be on admin's own initiative (FR-ADM-05)
  metadata     jsonb not null default '{}',                   -- e.g. { "part": "reply" } (provider-reviews-lld.md §6)
  created_at   timestamptz not null
);
create index moderation_target_idx on trust_and_safety.moderation_action (target_type, target_id);

-- ── Blocking (FR-TRUST-08) ───────────────────────────────────────────────────
create table trust_and_safety.block (
  blocker_id  uuid not null references identity_and_access."user"(id),
  blocked_id  uuid not null references identity_and_access."user"(id),
  created_at  timestamptz not null,
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);
create index block_blocked_idx on trust_and_safety.block (blocked_id);   -- "who has blocked me" for query-level enforcement in messaging/discovery
```

**Idempotency ledger (admin double-click, api-conventions §5):** module-local dedup table for moderation commands and verification decisions (this module is the *originator* of these actions, not an event subscriber, so it uses its own table rather than `shared.processed_events`):

```sql
create table trust_and_safety.processed_admin_action (
  idempotency_key text primary key,        -- (actor, action, target, Idempotency-Key ?? per-request nonce), api-conventions §5
  result_ref      uuid not null,           -- the moderation_action.id / verification_case.id produced
  processed_at    timestamptz not null
);
```

**Notes.**
- `verification_case.doc_photo_ids` are ids into `media-processing`'s `identity-docs` bucket (SR-MEDIA-01) — `trust-and-safety` owns the *business record* (which docs, case status, decision) but not the storage; docs are fetched by admins only via `media-processing`'s short-TTL presigned URLs (§4, security-implementation §8).
- `badge_state` stores **exactly two** badges (FR-TRUST-01) — `identity_verified` (+ `suppressed`) and `active_this_week`. No third boolean may be added without a BRD change. There is deliberately **no** column or code path by which a human sets `active_this_week` (§5).
- `moderation_action.reason` is `not null` at the schema level — the "recorded reason" of FR-ADM-05/FR-ADM-08 is a storage invariant, not a UI nicety.

---

## 4. Identity verification state machine (FR-TRUST-02..05)

> **Profile visibility is NEVER affected by anything in this section** (FR-TRUST-02 "never affected"). Every transition below is restated with this guarantee inline — verification gates the *badge*, never the *listing* (§1).

### 4.1 Sequence (reproduces user-stories §19.4)

```mermaid
sequenceDiagram
    actor P as Provider
    participant T as trust
    participant M as media
    actor A as Admin
    Note over P,A: Profile visibility is NEVER affected by anything in this flow
    P->>M: Upload ID photo + selfie → identity-docs bucket (private, SSE)
    P->>T: Submit claim { doc_photo_ids } → verification_case(status=pending)
    T->>A: Enters review queue (oldest-first, FR-ADM-02)
    A->>M: Open docs via presigned URL (TTL ≤5min, admin session only; issuance audit-logged)
    alt Approve
        A->>T: approve(caseId, reason?) — TX: case→approved + badge_state.identity_verified=true + audit(identity.approve) + outbox(VerificationDecided, BadgeGranted)
        T->>P: BadgeGranted → notifications (outcome email/in-app, FR-NOTIF-01)
    else Reject
        A->>T: reject(caseId, reason) — TX: case→rejected + audit(identity.reject) + outbox(VerificationDecided)
        T->>P: VerificationDecided(rejected) → notifications: reason + resubmit path
        P->>T: Resubmit → new verification_case(pending) [loops]
    end
    Note over T: Purge job deletes doc_photo_ids from media ≤90 days post-decision (FR-PRIV-05); case metadata retained
    Note over P,T: Later: identity-relevant profile edit → badge SUPPRESSED (not revoked), profile visibility untouched
```

### 4.2 Transition table

| From | Event | To | Side effects (all in one TX) | Visibility | Guard |
|---|---|---|---|---|---|
| _(none)_ | provider submits claim | `pending` | insert `verification_case`; if an open case exists ⇒ `VERIFICATION_ALREADY_PENDING`/409 | **untouched** | FR-TRUST-02 |
| `pending` | admin **approve** | `approved` | `badge_state.identity_verified=true, identity_verified_since=now`; audit `identity.approve` (target `verification_case`); outbox `VerificationDecided(approved)`, `BadgeGranted(identity_verified)` | **untouched** | badge granted **only** after human approval (FR-TRUST-02) |
| `pending` | admin **reject(reason)** | `rejected` | `rejection_reason` set; audit `identity.reject` (reason required); outbox `VerificationDecided(rejected)` | **untouched** | rejection returns reason; resubmit allowed |
| `rejected` | provider resubmits | new `pending` | new case row (old stays historical) | **untouched** | FR-TRUST-02 |
| `approved` | provider changes identity-relevant attribute | badge **suppressed** | subscribe `IdentityAttributesChanged`; if `changedFields ∩ {display_name, phone}` ≠ ∅ ⇒ `badge_state.suppressed=true, suppressed_reason`; open a new `pending` re-review case; outbox `BadgeRevoked(identity_verified, reason='suppressed_pending_rereview')` | **untouched** | FR-TRUST-04 — suppressed, **not** revoked; provider told why + what to do |
| suppressed | admin re-review approve | `approved`, un-suppressed | `suppressed=false`; audit `identity.approve`; outbox `BadgeGranted(identity_verified)` | **untouched** | FR-TRUST-04 |
| `approved` | admin **revoke** (any time) | badge cleared | `identity_verified=false`; audit `identity.revoke` (target `provider_profile`, reason required); outbox `BadgeRevoked(identity_verified, reason='admin_revoke')` | **untouched** | FR-TRUST-05 (e.g. report reveals fraud) |

**Display rule (serializer + discovery projection):** the "Identity verified" badge renders iff `identity_verified = true AND suppressed = false`. Suppression hides the badge without losing the underlying verified fact, so an admin re-approval restores it without a fresh full review.

**Badge-suppression subscription details (§11).** `trust-and-safety` subscribes to **`identity-and-access`'s `IdentityAttributesChanged { userId, changedFields }`** (event-catalog §2, authored by `01-identity-and-access` §5/§7) — **not** `provider-profile`'s `ProfileUpdated`. This is the correct source because `display_name` and the verified `phone` are **identity-owned** attributes (shared shape `identity_and_access.user(…, display_name, …)`), not provider-profile fields. The identity-relevant set is a **fixed list `{display_name, phone}`** (FR-TRUST-04) checked in-module — not configurable, not inferred. On a hit, `trust-and-safety` resolves `userId → providerProfileId` via `provider-profile`'s facade (`getProfileByOwnerId(userId)`) since `badge_state` is keyed by `providerProfileId`; a non-provider `userId` is ignored. Idempotency: processed-event ledger `(event_id, 'trust-and-safety')` (a redelivered event must not open a second re-review case). *(The pre-existing `ProfileUpdated → trust` subscription in the catalog is superseded by this and is flagged for the `provider-profile` author to drop — §12(7).)*

### 4.3 Identity-document purge (FR-PRIV-05, SR-APP-10 job spec)

- **Job:** `trust-and-safety`'s daily "identity-doc purge" (owned here per HLD §8 "identity-doc purge in `trust-and-safety`").
- **Query:** `verification_case where decided_at is not null and docs_purged_at is null and decided_at <= now - interval '90 days'`.
- **Action per row:** call `media-processing.deletePhotos(doc_photo_ids)` (media's facade — deletes objects + variants from the `identity-docs` bucket, SR-MEDIA-04); set `docs_purged_at = now`; **retain** the case metadata (status, `decided_at`, `decided_by`, `rejection_reason`) per SR-PRIV-05. `doc_photo_ids` are left in place as historical references but the underlying objects no longer exist.
- Idempotent (a re-run skips rows already `docs_purged_at`), logs rows-affected, pings healthchecks.io (clean-code §9). Backup propagation: purged docs must not survive in backups beyond the ≤35-day window (SR-AVL-03) — a `media-processing`/backup concern, cross-referenced, not owned here.

---

## 5. "Active this week" computation (FR-AVAIL-06 / FR-TRUST-06)

> **No human can grant or revoke this badge** (FR-TRUST-06, restated as a guard). There is no admin route, no facade method, and no column write anywhere in this module that sets `active_this_week` except the job below. Admins can suspend a provider entirely (§7) — they cannot edit this badge.

### 5.1 Ownership split (decision)

Per HLD §6.1, the **`provider-availability` module owns the "available now" signal**; the **`trust-and-safety` module owns the *badge_state* record and the *badge events*** (event-catalog: `BadgeGranted`/`BadgeRevoked` are published by `trust-and-safety`). **RECONCILED against `03-provider-availability/provider-availability-lld.md` §10/§12(4):** `provider-availability.getRecentActivityCount(providerProfileId, since)` deliberately exposes only *its own* signal's raw count (availability's author declined to aggregate the other three, by design — "this module deliberately exposes the raw count, not a verdict"). The originally-recommended single-facade-call design is therefore **not** what's built; `trust-and-safety`'s daily job calls **four facades directly**, one per signal owner (clean-code §3 boundaries are still respected — each call crosses exactly one module's public surface, there is no reach-through):

| Signal (FR-AVAIL-06) | Source module | Facade surface |
|---|---|---|
| Sign-in in trailing 7d | `identity-and-access` | `identity-and-access.hasSignedInSince(userId, since)` — boolean, never a raw timestamp |
| "Available now" set/renewed in 7d | `provider-availability` | `getRecentActivityCount(pid, since)` (provider-availability-lld.md §10) |
| Profile edit in 7d | `provider-profile` | `provider-profile.updatedAtSince(providerProfileId, since)` — boolean |
| Message sent in 7d | `direct-messaging` | `direct-messaging.hasSentSince(userId, since)` — boolean; message bodies never read |

"Active this week" = **any** of the four occurred within `now - 7 days` (computed in the platform operating timezone window, SR-APP-09). This module (`trust-and-safety`) owns the OR composition — no other module is expected to pre-OR these signals for it.

### 5.2 Job (SR-APP-10, "at least daily")

- **Cadence:** daily (FR-TRUST-06 "evaluated at least daily"; SR-APP-10 row).
- **Algorithm (per published provider):**
  1. `active = ` OR of the four facade checks in §5.1's table, each `> 0`/non-null within `now-7d`.
  2. If `active` and `badge_state.active_this_week=false` ⇒ set `true`, `active_this_week_since=now`, outbox `BadgeGranted(active_this_week)`.
  3. If `not active` and `badge_state.active_this_week=true` ⇒ set `false`, clear since, outbox `BadgeRevoked(active_this_week)`.
  4. No change ⇒ no write, no event (idempotent; natural-key upsert semantics).
- **Guard:** this job is the **only** writer of `active_this_week` (FR-TRUST-06). Absence of the badge is neutral — never a demerit (FR-AVAIL-05).
- `discovery-search` updates its projection's `badge_active_this_week` flag from `BadgeGranted`/`BadgeRevoked(active_this_week)` (event-catalog §2; discovery LLD §4A).

---

## 6. Report resolution flow (FR-TRUST-07, FR-ADM-03)

> **Every report reaches a human resolution. Nothing auto-resolves, nothing auto-expires, and filing a report triggers NO automated action against the reported party** (FR-TRUST-07, §1). There is no timer, no threshold ("N reports ⇒ auto-hide"), and no heuristic anywhere in this module. Restated as a guard because it is the single most load-bearing behavior in the cluster.

### 6.1 Filing

`commands/file-report.ts`: `ctx.requireRole('seeker'|'provider')`; validate `target_type`/`reason` against the fixed taxonomies (§3); insert `report(status='open')`; outbox `ReportFiled` (→ `user-notifications` sends the reporter a receipt confirmation, FR-NOTIF-01). Rate-limit bucket `report_file` (account, 10/hour — security-implementation §5.2). **No** state of the reported party changes (§1). Reported-content *context* (the profile, review, photo, or thread) is fetched by the admin console later via the owning module's facade — for `target_type='thread'`, access is limited to that reported thread only (FR-ADM-04, FR-MSG-09; `direct-messaging` facade `getThreadForReport(threadId)`).

### 6.2 Decision table (reproduces user-stories §19.5)

| # | State / event | Condition | Transition / outcome | Guard |
|---|---|---|---|---|
| 1 | User taps Report (profile/review/photo/thread, 1–2 taps) | valid reason chosen | `report(open)`; `ReportFiled`; receipt to reporter | taxonomy fixed (FR-TRUST-07) |
| 2 | Report filed | _always_ | **no automated action of any kind** against reported party | §1 (FR-TRUST-07) |
| 3 | Report in queue | admin opens | shows reporter, reported party, content-in-context, **reported party's report/moderation history** (`report_target_history_idx`, `moderation_target_idx`) | FR-ADM-03 |
| 4 | Open report | admin **dismiss(note)** | `status='dismissed'`, `resolved_by`, `resolution_note` (required); audit `report.dismiss`; outbox `ReportResolved(dismissed)` | every report → human resolution |
| 5 | Open report | admin **act** | `status='acted'`; performs a moderation action (§7) linked via `moderation_action.report_id`; audit `report.act`; outbox `ReportResolved(acted)` + the action's `ModerationActionTaken` | takedown is a reasoned human act (FR-ADM-05) |
| 6 | Any open report | time passes / more reports arrive | **nothing** — no auto-resolve, no auto-expire, no escalation heuristic | §1 |
| 7 | Acted → unpublish | reported provider | provider may **edit and republish themself** — republish is not admin-gated | FR-ADM-05; user-stories §19.5 |

**Queue ordering.** The reports queue is **oldest-first** (`report_queue_idx on created_at where status='open'`) — confirmed to match the identity queue's oldest-first policy (FR-ADM-02). FR-ADM-03 does not state an order explicitly; oldest-first is chosen for consistency and to bound worst-case wait (fairness + the manual-review-scaling visibility goal, BRD risk #2).

---

## 7. Moderation actions (FR-ADM-05)

> These are the **only** mechanisms in the entire product that can take content down (FR-ADM-05, §1). Each requires an explicit admin decision + a recorded `reason` (schema-enforced, §3), writes `shared.audit_log` **in the same transaction** (SR-APP-12, clean-code §12 `trust-and-safety`), and publishes `ModerationActionTaken` for cross-module effect. Nothing is removed by automation.

Every action handler: `ctx.requireRole('admin')` (also enforced at the admin-route hook, security-implementation §2); idempotency via `trust_and_safety.processed_admin_action` (§3, api-conventions §5) so a double-click is a no-op returning the original result; one transaction owning `moderation_action` insert + audit entry + outbox.

| Action | Effect it DOES have | What it does **NOT** do | Event published | Audit `action` (event-catalog §4) |
|---|---|---|---|---|
| `remove_photo` | requests `media-processing` to delete a specific photo (via `ModerationActionTaken` → `media-processing`/`provider-profile` subscribe) | does not touch other photos, does not unpublish the profile | `ModerationActionTaken{action:'remove_photo', targetType:'photo'}` | `moderation.remove_photo` |
| `remove_review` | `provider-reviews` deletes the review, or nulls the reply if `metadata.part='reply'` (provider-reviews-lld.md §5.4/§6) | does not affect the provider's other reviews or rating beyond the recompute | `ModerationActionTaken{action:'remove_review', targetType:'review'}` | `moderation.remove_review` |
| `unpublish` | `provider-profile` flips `publish_state` to hidden (subscribes); `discovery-search` removes the projection row | **does not delete any data** — profile is retained; provider may edit + republish themself (not admin-gated) | `ModerationActionTaken{action:'unpublish', targetType:'provider_profile'}` | `moderation.unpublish` |
| `suspend` | account access revoked + sessions revoked (**synchronous**, §9); profile hidden (via event → `provider-profile`/`discovery-search`) | **does not delete the account or its data**; provider is notified with reason | `ModerationActionTaken{action:'suspend', targetType:'user'}` + synchronous `identity-and-access.applySuspension` (§9) | `moderation.suspend` |
| `reinstate` | reverses suspension: `identity-and-access` status→active (**synchronous**, §9); profile republish is the provider's own action | does not auto-republish the profile | `ModerationActionTaken{action:'reinstate', targetType:'user'}` | `moderation.reinstate` |
| `revoke_badge` | clears `badge_state.identity_verified` (§4.2 revoke row) | does not touch profile visibility, does not suspend | `BadgeRevoked(identity_verified, reason='admin_revoke')` | `identity.revoke` |

**Cross-module effect is event-driven, never a direct write (except suspension's identity/session part, §9).** `trust-and-safety` does **not** write `provider_profile.provider_profile.publish_state`, `media_processing.photo`, or `provider_reviews.review` directly — it publishes `ModerationActionTaken` and the owning module reacts (event-catalog §2 subscribers: `provider-profile` unpublish/suspend effect, `discovery-search` projection removal, `user-notifications` affected-party notice, `provider-reviews`/`media-processing` content removal). Subscriber idempotency: processed-event ledger keyed `(event_id, <subscriber>)`.

**`ModerationActionTaken` idempotency at publish:** processed-ledger semantics per event-catalog §2 (the event is one-time per `moderationActionId`); the double-click guard is the `processed_admin_action` table upstream so the action+event are produced exactly once.

---

## 8. Blocking (FR-TRUST-08)

- **Create:** `commands/block-user.ts`: `ctx.requireRole('seeker'|'provider')`; insert `block(blocker_id=ctx.userId, blocked_id)`; on PK conflict ⇒ `ALREADY_BLOCKED` returned as **200 no-op** (idempotent, event-catalog §5 note), not an error. Outbox `UserBlocked{blockerId, blockedId}`.
- **Effect (enforced in *queries*, not post-filtering):**
  - `direct-messaging` subscribes `UserBlocked` and blocks new messages **both directions** (FR-TRUST-08 symmetric); a blocked pair's thread returns `THREAD_NOT_FOUND`/404 (anti-enumeration, api-conventions §3.3).
  - `discovery-search` subscribes `UserBlocked` and **excludes the blocker from the blocked party's** search/browse results (FR-TRUST-08) — enforced at query level via the `block_blocked_idx` (clean-code §12 `direct-messaging`/`discovery-search` "block checks in queries").
- **Silent:** the blocked party is **not** notified (FR-TRUST-08); `user-notifications` never emits on `UserBlocked`, and a blocked party's activity never generates a notification for the blocker (FR-NOTIF-03; cross-ref `11-user-notifications/user-notifications-lld.md` block-silence handling).
- **Undo:** `commands/unblock-user.ts`: `ctx.requireOwnership(block.blockerId)`; delete the `block` row. Publishes **`UserUnblocked{blockerId, blockedId}`** (registered in event-catalog §2; `trust-and-safety` is the publisher) — `direct-messaging` and `discovery-search` (and `user-notifications`, per the catalog) need to know a block was lifted to restore messaging and result visibility, so unblock **does** need its own event (decision). `UserBlocked` does **not** fire on unblock.
- **List own blocks:** `GET /api/trust/blocks` (seeker/provider) — returns the caller's own blocks for the settings screen (FR-TRUST-08 "view and undo their own blocks").

---

## 9. Suspension cross-module call — decision (identity_and_access.user.status write path)

**Decision: synchronous facade call, in the same transaction, for the identity-status + session-revocation part of `suspend`/`reinstate`. The profile-visibility part remains event-driven.**

`suspend` and `reinstate` split into two concerns with deliberately different coupling:

1. **Account status + session revocation (synchronous):** the `suspend` handler calls `identity-and-access.applySuspension(tx, userId, reason)` passing the **ambient transaction handle**, so `identity_and_access.user.status='suspended'` **and** revocation of all that user's sessions (SR-SEC-04, security-implementation §3.3) commit **atomically** with `trust-and-safety`'s `moderation_action` insert + audit entry. `reinstate` calls `identity-and-access.applyReinstatement(tx, userId)` symmetrically (status→active; sessions are **not** restored — the user simply logs in again).
2. **Profile visibility (event-driven):** the same transaction publishes `ModerationActionTaken(suspend)`; `provider-profile` subscribes to hide the profile and `discovery-search` to remove the projection row — tolerating the existing ≤30s projection lag.

**Justification against HLD §6.3.** Rule 4 forbids a command handler calling another module's command synchronously, "money paths excepted only where the SRS demands transactional coupling (badge grant + audit log per SR-APP-12)." Suspension is a **security-critical same-transaction requirement**, not a side effect that tolerates async lag:

- A suspension exists precisely because a human judged the account dangerous (e.g. harassment). A window in which a suspended user still holds a **live session** is a security defect, not a cosmetic delay — SR-SEC-04 requires immediate session revocation, and an event-driven status flip cannot guarantee the session is dead before the next request. This is the same class of "the SRS demands transactional coupling" that justifies the badge-grant + audit exception; I extend that exception to suspension explicitly.
- The audit entry (`moderation.suspend`, reason required) must be atomic with the status change (SR-APP-12) — a synchronous same-transaction call gives that for free; an event does not.
- The **asymmetry with `unpublish`** is deliberate and defensible: `unpublish` only changes discovery visibility (no active-session danger), so its provider `publish_state` flip is event-driven (the task's mandated shape). Suspension's *visibility* part is likewise event-driven; only its *access-revocation* part is synchronous — the part where async lag is a security hole.
- **Schema boundary respected:** `identity_and_access.user.status` lives in `identity-and-access`'s schema; `trust-and-safety` never writes it directly. The write happens inside `identity-and-access`'s facade method, which merely accepts the caller's transaction. This is the sanctioned synchronous-command exception, not a cross-schema write.

The rejected alternative (event-driven status: `ModerationActionTaken → identity subscribes → sets status + revokes sessions`) is documented in §12(1) with the session-window reason it was rejected.

---

## 10. API contract

Envelope/errors/pagination/idempotency/rate-limits per `api-conventions.md`. Admin routes live under `/admin/api/trust/...` with the `is_admin=true` RBAC floor enforced **at the hook** before any handler runs (api-conventions §2, security-implementation §2); their delivery-surface wiring is `08-moderation-admin/moderation-admin-lld.md` §7 — the **handlers** (domain logic) are this module's facade.

### 10.1 Provider / seeker routes

| Method & path | Role | Request | Response | Rate-limit |
|---|---|---|---|---|
| `POST /api/trust/verification` | provider | `{ docPhotoIds: uuid[] }` | `{ data: <case> }` (201); open case exists ⇒ `VERIFICATION_ALREADY_PENDING`/409 | `verification_submit` (account, 5/h — security-implementation §5.2) |
| `POST /api/trust/verification/resubmit` | provider | `{ docPhotoIds }` | `{ data: <case> }` after a rejection | `verification_submit` |
| `GET /api/trust/verification/me` | provider (owner) | — | `{ data: { status, decidedAt?, rejectionReason? } }` — own status transparency (FR-AVAIL-07-adjacent) | — |
| `POST /api/trust/reports` | seeker/provider | `{ targetType, targetId, reason, freeText? }` (`FileReportRequestSchema`) | `{ data: { reportId } }` (201) | `report_file` (account, 10/h) |
| `POST /api/trust/blocks` | seeker/provider | `{ blockedId }` | `{ data: { blocked: true } }` (200; already-blocked = 200 no-op) | — |
| `DELETE /api/trust/blocks/:blockedId` | owner | — | `{ data: { blocked: false } }` | — |
| `GET /api/trust/blocks` | owner | — | `{ data: [<block>] }` | — |
| `GET /api/trust/safety-info` | anonymous+ | — | `{ data: { html } }` — safety-info page content (FR-TRUST-09, S) | `search_query` |

**Safety-info content (FR-TRUST-09).** Stored as admin-authored HTML in `platform-configuration` config (`platform-configuration.getConfig('platform-configuration.safety_info_html')`), sanitized through the fixed allowlist sanitizer **at write time** (the sole sanctioned `{@html}` sink, security-implementation §8). This module's endpoint returns it read-only; badge tap/hover one-liners (FR-TRUST-09) are static UI copy in the delivery layer.

### 10.2 Admin routes (facade methods; RBAC floor at hook)

| Method & path | Facade method | Writes |
|---|---|---|
| `POST /admin/api/trust/verification/:caseId/approve` | `approveVerification` | case→approved, badge grant, audit `identity.approve`, `VerificationDecided`+`BadgeGranted` |
| `POST /admin/api/trust/verification/:caseId/reject` | `rejectVerification` (reason required) | case→rejected, audit `identity.reject`, `VerificationDecided(rejected)` |
| `POST /admin/api/trust/reports/:reportId/dismiss` | `dismissReport` (note required) | report→dismissed, audit `report.dismiss`, `ReportResolved(dismissed)` |
| `POST /admin/api/trust/reports/:reportId/act` | `actOnReport` (invokes a moderation action, reason required) | report→acted, `moderation_action`, audit `report.act`, `ReportResolved(acted)` + `ModerationActionTaken` |
| `POST /admin/api/trust/moderation/remove-photo` | `removePhoto` | §7 |
| `POST /admin/api/trust/moderation/remove-review` | `removeReview` | §7 |
| `POST /admin/api/trust/moderation/unpublish` | `unpublishProfile` | §7 |
| `POST /admin/api/trust/moderation/suspend` | `suspendAccount` | §7 + synchronous `identity-and-access.applySuspension` (§9) |
| `POST /admin/api/trust/moderation/reinstate` | `reinstateAccount` | §7 + synchronous `identity-and-access.applyReinstatement` (§9) |
| `POST /admin/api/trust/moderation/revoke-badge` | `revokeBadge` | §4.2 revoke |

All admin routes accept `Idempotency-Key` (api-conventions §5) → `trust_and_safety.processed_admin_action`. All require a non-empty `reason` (schema + `moderation_action.reason not null`).

---

## 11. Domain events published (event-catalog §2)

| Event | When | Payload | Subscribers | Catalog status |
|---|---|---|---|---|
| `VerificationDecided` | approve/reject (§4) | `verificationCaseId, providerProfileId, decision` | `user-notifications`, `discovery-search` (on approve) | existing |
| `BadgeGranted` / `BadgeRevoked` | identity badge grant/revoke/suppress (§4) **and** active-this-week grant/revoke (§5) | `providerProfileId, badge, reason` | `discovery-search` (projection badge flag) | **CORRECTED** — `badge` domain widened to `'identity_verified' \| 'active_this_week'` (§12(3), event-catalog append) |
| `ReportFiled` | report created (§6.1) | `reportId, reporterId, targetType, targetId` | `user-notifications` (receipt) | existing |
| `ReportResolved` | dismiss/act (§6.2) | `reportId, resolution` | `user-notifications` (S) | existing |
| `ModerationActionTaken` | any moderation action (§7) | `moderationActionId, targetType, targetId, action` (+ `metadata` for reply removal) | `provider-profile`, `user-notifications`, `discovery-search`, `provider-reviews`, `media-processing` | existing |
| `UserBlocked` | block created (§8) | `blockerId, blockedId` | `direct-messaging`, `discovery-search` | existing |
| `UserUnblocked` | block removed (§8) | `blockerId, blockedId` | `direct-messaging` (re-allow), `discovery-search` (restore visibility), `user-notifications` (block-cache mirror) | present in event-catalog §2 (publisher `trust-and-safety`) |

**Subscribed by this module:** `IdentityAttributesChanged` (from `identity-and-access` — badge suppression, §4.2). `ModerationActionTaken` is *published* here, not subscribed. Idempotency for the subscription: processed-event ledger `(event_id, 'trust-and-safety')`.

---

## 12. Open questions / assumptions (for reconciliation)

1. **Suspension = synchronous facade** — **Closed:** `identity-and-access.applySuspension` / `applyReinstatement`.
2. **"Active this week" aggregation** — **Closed:** `trust-and-safety` owns the four-signal OR; discovery consumes `BadgeGranted`/`BadgeRevoked` into `badge_active_this_week`.
3. **`badge_state.active_this_week` columns** — **Closed:** discovery now projects the badge (2026-08-20).
4. **`UserUnblocked`** — **Closed:** this module publishes; messaging, discovery, and notifications consume.
5. **Reply-removal `metadata.part='reply'`** — agreed with reviews and admin console; keep as the implementation convention.
6. **`verification_submit` rate-limit bucket** — **Closed 2026-08-20:** `verification_submit` (account, 5/h) in `security-implementation.md` §5.2; open-case unique index still blocks duplicate pending submissions.
7. **Badge-suppression trigger** — **Closed:** `IdentityAttributesChanged`; `ProfileUpdated` no longer lists `trust-and-safety`.

KPI facades used by the admin console: `getIdentityQueueStats()` / `getReportsQueueStats()` are public methods on this module's `index.ts` (FR-ADM-09). `exportFor(userId)` returns verification-case metadata, reports the user filed, and blocks they created — never identity-document binaries (SR-DATA-07; platform-configuration LLD §9).
