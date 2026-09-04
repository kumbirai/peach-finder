---
title: Peach Finder — LLD — Security & Session Implementation
updated: 2026-08-20
---

# Security & Session Implementation — Low-Level Design

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Low-Level Design — cross-cutting security mechanisms |
| Upstream | HLD §10.1 (mechanism map), SRS §11 (SEC), §12 (PRIV) |
| Downstream | `01-identity-and-access/identity-and-access-lld.md` (owns the tables this document specifies), `08-moderation-admin` (TOTP enrollment UI) |
| Status | Living document — updated in place |

This document specifies **mechanism**; `01-identity-and-access` specifies the module that owns and exposes it. Split this way because sessions/RBAC/rate-limiting are consumed by every module, while their storage lives in one schema.

---

## 2. RBAC middleware (SvelteKit server hook)

`src/hooks.server.ts` runs on every request, once:

1. Read session cookie (`pf_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, path `/`).
2. If present, look up `identity_and_access.session` (schema in §3) by session ID hash (the cookie holds a random 256-bit token; only its SHA-256 hash is stored — a DB compromise never yields a replayable session token directly).
3. If found and not expired/revoked: build `AuthContext` (`shared-kernel.md` §8) with `role` resolved by identity's `resolveRole(session, routeRequiredRole)` (`01-identity-and-access/identity-and-access-lld.md` §4.2 — there is no stored `role` column; `admin` comes from `identity_and_access.user.is_admin`, `provider` is a presence-based capability lazily checked against `provider_profile.provider_profile`, `seeker` is the default authenticated capability), extend the session's rolling expiry (§3.2), attach to `event.locals.auth`.
4. If absent/expired/revoked: `AuthContext` with `role: 'anonymous'`.
5. **Anonymous analytics cookie (`pf_anon`).** Independent of the session cookie. On every response where `pf_anon` is missing, the hook sets `pf_anon` (`HttpOnly`, `Secure`, `SameSite=Lax`, path `/`, `Max-Age=86400`). It holds a random 128-bit id, **creates no `session` row, grants no capability**, and is folded only into `provider-analytics`'s daily `viewer_key` (analytics LLD §5). This is not session fixation: the identifier never becomes an authenticated session token (identity LLD §5.3). Viewers who block cookies fall back to a per-request random key (analytics LLD §5 — acceptable over-count).
6. **Route metadata check:** every route under `src/routes/` declares its minimum role via a co-located `+page.server.ts`/`+server.ts` export (`export const requiredRole = 'seeker'`). The hook reads this before invoking the route handler; a mismatch short-circuits with 401 (no session) or 403 (session, wrong role) **before any application code runs** — SR-SEC-05's "admin capabilities are unreachable, not merely hidden" is enforced exactly here, at the single chokepoint every request passes through.
7. Ownership checks (a provider editing *their* profile) are **not** hook-level — they're application-layer (`AuthContext.requireOwnership`), because they need the loaded resource, which the hook doesn't have.
8. `X-Correlation-Id` is read or generated here and placed on `event.locals` for the logger and for outbox `correlation_id` propagation.
9. Security headers set here for every response: CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (denies camera/mic/geolocation by default; geolocation is opted into per-request only on the search page via a narrower policy override).

---

## 3. Session storage & lifecycle

### 3.1 Schema (owned by `identity-and-access`, specified here for cross-reference)

```sql
create table identity_and_access.session (
  id              uuid primary key,
  user_id         uuid not null references identity_and_access."user"(id),
  token_hash      text not null unique,      -- SHA-256 of the bearer token; token itself never stored
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  expires_at      timestamptz not null,       -- rolling: last_seen_at + 90 days, recomputed on each request
  revoked_at      timestamptz,
  ip_address      inet not null,
  user_agent      text
);
create index session_user_idx on identity_and_access.session (user_id) where revoked_at is null;
create index session_expiry_idx on identity_and_access.session (expires_at) where revoked_at is null;
```

### 3.2 Rolling expiry

`expires_at = last_seen_at + 90 days` (SR-SEC-04). On each authenticated request past the hook, if more than 1 hour has elapsed since `last_seen_at`, the row is updated (throttled to avoid a write per request) — extends "keep me signed in" indefinitely with activity, expires naturally after 90 days idle.

### 3.3 Revocation

- **Explicit sign-out:** `revoked_at = now()` on the current session only.
- **Credential/email/phone change** (FR-ACC-06): all *other* sessions for that user revoked in the same transaction as the credential change; the session performing the change is kept (so the user isn't logged out by their own action) but is required to have re-authenticated in the preceding 15 minutes (checked via a short-lived `reauth_at` claim set at password re-entry).
- **Account suspension/deletion:** all sessions revoked immediately as part of the moderation/deletion transaction.

### 3.4 Admin sessions

Same table, distinguished by `identity_and_access.user.is_admin = true`, but: `expires_at` is capped at `last_seen_at + 12 hours` regardless of activity (SR-SEC-08 idle timeout — implemented as a hard cap, not rolling, since admin compromise risk outweighs convenience), and login requires TOTP (§4) before a session row is created at all — there is no admin session in a "logged in, TOTP pending" state; the hook only ever sees fully-authenticated admin sessions.

---

## 4. TOTP (admin 2FA)

- **Enrollment** (first admin login, SR-OPS-07 bootstrap): server generates a random 160-bit secret, stores it **encrypted** (application-level AEAD, key from the secrets store — not just relying on disk encryption) in `identity_and_access.admin_totp (user_id pk, secret_encrypted, enrolled_at, backup_codes_hash[])`. Client shows a QR code (`otpauth://totp/PeachFinder:<email>?secret=...&issuer=PeachFinder`) rendered client-side from the secret returned exactly once at enrollment (never re-displayable — re-enrollment invalidates the old secret).
- **10 single-use backup codes** generated at enrollment, shown once, stored hashed (Argon2id, same as passwords) — recovery path if the authenticator device is lost, each consumed code marked used, never reusable.
- **Verification:** standard 30-second-window TOTP (RFC 6238), accepting the current and immediately-adjacent window (±30 s) to tolerate clock drift. 5 failed attempts in 10 minutes locks the login attempt for that account for 15 minutes (rate-limited per §5, bucket `admin_totp_verify`).
- **No SMS/email fallback for admin 2FA** — TOTP or a backup code only; email/SMS 2FA would reduce admin-account security to the same bar as ordinary account recovery, which SR-SEC-08 exists specifically to exceed.

---

## 5. Rate limiting

### 5.1 Mechanism

`shared.rate_limit_bucket` — an **unlogged** table (HLD-DEC-04; crash loss acceptable, never backed up, excluded from PITR):

```sql
create unlogged table shared.rate_limit_bucket (
  bucket_key   text not null,     -- e.g. 'auth_login:ip:41.x.x.x' or 'otp_request:phone:+27...'
  window_start timestamptz not null,
  count        integer not null default 1,
  primary key (bucket_key, window_start)
);
```

Sliding-window-by-fixed-bucket algorithm: `window_start = date_trunc('minute', now())` truncated to the bucket's configured window size (e.g. 1 hour for OTP-per-hour); `INSERT … ON CONFLICT (bucket_key, window_start) DO UPDATE SET count = count + 1 RETURNING count`; if `count > limit`, reject with `RATE_LIMITED` (`api-conventions.md` §6). A background job (part of the existing minute-cadence worker tick) deletes buckets older than their own window twice their duration, keeping the table small — this is a resource-protection cleanup, not a retention policy subject to SR-DATA-03.

### 5.2 Bucket definitions (concrete numbers — single source of truth)

| Bucket | Key | Window | Limit | Driving requirement |
|---|---|---|---|---|
| `auth_login` | IP | 15 min | 20 | SR-SEC-10 |
| `auth_login` | account (email) | 15 min | 10 | SR-SEC-10, account-targeted throttling independent of IP |
| `otp_request` | phone number | 1 hour | 3 | SR-INT-02 |
| `otp_request` | phone number | 24 hours | 10 | SR-INT-02 |
| `otp_request` | IP | 1 hour | 10 | SR-INT-02 (per-IP layer) |
| `otp_verify_attempt` | OTP code ID | lifetime of code (≤10 min) | 5 | SR-INT-02 |
| `password_reset_request` | email | 1 hour | 5 | SR-SEC-10 |
| `admin_totp_verify` | admin user | 10 min | 5 | §4 |
| `message_send` | account | 1 min | 30 | SR-SEC-10 (generous enough no plausible human hits it) |
| `thread_create` | account | 1 hour | 20 | SR-SEC-10 |
| `review_submit` | account | 1 day | 10 | SR-SEC-10 |
| `report_file` | account | 1 hour | 10 | SR-SEC-10 |
| `search_query` | IP | 1 min | 60 | SR-SEC-10 |
| `search_suggest` | IP | 1 min | 120 | SR-SEC-10 (higher — fires per keystroke) |
| `availability_toggle` | account | 1 min | 30 | `03-provider-availability/provider-availability-lld.md` §7.2 — set/renew/clear; caps runaway-client outbox churn (not an SR-SEC-10 bucket) |
| `register` | IP | 1 hour | 5 | SR-SEC-10 — registration (email-verification send) |
| `verify_email` | IP | 1 hour | 20 | SR-SEC-10 — email-verification confirm; identity LLD §9 |
| `reset_complete` | IP | 1 hour | 10 | SR-SEC-10 — password-reset complete; identity LLD §9 |
| `verification_submit` | account | 1 hour | 5 | SR-SEC-10 — identity-document case submit/resubmit; `07-trust-and-safety` §10.1. Open-case unique index still blocks duplicate *pending* cases; this bucket caps retry churn after reject. |

Every module LLD's API section states which of these buckets applies to which route rather than inventing a parallel table — this is the only place numbers are declared, so a tuning change touches one file.

### 5.3 Consistent-with-§1-stance guarantee

Per SR-SEC-11: a rate-limited user is throttled (`429`), never flagged, reported, or unpublished. The rate-limit middleware has **no** code path that writes to `trust_and_safety.report` or calls any `trust-and-safety`/`provider-profile` facade — this is verified by a dependency-cruiser rule (`shared/rate-limit.ts` may not import from `modules/trust-and-safety` or `modules/provider-profile`) alongside the general import-boundary check.

---

## 6. Runtime configuration cache (SR-APP-11)

`platform-configuration` module owns `platform_configuration.config (key text primary key, value jsonb, updated_at timestamptz)`. Every process (`web` and `worker`) holds an in-process `Map` cache populated at boot and on every `ConfigChanged` event (subscribed via the shared outbox dispatch, `event-catalog.md` §2), with a **5-minute TTL backstop** (a periodic re-fetch even without an event, guarding against a missed/dead-lettered event) — this is the one cross-module subscriber referenced in the `ConfigChanged` row of the event catalog, implemented once in `platform-configuration/infra/config-cache.ts` and imported (read-only accessor, not the module's internals) by any module needing a config value (`provider-availability` for expiry duration, `discovery-search` for the lexicon and "highly rated" threshold, `listing-billing` for pricing, `provider-reviews` for the rating threshold, `user-notifications` for batch/unread windows). This is a sanctioned exception to "never import another module's infra" — config-cache is exposed through `platform-configuration`'s public facade (`platform-configuration.getConfig<T>(key)`), not its raw infra.

---

## 7. Privacy filtering (server-side serializers)

Pattern, concretely:

```typescript
// provider-profile/infra/serializers.ts
export function toPublicProfile(p: ProviderProfile, viewer: AuthContext): PublicProfileDTO {
  return {
    id: p.id,
    displayName: p.displayName,
    // ...
    phone: (p.phoneVisible || viewer.role !== 'anonymous') ? p.phone : undefined,
  };
}
```

The DTO type itself makes `phone` optional — there is no runtime branch that could accidentally serialize it into JSON and then rely on the client to hide it (SR-SEC-09, FR-PRIV-01: "hiding must be server-side, not CSS"). Every module LLD's API section names its serializer function(s) per response shape.

---

## 8. OWASP ASVS L2 baseline checklist (SR-SEC-06) — where each control lives

| Control | Mechanism |
|---|---|
| Injection | Drizzle parameterized queries everywhere; hand-written SQL uses `sql` template tag (auto-parameterized), never string concatenation — lint-enforced |
| XSS | Svelte auto-escapes template output by default; the only `{@html}` usage in the codebase is the admin-authored safety-info page content, sanitized through a fixed allowlist sanitizer at write time, not render time |
| CSRF | `api-conventions.md` §9 |
| Security headers | §2 step 9 |
| SSRF-safe outbound | `shared-kernel.md` §11 |
| Pre-signed URL safety | `12-media-processing/media-processing-lld.md` §4 — TTL ≤ 5 min, admin-session-only issuance, issuance itself audit-logged |
| Dependency/image scanning | Trivy in CI (SR-OPS-02), criticals block release — CI configuration, not application code, tracked in `08-development-deliverable-documents` when authored |
