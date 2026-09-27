---
title: Peach Finder — Playwright Backend-Validation Audit
updated: 2026-09-27
---

# Playwright Backend-Validation Audit

## Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Live-stack Playwright audit + correction tracker |
| Date | 2026-09-27 |
| Canonical | This file (repo). Vault copy: `projects/peach-finder/playwright-backend-validation-audit.md` (browsable only). |
| Upstream | `00-overview.md`; `01-test-strategy.md`; `05-playwright-spec-designs/00-index.md` (`stub_mode: forbidden`); LLD `14-test-strategy.md` |
| Downstream | `testing/playwright/*.e2e.ts` — every correction must strengthen, never delete, existing coverage |
| Status | Living — update §Correction status when a flagged item lands |

**Binding principle:** each Playwright test simulates a real user workflow and fails if backend processing (DB, outbox/consumers, search, integrations) breaks. UI state alone is never the validation target. Axe/visual/CSS tests stay; they gain a companion proof.

**Suite fact:** no `page.route` mocks of app APIs. Insufficiency is UI-only, API-only `/api/dev/*`, or **false-green** claims.

---

## Correction status (drive work from here)

Highest-priority false-greens first. Status is relative to this working tree on `feat/initial-implementation`.

| Priority | Item | Status | Evidence |
|---|---|---|---|
| P0 | **TC-ADMIN-04b** unpublish hides listing + notifies provider | **Corrected** | Admin unpublish → `POST /api/dev/moderation-effect-dispatch` (provider-profile consumer) → anonymous profile ≥400 and search omit; Amara sees `moderation_outcome`; finally-block republish restores seed. Integration: `moderation-commands.integration.test.ts` dispatcher case. |
| P0 | **TC-SAFE-01a-thread** file report from conversation | **Corrected** | Safety menu is an explicit toggle (not `<details>`); Report → Harassment → `POST /api/trust/reports` 201; profile snapshot unchanged. |
| P0 | **TC-SAFE-01b** server taxonomy | **Corrected** | Unknown reason `POST` → 422. |
| P0 | **TC-MSG-06a / 06c** confirm block + file report | **Corrected** | Report 201; confirm block; subsequent send 404. |
| P0 | **Golden path Send** (E2E-1) | **Corrected** | Homepage → Message click (draft-nav) → sign-up → verify → compose restores draft via `initialComposeDraft` + sessionStorage → Send → thread + GET messages contain draft. `e2eWebServerEnv` pins `PUBLIC_APP_ORIGIN` to Playwright `baseURL`. Verified `E2E_PORT=4178`. |
| P0 | **TC-PRIV-04b** terms reject | **Corrected** | HTML5 invalid + form POST without `acceptedTerms` (422 or body) + session ping ≥400. SvelteKit `fail()` is often HTTP 200. |
| P0 | **TC-PRIV-03c** anonymize after delete | **Corrected** | Real delete; ping 401; login rejected (403 or invalid-credentials body); counterpart inbox “Deleted account” + message body. |
| P0 | **TC-ACC-05a** delete confirm | **Corrected** | `DELETE` `confirm:false` → 422; session ping still ok. |
| P0 | **TC-BILL-05** featuring UI + lapse | **Corrected** | Buy featuring from billing UI; status `featuring.active`; grace tick force-lapses. |
| P0 | **TC-ADMIN-04a** empty reason leaves listing live | **Corrected** | Alert + profile GET + search still contains seed id. |
| P1 | Reports picker completes an action | **Corrected** | Seed picker chrome kept; seeker opens `/report` then files via session POST (new report, not seed IDs); admin `/admin/reports?act=` picker Confirm Unpublish; open queue omits report; effect-dispatch hides listing; Amara restored. |
| P1 | TC-VIEW-03c / TC-MSG-01b send prefilled draft | **Corrected** | Verify + Send; GET thread messages include session draft / `Re: 60 minute session`. |
| P1 | TC-ACC-02d held message after one-screen register | **Corrected** | One-screen chrome plus register → held send → verify → `message-state` count 1. |
| P1 | TC-NOTIF-02a-live-dispatch via UI | **Corrected** | Sequential verify-email; in-app toggle on `/profile`; file Spam report from UI; receipt after dispatch. |
| P1 | TC-BILL-04d/e webhook from UI state | **Corrected** | Pay listing from billing UI; failed-charge webhook + replay `duplicate`; bad signature leaves status unchanged; billing UI still live. |
| P1 | TC-ADMIN-06a config consumer | **Corrected** | Save listing price from `/admin/config`; `/api/billing/status` + price list use new cents without restart; value restored. |
| P1 | TC-ADMIN-02c approve/reject from queue UI | **Corrected** | Approve/Reject buttons on `/admin/identity`; public badge + displayName; empty reject reason alert + API 422. |
| P2 | Class B axe/CSS pairing | **Corrected** | Every `AxeBuilder` spec now also calls `assertPrimaryListingLive` (or filtered search membership) so a dead listing/search stack fails the axe test. Helper: `testing/playwright/live-backend-assert.ts`. |
| P2 | Class C `/api/dev` journeys driven from UI | **Corrected (highest-traffic)** | `/admin` unauthenticated 4xx; identity queue opened from admin nav; cancel renewal clicked on billing UI; notification card click into thread (303 companion kept). |
| P2 | §2 coverage-gap rows | **Corrected (implementable set)** | Prior rows plus: 1280 token gates (no invented pixel baselines); filter-apply + JS payload budgets; homepage nearby named seeds; identity/admin sign-in via `/admin/login` form. Remaining: owner-approved screenshot diffs; `E2E_CWV_STRICT=1` for the 3s/200ms/300KB gates on Vite slack. |

**Harness facts used by corrections (do not regress):**

- Admin unpublish writes `ModerationActionTaken`; hide happens in `provider-profile.moderation-effect`, not `notification-dispatch`.
- Shared host Postgres may already bind `:5432` (do not `docker compose up` onto it). `E2E_PORT` must not reuse a foreign Vite app on `:5173`.
- `NotificationPreferences` parent-sync `$effect` must `untrack` writes or `/profile` hits `effect_update_depth_exceeded` and aborts later navigations (verify-email).

---

## 1. Tests requiring refactor

Three insufficiency classes. **Preserve** every test (including axe/visual); add a backend proof, do not replace one with the other.

### A. False-green — title claims a backend effect the test never asserts

These are the highest risk: they go green while dispatch, persistence, or search can be broken.

| Test | Why insufficient | Backend behavior it must validate |
|---|---|---|
| `admin-moderation-actions.e2e.ts` — **TC-ADMIN-04b: unpublish via API notifies provider after dispatch** | Calls unpublish + `/api/dev/notification-dispatch` in a loop, then only asserts the admin panel is visible. Never reads in-app notifications or public listing state. | After admin unpublish: public `GET /api/provider/profile/:id` is 404 / listing gone from search; provider inbox contains `moderation_outcome`; optionally republish so the seed profile is not left unpublished for later specs. |
| `admin-moderation-actions.e2e.ts` — **TC-ADMIN-04a** | UI alert on empty reason; no proof the listing was unchanged. | Empty reason → 4xx; profile still published in discovery/API. |
| `admin-moderation-actions.e2e.ts` — **reports queue exposes the moderation action picker** | Opens picker copy only. | Complete an action from the picker; report + profile + audit change. |
| `e2e-report-resolution.e2e.ts` — **TC-SAFE-01a-thread** | Opens thread safety panel; never files a report. | Submit a thread report; `POST /api/trust/reports` 201; receipt; reported party profile unchanged (human-only moderation). |
| `e2e-report-resolution.e2e.ts` — **TC-SAFE-01b** | Compares buttons to frontend `reportReasonLabels()`. | Server accepts only that taxonomy; unknown reason → 4xx. |
| `messaging-live.e2e.ts` — **TC-MSG-06a / TC-MSG-06c** | Reachability + confirm-block chrome; never confirms block or files a report. | Confirm block → both sides `POST` message 404; report → 201 + receipt. |
| `search-to-contact.e2e.ts` — **golden path: homepage to profile to sign-up preserves message context** | Stops when the draft is in the composer. | Send; thread exists; body persisted (`/api/messaging/...`). |
| `search-to-contact.e2e.ts` — **TC-VIEW-03c / TC-MSG-01b** | Draft/prefill only (`sessionStorage` / URL). | Send; stored body includes the prefilled text. |
| `data-retention-schedule.e2e.ts` — **TC-PRIV-03c** | Annotation stub; **zero assertions**. | After delete-account: counterpart sees “Deleted account”; PII gone from APIs (already partly in `delete-my-account.e2e.ts` — this spec must execute those checks, not point at them). |
| `terms-acceptance.e2e.ts` — **TC-PRIV-04b** (seeker + provider) | HTML5 `validity.valid === false` only. | `POST` register/provider-register with `acceptedTerms: false` → 4xx and no user; with accept → `acceptedTermsAt` on identity. |
| `delete-my-account.e2e.ts` — **TC-ACC-05a** | Confirm-step URL/copy only. | Delete without confirm / wrong password → 4xx; session still valid. |
| `sign-up-mid-action.e2e.ts` — **TC-ACC-02d** | “Exactly one screen” chrome (`Next` absent). | Same as 02a/02c: held message or compose after one register. |
| `notifications-channel-preferences.e2e.ts` — **TC-NOTIF-02a-live-dispatch** | Prefs + report + dispatch all via API; no UI. | Toggle silence in UI; file report in UI; report-receipt still appears (essential path). |
| `billing-lifecycle.e2e.ts` — **TC-BILL-04d/e** | Webhook replay/signature via `page.request` only; sign-in unused. | After valid webhook: billing UI + listing state change; replay is no-op (one invoice/transition); bad signature leaves state untouched. |
| `billing-lifecycle.e2e.ts` — **TC-BILL-05a/b** | Featuring purchase/lapse entirely API. | Buy featuring from billing UI; listing/search show featured; grace/unpublish force-lapses featuring in the same lifecycle tick (LLD §2.9). |
| `platform-config.e2e.ts` — **TC-ADMIN-06a** | PUT/GET round-trip; no product consumer. | Save from `/admin/config` UI; a live consumer (availability expiry, trial length, etc.) uses the new value without restart (`ConfigChanged` / cache). |
| `identity-verification.e2e.ts` — **TC-ADMIN-02c approve / reject** | Approve/reject via admin API; no queue buttons; approve test does not assert public badge. | Click Approve/Reject in queue UI; public profile badge + displayName unchanged; reject requires reason (422 without). |

### B. UI-only — would stay green if DB, consumers, or search died

**Axe-only** (keep; pair with a data assertion on the same page): every `has no critical or serious axe violations` / `legal pages meet accessibility baseline` / `thread view has no critical or serious axe violations` across homepage, components, browse, stay-signed-in, sign-up, roles, delete, terms, all PONB specs, safety, badges, filters, suggestions, near-me, ranking, empty-search, shortlist, recent-searches, search-to-contact, ratings, messaging, reports, identity, admin, analytics, platform-config.

**Chrome / CSS / geometry** (keep as visual; add search/profile/API proof):

- `homepage.e2e.ts` — cream token + hero copy, no seeded providers.
- `components.e2e.ts` — `/dev/components` shadows/animation only.
- `search-natural-language.e2e.ts` — sticky search bar; BRD queries only assert “cards exist”.
- `search-filters.e2e.ts` — `chip-selected` class; combined filters only assert `count <= initial`.
- `search-suggestions.e2e.ts` — stale-clear + skeleton spinner.
- `search-near-me.e2e.ts` — geolocation-unavailable copy; distance label exists, not order vs seed coords.
- `search-shortlist-cards.e2e.ts` — 360px touch targets; anonymous Message → `/sign-in` without later send.
- `search-recent-searches.e2e.ts` — **`localStorage` `pf_recent_searches` only**; re-run never asserts search API/intents.
- `search-to-contact.e2e.ts` — above-the-fold geometry; share-control presence (`TC-VIEW-06a`).
- `provider-profile-build.e2e.ts` — **TC-PONB-03d** 600-char client cap.
- `provider-analytics.e2e.ts` — **TC-ANLY-01c** metric-definition copy.
- `admin-console.e2e.ts` — Ink strip CSS; nav links without loading a live queue.
- `admin-ops-dashboard.e2e.ts` — **TC-ADMIN-VIS-02** homepage strip absence.
- `admin-account-lookup.e2e.ts` — **TC-ADMIN-05b** “no impersonate button” DOM only (add OpenAPI/route absence).
- `safety-info.e2e.ts` — footer/badge href + static `/safety` copy.
- `terms-acceptance.e2e.ts` — **TC-PRIV-04a** legal `href`s.

### C. API-only or `/api/dev/*` — real backend, not a user workflow

These **do** catch some backend failures. They fail the audit’s “simulate a real user” rule. Refactor by driving the same assertion from the UI; **keep** the API companion.

| Area | Tests | User action to add |
|---|---|---|
| Notifications | `TC-NOTIF-01a-live`; deep-link open via `GET openHref` 303 | File report / send message in UI; **click** the notification into thread/billing. |
| Notifications | Spam-cannon burst via messaging API | Send the burst from the composer (or first + API rest); click collapsed notif. |
| Identity | `TC-ADMIN-02b` presign; `TC-VERIF-01a` multipart submit; `TC-VERIF-01b` JSON scan | Open doc from queue UI; submit `/provider/verify` form; view public profile (no doc URLs). |
| Billing | Continuity snapshot + trial-ending-dispatch; cancel-renewal POST; seed invoices | Trigger from billing UI / visible banner; cancel via UI control. |
| Retention | 03a/03b/03d seed → tick → verify | After tick: admin doc 404; user opens purged thread and sees empty/gone; analytics UI still shows rollups. |
| Admin | Unauthenticated 401; TOTP gate; lookup by API; audit PATCH 405; config 422 | Hit `/admin` unauthenticated; login+TOTP UI; type lookup in Accounts; save invalid config in UI. |
| Active-this-week | `TC-AVAIL-04b` API-only negative | Badge absent before tick, present after real availability activity + job. |

**MIXED** remaining: report dismiss/act still has an API companion while the seeker is signed in; NOTIF-02a prefs still PUT then reload. Tightened: filter/near-me named-seed search; homepage nearby includes Nomsa P.; analytics range re-GETs dashboard totals; identity/admin login uses `/admin/login` + TOTP field.

---

## 2. Coverage gaps

Mapped to `documentation/07-test-artifacts` + LLD `14-test-strategy.md` §2–3 and the Playwright design contract (`stub_mode: forbidden`). These workflows have **no UI-driven live-stack proof** that would fail if messaging, persistence, or a consumer broke.

| Documented workflow | User action that should trigger it | Backend failure the test must catch |
|---|---|---|
| **E2E-1 complete send** (`e2e-search-to-contact.spec-design`, user-stories §19.1) | Homepage → card → Message → sign-up → **Send** | Thread/message row missing; draft lost; discovery ranking/phone rules already covered elsewhere. |
| **Availability projection + hourly repair** (LLD §2.4) | Set available in dashboard; optionally corrupt projection via dev hook | Homepage/search stale >30s; reconciling sweep does not restore. |
| **`block_cache` heal-after-gap** (LLD §2.5) | Block, send immediately, send again | First-in-window may be documented; **second** send must 404. Not asserted today. |
| **WS drop → poll fallback, no duplicate** (LLD §2.5) | Two browsers; kill WS mid-thread; send | Message missing or duplicated after reconnect. Polling-only path exists (`TC-MSG-02c`); drop+reconcile does not. |
| **One-thread-per-pair under concurrency** (LLD §2.5) | Two Message clicks / parallel compose | Two thread IDs for one pair. |
| **Notification window-after-flush** (LLD §2.11, US-NOTIF-03) | Burst, flush, one more message | Second window not opened; or first window not collapsed (collapse of 6 is covered). |
| **Block-silence for every subscriber event** (LLD §2.11) | Block, then review/report/availability/billing events from blocked party | **Corrected (actor-attributed).** `recordNotification({ actorUserId })` is the silence chokepoint; outbox claim priority drains block-cache events first. E2E: eligible review then block then dispatch → no `review_received`. Billing/availability/report-receipt stay self-addressed (no actor). |
| **Channel failure isolation** (LLD §2.11) | Trigger a notification with email adapter forced to throw | Push/in-app still land; user action still 2xx. |
| **Analytics fire-and-forget + `profile_view` dedup** (LLD §2.10) | Open profile twice same day; inject analytics timeout | Page 5xx if capture throws; two raw events for one viewer/day. |
| **`ConfigChanged` cache + 5‑min TTL backstop** (LLD §2.13, US-ADMIN-06) | Save config in admin UI; drop the event | In-process cache stale forever; product still uses old expiry/price. |
| **Featuring UI + same-transaction force-lapse** (US-BILL-05, LLD §2.9) | Buy featuring; run grace/unpublish tick | Featured stays after listing lapses; or lapse is a second async step that can be missed. |
| **Daily billing job heals missed webhook** (LLD §2.9, E2E-6) | No PSP event; advance clock via lifecycle job | `free_listed → grace → unpublished` does not move on stored timestamps. |
| **Identity-doc MinIO policy denial** (LLD §2.12) | Unauthenticated GET of a real object key | **Corrected.** Authenticated path-style PUT writes a probe object; anonymous GET must be 403/404. App dual-writes finals to MinIO when configured; local `.media-local` stays canonical if the store is down. |
| **SR-DATA-07 export** (LLD §2.8/§2.13, US-ADMIN-05) | Admin export a user | Cross-schema SQL / identity binaries / PSP refs leak; duplicate audit on idempotent retry. |
| **Moderation idempotency** (LLD §2.7) | Same `Idempotency-Key` twice from admin UI/API | Two `moderation_action` rows / two audits / two events. |
| **Rapid reports do not auto-hide** (LLD §2.7 guard suite) | File N reports on one profile | Profile publish_state/search membership changes without admin act. 01c checks one report; not a burst. |
| **Visual-quality + perceived-performance designs** (`05-playwright-spec-designs/e2e-visual-quality-*.md`, `e2e-performance-*.md`) | Critical-path screens at 360/768/1280 | **Corrected (token gates at 360/768/1280).** Homepage + filtered search + seed profile assert One-Serif, 44px/pill, warm/ink shadow, terracotta focus, never-color-alone, no admin ink, plus live listing. Screenshot pixel diffs still need owner-approved baselines. Perceived: SSR, filter apply, core JS transfer, suggestions — 3s/200ms/300KB when `E2E_CWV_STRICT=1`, else Vite slack. |
| **US-DISC-09 server history** | Re-run recent search | **N/A (product).** DDD/FR-SRCH-12 keep history in `pf_recent_searches` only. E2E re-runs live search + proves a second browser has no stored history. |
| **Phone-reuse registration journey** (US-BILL-02) | Register a new provider with a reused phone | **Corrected.** `registerAndPublishProvider` uses the working register fill order plus onboarding form-action POSTs (avoids remount-empty fields). First context publishes (`billingContinuity=new`), deletes the account, second context re-registers the same phone and must not be `new`. Snapshot copy tests remain. |

Out of Playwright scope (already documented as such): load/SR-CAP-01, pentest SR-SEC-12, restore drills SR-AVL-05.

---

## 3. Tests that pass the audit

These already combine a realistic user (or a clearly user-equivalent live mutation) with a backend dependency that would fail if persistence, search, messaging, or a job broke.

**Accounts / identity:** `TC-ACC-01a` anonymous browse→search→profile; `TC-ACC-02a` / `02c` mid-action draft + held-message delivery; `TC-ACC-03a–d` session persist, device-scoped sign-out, one-time reset, password change revokes other session (`/api/session/ping` 401); `TC-ACC-04a` + seeker 403 on provider dashboard; `TC-ACC-05b/c` delete unpublishes / counterpart “Deleted account”.

**Provider onboarding:** `TC-PONB-01a/c` OTP + draft onboarding; `02a/b` resume + readiness; `03a/b` real upload + oversize reject; `03e` tag proposal submitted; `04a/b/c` publish + trial + search ≤30s; `05a/b` live intro + name-change badge suppress; `06a` unpublish/republish + search; `07a/b/c` phone visibility API/HTML; `08a` preview `as=anonymous` / `as=seeker`; `TC-PRIV-02b` geotagged JPEG → variants with no EXIF.

**Discovery / availability:** `TC-DISC-01a/c` available cohort order + set-available appears “just now”; `02c` NL → `lang=zu` chip; `03a/b` suggestions + no provider names; `04c` / `TC-REV-04a/b` New vs rating filter; `06a/b/d` availability-first ranking, featured cannot beat available, draft/unpublish hidden; `07a` empty-state relaxation re-runs search; `08a` shortlist fields from seed; `TC-PRIV-01a` + phone-on/off profile/search JSON key absence; `TC-VIEW-01a/c`, `02a/b`, `03b`, `06b` profile SSR/OG/presence/call rules; `TC-AVAIL-01a/c`, `02a`, `03a–c`, `05a` set/clear/renew/sweep + homepage; `TC-AVAIL-04a` active-this-week after tick.

**Messaging / safety / reviews:** `TC-MSG-01a/c` same thread + history; blocked compose 404; `02a–c` live delivery, sent/delivered/read, poll fallback; `04a` inbox order/unread; `TC-SAFE-01a` profile report 201; `01c` receipt + profile snapshot unchanged; `TC-SAFE-02a–d` block both ways, asymmetric discovery hide, no block notif, UI unblock restores; `TC-REV-06a` reviews survive block; review lifecycle `01a–c`, `02a/c`, `03a–c`, `05a/b` eligibility tick, 201/409, live on profile, report does not remove, edit/delete/reply.

**Billing / analytics / admin (already backend-backed):** `TC-BILL-01b` free-period dashboard vs status API; `03a` hosted PSP (no raw card fields); `03b` price before purchase; `TC-ANLY-01a`, `02a/b`, `03a`, `04a` metrics, privacy floor, demand tags, chart annotations; `TC-VERIF-03a` name change → badge gone, profile still live; `TC-NOTIF-02b` essential billing always-on (UI + PUT 422); `TC-ADMIN-08a` ops KPIs match live identity/reports queues.

---

## How to continue

1. Pick the next **Open** or **In progress** row in Correction status.
2. Keep existing asserts; add one that fails if the write, consumer, or search index is down.
3. Update that row’s Status/Evidence in this file in the same change set.
4. Do not drop axe or visual tests.
