---
title: Peach Finder — LLD — Billing (Monetization)
updated: 2026-08-20
---

# Billing Module — Low-Level Design

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Module | `listing-billing` (`src/lib/server/modules/listing-billing/`, Postgres schema `listing_billing`) |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | FRS §13 FR-MONET-01..09, §11 FR-ADM-06; SRS SR-INT-03, SR-APP-10, SR-APP-12, SR-AVL-06, SR-PRIV-03; HLD §6.1 (`listing-billing` row), §7.3 (webhook flow), HLD-DEC-12 (Paystack); clean-code-guidelines §12 (`listing-billing` row); user-stories §14 E11, §19.6 |
| Foundations (imported, not restated) | `shared-kernel.md` §5 (Money), §6 (outbox/idempotency), §7 (audit); `api-conventions.md` §5 (webhook idempotency contract), §3 (envelope/errors); `event-catalog.md` (billing events, `listing-billing.state_transition` audit, billing error codes); `security-implementation.md` §6 (config cache) |
| Cross-module shapes consumed | `identity_and_access.phone_registry_history` (facade — anti-abuse, §9), `provider_profile.provider_profile` (subscribes `ProviderPublished`; publishes `ListingLapsed`/`SubscriptionActivated` that provider subscribes to), `platform_configuration.config` pricing keys (facade — §8) |
| Status | Living document — updated in place |

**Highest-consequence stance.** Every path in this module is on the money/idempotency critical path. Two invariants hold everywhere and are restated at each use site: **(a) money is integer cents ZAR** (shared-kernel §5, never float); **(b) every subscription/invoice state transition is idempotent, transactional, and audit-logged in the same transaction** (SR-APP-12). Lifecycle is **re-derivable from stored facts** — a missed webhook heals via the daily job (§5). **Billing never writes to `provider-profile`'s schema** — it affects publish state only by publishing events `provider-profile` subscribes to.

---

## 2. Module purpose & scope

| In scope | Requirement |
|---|---|
| Listing subscription lifecycle (building → free → paid → grace → unpublished) | FR-MONET-01/02/04; §19.6 |
| Free period start on first publish + one-per-phone anti-abuse | FR-MONET-02/03 |
| Featuring add-on, independent lapse, force-lapse on listing state change | FR-MONET-05 |
| Paystack recurring charges, signed idempotent webhooks, refunds (dashboard-issued) | SR-INT-03, HLD-DEC-12 |
| Self-serve billing (payment method, see-price, cancel-renewal, history) | FR-MONET-06 |
| Daily re-derivation job (trial-end, grace, unpublish, dunning) | SR-APP-10, SR-APP-12 |
| Integer-cents money, SAQ-A (no card data on platform) | shared-kernel §5, SR-PRIV-03 |

| Explicitly NOT in scope | Where |
|---|---|
| Seeker→provider session payment (no checkout/deposits/tips ever) | FR-MONET-08 (product has no such flow; guards FR-MSG-10) |
| Tiered plans, coupons, auctions, commissions | FR-MONET-09 (W) |
| Storing raw PAN/card data | SR-PRIV-03 — Paystack hosted tokenization only |
| Writing `provider_profile.publish_state` | `provider-profile` (reacts to our events) |

---

## 3. Data model — `listing-billing` schema

All money columns are `integer` cents (shared-kernel §5). All timestamps `timestamptz` UTC (shared-kernel §4).

```sql
-- One listing subscription per provider (FR-MONET-01)
create table listing_billing.subscription (
  id                     uuid primary key,                         -- SubscriptionId (UUIDv7)
  provider_profile_id    uuid not null unique,                     -- provider_profile.provider_profile (no cross-FK per shared-kernel §10); UNIQUE = one per provider
  state                  text not null,                            -- 'building'|'free_listed'|'paid_listed'|'grace'|'unpublished'
  trial_ends_at          timestamptz,                              -- set on first publish (FR-MONET-02); null before publish / after conversion
  grace_ends_at          timestamptz,                              -- set on entering grace; null otherwise
  current_period_ends_at timestamptz,                              -- paid period end (drives renewal + cancel-at-period-end)
  cancel_at_period_end   boolean not null default false,           -- FR-MONET-06 cancel renewal (stays live to period end)
  psp_customer_ref       text,                                     -- Paystack customer code; null until a payment method is added
  phone_history_ref      text,                                     -- phone_hash from identity anti-abuse link (FR-MONET-03, §9)
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint subscription_state_chk check (state in
    ('building','free_listed','paid_listed','grace','unpublished'))
);
create index subscription_state_idx        on listing_billing.subscription (state);
create index subscription_trial_due_idx    on listing_billing.subscription (trial_ends_at) where state = 'free_listed';
create index subscription_grace_due_idx    on listing_billing.subscription (grace_ends_at) where state = 'grace';
create index subscription_renewal_due_idx  on listing_billing.subscription (current_period_ends_at) where state = 'paid_listed';

-- Featuring add-on, INDEPENDENT lifecycle (FR-MONET-05)
create table listing_billing.featuring_addon (
  id                     uuid primary key,
  subscription_id        uuid not null references listing_billing.subscription(id),
  state                  text not null,                            -- 'active'|'lapsed'
  current_period_ends_at timestamptz,                              -- independent renewal clock
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint featuring_state_chk check (state in ('active','lapsed'))
);
create unique index featuring_one_active_idx on listing_billing.featuring_addon (subscription_id) where state = 'active';  -- at most one active add-on per subscription
create index featuring_renewal_due_idx on listing_billing.featuring_addon (current_period_ends_at) where state = 'active';

-- Invoices / receipts (FR-MONET-06 itemized history)
create table listing_billing.invoice (
  id               uuid primary key,                               -- InvoiceId
  subscription_id  uuid not null references listing_billing.subscription(id),
  line_item        text not null,                                  -- 'listing'|'featuring' (itemization)
  amount_cents     integer not null,                               -- integer cents ZAR (shared-kernel §5)
  currency         text not null default 'ZAR' check (currency = 'ZAR'),
  status           text not null,                                  -- 'pending'|'paid'|'failed'|'refunded'
  psp_invoice_ref  text,                                           -- Paystack transaction/charge reference
  issued_at        timestamptz not null default now(),
  paid_at          timestamptz,
  constraint invoice_status_chk check (status in ('pending','paid','failed','refunded')),
  constraint invoice_line_chk   check (line_item in ('listing','featuring'))
);
create index invoice_subscription_idx on listing_billing.invoice (subscription_id, issued_at desc);

-- THE webhook idempotency ledger (api-conventions.md §5 — billing-specific, NOT the generic Idempotency-Key)
create table listing_billing.processed_webhooks (
  psp_event_id  text primary key,                                  -- Paystack's own event id (x-paystack-* / event.id)
  processed_at  timestamptz not null default now()
);
```

Notes:
- `subscription.provider_profile_id` is `unique` → **one listing subscription per provider** (FR-MONET-01), enforced in the DB not by convention.
- `featuring_one_active_idx` partial-unique → **at most one active featuring add-on** per subscription; lapsed rows retained for history.
- `processed_webhooks` is the ledger the entire idempotency story rests on (§6); primary key is Paystack's event id, so a replay is a PK collision.
- Refunds are **issued from the Paystack dashboard** (SR-INT-03) and arrive back as a webhook that flips the matching `invoice.status` to `refunded`; the platform has no refund-initiation endpoint.

---

## 4. Listing lifecycle state machine (reproduces §19.6 exactly)

States: `building`, `free_listed`, `paid_listed`, `grace`, `unpublished`. Modeled in `domain/` as a discriminated union with transition functions that return the new state or a typed error (clean-code-guidelines §4 — illegal transitions unrepresentable). **Only** the two rows marked ✱ change `provider_profile.publish_state`, and only indirectly via a published event `provider-profile` subscribes to — billing never writes provider's schema.

| # | From | To | Trigger | Side effects (same TX) | Event published | Affects provider publish_state? |
|---|---|---|---|---|---|---|
| 1 | `building` | `free_listed` | First `ProviderPublished` received (subscriber) | set `trial_ends_at = now + trial_period_days`; write audit `listing-billing.state_transition` | `TrialStarted` | No (provider already published itself) |
| 2 | `free_listed` | `paid_listed` | Payment succeeds before `trial_ends_at` (webhook §6) | mark invoice paid; set `current_period_ends_at = now + 1 month`; clear `trial_ends_at`; audit | `SubscriptionActivated` (+ `PaymentSucceeded`) | No (already live) |
| 3 | `free_listed` | `grace` | Daily job: `trial_ends_at < now` and still `free_listed` (§5) | set `grace_ends_at = now + grace_period_days`; audit | `GraceEntered` | No (listing stays LIVE in grace) |
| 4 | `paid_listed` | `paid_listed` | Renewal payment succeeds (self-loop) | mark renewal invoice paid; `current_period_ends_at += 1 month`; audit | `PaymentSucceeded` | No |
| 5 | `paid_listed` | `grace` | Renewal payment fails (webhook §6) or renewal due unpaid (daily job) | set `grace_ends_at = now + grace_period_days`; audit | `GraceEntered` (+ `PaymentFailed` on webhook path) | No (stays LIVE) |
| 6 | `grace` | `paid_listed` | Payment succeeds during grace (webhook §6) | mark invoice paid; clear `grace_ends_at`; `current_period_ends_at = now + 1 month`; audit | `PaymentSucceeded` (+ `SubscriptionActivated` if first ever paid) | No — **listing never went down**; profile stayed published throughout grace |
| 7 ✱ | `grace` | `unpublished` | Daily job: `grace_ends_at < now` and still `grace` (§5) | force-lapse featuring (§7, same TX); audit; data retained | `ListingLapsed` (+ `FeaturingLapsed` reason `listing_lapsed` if featuring was active) | **Yes** — `provider-profile` subscribes to `ListingLapsed` → auto-unpublish |
| 8 ✱ | `unpublished` | `paid_listed` | Payment succeeds (webhook §6) | mark invoice paid; `current_period_ends_at = now + 1 month`; clear `grace_ends_at`; audit | `SubscriptionActivated` (+ `PaymentSucceeded`) | **Yes** — `provider-profile` subscribes to `SubscriptionActivated` → **immediate republish, no review step** (guard clause per §1 stance: republish is billing state, never moderation) |

- **Grace never takes the listing down** (rows 3/5/6, §19.6 note): `grace_ends_at` is a countdown; the profile is published the whole time. Only row 7 unpublishes.
- **Republish is immediate and un-gated** (row 8): a guard clause in the pay-during-unpublished handler asserts no moderation review is inserted — FR-MONET-04/§1: auto-unpublish here is billing state, not a content judgment.
- Transition functions are **guarded by current-state predicates** — applying transition #3 to a subscription already in `grace` is a rejected/no-op transition, which is what makes the daily job idempotent (§5).

---

## 5. Daily billing lifecycle job (SR-APP-10 "daily + webhook-driven")

The re-derivation algorithm HLD §7.3 promises. Runs daily on the `worker`; **idempotent** — re-running against a correctly-stated subscription is a no-op because each transition is guarded by a current-state predicate. Each per-row transition uses the same domain transition functions and same-TX audit + outbox as the webhook path (no divergent code).

```
now = clock.now()
graceDays      = platform-configuration.getConfig('listing-billing.grace_period_days')     // trial_period_days is read at trial-start (§9), not here
dunningOffsets = platform-configuration.getConfig('listing-billing.dunning_offset_days')   // e.g. [1,3,6]

-- 1. Trial expiry → Grace (transition #3)
for each subscription where state = 'free_listed' and trial_ends_at < now:
   TX { apply free_listed→grace (sets grace_ends_at = now + graceDays); audit; outbox GraceEntered }

-- 2. Renewal due unpaid → Grace (transition #5, non-webhook path)
for each subscription where state = 'paid_listed' and current_period_ends_at < now:
   attempt PSP charge (§6 renewal); on failure or PSP unavailable:
     TX { apply paid_listed→grace; audit; outbox GraceEntered }
   -- success arrives as a webhook (transition #4); job does not self-mark paid

-- 3. Grace expiry → Unpublished (transition #7)
for each subscription where state = 'grace' and grace_ends_at < now:
   TX { force-lapse active featuring (§7); apply grace→unpublished; audit;
        outbox ListingLapsed (+ FeaturingLapsed reason 'listing_lapsed' if applicable) }

-- 4. Dunning notifications (FR-MONET-04), fire-and-idempotent
for each subscription where state = 'grace':
   dayInGrace = days_between(grace_ends_at - graceDays, now)   // 1-based day within grace
   if dayInGrace in dunningOffsets:
     publish GraceEntered is NOT re-published; dunning is notifications' concern driven by a
     processed-ledger keyed (subscriptionId, dayInGrace) so a re-run never double-sends
```

- **Dunning schedule:** default day **1, 3, 6** of a 7-day grace (`listing-billing.dunning_offset_days`, platform-configuration §4). `user-notifications` owns delivery (event-catalog.md: `GraceEntered` → dunning schedule); the daily job's role is to keep grace state correct, and the dunning-day fan-out is guarded by a `(subscriptionId, dayInGrace)` processed-ledger so re-running the job the same day is a no-op.
- **Missed webhook heals** (HLD §7.3): grace/unpublish transitions (#3, #7) are driven by stored `trial_ends_at` / `grace_ends_at`, not by webhook receipt. If a payment webhook was lost, the daily job still transitions correctly from stored facts; a later-arriving duplicate webhook is absorbed by `processed_webhooks` (§6).
- **PSP-outage safety (SR-AVL-06 made concrete):** transitions #3 and #7 read only stored timestamps — they need **no** call to Paystack. So even with Paystack fully unreachable, grace→unpublished proceeds on schedule *and* new purchases are blocked (`PSP_UNAVAILABLE`, §10) — the outage "blocks new purchases but never unpublishes anyone" precisely because unpublish is time-driven, not payment-confirmation-driven, and no one is *wrongly* unpublished since grace already tolerates the payment delay.

---

## 6. Webhook handling (HLD §7.3, SR-INT-03, SR-APP-12)

Endpoint: `POST /api/billing/webhooks/paystack` (public, unauthenticated — Paystack calls it; auth is the signature, not a session).

**Exact sequence** (order is load-bearing):

```
1. Verify Paystack signature: HMAC-SHA512 of the raw body with the secret key,
   compared (constant-time) to the `x-paystack-signature` header.
   FAIL  -> respond 401 WEBHOOK_SIGNATURE_INVALID and STOP.
            This is handled at the ROUTE BOUNDARY, not as a UseCaseError
            (event-catalog.md §5: signature-invalid is a 401, not part of the UseCaseError union).
            Nothing is read or written before this passes — not even processed_webhooks.

2. Parse body -> extract psp_event_id (Paystack event id) and event type.

3. Idempotency check: SELECT 1 FROM listing_billing.processed_webhooks WHERE psp_event_id = :id.
   PRESENT -> respond 200 immediately (idempotent no-op). No state touched. STOP.

4. ONE transaction:
     a. INSERT INTO listing_billing.processed_webhooks (psp_event_id)   -- PK collision here = concurrent duplicate -> rollback, treat as step 3
     b. apply the subscription/invoice state transition (§4 domain function)
     c. writeAudit(tx, { action: 'listing-billing.state_transition', target_type: 'subscription', ... })  -- SR-APP-12 same-TX audit
     d. insert outbox event(s): PaymentSucceeded | PaymentFailed  (+ SubscriptionActivated / GraceEntered / ListingLapsed / FeaturingLapsed per §4)
   COMMIT.

5. Respond 200.
```

- **Signature before ledger** (step 1 before step 3): an unverified caller must never be able to insert a row into `processed_webhooks` or probe for event ids. Rejection is a bare 401 at the route, not routed through the `UseCaseError`→status mapper.
- **Insert-first idempotency** (step 4a first in the TX): inserting the ledger row *inside* the same transaction as the state change means a crash between "apply transition" and "commit" rolls back the ledger row too — so a retry re-processes cleanly, and a concurrent duplicate loses the PK race and rolls back to a no-op. There is no window where the ledger says "done" but the state change didn't commit.
- **Event→transition mapping:** Paystack `charge.success` → transition #2/#4/#6/#8 by current state (mark invoice paid); `invoice.payment_failed` / `charge.failed` → transition #5 (+ `PaymentFailed`). The handler fetches current subscription state and lets the domain transition function decide — it never assumes the state from the webhook type alone (clean-code-guidelines §8: subscriber fetches current state, never trusts payload staleness).
- **Renewal charges** are initiated by the daily job (§5 step 2) against the stored `psp_customer_ref`; their outcome returns as one of these webhooks. The charge *initiation* is the only outbound Paystack call and goes through `shared/http.ts` (`safeFetch`, `allowedHosts: ['api.paystack.co']`, timeout tuned to Paystack SLA — shared-kernel §11).

---

## 7. Featuring add-on (FR-MONET-05)

Independent lifecycle, but **structurally subordinate** to the listing state:

- **Purchase:** `POST /api/billing/featuring` — requires an active listing. Guard clause: featuring may be created/activated **only if** the parent subscription is in `paid_listed` or `free_listed`; otherwise `PAYMENT_METHOD_REQUIRED`/`conflict`. On success: create/activate `featuring_addon` (partial-unique guarantees one active), set its own `current_period_ends_at`, issue a `featuring` line-item invoice, publish `FeaturingActivated`.
- **Cancel:** `POST /api/billing/featuring/cancel` — sets `cancel_at_period_end = true`; stays active until its own period end, then lapses (daily job). Distinct from listing cancel (§8).
- **Independent lapse:** featuring renewal failure lapses **only** featuring (`FeaturingLapsed` reason `payment_failed`), listing unaffected — this is the "lapses independently of listing" half of FR-MONET-05.
- **Force-lapse on listing state change (the other half):** when the listing leaves `paid_listed`/`free_listed` (i.e. transition #7 grace→unpublished — and defensively any move out of a featurable state), any active featuring is force-lapsed **in the same transaction** as the listing-state transition (§4 row 7 side effect), emitting `FeaturingLapsed` reason `listing_lapsed`. This is a **same-TX side effect of the listing transition code, not a separate job** — "nothing hidden can be featured" is enforced atomically, so there is never a committed state where an unpublished listing has active featuring.
- **Events:** publishes `FeaturingActivated` / `FeaturingLapsed` (the pair **billing registered** in event-catalog.md §2 — see §11 reconciliation). `discovery-search` subscribes and drives its projection `featured` flag off them; billing never writes discovery's projection.

---

## 8. Self-serve billing API (FR-MONET-06)

All under `/api/billing/...`; RBAC floor `role === 'provider'` + ownership (`requireOwnership(subscription.provider_profile_id`'s owner`)`). Serializer `toProviderBillingView` omits `psp_customer_ref` and any internal refs from provider-facing responses (api-conventions.md §11).

| Method + path | Purpose | Notes |
|---|---|---|
| `POST /api/billing/payment-method` | Add/update card | **Delegates to Paystack hosted tokenization** — guard clause: the handler never receives a PAN; it initializes a Paystack transaction/authorization and stores only the returned `psp_customer_ref` + authorization code. SAQ-A (SR-PRIV-03) — card data never touches Peach Finder. |
| `GET /api/billing/price` | See price before purchase | Reads `listing-billing.listing_price_cents` / `listing-billing.featuring_price_cents` via `platform-configuration.getConfig` (platform-configuration-lld §4/§5). Returns Money (integer cents). |
| `POST /api/billing/subscription/cancel-renewal` | Cancel listing renewal | Sets `cancel_at_period_end = true`; **remains live until `current_period_ends_at`** — then daily job transitions to grace/unpublished as normal. Distinguished from *immediate cancellation, which does not exist.* |
| `POST /api/billing/featuring` / `.../featuring/cancel` | Upgrade/downgrade | §7 |
| `GET /api/billing/history` | Itemized billing history + receipts | Cursor pagination (api-conventions.md §4); each row is an `invoice` with `line_item`, `amount_cents`, `status`, `issued_at`, `paid_at`, `psp_invoice_ref` for receipt rendering. |
| `GET /api/billing/status` | Dashboard billing state | Returns state, `trial_ends_at` / `grace_ends_at` / `current_period_ends_at` so the provider always sees "when the free period ends and what happens then" (FR-MONET-02, US-BILL-01). |

- **See-price reads config, never hardcodes** (FR-MONET-07): pricing applies to *new* billing periods; a mid-period `ConfigChanged` does not retroactively re-price an issued invoice.
- **No seeker payment surface exists** (FR-MONET-08): there is deliberately no endpoint here for session fees/deposits/tips.

Facade (public `index.ts`): `getActiveListingCount()` returns the count of subscriptions in a live listing state (free or paid) for FR-ADM-09. `getSubscription(providerProfileId)` is the admin read (FR-ADM-07). `exportFor(userId)` returns subscription state + invoices without PSP customer/authorization refs (SR-DATA-07; platform-configuration LLD §9).

---

## 9. Free-period anti-abuse (FR-MONET-03)

The actual anti-abuse mechanism, at **trial-start time** (transition #1, on first `ProviderPublished`):

```
on ProviderPublished(providerProfileId, ownerId):
  phoneHash = identity-and-access.getVerifiedPhoneHash(ownerId)            // identity facade — the OTP-verified number (FR-ACC-03)
  prior = identity_and_access.phoneRegistryHistory(phoneHash)              // identity_and_access.phone_registry_history — survives anonymization
  if prior exists (this phone was registered before):
      -- DO NOT start a new trial.
      existingSub = listing_billing.subscription for a prior profile linked to this phoneHash (via phone_history_ref)
      if existingSub found:
          RESUME: reuse its billing state — attach/continue that subscription's state for this profile
                  (e.g. if it was 'grace'/'unpublished'/'paid_listed', the new publish resumes THAT state,
                   not a fresh 'free_listed'). No new trial_ends_at is granted.
      else (genuinely new account, but phone previously used and no findable prior sub):
          NO free trial — create subscription directly in a payment-required posture:
          state starts at 'grace' with grace_ends_at = now (i.e. immediately due) OR straight to a
          "must pay to list" state, so the provider must pay to become listed. This is the anti-abuse teeth:
          re-using a burned phone number never re-grants free time.
      set phone_history_ref = phoneHash on the (resumed/new) subscription
  else (phone never seen):
      normal transition #1: building→free_listed, trial_ends_at = now + trial_period_days
```

- **"Resume" is precise:** if a prior subscription tied to that phone-history is findable, the new publish reuses that subscription's state and clocks (`grace_ends_at`, `current_period_ends_at`) — listing *continuity*, not a fresh trial (US-BILL-02 "listing continuity, not a fresh trial").
- **Edge case (the actual teeth):** a genuinely new account presenting a previously-used phone with no findable prior subscription still gets **no** free trial — it is placed straight into a payment-required posture. Specified explicitly because this is the case that stops "churn-and-re-register" (BRD risk #6).
- **Phone history lives in identity, queried via facade** — billing never duplicates phone history in its own schema (only stores the opaque `phone_history_ref` link). `identity_and_access.phone_registry_history(phone_hash, first_registered_at)` survives anonymization specifically for this check.
- The `PhoneVerified` event (event-catalog.md §2, subscriber `listing-billing`) primes this: billing can pre-record the phone link at verification time, but the *decision* is made at first-publish (when the trial would otherwise start).

---

## 10. API contract summary

Endpoints in §6 (webhook) and §8 (self-serve). Error codes (event-catalog.md §5):

| Code | `UseCaseError.kind` | HTTP | Raised when |
|---|---|---|---|
| `PAYMENT_METHOD_REQUIRED` | (billing-specific, maps `precondition_failed`) | 412 | Purchase attempted with no card on file |
| `PSP_UNAVAILABLE` | `unavailable` | 503 | Paystack outage on a purchase/charge-init path (never on the unpublish path — §5) |
| `WEBHOOK_SIGNATURE_INVALID` | (not a UseCaseError) | 401 | Handled at route boundary before any processing (§6 step 1) |

- **Idempotency-Key** (api-conventions.md §5): accepted on admin-adjacent billing actions (e.g. an admin manually adjusting a subscription state via the console, if exposed) — derived key `(actor, action, target, key)` checked against a module-local processed-ledger. The **webhook path does not use** the generic header — it uses `listing_billing.processed_webhooks` keyed by Paystack event id (api-conventions.md §5 explicitly carves this out).
- Envelope, pagination, rate-limit contract all per api-conventions.md (not restated).

---

## 11. Domain events published / subscribed

**Published** (event-catalog.md §2):

| Event | Trigger | Payload |
|---|---|---|
| `TrialStarted` | Transition #1 | `providerProfileId`, `subscriptionId`, `trialEndsAt` |
| `SubscriptionActivated` | First paid period (rows 2/6/8) | `subscriptionId`, `providerProfileId` |
| `PaymentSucceeded` | Webhook charge.success (§6) | `subscriptionId`, `invoiceId`, `amount` (Money) |
| `PaymentFailed` | Webhook payment_failed (§6) | `subscriptionId`, `invoiceId`, `amount` |
| `GraceEntered` | Rows 3/5 | `subscriptionId`, `graceEndsAt` |
| `ListingLapsed` | Row 7 | `subscriptionId`, `providerProfileId` |
| `FeaturingActivated` | §7 purchase/activate | `subscriptionId`, `providerProfileId` |
| `FeaturingLapsed` | §7 cancel/lapse/force-lapse | `subscriptionId`, `providerProfileId`, `reason: 'cancelled'\|'payment_failed'\|'listing_lapsed'` |

**Subscribed:**

| Event | Publisher | Billing's reaction |
|---|---|---|
| `ProviderPublished` | `provider-profile` | Start/resume free-period clock (transition #1, anti-abuse §9) |
| `PhoneVerified` | `identity-and-access` | Pre-record phone link for anti-abuse (§9) |
| `AccountDeletionRequested` | `identity-and-access` | Cancel subscription (retain billing/tax records per FR-PRIV-03 — statutory survivorship) |

**Reconciliation performed (FeaturingActivated/FeaturingLapsed):** billing and the discovery cluster (`lld-availability-discovery`) each registered a `FeaturingActivated`/`FeaturingLapsed` pair concurrently, producing a duplicate in event-catalog.md §2. Billing reconciled to **exactly one canonical pair**: publisher `listing-billing`, `FeaturingActivated` payload `{subscriptionId, providerProfileId}`, `FeaturingLapsed` payload `{subscriptionId, providerProfileId, reason: 'cancelled'|'payment_failed'|'listing_lapsed'}`, subscriber `discovery-search` driving its projection `is_featured` flag (`is_featured=true` + `featured_since` on activate, `is_featured=false` on lapse — discovery's field names, retained). The duplicate row was removed and the discovery cluster notified.

`listing-billing.state_transition` audit action (event-catalog.md §4, no reason required — the transition name is the reason) is written in-transaction for every §4 transition (SR-APP-12).

---

## 12. Open questions / assumptions

1. **Config key names** cited here (`listing-billing.trial_period_days`, `listing-billing.grace_period_days`, `listing-billing.listing_price_cents`, `listing-billing.featuring_price_cents`, `listing-billing.dunning_offset_days`) match platform-configuration-lld.md §4 — that file is the tiebreaker. Trial length and prices have no FRS/BRD numbers; defaults there are flagged assumptions, admin-set pre-launch.
2. **Anti-abuse "no findable prior sub" posture** (§9 edge case): modeled as immediate-grace / payment-required. If product prefers an explicit `payment_required` state distinct from `grace`, add it to the state enum — flagged rather than assumed, since §19.6 does not depict it (it is an anti-abuse entry point, not a normal lifecycle edge).
3. **Renewal charge initiation** assumed daily-job-driven against `psp_customer_ref`; if Paystack's own subscription/plan scheduling is used instead, the daily job becomes a reconciliation safety-net rather than the initiator — either way the webhook-heals invariant (§5) holds.
4. **`AccountDeletionRequested` handling** assumes billing cancels the subscription but retains invoice/tax records (FR-PRIV-03 statutory survivorship); the anonymization of `phone_history_ref` is identity's concern (the hash survives per its LLD).
