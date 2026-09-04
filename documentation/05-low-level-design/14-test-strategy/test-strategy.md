---
title: Peach Finder — LLD — Test Strategy
updated: 2026-08-20
---

# Test Strategy — Low-Level Design

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Low-Level Design — cross-module test plan |
| Upstream | `clean-code-guidelines-per-module.md` §10 (test pyramid, normative rules); every module LLD in this folder (module-specific test obligations synthesized below); SRS §15 SR-COMPAT (browser/device/accessibility verification), §8 SR-PERF (budgets as release gates) |
| Status | Living document — updated in place |

This document does not restate the test *pyramid rules* (clean-code-guidelines §10 already fixes those: pure domain unit tests, handler tests with fake ports, Testcontainers infra tests, Playwright E2E on the critical path, CI gates). It synthesizes **what must specifically be tested**, module by module, because that's where a generic "write tests" instruction leaves ambiguity — this is the developer-facing test matrix the module LLDs individually call for but don't collect in one place.

---

## 2. Module-by-module test matrix

For each module: the invariants/state-transitions that need domain-unit coverage (legal and illegal paths), the handler-level authorization/idempotency cases, and the infra/integration cases that need a real Postgres (Testcontainers).

### 2.1 `identity-and-access` (`01-identity-and-access/identity-and-access-lld.md`)

| Layer | Required test |
|---|---|
| domain | Account status transitions: every row of §4.1's table, plus every **illegal** transition (e.g. `deleted → active` without going through re-registration) rejected as a typed error |
| domain | Anonymization function (§6): every PII field null/tombstoned post-anonymize; phone equality only via HMAC hash, never plaintext |
| app | Registration: uniform response whether email exists (SR-SEC-04) — assert identical status/body/timing-insensitive shape for both cases |
| app | Login: uniform "invalid email or password" for unknown-email vs wrong-password; `ACCOUNT_SUSPENDED` only for genuinely suspended accounts |
| app | OTP: 6th verify attempt rejected pre-hash (rate-limited before Argon2id work); expired/consumed code → `NOT_FOUND`, never a distinct "expired" signal (anti-enumeration) |
| app | Session fixation: `pf_anon` is never copied into `pf_session` / a session row; post-auth token is freshly generated |
| app | `applySuspension`/`applyReinstatement`: session revocation atomic with status change in the same transaction — test that a session lookup immediately after a simulated crash-after-status-before-revoke scenario cannot occur (transaction boundary test) |
| app | OAuth linking: unverified-email match never auto-links; verified-email match requires the explicit `linkChallengeToken` + proof step |
| infra | `phone_registry_history` upsert survives a full anonymization cycle — regression test for the FR-MONET-03 anchor |
| infra | Session fixation: pre-auth request carries no session cookie; post-auth token is freshly generated, never reused from any prior state |

### 2.2 `provider-profile` (`02-provider-profile/provider-profile-lld.md`)

| Layer | Required test |
|---|---|
| domain | Publish-readiness predicate (FR-PROF-02 minimum fields) — every field-missing permutation rejected with `PROFILE_INCOMPLETE` |
| domain | Publish-state transition table (T1–T7) — every legal transition plus illegal ones (e.g. `draft → unpublished`) rejected |
| app | Phone-visibility serializer: `phone` field is **absent from the response object**, not merely falsy, when `phoneVisible=false` and viewer is anonymous — assert via `JSON.stringify` key absence, not just value check (this is the exact bug class SR-SEC-09 exists to prevent) |
| app | T7 reactivation idempotency: a second `SubscriptionActivated`/`PaymentSucceeded` delivery when already `published` is a no-op (no duplicate `ProviderPublished`) |
| infra | `ProfileUpdated{changedFields}` fires with the correct field diff on every mutating save, including no-op saves (must **not** fire if nothing changed) |

### 2.3 `provider-availability` (`03-provider-availability/provider-availability-lld.md`)

| Layer | Required test |
|---|---|
| domain | State machine (NotAvailable/Available/ExpiryWarned) — every user-stories §19.3 transition, plus the illegal ones (e.g. `NotAvailable → ExpiryWarned` directly) |
| domain | Renew-vs-sweep race: a renew committed before the sweep's snapshot must survive (simulate via `FixedClock` + concurrent transaction ordering) |
| infra | Sweep SQL: seed rows with `expires_at` in the past/future/exactly-now boundary; assert only past rows transition, one `AvailabilityExpired` per row, none survive past `expires_at + 60s` under a simulated 60s-delayed sweep run |
| infra | Warning job: `warned_at` set atomically with the notification-triggering event — a re-run of the same tick never double-warns |

### 2.4 `discovery-search` (`04-discovery-search/discovery-search-lld.md`)

This module carries the platform's hardest correctness requirement (FR-SRCH-13/D-5 determinism) — its test bar is correspondingly the highest in the system.

| Layer | Required test |
|---|---|
| domain | **Lexicon parser determinism:** same (query, lexicon snapshot) pair run 100× produces byte-identical structured filters — no timing, no randomness dependency |
| domain | Every BRD §13 example query (not just the 3 walked in the LLD) resolves to a sensible, asserted-exact filter set — this is the FR-SRCH-02 acceptance set and must be a named test per example query |
| domain | Longest-match-first phrase resolution: a query containing both a 2-word phrase and its constituent single words resolves to the phrase intent, not two separate token matches |
| app | Ranking query: availability-first ordering holds even when a featured-but-unavailable provider has a higher relevance score than an available non-featured one (the FR-SRCH-08c proof case, as an actual seeded-data test, not just a reading of the `ORDER BY` clause) |
| app | Empty-result relaxation: the deterministic priority order (available_now → rating → area/distance → price) is asserted against a fixture that would give a different "helpful" answer under a different plausible ordering, so the test actually pins the choice |
| infra | Projection freshness: publish `AvailabilitySet`, assert the projection row reflects it within the dispatch latency, well inside the ≤30s SR-APP-03 bound; separately, corrupt a projection row directly and assert the hourly reconciling sweep repairs it |
| infra | Suggestions never surface a provider display name to an anonymous-role query (FR-SRCH-07 guard) — fixture with a provider whose display name happens to collide with a lexicon term |

### 2.5 `direct-messaging` (`05-direct-messaging/direct-messaging-lld.md`)

| Layer | Required test |
|---|---|
| domain | Response-time bucket thresholds at exact boundaries (29m59s vs 30m01s) |
| app | One-thread-per-pair uniqueness: concurrent "start thread" requests from the same seeker→provider pair resolve to one thread, not two (unique constraint + idempotent handler) |
| app | Blocked-thread access returns `THREAD_NOT_FOUND` (404), never `FORBIDDEN` (403) — anti-enumeration assertion |
| app | `block_cache` eventual-consistency window: send a message in the gap between `UserBlocked` publish and mirror-row apply, assert the **next** send attempt is blocked (the documented acceptance of the window, made into a test that proves the healing behavior, not just the gap) |
| infra | WS reconnect: forcibly drop the socket mid-session, assert exponential backoff timing and that a message sent during the outage is delivered via the poll-fallback path, then reconciles once WS resumes (no duplicate delivery) |

### 2.6 `provider-reviews` (`06-provider-reviews/provider-reviews-lld.md`)

| Layer | Required test |
|---|---|
| domain | Eligibility boundary: thread exactly 23h59m59s old → ineligible; exactly 24h00m00s → eligible |
| app | One-review-per-pair uniqueness under concurrent submit |
| app | Ineligible submit returns the plain-language explanation shape (200 + `eligible:false`), not an error code, per the reviews LLD's explicit decision — regression-guard this exact response shape |
| infra | Rating aggregate recompute correctness across submit/edit/delete/admin-remove, including the "New" (zero-review) display rule |

### 2.7 `trust-and-safety` (`07-trust-and-safety/trust-and-safety-lld.md`)

The human-only-moderation guarantee is the platform's single most important behavior — it needs a dedicated adversarial test class, not just happy-path coverage.

| Layer | Required test |
|---|---|
| **guard-clause suite** | **Grep-level + integration proof that no code path in `trust-and-safety/` (or anywhere) calls a moderation-action-equivalent function from a non-admin-initiated context.** Concretely: file N reports against one target in rapid succession and assert **zero** state change on the target — no auto-hide, no auto-suspend, no threshold effect of any kind. This is the test that would catch a regression reintroducing automated enforcement. |
| domain | Verification state machine (§4.2) — every transition including suppression-on-edit and re-review-restores-without-full-review |
| domain | Active-this-week: exactly one of the four signals present → badge granted; all four absent → badge revoked; the job is the **only** writer (assert no other code path can set the column — a compile-time/lint check plus a runtime assertion test) |
| app | Moderation-action idempotency: identical `Idempotency-Key` submitted twice produces one `moderation_action` row, one audit entry, one event |
| app | `applySuspension`/`applyReinstatement` transactional atomicity (also covered from `identity-and-access`'s side, §2.1) — from `trust-and-safety`'s side, assert the audit entry, the `moderation_action` row, and the session revocation all commit or all roll back together |
| app | `verification_submit` bucket: a 6th submit/resubmit in the same hour from the same account returns `RATE_LIMITED`; an open pending case still returns `VERIFICATION_ALREADY_PENDING` on the first duplicate |
| infra | Identity-doc purge job: seed a decided case at exactly 90 days, assert purge fires; at 89 days, assert it doesn't; case metadata (decision, date, reviewer) survives the purge, the photo objects don't |
| infra | Block/unblock round-trip via the real event path (not a direct DB write) reaches `direct_messaging.block_cache` and `discovery-search`'s exclusion correctly in both directions |

### 2.8 `08-moderation-admin` (delivery surface)

| Layer | Required test |
|---|---|
| — | **No new domain-logic tests** — by design, this layer has none of its own (§3 of its LLD). Tests here are route-level: correct facade method invoked per endpoint, `is_admin` RBAC floor enforced at the hook (a non-admin session hitting any `/admin/api/*` route gets 401/403 before any handler code runs — assert via a spy that the handler was never called) |
| — | TOTP login sequence: no session row exists in a "password-ok, TOTP-pending" state (query the session table mid-flow and assert it's empty) |
| — | SR-DATA-07: `POST /admin/api/platform/export/:userId` calls `platform-configuration.exportUserData` and never SELECT-crosses module schemas from the route |
| — | Impersonation: assert no route exists that accepts an "act as user X" parameter (a negative/absence test, e.g. an OpenAPI-surface scan asserting no such route is registered) |

### 2.9 `listing-billing` (`09-listing-billing/listing-billing-lld.md`)

Money and idempotency are the highest-consequence bugs in the system — this module's test bar matches `trust-and-safety`'s.

| Layer | Required test |
|---|---|
| domain | Full lifecycle state machine (§4, all 8 rows) including the self-loop and the "listing never went down" grace-period assertion (profile `publish_state` unaffected while `subscription.state='grace'`) |
| app | **Webhook idempotency:** replay the identical Paystack event ID twice — assert exactly one state transition, one invoice write, one audit entry, one outbox event; the second call is a fast 200 no-op with zero side effects |
| app | Webhook signature verification: a tampered payload with a stale/invalid signature is rejected with 401 **before** touching `processed_webhooks` or any state |
| app | Daily lifecycle job re-derivation: simulate a "missed webhook" (PSP event never arrives) and assert the daily job still transitions `free_listed → grace → unpublished` correctly on stored-fact timestamps alone (the "heals" property, HLD §7.3) |
| app | Free-period anti-abuse: a phone with an existing `phone_registry_history` entry gets **no** new trial on a fresh account registration — assert the resulting subscription starts directly in a payment-required state |
| app | Featuring force-lapse: a listing entering `grace` or `unpublished` force-lapses an active featuring add-on in the **same transaction** as the listing transition, not a separate async step |
| infra | Money columns: a schema/lint test asserting every `*_amount`/`*_price`/`*_fee`-named column in the `listing-billing` schema is `integer`, never `numeric`/`float` (shared-kernel §5 rule, enforced concretely here) |

### 2.10 `provider-analytics` (`10-provider-analytics/provider-analytics-lld.md`)

| Layer | Required test |
|---|---|
| app | **Fire-and-forget guarantee:** simulate the analytics capture path throwing/timing out and assert the triggering page request/action still succeeds and returns normally — this is the single most important test in this module, since a regression here breaks pages, not just metrics |
| app | Dedup: two `profile_view` events for the same `(provider, viewer_key, date)` produce one `raw_event` row, not two |
| app | `viewer_key` for an anonymous viewer is derived from `pf_anon`, not from IP; an authenticated viewer uses the session id — neither key equals the raw cookie/token |
| app | `< 5` floor: dashboard query returns the literal string for counts 1–4 and the exact number for 5+, at both boundaries |
| infra | Rollup job idempotency: re-running the same hour's rollup twice does not double-count |
| infra | Raw-event destruction at 90 days; aggregates in `hourly_rollup` survive the destruction |

### 2.11 `user-notifications` (`11-user-notifications/user-notifications-lld.md`)

| Layer | Required test |
|---|---|
| app | Batching window: N messages from the same sender within the window collapse into exactly one notification; a message arriving just after the window flush starts a new window |
| app | Block-silence: a blocked party's triggering activity produces **zero** notifications to the blocker — test this against every event type that has `user-notifications` as a subscriber, not just `MessageSent` |
| app | Channel failure isolation: simulate the email adapter throwing and assert the push/in-app channels for the same notification still dispatch, and the triggering user action is unaffected (same fire-and-forget principle as analytics) |
| app | Always-delivered categories (billing/security/moderation) ignore preference opt-out settings — explicit test that a user who has disabled all channels still receives these |

### 2.12 `media-processing` (`12-media-processing/media-processing-lld.md`)

| Layer | Required test |
|---|---|
| **regression-critical** | **Geotagged fixture test (explicitly required by clean-code-guidelines §12 `media-processing` and HLD §10.2):** upload a JPEG with embedded GPS EXIF, assert **zero** EXIF/GPS tags survive in every generated variant, including the archival 2048px original. This must run on every CI build touching the media pipeline, not just once at launch. |
| app | Content-sniff rejection: a `.jpg`-named file containing non-image bytes is rejected as `IMAGE_UNDECODABLE`, never trusted by extension |
| app | Size/count limits enforced **before** any storage write (a 15MB upload never touches MinIO even transiently) |
| app | Identity-docs bucket: attempt an unauthenticated/non-admin GET against a real object key — assert it fails at the MinIO policy level, not merely at an application check (defense-in-depth verification, SR-MEDIA-01's "under no configuration" claim) |
| infra | Presign issuance is audit-logged (`media-processing.identity_doc_presign`) with the correct admin actor and target on every call, including denied attempts |

### 2.13 `platform-configuration` (`13-platform-configuration/platform-configuration-lld.md`)

| Layer | Required test |
|---|---|
| app | **Fail-loudly-on-bad-config:** seed a malformed value for a known config key and assert process boot fails (not a silent default) — clean-code-guidelines §12 `platform-configuration` rule, made concrete |
| app | Cache invalidation: a `ConfigChanged` event updates the in-process cache within the dispatch latency; independently, the 5-minute TTL backstop refreshes even with zero events (simulate a dropped event and assert eventual consistency) |
| app | Cross-key validation: PUT of `provider-availability.reminder_lead_minutes` ≥ current `expiry_minutes` returns `VALIDATION_FAILED` and does not persist |
| app | **SR-DATA-07 export:** `exportUserData` concatenates only facade `exportFor` slices (no cross-schema SQL); identity-doc binaries and PSP customer refs are absent; a second call with the same `Idempotency-Key` does not write a second `admin.export_user_data` audit row |
| infra | Gazetteer/lexicon admin CRUD: malformed `maps_to` JSON for a given `entry_type` is rejected at write time against discovery's Zod schema, never persisted invalid |

---

## 3. Cross-module / end-to-end scenarios (Playwright, critical path)

Per clean-code-guidelines §10's E2E list, expanded with the specific assertions each scenario must make given everything the module LLDs above establish:

| # | Scenario | Must specifically assert |
|---|---|---|
| E2E-1 | Search → profile → contact (golden path, user-stories §19.1) | Availability-first ordering visible in results; anonymous phone visibility respects the provider's setting; message action interrupts to a single-screen sign-up and returns to the exact draft in progress (FR-ACC-05) |
| E2E-2 | Provider onboarding → publish (user-stories §19.2) | Profile is live and appears in search within the ≤30s freshness bound immediately after publish, with **no** approval step anywhere in the flow (assert no pending/review UI state ever renders) |
| E2E-3 | Availability set → auto-expire | Status visible immediately on the homepage; expiry-warning notification fires at T-15min; status clears within `expiry + 60s` even without a client reconnect |
| E2E-4 | Identity verification, approve path and reject-then-resubmit path | Profile visibility (search presence, all fields) is byte-identical before/during/after every state — the strongest possible proof of the "never affected" guarantee |
| E2E-5 | Report → human resolution (user-stories §19.5) | No visible/observable effect on the reported party between filing and the admin's decision (poll their public profile throughout and assert no change); dismissed vs acted paths both produce reporter-visible closure |
| E2E-6 | Billing: trial → paid → simulated failed renewal → grace → auto-unpublish → pay → republish | Profile stays live throughout grace; auto-unpublish happens exactly at grace end; republish is immediate with zero review step, matching user-stories §19.6 |
| E2E-7 | Review: ineligible attempt → thread ages past 24h → eligible submit → provider reply → report → admin removal | Ineligible state shows the explanation, not a hidden control; removal only happens via the explicit admin action, never automatically |
| E2E-8 | Block/unblock | The blocked party cannot message the blocker either way; the **blocker** is hidden from the **blocked party's** search (FR-TRUST-08 directed hide); unblock restores both within the accepted eventual-consistency window |

Each E2E scenario runs against the fully composed stack (real Postgres, real MinIO, fake external providers per clean-code-guidelines §6 "every port has a fake") in CI, per clean-code-guidelines §10.

---

## 4. CI gates (cross-cutting, not module-specific)

Restated from `clean-code-guidelines-per-module.md` §10/§13 and the HLD, as the release-blocking checklist this LLD set assumes exists:

1. `dependency-cruiser` module-boundary check (HLD §6.2) — blocking.
2. Bundle-size budget (SR-PERF-05, ≤300KB compressed JS) — blocking.
3. WCAG 2.2 AA automated checks (SR-COMPAT-04) — blocking.
4. Trivy dependency/image scan, criticals block release (SR-SEC-06, SR-OPS-02).
5. Full test suite (all module-level tests above) + Playwright E2E suite (§3) — any failure blocks.
6. The `trust-and-safety` guard-clause suite (§2.7) and the `media-processing` geotagged-fixture test (§2.12) are called out individually because a regression in either is a product-integrity incident, not an ordinary bug — treat a failure in these two specifically as a stop-the-line event, not a normal red-CI triage item.

---

## 5. What this document deliberately does not cover

- Load/performance testing against the SR-CAP-01 design point and SR-PERF budgets — that is a pre-launch activity (SR-PERF-07) using synthetic mobile-profile tooling, tracked under `08-development-deliverable-documents` once launch-readiness work begins, not a per-PR CI concern.
- Security penetration testing (SR-SEC-12, S-priority) — external/structured exercise before public launch, out of this LLD's scope.
- Restore-drill verification (SR-AVL-05) — an operational runbook exercise (`08-development-deliverable-documents`), not application-level testing.
