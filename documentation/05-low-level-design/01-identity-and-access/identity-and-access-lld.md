---
title: Peach Finder — LLD — Identity Module
updated: 2026-08-20
---

# Identity Module — Low-Level Design

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Low-Level Design — `identity-and-access` module (`src/lib/server/modules/identity-and-access/`, Postgres schema `identity_and_access`) |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | FRS §2 (Actors), §4 (ACC), §16 (PRIV); SRS §5 SR-APP-09, §11 SEC (SR-SEC-03/04/05/08), §12 PRIV (SR-PRIV-01/02/03), §16 D-7; HLD §6.1 (`identity-and-access` row), §6.2/6.3 (hexagonal + inter-module rules), §10.1; `clean-code-guidelines-per-module.md` §12 (`identity-and-access` row); user-stories §6 (E3 ACC), §19.1/19.2 |
| Foundations (binding) | `00-foundations/shared-kernel.md`, `00-foundations/api-conventions.md`, `00-foundations/event-catalog.md`, `00-foundations/security-implementation.md` |
| Downstream | Every module that FKs onto `identity_and_access."user"(id)`; consumers of the `identity-and-access` facade (`provider-profile`, `direct-messaging`, `provider-reviews`, `trust-and-safety`, `listing-billing`, `user-notifications`) |
| Status | Living document — updated in place |

**What this document is:** the buildable design for the module that owns accounts, credentials, sessions, verification, and the account lifecycle. It owns the platform's single `user` aggregate (§3.1) that every other module references. Cross-cutting session/RBAC/TOTP/rate-limit *mechanism* is specified once in `security-implementation.md`; this document specifies the module that **owns and exposes** those tables and the identity-specific behaviour around them, and does not redefine mechanism already fixed there.

---

## 2. Module purpose & scope

The `identity-and-access` module is the authority for *who a request is* and *what an account may do*. It delivers FRS **ACC** (FR-ACC-01…09) and the identity-facing parts of **PRIV** (FR-PRIV-03 anonymization; FR-PRIV-01 phone exposure is `provider-profile`'s serializer concern, not identity's).

In scope:
- Registration (seeker email/OAuth; provider with OTP-verified phone), email verification, phone OTP verification (SR-INT-02), login (email+password, OAuth callback), logout (SR-SEC-04).
- Password reset and self-serve change of email/phone/password with re-authentication (FR-ACC-06, SR-SEC-04).
- Session lifecycle and RBAC context resolution (`security-implementation.md` §2/§3), admin TOTP (§4), account-scoped rate-limit buckets (§5.2).
- Account deletion + irreversible anonymization (FR-ACC-07, FR-PRIV-03, SR-DATA-04), free-period phone anti-abuse anchor (FR-MONET-03, §8).
- Dual seeker/provider capability under one login (FR-ACC-08) — resolved as **presence-based capability**, not a stored role (§4, §5).

Out of scope (owned elsewhere, referenced only): the provider profile aggregate and its `owner_id` (`provider-profile`); phone visibility on the public profile (`provider-profile` serializer, FR-PRIV-01); identity-**document** cases and badge state (`trust-and-safety`); trial/subscription state keyed on the phone anchor (`listing-billing`); held-pending-message release on email verification (`direct-messaging`, via `EmailVerified`).

Binding stance inheritance: nothing here gates any *profile* — the sole identity-adjacent review workflow is the badge, owned by `trust-and-safety`, which gates the badge only (FRS §1). Anti-enumeration is a hard requirement across every auth surface (SR-SEC-04).

---

## 3. Data model — `identity-and-access` schema DDL

Conventions from `shared-kernel.md`: UUIDv7 primary keys; all timestamps `timestamptz` UTC (SR-APP-09); `citext` for case-insensitive email. FKs cross-schema only onto `identity_and_access."user"(id)` and `platform_configuration.area(id)` (HLD §6.3.3). `app_role` has `SELECT/INSERT/UPDATE/DELETE` on this schema.

Requires extension `citext` (created in the `shared` bootstrap migration).

### 3.1 `identity_and_access."user"` — the shared aggregate

Compatible with the mandated shape (every other module FKs onto `id`); columns added, none removed/renamed. Additions: `anonymized_at` (distinguishes *deletion requested* from *PII scrubbed*, §6), `updated_at` (hygiene).

```sql
create table identity_and_access."user" (
  id                 uuid primary key,                          -- UUIDv7 (shared-kernel §2)
  is_admin           boolean not null default false,            -- hard admin flag; source of the 'admin' role (§4)
  email              citext unique,                             -- null after anonymization; null allowed & distinct
  email_verified_at  timestamptz,                               -- gates messaging (FR-ACC-02)
  phone              text,                                      -- E.164; null after anonymization; hash lives in phone_registry_history
  phone_verified_at  timestamptz,                               -- set by OTP verify (FR-ACC-03, SR-INT-02)
  password_hash      text,                                      -- Argon2id (SR-SEC-04); null if OAuth-only or anonymized
  display_name       text not null,                             -- canonical account name (see note below)
  status             text not null default 'active',            -- 'active' | 'suspended' | 'deleted' (§4 state machine)
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz,                               -- set at deletion request (phase 1, §6)
  anonymized_at      timestamptz,                               -- set when PII irreversibly scrubbed (phase 2, §6)  [ADDED]
  updated_at         timestamptz not null default now(),        -- [ADDED]
  constraint user_status_chk check (status in ('active','suspended','deleted'))
);

-- one active account per verified phone (FR-MONET-03 anchor is separate & durable, §8; this guards live accounts)
create unique index user_active_phone_idx on identity_and_access."user"(phone)
  where phone is not null and status = 'active';
-- admin/account lookup by phone (FR-ADM-07), excludes anonymized rows
create index user_phone_idx on identity_and_access."user"(phone) where phone is not null;
```

**`display_name` is canonical here, not duplicated in `provider-profile`.** The provider's public profile name, the messaging participant name, and the reviewer name ("Thandi M.", FR-REV-03 — first name + initial derived at render) all resolve to `identity_and_access."user".display_name` through the identity facade (§5). This is why a `display_name` change is an identity-relevant event (§7, FR-TRUST-04) rather than a `provider-profile` `ProfileUpdated`.

**No stored `role`/`is_seeker`/`is_provider` columns.** `is_admin` is the only persisted role signal; seeker/provider are *capabilities* resolved per request (§4). This directly satisfies FR-ACC-08 (one login, two roles) without a mutually-exclusive enum.

### 3.2 `identity_and_access.session` — restated from `security-implementation.md` §3.1

Owned here; mechanism (rolling expiry §3.2, revocation §3.3, admin cap §3.4) is fixed in `security-implementation.md` and not redefined. One addition: `reauth_at`, implementing the short-lived re-auth claim that `security-implementation.md` §3.3 references for credential changes.

```sql
create table identity_and_access.session (
  id              uuid primary key,
  user_id         uuid not null references identity_and_access."user"(id),
  token_hash      text not null unique,       -- SHA-256 of the 256-bit bearer token; token itself never stored
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  expires_at      timestamptz not null,        -- rolling last_seen_at + 90d (seeker/provider); hard cap +12h (admin, §3.4)
  revoked_at      timestamptz,
  reauth_at       timestamptz,                 -- [ADDED] last password re-entry; credential change requires < 15 min ago
  ip_address      inet not null,
  user_agent      text
);
create index session_user_idx   on identity_and_access.session (user_id)    where revoked_at is null;
create index session_expiry_idx on identity_and_access.session (expires_at) where revoked_at is null;
```

### 3.3 `identity_and_access.oauth_link` — Google/Apple (SR-INT-04, FR-ACC-02, SRS D-7)

```sql
create table identity_and_access.oauth_link (
  id                uuid primary key,
  user_id           uuid not null references identity_and_access."user"(id) on delete cascade,
  provider          text not null,             -- 'google' | 'apple'
  provider_subject  text not null,             -- OIDC `sub` — stable per provider, never the email
  email_at_link     citext,                    -- email asserted by the provider at link time (audit/debug only)
  linked_at         timestamptz not null default now(),
  constraint oauth_provider_chk check (provider in ('google','apple')),
  unique (provider, provider_subject)          -- one platform account per external identity
);
create index oauth_link_user_idx on identity_and_access.oauth_link (user_id);
```

Linking key is `(provider, provider_subject)`, **never** email — email is mutable at the provider and forgeable across providers; `sub` is the stable identity. Email is used only for the *linking-match* decision (SR-INT-04, §8) with explicit confirmation. A user may hold one `google` and one `apple` link plus a password (columns are independent; `password_hash` may be null for OAuth-only accounts).

### 3.4 `identity_and_access.email_verification_token` (FR-ACC-02, FR-ACC-06)

Single-use, hashed, time-limited. Serves both first-registration verification and email-change verification (the pending new email rides on the row).

```sql
create table identity_and_access.email_verification_token (
  id           uuid primary key,
  user_id      uuid not null references identity_and_access."user"(id) on delete cascade,
  email        citext not null,               -- the address being verified (new email on a change flow)
  token_hash   text not null unique,          -- SHA-256 of the emailed random token; token never stored
  purpose      text not null,                 -- 'register' | 'email_change'
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,          -- created_at + 24h (LLD-level, §9 open q. #5)
  consumed_at  timestamptz,
  constraint evt_purpose_chk check (purpose in ('register','email_change'))
);
create index evt_user_idx    on identity_and_access.email_verification_token (user_id) where consumed_at is null;
create index evt_expiry_idx  on identity_and_access.email_verification_token (expires_at) where consumed_at is null;
```

### 3.5 `identity_and_access.phone_otp` (FR-ACC-03, SR-INT-02)

6-digit code, single-use, ≤10 min, ≤5 verify attempts per code (SR-INT-02). Row `id` is the `otp_verify_attempt` rate-limit bucket key (`security-implementation.md` §5.2). Send-rate limits are `otp_request` buckets, not columns here.

```sql
create table identity_and_access.phone_otp (
  id            uuid primary key,             -- == the code identity; keys `otp_verify_attempt` bucket
  user_id       uuid not null references identity_and_access."user"(id) on delete cascade,
  phone         text not null,                -- E.164 target
  code_hash     text not null,                -- Argon2id of the 6-digit code (low-entropy → memory-hard hash + attempt cap)
  purpose       text not null,                -- 'register' | 'phone_change'
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,         -- created_at + 10 min (SR-INT-02 upper bound)
  attempt_count integer not null default 0,   -- hard-capped at 5 (SR-INT-02); further attempts rejected before hashing
  consumed_at   timestamptz,
  constraint otp_purpose_chk check (purpose in ('register','phone_change'))
);
create index phone_otp_user_idx   on identity_and_access.phone_otp (user_id) where consumed_at is null;
create index phone_otp_expiry_idx on identity_and_access.phone_otp (expires_at) where consumed_at is null;
```

### 3.6 `identity_and_access.password_reset_token` (FR-ACC-06, SR-SEC-04)

Single-use, ≤1 h (SR-SEC-04).

```sql
create table identity_and_access.password_reset_token (
  id           uuid primary key,
  user_id      uuid not null references identity_and_access."user"(id) on delete cascade,
  token_hash   text not null unique,          -- SHA-256 of the emailed token; token never stored
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,          -- created_at + 1h (SR-SEC-04 upper bound)
  consumed_at  timestamptz
);
create index prt_user_idx   on identity_and_access.password_reset_token (user_id) where consumed_at is null;
create index prt_expiry_idx on identity_and_access.password_reset_token (expires_at) where consumed_at is null;
```

### 3.7 `identity_and_access.admin_totp` — restated from `security-implementation.md` §4

Owned here; verification/enrollment behaviour fixed in `security-implementation.md` §4, not redefined.

```sql
create table identity_and_access.admin_totp (
  user_id            uuid primary key references identity_and_access."user"(id) on delete cascade,
  secret_encrypted   bytea not null,          -- 160-bit secret, app-level AEAD (key from secrets store, not disk-crypto alone)
  enrolled_at        timestamptz not null default now(),
  backup_codes_hash  text[] not null          -- 10 single-use codes, Argon2id-hashed, consumed-once (§4 sec-impl)
);
```

### 3.8 `identity_and_access.phone_registry_history` — durable free-period anchor (FR-MONET-03, §8)

**Survives account deletion and anonymization** — this is the one identity record that must outlive the user row's PII, so the FR-MONET-03 "was this phone previously used" check works against churned/anonymized accounts. It stores a **keyed hash only**, never the number.

```sql
create table identity_and_access.phone_registry_history (
  phone_hash          text primary key,       -- HMAC-SHA-256(phone, server_pepper) hex — see §8 for why keyed, not plain
  first_registered_at timestamptz not null default now(),
  last_registered_at  timestamptz not null default now()
);
create index prh_first_seen_idx on identity_and_access.phone_registry_history (first_registered_at);
```

Written (upsert) whenever a phone is OTP-verified (§8). Never deleted by the anonymization job. `listing-billing` consumes `PhoneVerified` (carrying `phoneHash`) to decide trial eligibility and owns the trial→phone mapping; identity owns only the durable *existence* record. Rationale for hash-only: FR-PRIV-03 requires deleted personal data to be irreversibly anonymized — a reversible phone store would violate it, so the number is HMAC'd with a secret pepper (equality-comparable, not reversible).

### 3.9 Token/OTP hygiene (not a retention policy)

Expired rows in `email_verification_token`, `phone_otp`, `password_reset_token` are deleted by a cleanup pass on the existing worker minute-tick (resource hygiene, mirroring the rate-limit-bucket cleanup in `security-implementation.md` §5.1) — **not** an SR-DATA-03 retention job. Consumed rows are kept 7 days for support/debug then cleaned. This behaviour is distinct from the SR-APP-10 anonymization job (§6).

---

## 4. Account lifecycle & role resolution

### 4.1 Account status state machine (`identity_and_access."user".status`)

Modelled in `domain/` as a discriminated union (clean-code §4/§12); illegal transitions are rejected with a typed error, never silently coerced.

```typescript
// identity-and-access/domain/account-status.ts
export type AccountStatus =
  | { kind: 'active' }
  | { kind: 'suspended'; since: Instant; reason: string }
  | { kind: 'deleted';   requestedAt: Instant; anonymizedAt: Instant | null };
```

Email/phone verification are **orthogonal** to status (they gate *capabilities/actions*, not lifecycle): a freshly registered account is `active` immediately (FR-ACC-01 — browsing needs no verification), with `email_verified_at`/`phone_verified_at` filled independently.

| From | Trigger | To | Side effects & events |
|---|---|---|---|
| — | Seeker/provider registration completes | `active` | Insert `user`; publish `UserRegistered{userId, registrationIntent}` (§7). No session until login/registration auto-login. |
| `active` | Admin suspend — via `trust-and-safety`, `identity-and-access.applySuspension(tx,…)` (§5.4 boundary) | `suspended` | Revoke **all** sessions (same tx); `trust-and-safety` writes `moderation.suspend` audit + publishes `ModerationActionTaken` (→ `provider-profile` unpublish, `user-notifications`). Identity writes **no** audit row (trust owns it, event-catalog §4). |
| `suspended` | Admin reinstate — via `trust-and-safety`, `identity-and-access.applyReinstatement(tx,…)` | `active` | `trust-and-safety` writes `moderation.reinstate` audit + `ModerationActionTaken`. No sessions restored (user logs in fresh). |
| `active` / `suspended` | User confirms self-delete (FR-ACC-07) | `deleted` (`anonymizedAt=null`) | Phase 1 (§6): set `deleted_at`, revoke all sessions, delete oauth_links + pending tokens + admin_totp; publish `AccountDeletionRequested` (→ `provider-profile` unpublish, `listing-billing` cancel, `direct-messaging` deleted-display). |
| `deleted` | Anonymization job (≤30 days, SR-APP-10) | `deleted` (`anonymizedAt` set) | Phase 2 (§6): irreversibly null PII, set `anonymized_at`. Terminal. |

Guards: login and the RBAC hook hard-check `status = 'active'` (a `suspended`/`deleted` user resolves to `anonymous` and cannot authenticate — `ACCOUNT_SUSPENDED` surfaced on login attempt, §5.2). Admins cannot delete users (FR-ADM-05 has suspend, never delete); deletion is self-serve only.

### 4.2 Role/capability resolution (FR-ACC-08 — the explicit resolution)

`shared-kernel.md` §8 types `Role = 'anonymous' | 'seeker' | 'provider' | 'admin'` as a single `AuthContext.role`. The mandated `user` table has **no** `role` column — so role is *derived per request*, and this LLD refines the single-value model as follows (flagged in §9 open q. #1):

- **`admin`** — `user.is_admin = true`. Mutually exclusive with seeker/provider capability in V1 (no impersonation, FR-ADM-07). Admin sessions exist only on the admin subdomain (`security-implementation.md` §3.4).
- **`seeker`** — the default capability of **any** authenticated non-admin account. Always present.
- **`provider`** — a **presence-based capability**: true iff a `provider_profile.provider_profile` row exists with `owner_id = userId` (resolved through the `provider-profile` facade — identity never reads provider tables). Not an account attribute, not an enum value on `user`.

Because one login can be both seeker and provider (FR-ACC-08), **`role` is contextual to the route group being accessed, not a fixed session attribute.** Concrete resolution in the SvelteKit hook (`security-implementation.md` §2 steps 3/5), extended here:

```
resolveRole(session, routeRequiredRole):
  if no valid session OR user.status != 'active':  return anonymous          # deny suspended/deleted
  if user.is_admin:                                 return admin             # admin routes only
  switch routeRequiredRole:
    'anonymous' | 'seeker' | none →                 return seeker            # base capability; a provider is also a seeker
    'provider' →                                                              # provider route group
        if provider-profile.ownsProfile(userId):            return provider
        else                                        403 FORBIDDEN
    'admin' →                                       403 FORBIDDEN (non-admin)
```

The provider-capability lookup is **lazy** — performed only when a route in the provider group declares `requiredRole = 'provider'`, so seeker/public requests never query `provider-profile` (keeps the hook inside the SR-PERF-01 SSR budget). `AuthContext.hasRole('provider')` triggers the same lazy check; `AuthContext.role` is the *effective* role the route group selected. This is the concrete reconciliation of `security-implementation.md` §2 step 3's logical phrase "role from `identity_and_access.user.role`": there is no such column — `resolveRole` computes it (§9 open q. #2).

The **role-switch UI** (FR-ACC-08) reads capability state via `GET /api/identity/me/capabilities` (§5.1) — a pure read, not a state mutation; the "switch" is client navigation between the seeker and provider route groups, each independently capability-enforced server-side.

---

## 5. API contract

Envelope, `UseCaseError`→HTTP mapping, pagination, idempotency, CSRF, and headers are fixed in `api-conventions.md` and cited, not restated. Registration/login/verify are **SvelteKit form actions** (progressive enhancement, SR-COMPAT-03) reachable both as `POST <page>?/<action>` and via the hydrated app; account-settings mutations are JSON API routes. Error codes reuse the `event-catalog.md` §5 registry.

### 5.1 Endpoint table

| # | Method + path | Req. role | Request fields | Response DTO (`data`) | Error codes | Rate-limit bucket | Notes / anti-enumeration |
|---|---|---|---|---|---|---|---|
| 1 | `POST /register?/seeker` | anonymous | `email`, `password`, `displayName`, `acceptedTerms` | `{ userId, emailVerificationSent: true }` | `VALIDATION_FAILED` | `register` (IP, 5/h) | **Uniform response** whether or not `email` exists (SR-SEC-04): existing → send "someone tried to register / sign in or reset" to that address; response identical to fresh signup. Never reveals existence. Creates `active` user, `email_verified_at=null`. |
| 2 | `POST /register?/provider` | anonymous | `email`, `password`, `displayName`, `phone`, `areaId`, `acceptedTerms` | `{ userId, otpSent: true }` | `VALIDATION_FAILED` | `otp_request` (phone 3/h, 10/day; IP 10/h) | Creates `active` user (email + phone unverified); sends OTP (endpoint 5). Draft `provider_profile` is **not** created here — provider onboarding (`provider-profile` facade) creates it after OTP (§9 assumption). Uniform email-existence behaviour as #1. |
| 3 | `POST /verify-email?/confirm` | anonymous | `token` | `{ userId, emailVerified: true }` | `NOT_FOUND` (bad/expired/consumed token) | `verify_email` (IP, 20/h) | Single-use; sets `email_verified_at`; publishes `EmailVerified` (→ `direct-messaging` releases held pending messages, FR-ACC-02). Invalid & expired tokens return the same `NOT_FOUND`. |
| 4 | `POST /api/identity/otp/request` | anonymous (registration) / provider (change) | `userId` (register) or session (change), `phone` | `{ otpId, expiresInSeconds: 600 }` | `VALIDATION_FAILED`, `RATE_LIMITED`, `CONFLICT` (phone already active on another account) | `otp_request` (phone 3/h & 10/day; IP 10/h) | Also re-send. `CONFLICT` maps `user_active_phone_idx`. |
| 5 | `POST /api/identity/otp/verify` | anonymous (register) / provider (change) | `otpId`, `code` | `{ userId, phoneVerified: true }` | `VALIDATION_FAILED`, `NOT_FOUND` (unknown/expired otp), `precondition_failed` (attempts exhausted) | `otp_verify_attempt` (per `otpId`, 5 for code lifetime) | Sets `phone_verified_at`; upserts `phone_registry_history` (§8); publishes `PhoneVerified{userId, phoneHash}` (→ `listing-billing` anti-abuse). Wrong code increments `attempt_count`; 6th attempt rejected pre-hash. |
| 6 | `POST /login?/password` | anonymous | `email`, `password`, `keepSignedIn?` | `{ userId, capabilities }` + `Set-Cookie: pf_session` | `VALIDATION_FAILED`, `ACCOUNT_SUSPENDED` | `auth_login` (IP 20/15m; account 10/15m) | **Uniform** `"invalid email or password"` for unknown email *and* bad password (SR-SEC-04) — same status, same message, constant-time compare. `suspended` → `ACCOUNT_SUSPENDED`; `deleted`/unknown → uniform invalid. New session minted (§5.3 fixation). |
| 7 | `GET /api/identity/oauth/:provider/start` | anonymous | `:provider` ∈ {google,apple} | `302` to provider authorize URL | `NOT_FOUND` (unknown provider) | `auth_login` (IP) | Sets signed `state` + PKCE verifier cookie. |
| 8 | `GET /api/identity/oauth/:provider/callback` | anonymous | `code`, `state` | `{ userId, capabilities, linkPrompt? }` + `Set-Cookie` | `VALIDATION_FAILED` (bad state/PKCE), `unavailable` (provider down) | `auth_login` (IP) | Match by `(provider, sub)` → sign in. No link, email matches a **verified** existing account → return `linkPrompt` (no session yet) → endpoint 9 (SR-INT-04, §8). Provider-asserted verified email sets `email_verified_at`. |
| 9 | `POST /api/identity/oauth/:provider/link` | anonymous (holding link challenge) | `linkChallengeToken`, `password` **or** existing-session confirm | `{ userId, capabilities }` + `Set-Cookie` | `VALIDATION_FAILED`, `forbidden` (proof failed) | `auth_login` (account) | Explicit-confirmation link (SR-INT-04): requires proof of the existing account (password, or being signed into it) before attaching `oauth_link` — blocks takeover via a provider account bearing the victim's email (§8). |
| 10 | `POST /logout` (form) / `POST /api/identity/logout` | seeker/provider/admin | session | `{ ok: true }` | — | — | Revokes **current** session only (`revoked_at=now`, sec-impl §3.3). Clears cookie. |
| 11 | `POST /reset?/request` | anonymous | `email` | `{ requested: true }` | `VALIDATION_FAILED` | `password_reset_request` (email 5/h) | **Always** `"if an account exists we've emailed a link"** regardless of existence (SR-SEC-04). |
| 12 | `POST /reset?/complete` | anonymous | `token`, `newPassword` | `{ ok: true }` | `VALIDATION_FAILED`, `NOT_FOUND` (bad/expired/used token) | `reset_complete` (IP, 10/h) | Single-use ≤1 h token (SR-SEC-04). Sets `password_hash`; revokes **all** sessions for the user; user re-logs in. |
| 13 | `POST /api/identity/account/reauth` | seeker/provider/admin | `password` | `{ reauthedUntil }` | `VALIDATION_FAILED`, `forbidden` | `auth_login` (account) | Verifies current password, stamps `session.reauth_at` (sec-impl §3.3) — prerequisite for #14–16. |
| 14 | `POST /api/identity/account/email` | seeker/provider/admin | `newEmail` (reauth ≤15 m) | `{ verificationSent: true }` | `VALIDATION_FAILED`, `forbidden` (stale reauth), `CONFLICT` (email in use) | *(edge rule)* | Creates `email_change` verification token to `newEmail`; email swapped only on confirm (#3-style). On confirm: `email`+`email_verified_at` updated; **all other sessions revoked** (SR-SEC-04); `session.revoke_others` audit (event-catalog §4). No `IdentityAttributesChanged` (email is not badge-relevant, FR-TRUST-04). |
| 15 | `POST /api/identity/account/phone` | provider (typically) | `newPhone` (reauth ≤15 m) | `{ otpSent, otpId }` | `VALIDATION_FAILED`, `forbidden`, `CONFLICT` | `otp_request` | Verify new phone via #5. On success: `phone`+`phone_verified_at` updated; `phone_registry_history` upsert (§8); **other sessions revoked**; publishes `IdentityAttributesChanged{changedFields:['phone']}` (→ `trust-and-safety` badge suppression FR-TRUST-04, `discovery-search` refresh). |
| 16 | `POST /api/identity/account/password` | seeker/provider/admin | `newPassword` (reauth ≤15 m) | `{ ok: true }` | `VALIDATION_FAILED`, `forbidden` | `auth_login` (account) | Sets `password_hash`; **other sessions revoked**, current kept (sec-impl §3.3); `session.revoke_others` audit. |
| 17 | `POST /api/identity/account/display-name` | seeker/provider/admin | `displayName` | `{ displayName }` | `VALIDATION_FAILED` | *(edge rule)* | Updates canonical `display_name`; publishes `IdentityAttributesChanged{changedFields:['display_name']}` (→ `trust-and-safety` suppress FR-TRUST-04, `discovery-search` name refresh). No reauth (name is public-facing, not a credential). |
| 18 | `DELETE /api/identity/account` | seeker/provider/admin | confirm (reauth ≤15 m) | `{ deletionScheduled: true }` | `forbidden` (stale reauth) | — | Phase-1 deletion (§6); publishes `AccountDeletionRequested`. Confirmation UI states what survives (billing/tax, moderation) in plain language (FR-ACC-07, US-ACC-05). |
| 19 | `GET /api/identity/me/capabilities` | seeker/provider/admin | session | `{ userId, isSeeker, isProvider, isAdmin, emailVerified, phoneVerified }` | — | — | Drives the FR-ACC-08 role switch; pure read (lazy `provider-profile.ownsProfile`). |
| 20 | `POST /admin/api/identity/login` → `…/totp` | anonymous (admin subdomain) | `email`,`password` then `totpCode`\|`backupCode` | `{ userId }` + admin `Set-Cookie` | `VALIDATION_FAILED`, `forbidden` | `auth_login`; `admin_totp_verify` (admin 5/10m) | TOTP mandatory (SR-SEC-08, sec-impl §4). No admin session row exists in a "password-ok, TOTP-pending" state — session minted only after TOTP. 12 h hard idle cap (sec-impl §3.4). |

### 5.2 Serializers (server-side privacy filtering, SR-SEC-09, `api-conventions.md` §11)

Identity constructs sensitive fields only for the owning user:

- `toSelfAccount(user, viewer)` — account-settings view: `email`, masked `phone` (`•••• 1234`), `emailVerified`, `phoneVerified`, `capabilities`, `hasPassword`, linked OAuth providers. Only ever built when `viewer.userId === user.id` (or admin lookup, §5.5).
- `toCapabilities(user, ownsProfile)` — endpoint 19 shape.
- `toDisplayIdentity(userId) → { displayName, isDeleted }` — the facade shape other modules render (§5.4); a `deleted`/anonymized user returns `isDeleted:true` and the caller applies its own label ("Deleted account" / "Former user").

No public serializer ever emits `email`, `phone`, `password_hash`, tokens, or session data. Emails/phones are excluded from logs via the shared maskers (SR-OBS-05).

### 5.3 Session issuance & fixation prevention (SR-SEC-04)

Anonymous users hold **no** session cookie — there is no pre-auth session to fixate on. The `pf_anon` cookie (`security-implementation.md` §2 step 5) is an analytics-only identifier and is never upgraded into a `session` row. On **every** successful authentication (endpoints 6, 8, 9, 20) a fresh 256-bit token is generated, its SHA-256 stored as a new `identity_and_access.session` row, and the cookie reset; no identifier is ever carried over from the unauthenticated context. Re-auth (#13) elevates only via the short-lived `reauth_at` stamp on the existing session — it mints no new ambient privilege and no new session. This structurally prevents session fixation (§8).

### 5.4 Facade (module public surface, `index.ts`)

The only cross-module entry points (HLD §6.2 — other modules import `index.ts`, never internals):

| Method | Used by | Purpose |
|---|---|---|
| `getDisplayIdentity(userId): { displayName, isDeleted }` | `direct-messaging`, `provider-reviews`, `trust-and-safety`, admin | Render participant/reviewer names + deleted-label resolution (read-time, §6). |
| `getContactPhone(ownerId)` | `provider-profile` serializer | OTP-verified E.164 **only when the caller will include it** (FR-PROF-08). Never logs the number. |
| `getVerifiedPhoneHash(ownerId)` | `listing-billing` anti-abuse | HMAC phone hash for FR-MONET-03; never the raw number. |
| `getRegistrationStats(range)` | admin KPI row (FR-ADM-09) | New-registration counts over a date range. |
| `hasSignedInSince(userId, since)` | `trust-and-safety` active-this-week job | Boolean — session activity in window; never a raw timestamp. |
| `getAccountSummary(userId)` | admin lookup (`08-moderation-admin`) | Profile/badge-free account facts for FR-ADM-07 (§5.5). |
| `applySuspension(tx, userId, reason)` / `applyReinstatement(tx, userId)` | `trust-and-safety` | Flip status + revoke sessions **inside the caller's moderation transaction** (§5.5 boundary). |
| `exportFor(userId)` | `platform-configuration.exportUserData` (SR-DATA-07) | Subject-access slice — account fields, OAuth provider names, session metadata; never hashes/secrets (platform-configuration LLD §9). |
| `ownsProfile(userId)` is **not** here — it is `provider-profile`'s facade; identity *calls* it during role resolution. | | |

### 5.5 Boundary: admin suspension/reinstatement

Suspension is a **moderation** decision owned by `trust-and-safety` (FR-ADM-05, event-catalog §4 `moderation.suspend` written by `trust-and-safety`). Because access revocation must be **atomic** with the decision (SR-APP-12; a suspended user's live sessions must die in the same commit), `trust-and-safety` invokes `identity-and-access.applySuspension(tx, userId, reason)` **synchronously within its moderation transaction**, passing its own `tx`. This is a deliberate, documented exception to the async-default of HLD §6.3 rule 4 — parallel to the sanctioned same-transaction audit-log exception — because deferring session revocation to an async `ModerationActionTaken` subscriber would leave a window of authenticated access after suspension. `identity-and-access` writes no audit row here (trust owns it); it only mutates `user.status` + `session.revoked_at`. The `ModerationActionTaken` event still fans out to `provider-profile` (unpublish) and `user-notifications` per the catalog.

---

## 6. Anonymization algorithm (FR-ACC-07, FR-PRIV-03, SR-DATA-04)

"Irreversibly anonymized" is defined field-by-field on `identity_and_access."user"` and its satellites. Two phases; the SR-APP-10 daily job guarantees completion ≤30 days.

**Phase 1 — immediate, in the delete command transaction (endpoint 18):**

| Field/record | Action | Why |
|---|---|---|
| `user.status` | → `'deleted'` | Blocks login + RBAC (§4.1); provider profile unpublished via event. |
| `user.deleted_at` | → `now()` | Marks request time. |
| `identity_and_access.session` (all rows) | `revoked_at = now()` | Immediate access termination (SR-SEC-04). |
| `identity_and_access.oauth_link` (all rows) | deleted | Removes external-identity linkage. |
| `email_verification_token`, `phone_otp`, `password_reset_token` (pending) | deleted | No dangling credentials-recovery paths. |
| `identity_and_access.admin_totp` | deleted (if admin) | 2FA secret destroyed. |
| Event | publish `AccountDeletionRequested{userId}` | → `provider-profile` unpublish, `listing-billing` cancel subscription, `direct-messaging` deleted-display (event-catalog §2). |

**Phase 2 — anonymization job (daily, SR-APP-10; ≤30 days, idempotent, monitored, pings healthchecks.io):** for each `user` with `status='deleted' AND anonymized_at IS NULL`:

| Field | Action | Result |
|---|---|---|
| `email` | → `null` | Address unrecoverable; frees uniqueness. |
| `email_verified_at` | → `null` | — |
| `phone` | → `null` | Number unrecoverable; **`phone_registry_history.phone_hash` persists** (§8). |
| `phone_verified_at` | → `null` | — |
| `password_hash` | → `null` | Credential destroyed. |
| `display_name` | → `'Deleted user'` (canonical tombstone) | Consumers still render their own contextual label via `getDisplayIdentity` `isDeleted` (below). |
| `anonymized_at` | → `now()` | Marks completion; idempotency guard (re-run is a no-op). |
| Retained | audit/moderation records (direct IDs already opaque refs, SR-DATA-04), billing/tax (FR-PRIV-03), `phone_registry_history` | Statutory/enforcement survivorship. |

Irreversibility is a **domain operation with tests proving it** (clean-code §12 `identity-and-access`): `anonymize(user)` returns a value with no field from which the original email/phone/name can be derived; a unit test asserts every PII field is null/tombstoned and that phone equality still works only via the pre-computed HMAC hash, not the (now absent) number.

**Downstream display (cross-module concern, triggered by `AccountDeletionRequested`; each consumer owns its side):** identity specifies only its own row + the event. Consumers resolve the label **at read time** through `getDisplayIdentity(userId)` → `{ displayName, isDeleted }`:
- `direct-messaging` renders threads with a deleted participant as **"Deleted account"** (FR-ACC-07); it subscribes to `AccountDeletionRequested` for immediate thread-list flagging, but the label itself is read-time.
- `provider-reviews` renders a deleted reviewer as **"Former user"** (FR-ACC-07); it is **not** an `AccountDeletionRequested` subscriber — it needs no push, resolving `isDeleted` at render (avoids adding a subscriber to the catalog row).

This read-time resolution is why nulling `display_name` to a tombstone in phase 2 is safe: no consumer depends on the stored name for the deleted-state label.

---

## 7. Domain events published

Per `shared-kernel.md` §6 (envelope, outbox, idempotency) and event-catalog §2. Published only inside the command transaction (outbox), payload = IDs + immutable facts.

| Event | v | Trigger (endpoint) | Payload | Subscribers | Idempotency |
|---|---|---|---|---|---|
| `UserRegistered` | 1 | Registration (#1/#2) | `userId`, `registrationIntent: 'seeker' \| 'provider'` (entry point, for notifications' welcome variant; **not** a persisted role, §4.2) | `user-notifications` (welcome, S) | natural key (`userId`) |
| `EmailVerified` | 1 | Verify email (#3) | `userId` | `direct-messaging` (release held pending messages, FR-ACC-02) | natural key |
| `PhoneVerified` | 1 | Verify OTP (#5) | `userId`, `phoneHash` | `listing-billing` (free-period anti-abuse, FR-MONET-03) | natural key |
| `AccountDeletionRequested` | 1 | Delete (#18, phase 1) | `userId` | `provider-profile` (unpublish if a profile exists for this owner), `listing-billing` (cancel), `direct-messaging` (deleted-display) | processed-ledger |
| `IdentityAttributesChanged` | 1 | Change phone (#15) / display name (#17) | `userId`, `changedFields: ('display_name'\|'phone')[]` | `trust-and-safety` (identity-badge suppression pending re-review, FR-TRUST-04), `discovery-search` (search-projection name refresh) | natural key (idempotent effect) |

`IdentityAttributesChanged` is published **unconditionally** on a name/phone change; subscribers self-filter (`trust-and-safety` no-ops if no verification case exists; `discovery-search` upsert no-ops if no projection row) — this keeps `identity-and-access` decoupled from provider-ness. Registered in `event-catalog.md` §2.

No `session.revoke_others` **event** is published — it is an **audit** action only (`shared.audit_log`, event-catalog §4), written in-transaction by the shared audit writer on endpoints 14/16.

---

## 8. Edge cases

**Free-period phone anti-abuse (FR-MONET-03).** The check "was this phone previously used?" must see churned/anonymized accounts, so the phone must survive deletion in a queryable-but-anonymized form — this is exactly `identity_and_access.phone_registry_history.phone_hash` (§3.8), which the anonymization job never purges. On every OTP verification (#5) and phone change (#15), identity upserts `(phone_hash, first_registered_at, last_registered_at)` and publishes `PhoneVerified{phoneHash}`; `listing-billing` decides trial eligibility against its own trial→hash mapping. **Hashing is keyed HMAC-SHA-256 with a server pepper** from the secrets store (SR-SEC-07), *not* plain SHA-256: the phone-number space (~10⁹ E.164 numbers) is trivially brute-forced from an unkeyed digest, which would make the "anonymized" registry reversible and violate FR-PRIV-03. HMAC keeps equality-comparison while resisting reversal even if the table leaks (attacker also needs the pepper). The pepper is fixed for the platform's life (rotating it would orphan historical hashes); this is recorded as an accepted constraint (§9).

**OAuth account linking by verified email (SR-INT-04, endpoints 8/9).** Callback resolves by `(provider, sub)` first. If no link exists but the provider asserts an email that matches an **existing account with `email_verified_at` set**, identity does **not** silently link (that would let anyone holding a Google account bearing the victim's address seize the account). Instead it returns a `linkPrompt`/`linkChallengeToken` and **no session**; the user must prove the existing account via password (or already-authenticated session) at endpoint 9 before the `oauth_link` row is created — "additive, with explicit user confirmation" (SR-INT-04). If the matched account's email is *un*verified, no auto-match is offered at all. OAuth remains additive: password login always survives (`password_hash` untouched).

**Session fixation (SR-SEC-04, §5.3).** Anonymous sessions do not exist, so there is no fixed identifier to smuggle across the auth boundary; the `pf_anon` cookie is analytics-only and is never copied into a `session` row. Every authentication mints a brand-new token+row and resets the session cookie; re-auth elevates only via `reauth_at`, minting no session. A stolen pre-auth cookie is therefore worthless.

**Concurrent OTP / token races.** `phone_otp.attempt_count` is incremented under the row lock; the 6th attempt is rejected before any Argon2id work (cheap DoS guard). Verification and single-use consumption (`consumed_at`) are set in one `UPDATE … WHERE consumed_at IS NULL` — a double-submit loses the race and gets `NOT_FOUND`.

**Suspended user with an in-flight request.** Because `applySuspension` revokes sessions in the moderation commit (§5.5) and the hook hard-checks `status='active'`, at most one already-dispatched request can complete post-suspension; the next request (and the WS upgrade) resolve to `anonymous`.

**Email reuse after deletion.** Anonymization nulls `email`, freeing the `citext unique` slot; the address may be registered anew as a fresh, unrelated account — acceptable (the old account is unrecoverable). The phone anchor, by contrast, deliberately persists (anti-abuse).

---

## 9. Open questions / LLD-level assumptions

Decisions this LLD makes where upstream was silent or under-specified; each is reversible at LLD level.

1. **`Role` refined to contextual capability (§4.2).** `shared-kernel.md` §8's single `AuthContext.role` is the *effective role for the accessed route group*, backed by a capability set (`seeker` always; `provider` iff a `provider_profile` exists; `admin` from `is_admin`). `security-implementation.md` §2/§3.4 already cites `resolveRole()` — no stored `role` column. If a future need arises for a *simultaneously* dual-role response, `AuthContext` would need an explicit capability list — deferred (FR-ACC-08 is S).
2. **~~sec-impl `identity_and_access.user.role`~~** — **Closed 2026-08-20:** sec-impl already describes `is_admin` + `resolveRole()`.
3. **~~Suspension path~~** — **Closed:** `applySuspension` / `applyReinstatement` are the canonical sync facades (lld-index §5).
4. **~~Rate-limit buckets~~** — **Closed 2026-08-20:** `register`, `verify_email`, and `reset_complete` are in `security-implementation.md` §5.2.
5. **Token lifetimes** not fixed upstream: email verification **24 h**, phone OTP **10 min** (SR-INT-02 ceiling), password reset **1 h** (SR-SEC-04 ceiling). Admin-tunable candidacy deferred (not in FR-ADM-06 config set).
6. **~~`IdentityAttributesChanged`~~** — **Closed:** catalog and this module agree; `trust-and-safety` (not `ProfileUpdated`) is the FR-TRUST-04 trigger.
7. **Provider registration does not create the draft `provider_profile`.** Identity's responsibility ends at a verified account + `PhoneVerified`; the draft is created by provider onboarding (delivery layer calling `provider-profile.createDraftProfile` after OTP). Assumption: provider registration also captures email + password.
8. **Admin accounts carry no seeker/provider capability in V1** (mutually exclusive), consistent with no-impersonation (FR-ADM-07).
9. **Phone HMAC pepper is lifetime-fixed** (§8) — rotation would orphan historical hashes and break FR-MONET-03 continuity; accepted constraint.
10. **Credentials linger between deletion phases** (email/`password_hash` present until the phase-2 job, §6) — login is already blocked by `status='deleted'`; phase-1 credential scrubbing is a defense-in-depth tightening if desired.
