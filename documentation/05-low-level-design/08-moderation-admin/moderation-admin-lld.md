---
title: Peach Finder — LLD — Moderation & Admin Console
updated: 2026-08-20
---

# Moderation & Admin Console — Low-Level Design

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Low-Level Design — admin console **delivery surface** (`src/routes/admin/`) |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | HLD §6.1 ("the admin console is a **delivery surface, not a module**"), §5 (admin subdomain), §10.1 (SR-SEC-08); `00-foundations/api-conventions.md` §2, `00-foundations/security-implementation.md` §2/§3.4/§4/§8, `00-foundations/shared-kernel.md` §7; FRS §11 (ADM); user-stories §16 (E13) |
| Delivers | FR-ADM-01..09 (as a delivery surface over module facades) |
| Status | Living document — updated in place |

**Design constraint 0 — this is a delivery surface, not a domain module (HLD §6.1):** *nothing in this document may introduce new domain logic.* Every action here **delegates to a module facade documented elsewhere in this LLD set**, cited by file + section. The admin console holds no `domain/`, no `app/`, no `infra/`, no schema of its own — it is a route group (`src/routes/admin/…`) that parses input (Zod), calls a facade, and shapes a response (clean-code §7 "thin by decree"). Moderation *domain logic* lives in `trust-and-safety` (`07-trust-and-safety/trust-and-safety-lld.md`). If a reviewer finds business logic in a file under `src/routes/admin/`, it is a defect.

---

## 2. Purpose & scope

| FR | Covered in |
|---|---|
| FR-ADM-01 — access-restricted console housing queues, lookup, actions, config, free-period | §3 |
| FR-ADM-02/03 — identity queue, reports queue (delegated to `trust-and-safety`) | §3, §7 |
| FR-ADM-05 — moderation action panel (delegated to `trust-and-safety`) | §3, §7 |
| FR-ADM-06 — platform config editor (delegated to `platform-configuration`) | §3, §7 |
| SR-DATA-07 — subject-access export (delegated to `platform-configuration`) | §3, §7 |
| FR-ADM-07 — account lookup, **no impersonation** | §3, §6 |
| FR-ADM-08 — every admin action audit-logged | §7 (writes happen in the facade's transaction), §8 |
| FR-ADM-09 (S) — ops KPI dashboard | §4 |
| SR-SEC-08 — TOTP, ≤12h idle, admin subdomain | §5 |

Every capability below names the **facade + file + section** it delegates to. No facade call in this document performs a write this document defines — the write, its transaction, its audit entry, and its events are all specified in the owning module's LLD.

---

## 3. Console structure

Route group `src/routes/admin/` on the **admin subdomain** (HLD §5, SR-SEC-08). Each surface is a thin page/endpoint over a facade:

| Console surface | FR | Delegates to (facade — file §) | Notes |
|---|---|---|---|
| Identity review queue | FR-ADM-02 | `trust-and-safety` — trust-and-safety-lld.md §4/§10.2 | oldest-first; docs open via `media-processing` presigned URLs (§7) |
| Reports queue | FR-ADM-03 | `trust-and-safety` — trust-and-safety-lld.md §6/§10.2 | oldest-first; content-in-context via owning-module facades |
| Account lookup | FR-ADM-07 | `identity-and-access` — identity-and-access-lld.md (search by name/email/phone) | aggregates badge/billing/report state read-only (§6) |
| Moderation action panel | FR-ADM-05 | `trust-and-safety` — trust-and-safety-lld.md §7/§10.2 | remove photo/review, unpublish, suspend, reinstate, revoke badge |
| Platform config editor | FR-ADM-06 | `platform-configuration` — platform-configuration-lld.md §6 | free-period, expiry/reminder, highly-rated threshold, response-time window, tag vocabulary, lexicon, pricing |
| Subject-access export | SR-DATA-07 | `platform-configuration` — platform-configuration-lld.md §9 | machine-readable dump of one user's personal data; not a message browser |
| Tag-vocabulary proposal review | FR-PROF-03 | `provider-profile` — provider-profile-lld.md (`service_tag_proposal` table + facade) | approve/reject provider-proposed tags; profile never blocked on outcome |
| Billing / subscription lookup | FR-ADM-07 | `listing-billing` — 09-listing-billing/listing-billing-lld.md (subscription/invoice facade) | read-only listing/billing state for an account |

Every write-capable surface calls a **facade command** that owns its own transaction + audit entry + events. The console never opens a transaction, never writes a schema, never publishes an event.

---

## 4. Ops KPI dashboard (FR-ADM-09, S; SR-OBS-07)

Read-only aggregate view; numbers must match the ops metrics pipeline (SR-OBS-07 — admin-visible and ops-visible numbers cannot diverge). **Specified as read-only aggregate queries exposed by owning-module facades' query methods, not raw cross-schema SQL from this delivery layer** (HLD §6.2 — "only `index.ts` is the public surface", even for read-only admin aggregation):

| KPI | Source facade query | Aggregate |
|---|---|---|
| Identity-queue depth & age | `trust-and-safety.getIdentityQueueStats()` (trust-and-safety-lld.md §4) | `COUNT(*) where status='pending'`, `AVG(now()-submitted_at)`, `MAX(now()-submitted_at)` |
| Reports-queue depth & age | `trust-and-safety.getReportsQueueStats()` (trust-and-safety-lld.md §6) | `COUNT(*) where status='open'`, `AVG/MAX(now()-created_at)` |
| New registrations | `identity-and-access.getRegistrationStats(range)` (identity-and-access-lld.md) | `COUNT` over range |
| Active listings | `listing-billing.getActiveListingCount()` (09-listing-billing/listing-billing-lld.md) | `COUNT` of live listings |

The console composes these facade results into one dashboard read model **in the page `load`** — no persistence, no SQL. If a facade's query method does not yet exist, it is added to that module (its LLD), not worked around here.

---

## 5. Admin authentication flow (SR-SEC-08, security-implementation §3.4/§4)

Login requires **email+password → TOTP**, and an admin session row is created **only after both succeed** — there is **no admin session in a "logged-in, TOTP-pending" state** (security-implementation §3.4). Sequence:

```mermaid
sequenceDiagram
    actor A as Admin
    participant W as web (admin routes)
    participant ID as identity facade
    A->>W: POST /admin/login { email, password }
    W->>ID: verifyPassword(email, password)  — Argon2id (SR-SEC-04)
    ID-->>W: ok (NO session yet)
    W-->>A: TOTP challenge
    A->>W: POST /admin/login/totp { code }
    W->>ID: verifyTotp(userId, code)  — RFC 6238 ±30s (security-implementation §4); bucket admin_totp_verify (5/10min)
    ID-->>W: ok
    W->>ID: createAdminSession(userId)  — expires_at = last_seen_at + 12h HARD cap (SR-SEC-08, security-implementation §3.4)
    ID-->>W: session
    W-->>A: authenticated (admin session cookie)
```

- Password and TOTP verification, session creation, the `admin_totp` store, and the 12h idle cap are all **`identity-and-access`/security-implementation mechanisms** — this console *invokes* them, it does not implement them.
- The RBAC floor for every `/admin/...` route is `is_admin=true` enforced **at the SvelteKit server hook, before any handler runs** (security-implementation §2 step 5; api-conventions §2) — "admin capabilities are unreachable, not merely hidden" (SR-SEC-05).
- First-admin bootstrap forces TOTP enrollment on first login (SR-OPS-07); the enrollment UI lives here but the secret storage/encryption is `identity-and-access` (security-implementation §4).

---

## 6. Impersonation — explicitly NONE (FR-ADM-07 guard)

**There is no "log in as user" capability anywhere in this console (V1).** This is a negative requirement satisfied **by omission**: no route, no facade call, and no UI control exists that would assume another user's identity or session. Account lookup (§3) is strictly **read-only aggregation** of a user's profile/badge/billing/report/moderation state (FR-ADM-07) — it never mints a session for, or acts as, the looked-up user. This is asserted here so the absence is a documented decision, not an oversight, and so any future PR adding impersonation is a visible BRD-level change.

---

## 7. API contract — `/admin/api/...` routes

Per api-conventions §2 admin-route convention; `role=admin` (`is_admin=true`) enforced at the hook; `Idempotency-Key` accepted on every state-changing route (api-conventions §5 → the owning module's dedup table). Each row cites the facade method (module + file + §) it calls — the **write, transaction, audit entry, and events belong to that facade**, not to this layer.

| Method & path | Calls facade (module — file §) | Domain effect (owned there) |
|---|---|---|
| `GET /admin/api/trust/verification/queue` | `trust-and-safety.listIdentityQueue` — trust §4/§10.2 | oldest-first pending cases |
| `POST /admin/api/trust/verification/:caseId/approve` | `trust-and-safety.approveVerification` — trust §7/§10.2 | badge grant, audit `identity.approve`, events |
| `POST /admin/api/trust/verification/:caseId/reject` | `trust-and-safety.rejectVerification` — trust §10.2 | audit `identity.reject` (reason required) |
| `GET /admin/api/media/identity-doc-url/:photoId` | `media-processing.issueIdentityDocUrl` — 12-media-processing/media-processing-lld.md §4 | presigned GET, TTL ≤5min, admin-session-only, **issuance audit-logged** |
| `GET /admin/api/trust/reports/queue` | `trust-and-safety.listReportsQueue` — trust §6/§10.2 | oldest-first open reports |
| `GET /admin/api/trust/reports/:reportId` | `trust-and-safety.getReportContext` — trust §6 | reporter, reported party, content-in-context, history |
| `POST /admin/api/trust/reports/:reportId/dismiss` | `trust-and-safety.dismissReport` — trust §6/§10.2 | report→dismissed (note required), audit `report.dismiss` |
| `POST /admin/api/trust/reports/:reportId/act` | `trust-and-safety.actOnReport` — trust §6/§7 | report→acted + moderation action, audit `report.act` |
| `POST /admin/api/trust/moderation/remove-photo` | `trust-and-safety.removePhoto` — trust §7 | `ModerationActionTaken`, audit `moderation.remove_photo` |
| `POST /admin/api/trust/moderation/remove-review` | `trust-and-safety.removeReview` — trust §7 | audit `moderation.remove_review` (`metadata.part` for reply, reviews §6) |
| `POST /admin/api/trust/moderation/unpublish` | `trust-and-safety.unpublishProfile` — trust §7 | audit `moderation.unpublish`; provider may republish |
| `POST /admin/api/trust/moderation/suspend` | `trust-and-safety.suspendAccount` — trust §7/§9 | audit `moderation.suspend`; synchronous `identity-and-access.suspendUser` |
| `POST /admin/api/trust/moderation/reinstate` | `trust-and-safety.reinstateAccount` — trust §7/§9 | audit `moderation.reinstate` |
| `POST /admin/api/trust/moderation/revoke-badge` | `trust-and-safety.revokeBadge` — trust §4.2/§7 | audit `identity.revoke` |
| `GET /admin/api/identity/accounts?q=` | `identity-and-access.searchAccounts` — identity-and-access-lld.md | lookup by name/email/phone (read-only) |
| `GET /admin/api/billing/subscription/:providerProfileId` | `listing-billing.getSubscription` — 09-listing-billing/listing-billing-lld.md | listing/billing state (read-only) |
| `GET/PUT /admin/api/platform/config/:key` | `platform-configuration.getConfig` / `platform-configuration.setConfig` — 13-platform-configuration/platform-configuration-lld.md §6 | config read/write; `setConfig` audits `config.change`, publishes `ConfigChanged` |
| `POST /admin/api/platform/export/:userId` | `platform-configuration.exportUserData` — 13-platform-configuration/platform-configuration-lld.md §9 | SR-DATA-07 dump; audits `admin.export_user_data` |
| `GET /admin/api/provider/tag-proposals` · `POST …/:id/approve\|reject` | `provider-profile.listTagProposals` / `resolveTagProposal` — 02-provider-profile/provider-profile-lld.md (`service_tag_proposal`) | approve/reject proposed tag; profile never blocked |
| `GET /admin/api/audit?targetType=&targetId=` | `platform-configuration.readAuditLog` (or shared-kernel read helper) over `shared.audit_log` | §8 |
| `GET /admin/api/ops/kpis?range=` | composes `trust-and-safety`/`identity-and-access`/`listing-billing` stat facades | §4 read-only aggregates |

**No route in this table opens a transaction or writes a schema.** Where a row shows a domain effect, that effect is executed *inside the cited facade's own transaction* (with its audit entry per SR-APP-12 and its outbox events) — this console only forwards the validated request and shapes the result.

---

## 8. Audit visibility (read-only viewer over `shared.audit_log`)

FR-ADM-08 requires every admin action to be recorded; this console additionally exposes a **read-only** admin-facing audit viewer (`GET /admin/api/audit?targetType=&targetId=`) filtered by target, over `shared.audit_log` (shared-kernel §7, indexed by `audit_log_target_idx`). Constraints:

- The application role has `SELECT`/`INSERT` only on `shared.audit_log` — `UPDATE`/`DELETE` are revoked at the database level (shared-kernel §7, SR-DATA-05). The viewer is physically incapable of editing history; it can only read.
- Entries are **written** by the acting module's command handler in-transaction via `shared/audit.ts` (shared-kernel §7) — **never** by this delivery layer. The console reads; it does not write audit entries itself.
- Shows actor, action, target, UTC timestamp, and recorded reason — the FR-ADM-08 fields.

---

## 9. Open questions / assumptions

1. **Facade query methods for KPIs (§4).** **Closed 2026-08-20:** `trust-and-safety.getIdentityQueueStats` / `getReportsQueueStats`, `identity-and-access.getRegistrationStats`, `listing-billing.getActiveListingCount` are named on those modules' facades.
2. **`platform-configuration-lld.md` §6 and `09-listing-billing/listing-billing-lld.md`** match the delegation shape (get/set + `ConfigChanged`; `getSubscription`). SR-DATA-07 export is `POST /admin/api/platform/export/:userId` → `exportUserData` (§9).
3. **Audit read helper location.** **Closed:** `platform-configuration.readAuditLog` (platform-configuration LLD §8).
4. **Reply-removal `metadata.part` plumbing (§7).** The remove-review console control must set `metadata.part='reply'` when the admin targets a reply vs a whole review (provider-reviews-lld.md §6, trust-and-safety-lld.md §7). UI concern; noted for the design/build phase.
5. **Cloudflare Access hardening (SR-SEC-08, S).** The admin subdomain is eligible for IP allowlist / Cloudflare Access as an additional edge control — an infra/deployment concern (HLD §5), not an application route change; noted for `08-development-deliverable-documents`.
