---
title: Peach Finder — Low-Level Design — Master Index
updated: 2026-08-20
---

# Low-Level Design (LLD) / Technical Design Document — Master Index

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | LLD/TDD master index — read this first |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | `00-business-requirements/brd.md`, `01-functional-requirements-specification/frs.md`, `02-system-requirements-specification/srs.md`, `03-user-stories/user-stories.md`, `04-solution-architecture/hld.md` + `clean-code-guidelines-per-module.md` — all signed-off/owner-ratified as of 2026-07-22 |
| Downstream | `06-ui-ux-design/` (living — see that folder's README); `07-test-artifacts` (strategy, plan, test cases, traceability, and 11 live-stack-seeded Playwright designs now written — see that folder's `00-overview.md`); `08-development-deliverable-documents` (compose file, Caddyfile, provisioning script, runbooks — materialize there, referenced but not authored here per HLD §14) |
| Status | Living document — updated in place |

**What this folder is:** the buildable design — schemas, endpoint/WS contracts, state machines, and algorithms — that closes the gap the HLD deliberately left open (HLD §14). Every document here cites the FR/SR/HLD-decision it implements; a developer should be able to build any one module from its LLD plus the four foundation documents without asking a clarifying question. Where a genuine ambiguity remained, each document's closing "Open questions" section names it explicitly rather than papering over it — check those sections before assuming silence means certainty.

**How this was produced:** the four foundation documents (§2 below) were authored first as binding conventions — ID types, the event/outbox mechanism, API/error/WS envelopes, session/RBAC/rate-limit mechanics. The thirteen module documents (§3) were then authored against those conventions, with several genuinely cross-cutting design questions (the featuring-event pair, the badge-suppression event source, the "active this week" aggregation boundary, the suspension write-path) resolved by direct convergence between the documents rather than left to drift — each such resolution is recorded in the relevant document's own text, not hidden in a separate change log.

---

## 2. Foundations — read these first, in this order

| Document | What it fixes |
|---|---|
| [`shared-kernel.md`](shared-kernel.md) | Branded ID types (UUIDv7), `Result`/`UseCaseError`, the `Clock` port, `Money`, the outbox event mechanism (`shared.outbox`, publish/dispatch/subscriber-idempotency), the append-only `shared.audit_log`, `AuthContext`, Zod conventions, schema-per-module database convention |
| [`api-conventions.md`](api-conventions.md) | HTTP route shape, response envelope, `UseCaseError`→HTTP status mapping, pagination, idempotency, rate-limit response contract, CSRF, WebSocket protocol conventions, privacy-serializer principle, standard headers |
| [`event-catalog.md`](event-catalog.md) | **The single registry** of every domain event, audit-log action, error code, and WS message type across all modules — the cross-module contract surface. Every module document below cites this file rather than redefining names. |
| [`security-implementation.md`](security-implementation.md) | RBAC hook mechanism, session lifecycle/revocation, admin TOTP, the rate-limit bucket mechanism **and the concrete bucket table** (single source of truth for every numeric limit), the runtime-config cache, the privacy-serializer pattern, and the OWASP ASVS L2 control map |

---

## 3. Module documents

| # | Folder | Document | Delivers (FRS module) | Key design content |
|---|---|---|---|---|
| 1 | `01-identity-and-access` | [`identity-and-access-lld.md`](../01-identity-and-access/identity-and-access-lld.md) | ACC | `identity_and_access.user` (the shared aggregate every module FKs onto), session/OAuth/OTP/reset tables, account-status state machine, **role resolved as a per-request capability, not a stored column** (§4.2 — the concrete answer to how FR-ACC-08 dual roles work), anonymization algorithm, phone-registry anti-abuse anchor (FR-MONET-03) |
| 2 | `02-provider-profile` | [`provider-profile-lld.md`](../02-provider-profile/provider-profile-lld.md) | PROF | Profile/service/tag/language data model, publish-state machine (T1–T7, incl. admin-unpublish and billing-lapse paths), phone-visibility serializer (the concrete FR-PROF-08/SR-SEC-09 mechanism) |
| 3 | `03-provider-availability` | [`provider-availability-lld.md`](../03-provider-availability/provider-availability-lld.md) | AVAIL | "Available now" state machine (reproduces user-stories §19.3 exactly), the expiry-sweep SQL and its race-safety proof, `getRecentActivityCount` (deliberately availability-only — see `07-trust-and-safety` §5.1 for the composition this enables) |
| 4 | `04-discovery-search` | [`discovery-search-lld.md`](../04-discovery-search/discovery-search-lld.md) | SRCH | The search projection DDL, the deterministic lexicon-parser algorithm (walked against BRD §13 example queries), the actual ranking SQL proving availability-first/featured-never-outranks-available (FR-SRCH-08c), empty-result relaxation order — the platform's highest determinism bar (**SRS D-5**/FR-SRCH-13), tested accordingly (`14-test-strategy` §2.4) |
| 5 | `05-direct-messaging` | [`direct-messaging-lld.md`](../05-direct-messaging/direct-messaging-lld.md) | MSG | Thread/message data model, WS message-send flow, presence facade (owns FR-PROF-06's coarse online-status source), response-time computation, the `block_cache` local-mirror design and its accepted eventual-consistency window |
| 6 | `06-provider-reviews` | [`provider-reviews-lld.md`](../06-provider-reviews/provider-reviews-lld.md) | REV | Review/aggregate data model, the ≥24h eligibility check via `direct-messaging`'s facade, the "explains rather than hides" ineligible-response decision, "New" vs zero-score display rule |
| 7 | `07-trust-and-safety` | [`trust-and-safety-lld.md`](../07-trust-and-safety/trust-and-safety-lld.md) | TRUST + moderation domain logic for ADM | Verification-case state machine (user-stories §19.4), "active this week" computation (owns the four-signal OR composition), report-resolution flow (user-stories §19.5) with the human-only-moderation guard restated at every transition, the full moderation-action taxonomy, blocking, **the suspension synchronous-facade-call decision** (the one deliberate exception to async-by-default, justified against HLD §6.3) |
| 8 | `08-moderation-admin` | [`moderation-admin-lld.md`](../08-moderation-admin/moderation-admin-lld.md) | ADM (delivery surface) | Admin console route table — explicitly **no new domain logic**, every route delegates to `trust-and-safety`/`listing-billing`/`platform-configuration`/`identity-and-access`/`provider-profile` facades; TOTP login sequence; confirms no impersonation exists anywhere |
| 9 | `09-listing-billing` | [`listing-billing-lld.md`](../09-listing-billing/listing-billing-lld.md) | MONET | Listing lifecycle state machine (user-stories §19.6, all 8 transitions), webhook idempotency ledger and signature-verification sequence, the daily re-derivation job that makes the lifecycle "heal" from a missed webhook, free-period anti-abuse enforcement, featuring add-on independent lifecycle |
| 10 | `10-provider-analytics` | [`provider-analytics-lld.md`](../10-provider-analytics/provider-analytics-lld.md) | ANLY | Fire-and-forget capture design, per-viewer-per-day dedup, the `< 5` floor applied strictly at read time, hourly rollup job, most-searched-services aggregation |
| 11 | `11-user-notifications` | [`user-notifications-lld.md`](../11-user-notifications/user-notifications-lld.md) | NOTIF | Event→notification→channel mapping table, the batching-window algorithm (FR-NOTIF-03), block-silence enforcement, always-delivered (non-opt-out) categories |
| 12 | `12-media-processing` | [`media-processing-lld.md`](../12-media-processing/media-processing-lld.md) | supports PROF/MSG/TRUST | Upload pipeline (content-sniff → EXIF/GPS strip → WebP-first variants → content-hash), the two-bucket policy (public `media` vs deny-by-default `identity-docs` with short-TTL admin-only presigning) |
| 13 | `13-platform-configuration` | [`platform-configuration-lld.md`](../13-platform-configuration/platform-configuration-lld.md) | ADM (config) + PRIV (export) | `platform_configuration.area`/`config`/`lexicon_entry` DDL (the gazetteer and lexicon storage every other module's LLD was told to treat as mandated), the config-value registry (single source of truth for key names), fail-loudly-on-bad-config startup validation, **admin-initiated subject-access export** (SR-DATA-07, §9) |
| 14 | `14-test-strategy` | [`test-strategy.md`](../14-test-strategy/test-strategy.md) | cross-cutting | Module-by-module required-test matrix, 8 critical-path E2E scenarios, CI gate checklist — synthesizes what clean-code-guidelines §10's pyramid rules imply concretely for this system |

---

## 4. How the modules fit together (read order by concern)

- **Building an account/auth flow?** `01-identity-and-access` + `security-implementation.md`.
- **Building the provider-facing profile/photo experience?** `02-provider-profile` + `12-media-processing`.
- **Building the homepage/search?** `03-provider-availability` + `04-discovery-search` — read them together, availability is discovery's primary event source.
- **Building messaging/notifications?** `05-direct-messaging` + `11-user-notifications` together — nearly every notification category originates from a messaging event.
- **Building trust/safety/admin?** `07-trust-and-safety` (domain logic) + `08-moderation-admin` (delivery surface) + `06-provider-reviews` (shares the report/removal path) — read as one cluster.
- **Building billing?** `09-listing-billing` alone is sufficient, but its pricing/free-period numbers come from `13-platform-configuration`.
- **Building the provider analytics dashboard?** `10-provider-analytics` + `02-provider-profile` (for the tag-highlight comparison in most-searched-services).

---

## 5. Cross-document reconciliations performed

Six independent authoring passes converged on the shared foundation; the following genuine cross-module design questions were resolved during integration (recorded here so the resolution isn't only visible by diffing documents against each other):

| Question | Resolution | Where it's recorded |
|---|---|---|
| Featuring add-on event pair (`listing-billing` publishes, `discovery-search` consumes) | Converged to one canonical `FeaturingActivated`/`FeaturingLapsed` pair — the two authoring passes self-detected and merged their independent additions | `event-catalog.md` §2 |
| Badge-suppression trigger for FR-TRUST-04 | `trust-and-safety` subscribes to `identity-and-access`'s `IdentityAttributesChanged` (name/phone are identity-owned fields), **not** `provider-profile`'s `ProfileUpdated` — the stale subscriber reference was removed from the `ProfileUpdated` catalog row | `event-catalog.md` §2; `01-identity-and-access` §7; `07-trust-and-safety` §4.2 |
| "Active this week" four-signal aggregation | `provider-availability.getRecentActivityCount` deliberately exposes only its own signal (by that module's design); `trust-and-safety`'s daily job calls all four owning modules' facades directly and owns the OR composition | `03-provider-availability` §10/§12(4); `07-trust-and-safety` §5.1 (updated to match) |
| Suspension write path (`identity_and_access.user.status`) | Synchronous same-transaction facade call (`identity-and-access.applySuspension`/`applyReinstatement`), justified as the same class of exception HLD §6.3 already grants badge-grant+audit — both documents now use identical method names | `01-identity-and-access` §5.4/§5.5; `07-trust-and-safety` §9 |
| `security-implementation.md`'s references to `identity_and_access.user.role` | Corrected in place — `identity-and-access` settled on `is_admin boolean` + presence-based provider capability (no stored `role` column); the RBAC hook description now cites `identity-and-access`'s `resolveRole()` | `security-implementation.md` §2/§3.4 (corrected during integration) |
| Missing rate-limit buckets identified by module authors (`availability_toggle`, `register`) | Appended to the single bucket table rather than left as per-module ad-hoc limits | `security-implementation.md` §5.2 |
| `UserUnblocked` event (undo-block needed a removal signal) | Added by `05-direct-messaging` (consumer), published by `07-trust-and-safety` — both documents agree on payload and subscriber set | `event-catalog.md` §2 |

No reconciliation surfaced a requirements-level conflict — every resolution was a design-mechanics question the upstream documents (BRD/FRS/SRS/HLD) legitimately left to this layer.

---

## 6. Open items carried forward (non-blocking, flagged in module documents)

These do not block implementation — each module document states an interim working assumption — but should get a deliberate owner decision before or shortly after the relevant module is built:

- Token/session lifetimes not fixed upstream (email-verification 24h, etc.) — `01-identity-and-access` §9.5, admin-tunability deferred.
- Free-period length and listing/featuring prices — platform-configuration defaults (`14` days, `9900`/`4900` cents ZAR) are bootstrap placeholders; owner sets launch numbers in the console (FR-ADM-06).
- Pre-launch activities explicitly out of this LLD's scope: load testing against SR-CAP-01, penetration testing (SR-SEC-12), restore-drill exercises (SR-AVL-05) — tracked for `08-development-deliverable-documents`.

Closed in the 2026-08-20 LLD review pass: SR-DATA-07 export specified in `platform-configuration` §9 (facade `exportFor` per owning module; admin `POST /admin/api/platform/export/:userId`); `verification_submit` bucket; `pf_anon` analytics cookie (not a session); ConfigRegistry now includes notification + safety-info keys; `reminder_lead < expiry` and dunning-offset-within-grace rejected at config write; lexicon `maps_to` validated against discovery's Zod at write; area/lexicon audit actions registered; `UserRegistered.registrationIntent` / `AccountDeletionRequested` no longer carry a stored `role`.

Closed in the earlier 2026-08-20 consistency pass (no longer open in the module docs): FR-TRUST-04 via `IdentityAttributesChanged`; `UserUnblocked` restoring discovery visibility; `badge_active_this_week` on the search projection; directed FR-TRUST-08 hide; config key names unified to `platform-configuration` §4; `register`/`verify_email`/`reset_complete` buckets; missing KPI/contact/eligibility facades named on owning modules; FR-PRIV-04 24-month thread purge in `direct-messaging`.

These mirror each module document's own "Open questions" section — check the specific document before building that module, since this list is a summary, not the authoritative text.

---

## 7. What's deliberately not here

Per HLD §14: the compose file, Caddyfile, host-provisioning script, and operational runbooks are **deployment artifacts**, not design documents — they belong in `08-development-deliverable-documents` and materialize from this LLD set rather than being authored here. UI component specs and visual design live in `06-ui-ux-design/` (living — design system + prototype). Test *artifacts* (strategy, plan, story-level test cases, traceability, Playwright designs) belong in `07-test-artifacts`, now written; `14-test-strategy` here remains the *developer*-facing module-by-module matrix those QA-facing artifacts cross-reference rather than duplicate.
