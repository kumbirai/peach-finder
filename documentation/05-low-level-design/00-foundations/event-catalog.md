---
title: Peach Finder — LLD — Domain Event & Error Catalog
updated: 2026-08-20
---

# Domain Event, WS Message & Error Code Catalog

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Low-Level Design — cross-module event/message/error registry |
| Upstream | `shared-kernel.md` §6 (event mechanism), `api-conventions.md` §10 (WS), §3.2/§6 (error codes) |
| Rule | **This is the single place a new event name, WS message type, or error code is registered.** A module LLD introducing a new one appends a row here in the same change — no module LLD is the "owner" of the full list, this file is |
| Status | Living document — updated in place |

---

## 2. Domain event registry

Payload columns list field names only (types are the corresponding branded ID / `Instant` / primitive from `shared-kernel.md`); full field-by-field schemas live in the owning module's LLD.

| Event name | v | Publisher | Trigger | Payload (facts) | Subscribers | Idempotency mechanism |
|---|---|---|---|---|---|---|
| `UserRegistered` | 1 | `identity-and-access` | Account created | `userId`, `registrationIntent: 'seeker' \| 'provider'` (entry-point intent, **not** a persisted role) | `user-notifications` (welcome email — S) | natural key (`userId`) |
| `EmailVerified` | 1 | `identity-and-access` | Verification link clicked | `userId` | `direct-messaging` (releases held pending messages, FR-ACC-02) | natural key |
| `PhoneVerified` | 1 | `identity-and-access` | OTP confirmed | `userId`, `phoneHash` | `listing-billing` (free-period anti-abuse check, FR-MONET-03) | natural key |
| `AccountDeletionRequested` | 1 | `identity-and-access` | User confirms delete | `userId` | `provider-profile` (unpublish if a profile exists for this owner), `listing-billing` (cancel subscription), `direct-messaging` (mark deleted-account display) | processed-ledger |
| `ProviderPublished` | 1 | `provider-profile` | First publish or republish | `providerProfileId`, `ownerId`, `areaId` | `discovery-search` (projection upsert), `listing-billing` (starts/resumes free-period clock, FR-MONET-02) | natural key (upsert) |
| `ProviderUnpublished` | 1 | `provider-profile` | Provider or admin unpublishes | `providerProfileId`, `reason: 'owner' \| 'admin' \| 'billing_lapse'` | `discovery-search` (projection remove) | natural key |
| `ProfileUpdated` | 1 | `provider-profile` | Any profile field save | `providerProfileId`, `changedFields[]` | `discovery-search` (projection refresh) | natural key |
| `PhotoAdded` / `PhotoRemoved` | 1 | `provider-profile` (via `media-processing`) | Photo lifecycle | `providerProfileId`, `photoId` | `discovery-search` (projection refresh) | natural key |
| `AvailabilitySet` | 1 | `provider-availability` | Provider taps "Available now" | `providerProfileId`, `setAt` | `discovery-search` (projection upsert), `user-notifications` (n/a — no notif on set) | natural key (upsert) |
| `AvailabilityCleared` | 1 | `provider-availability` | Provider clears status | `providerProfileId` | `discovery-search` (projection upsert) | natural key |
| `AvailabilityExpired` | 1 | `provider-availability` | Sweep job, per row | `providerProfileId`, `expiredAt` | `discovery-search` (projection upsert) — **no notification** (renewal prompt is `AvailabilityExpiryWarned`) | natural key |
| `AvailabilityExpiryWarned` | 1 | `provider-availability` | Sweep job, T-15min | `providerProfileId`, `expiresAt` | `user-notifications` (renewal prompt, FR-AVAIL-03) | processed-ledger (one warning per active period) |
| `ThreadCreated` | 1 | `direct-messaging` | First message in a new pair | `threadId`, `seekerId`, `providerProfileId` | `provider-analytics` (contact-request event, FR-ANLY-02) | natural key |
| `MessageSent` | 1 | `direct-messaging` | Message persisted | `threadId`, `messageId`, `senderId` | `user-notifications` (new-message fan-out, FR-NOTIF-01), `direct-messaging` itself (response-time calc, in-process not cross-module) | natural key |
| `MessageRead` | 1 | `direct-messaging` | Read receipt — **direct WS push, NOT an outbox event** (no durable cross-module subscriber; read state persists on `message.read_at` and reconciles on next fetch/poll — see `05-direct-messaging` §9.1) | `threadId`, `messageId`, `readerId` | — (direct `message.read` WS frame to the sender only) | n/a |
| `ReviewSubmitted` | 1 | `provider-reviews` | Review created | `reviewId`, `providerProfileId`, `rating` | `discovery-search` (rating aggregate refresh), `user-notifications` (S: provider notified) | natural key |
| `ReviewReplied` | 1 | `provider-reviews` | Provider reply posted | `reviewId` | — | n/a |
| `RatingAggregateChanged` | 1 | `provider-reviews` | Aggregate recompute (submit/edit/delete/remove) | `providerProfileId`, `average`, `count` | `discovery-search` (projection field update) | natural key (upsert) |
| `VerificationDecided` | 1 | `trust-and-safety` | Admin approves/rejects | `verificationCaseId`, `providerProfileId`, `decision: 'approved'\|'rejected'` | `user-notifications` (outcome email/in-app, FR-NOTIF-01), `discovery-search` (badge flag update on approve) | processed-ledger (decision is one-time per case) |
| `BadgeGranted` / `BadgeRevoked` | 1 | `trust-and-safety` | Badge state change — identity: grant (admin approve), admin revoke, auto-suppress on identity-relevant edit; active-this-week: daily activity-computation grant/revoke | `providerProfileId`, `badge: 'identity_verified' \| 'active_this_week'`, `reason` | `discovery-search` (projection badge flag) | natural key |
| `ReportFiled` | 1 | `trust-and-safety` | User submits report | `reportId`, `reporterId`, `targetType`, `targetId` | `user-notifications` (receipt confirmation to reporter, FR-NOTIF-01) | natural key |
| `ReportResolved` | 1 | `trust-and-safety` | Admin dismisses or acts | `reportId`, `resolution: 'dismissed'\|'acted'` | `user-notifications` (S) | processed-ledger |
| `ModerationActionTaken` | 1 | `trust-and-safety` | Admin action executed (remove photo/review, unpublish, suspend, reinstate) | `moderationActionId`, `targetType`, `targetId`, `action` | `provider-profile` (unpublish/suspend effect), `provider-reviews` (remove review/reply), `media-processing` (remove photo), `user-notifications` (affected-party notice, FR-NOTIF-01), `discovery-search` (projection removal on unpublish/suspend) | processed-ledger |
| `UserBlocked` | 1 | `trust-and-safety` | Block created | `blockerId`, `blockedId` | `direct-messaging` (blocks new messages), `discovery-search` (excludes blocker from blocked party's results), `user-notifications` (block_cache silence) | natural key |
| `TrialStarted` | 1 | `listing-billing` | Free period begins (on first publish) | `providerProfileId`, `subscriptionId`, `trialEndsAt` | `user-notifications` (trial-ending reminder scheduling, driven by SR-APP-10 job reading state, not this event directly) | natural key |
| `SubscriptionActivated` | 1 | `listing-billing` | First paid period starts | `subscriptionId`, `providerProfileId` | `provider-profile` (n/a — listing already live), `discovery-search` (n/a, already listed) | natural key |
| `FeaturingActivated` | 1 | `listing-billing` | Featuring add-on purchased / first featured period starts (FR-MONET-05) | `subscriptionId`, `providerProfileId` | `discovery-search` (projection `is_featured=true`, `featured_since`) | natural key (upsert) |
| `FeaturingLapsed` | 1 | `listing-billing` | Featuring cancelled, lapses on non-payment, or force-lapsed when parent listing leaves paid/free state (FR-MONET-05) | `subscriptionId`, `providerProfileId`, `reason: 'cancelled' \| 'payment_failed' \| 'listing_lapsed'` | `discovery-search` (projection `is_featured=false`) | natural key (upsert) |
| `PaymentSucceeded` / `PaymentFailed` | 1 | `listing-billing` | PSP webhook processed | `subscriptionId`, `invoiceId`, `amount` | `user-notifications` (billing event emails), `provider-profile` (`PaymentSucceeded` only — T7 republish after billing lapse) | processed-ledger (`listing_billing.processed_webhooks`, keyed by PSP event ID — see billing LLD) |
| `GraceEntered` | 1 | `listing-billing` | Payment fails / trial ends unpaid | `subscriptionId`, `graceEndsAt` | `user-notifications` (dunning schedule) | natural key |
| `ListingLapsed` | 1 | `listing-billing` | Grace expires unpaid | `subscriptionId`, `providerProfileId` | `provider-profile` (auto-unpublish), `discovery-search` (projection removal), `user-notifications` (unpublished-for-non-payment notice, FR-NOTIF-01 — subscriber added by `11-user-notifications` LLD) | natural key |
| `MediaProcessed` | 1 | `media-processing` | Upload pipeline completes | `photoId`, `ownerId`, `variantUrls` | `provider-profile` (attach to profile), `discovery-search` (projection refresh if profile photo) | natural key |
| `MediaRemoved` | 1 | `media-processing` | Deletion (owner or admin) | `photoId` | `provider-profile`, `discovery-search` | natural key |
| `ConfigChanged` | 1 | `platform-configuration` | Admin saves a config value | `configKey`, `newValue` | `discovery-search` (lexicon/pricing/threshold), `provider-availability` (expiry duration), `listing-billing` (pricing), `provider-reviews` (highly-rated threshold), `user-notifications` (batch/unread windows) — all via a shared in-process cache-invalidation subscriber, see `security-implementation.md` §6 | natural key (cache set is idempotent) |
| `IdentityAttributesChanged` | 1 | `identity-and-access` | Provider changes display name or verified phone via account settings (`01-identity-and-access/identity-and-access-lld.md` §5/§7) | `userId`, `changedFields: ('display_name'\|'phone')[]` | `trust-and-safety` (identity-badge suppression pending re-review, FR-TRUST-04), `discovery-search` (search-projection name refresh) | natural key (idempotent effect; subscribers self-filter) |
| `UserUnblocked` | 1 | `trust-and-safety` | Block removed (either party undoes their block, FR-TRUST-08) — appended by `05-direct-messaging` LLD; needed for block-mirror correctness | `blockerId`, `blockedId` | `direct-messaging` (removes `block_cache` mirror row), `discovery-search` (re-includes blocker in blocked party's results), `user-notifications` (removes `block_cache` mirror row) | natural key (delete is idempotent) |
| `NotificationDispatched` | 1 | `user-notifications` | A channel dispatch completes (`sent`/`failed`) — appended by `11-user-notifications` LLD; for delivery-health metrics (SR-OBS-04) | `notificationId`, `userId`, `category`, `channel`, `status` | — (terminal; consumed as delivery-health metrics, no domain reaction) | natural key (`notificationId` + `channel`) |

---

## 3. Scheduled-job "synthetic events"

SR-APP-10 jobs are not domain events themselves but each drives one or more of the events above per row processed (e.g. the availability sweep publishes one `AvailabilityExpired` per expired row, not one bulk event) — this keeps every subscriber's contract identical whether a state change originated from a user action or a scheduled sweep. See `03-provider-availability/provider-availability-lld.md` §5 for the sweep's exact query and per-row publish loop.

---

## 4. Audit log `action` registry (extends `shared-kernel.md` §7)

| `action` | `target_type` | Written by | Reason required? |
|---|---|---|---|
| `identity.approve` / `identity.reject` | `verification_case` | `trust-and-safety` | Y (reject) |
| `identity.revoke` | `provider_profile` | `trust-and-safety` | Y |
| `report.dismiss` | `report` | `trust-and-safety` | Y (note) |
| `report.act` | `report` | `trust-and-safety` | Y |
| `moderation.remove_photo` / `moderation.remove_review` | `photo` / `review` | `trust-and-safety` | Y |
| `moderation.unpublish` / `moderation.suspend` / `moderation.reinstate` | `provider_profile` / `user` | `trust-and-safety` | Y |
| `config.change` | `platform_config` | `platform-configuration` | N (value diff is self-explanatory, but actor+timestamp always recorded) |
| `platform-configuration.area_change` | `area` | `platform-configuration` | N |
| `platform-configuration.lexicon_change` | `lexicon_entry` | `platform-configuration` | N |
| `listing-billing.state_transition` | `subscription` | `listing-billing` | N (system-driven; reason is the transition name itself) |
| `admin.export_user_data` | `user` | `platform-configuration` | N |
| `session.revoke_others` | `user` | `identity-and-access` | N |
| `media-processing.identity_doc_presign` | `photo` | `media-processing` | N (access log; admin actor + timestamp + target always recorded) |

---

## 5. Error code registry (extends `api-conventions.md` §3.2)

Cross-module common codes (raised by more than one module, kept spelled identically everywhere):

| Code | `UseCaseError.kind` | Typical origin |
|---|---|---|
| `NOT_FOUND` | `not_found` | any module |
| `FORBIDDEN` | `forbidden` | any module |
| `VALIDATION_FAILED` | `validation_failed` | any module |
| `RATE_LIMITED` | `rate_limited` | any module (via shared rate-limit middleware) |
| `UNAUTHENTICATED` | (hook-level 401) | shared hook |

Module-specific codes (full list; each module LLD's API section references these by name rather than redefining):

| Code | Module | Meaning |
|---|---|---|
| `EMAIL_NOT_VERIFIED` | identity-and-access | Action requires verified email (FR-ACC-02) |
| `ACCOUNT_SUSPENDED` | identity-and-access | Login blocked, suspended account |
| `PROFILE_INCOMPLETE` | provider-profile | Publish attempted below FR-PROF-02 minimum |
| `SERVICE_TAG_NOT_FOUND` | provider-profile | Unknown tag ID submitted |
| `AVAILABILITY_ALREADY_SET` | provider-availability | Idempotent no-op path, returned as 200 not error — listed here only to note it's *not* an error (see provider-availability LLD §3) |
| `BLOCKED` | direct-messaging | Attempt to message a user who has blocked/been blocked |
| `THREAD_NOT_FOUND` | direct-messaging | Also returned instead of 403 for a blocked/foreign thread (anti-enumeration) |
| `REVIEW_INELIGIBLE` | provider-reviews | Thread < 24h old (`precondition_failed`) |
| `REVIEW_ALREADY_EXISTS` | provider-reviews | One review per seeker–provider pair (`conflict`) |
| `VERIFICATION_ALREADY_PENDING` | trust-and-safety | Duplicate submission while a case is open |
| `ALREADY_BLOCKED` | trust-and-safety | Idempotent no-op (200, not error) |
| `PAYMENT_METHOD_REQUIRED` | listing-billing | Purchase attempted with no card on file |
| `PSP_UNAVAILABLE` | listing-billing | `unavailable` — PSP outage |
| `WEBHOOK_SIGNATURE_INVALID` | listing-billing | Rejected before any processing (401, not part of `UseCaseError`, handled at route boundary) |
| `IMAGE_UNDECODABLE` | media-processing | Failed content-sniff decode |
| `IMAGE_TOO_LARGE` | media-processing | > 10 MB |
| `PHOTO_LIMIT_REACHED` | media-processing | > 12 photos |
| `CONFIG_KEY_UNKNOWN` | platform-configuration | Admin references a non-existent config key |

---

## 6. WS message type registry (extends `api-conventions.md` §10)

| `type` | Direction | Module | Payload |
|---|---|---|---|
| `connected` | server→client | shared (connection lifecycle) | `{ sessionId }` |
| `presence.heartbeat` | client→server | direct-messaging | `{}` |
| `message.sent` | server→client | direct-messaging | `{ threadId, messageId, senderId, bodyPreview, sentAt }` |
| `message.delivered` | server→client (to sender) | direct-messaging | `{ threadId, messageId, deliveredAt }` — recipient's client acked `message.sent` or fetched via poll; drives sender's "delivered" state (FR-MSG-02). Appended by `05-direct-messaging` LLD |
| `message.read` | server→client | direct-messaging | `{ threadId, messageId, readerId }` |
| `thread.typing` | client→server, server→client (relayed) | direct-messaging | `{ threadId }` |
| `error` | server→client | shared | `{ code, message }` — connection-level errors only (auth failure etc.), not business errors, which ride the HTTP response for the originating POST |
